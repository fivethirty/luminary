/**
 * Builds and solves the exact combat graph. BattleModel owns transitions;
 * this module owns policy evaluation, minimax choices, and outcome propagation.
 */
import {
  BattleModel,
  ExpandContext,
  Role,
  Terminal,
  WorkingState,
} from './battle-state';

export type AssignmentMode = 'policy' | 'minimax';

export type SolverCaps = {
  maxStates: number;
  maxOutcomesPerSlot: number;
  maxSweeps: number;
  convergence: number;
  // Wall-clock ceiling for the whole solve. Infinity (the default) never
  // aborts, so exact analysis is unaffected; interactive callers set a finite
  // budget so a large solve bails to their fallback instead of stalling.
  maxMillis: number;
};

export const DEFAULT_CAPS: SolverCaps = {
  maxStates: 500_000,
  maxOutcomesPerSlot: 20_000,
  maxSweeps: 10_000,
  convergence: 1e-10,
  maxMillis: Infinity,
};

export type SolverOptions = {
  // The fleet whose win event solve() reports. This does not control decisions.
  perspective: Role;
  // 'policy' uses DPS/NPC assignments; 'minimax' optimizes selected player fleets.
  assignments: AssignmentMode;
  // Defaults to both roles in minimax mode, preserving the full two-sided solve.
  decisionRoles?: readonly Role[];
  caps?: SolverCaps;
  // Injectable for deterministic deadline tests and orchestration. Production
  // callers use Date.now so the deadline remains wall-clock based.
  now?: () => number;
};

// Forward-pass controls: propagate until this little probability mass is still
// in flight, or give up after this many steps (leftover mass is credited to
// the defender, matching the engine's round cap).
const FORWARD_RESIDUAL = 1e-12;
const FORWARD_MAX_STEPS = 20_000;
// Long loops check elapsed time in proportion to their cheap inner work. More
// expensive state expansions have their own finer-grained abort callback.
const DEADLINE_CHECK_INTERVAL = 256;

type TerminalInfo = { outcome: Terminal; hpA: number[]; hpB: number[] };
type Edge = { prob: number; options: number[] }; // node indices
type Node = {
  terminal: TerminalInfo | null;
  decisionRole: Role | null;
  edges: Edge[];
};

type TerminalMassResult =
  | { ok: true; absorbed: Float64Array; residual: number }
  | { ok: false; reason: 'time budget exceeded' };

export type SolveResult = {
  ok: boolean;
  winProbability: number;
  states: number;
  sweeps: number;
  reason?: string;
};

export type OutcomeResult = {
  ok: boolean;
  reason?: string;
  // Exact probabilities of each battle outcome. pDefender includes the
  // non-terminating residual (the engine's round cap awards those to the
  // defender); `residual` reports how much that was.
  pAttacker: number;
  pDefender: number;
  pDraw: number;
  residual: number;
  // Expected surviving ship counts by type, conditioned on that side winning.
  attackerSurvivors: Partial<Record<string, number>>;
  defenderSurvivors: Partial<Record<string, number>>;
  survivorDistribution: SurvivorComposition[];
  states: number;
};

export type TerminalDistributionEntry = {
  probability: number;
  outcome: Terminal;
  hpA: number[];
  hpB: number[];
};

export type TerminalDistributionResult = {
  ok: boolean;
  reason?: string;
  entries: TerminalDistributionEntry[];
  residual: number;
  states: number;
};

export type SurvivorComposition = {
  probability: number;
  attackerSurvivors: Partial<Record<string, number>>;
  defenderSurvivors: Partial<Record<string, number>>;
};

export type SolverGraphStats = {
  states: number;
  terminalStates: number;
  chanceStates: number;
  attackerDecisionStates: number;
  defenderDecisionStates: number;
  chanceOutcomes: number;
  assignmentOptions: number;
};

export type DecisionExplanation = {
  role: Role;
  outcomes: {
    probability: number;
    options: { value: number; selected: boolean }[];
  }[];
};

/**
 * Computes the exact probability that the selected perspective wins, by
 * building the reachable state graph and running value iteration to the least
 * fixed point. With policy assignments all choices use heuristics. With minimax
 * assignments selected non-NPC sides are decision nodes: attacker assignments
 * maximize and defender assignments minimize the queried reach objective.
 *
 * Role formulations (both solved by LFP from 0):
 *  - attacker: V = P(reach AttackerWins), decisions take max, W = V.
 *  - defender: V = P(reach AttackerWins ∪ Draw), decisions take min, W = 1 − V.
 * Non-terminating mass converges to 0, correctly crediting the defender.
 *
 * solveOutcome() additionally pushes probability mass forward through the graph
 * under the solved policy, yielding the full outcome distribution (attacker /
 * defender / draw) and expected survivors — the exact replacement for a
 * Monte Carlo run.
 */
export class WinProbabilitySolver {
  private readonly ctx: ExpandContext;
  private readonly perspective: Role;
  private readonly caps: SolverCaps;
  private readonly now: () => number;
  private keyToIndex = new Map<string, number>();
  private nodes: Node[] = [];
  private values: Float64Array = new Float64Array(0);
  private initialIndex = -1;
  private solved: SolveResult | null = null;
  private outcome: OutcomeResult | null = null;
  private terminalDistribution: TerminalDistributionResult | null = null;
  // Absolute time (ms) the solve must finish by; set in solve().
  private deadline = Infinity;

  constructor(
    private readonly model: BattleModel,
    options: SolverOptions
  ) {
    this.perspective = options.perspective;
    this.caps = options.caps ?? DEFAULT_CAPS;
    this.now = options.now ?? Date.now;
    this.ctx = {
      decisionRoles:
        options.assignments === 'minimax'
          ? (options.decisionRoles ?? ['A', 'D'])
          : [],
      maxOutcomes: this.caps.maxOutcomesPerSlot,
      deadlineExceeded: () => this.timeBudgetExceeded(),
    };
  }

  // Reach-set membership per role (fact 10).
  private target(outcome: Terminal): number {
    if (this.perspective === 'A') {
      return outcome === 'AttackerWins' ? 1 : 0;
    }
    return outcome === 'AttackerWins' || outcome === 'Draw' ? 1 : 0;
  }

  solve(): SolveResult {
    if (this.solved) return this.solved;
    this.deadline =
      this.caps.maxMillis === Infinity
        ? Infinity
        : this.now() + this.caps.maxMillis;
    const built = this.buildGraph();
    if (!built.ok) {
      this.solved = {
        ok: false,
        winProbability: NaN,
        states: this.nodes.length,
        sweeps: 0,
        reason: built.reason,
      };
      return this.solved;
    }
    const iter = this.iterate();
    const raw = this.values[this.initialIndex];
    const winProbability = this.perspective === 'A' ? raw : 1 - raw;
    this.solved = {
      ok: iter.ok,
      winProbability,
      states: this.nodes.length,
      sweeps: iter.sweeps,
      reason: iter.reason,
    };
    return this.solved;
  }

  // Exact outcome distribution + expected survivors under the solved policy.
  solveOutcome(): OutcomeResult {
    if (this.outcome) return this.outcome;
    const solved = this.solve();
    if (!solved.ok) {
      this.outcome = this.outcomeFailure(solved.reason ?? 'solve failed');
      return this.outcome;
    }
    this.outcome = this.propagateForward();
    return this.outcome;
  }

  solveTerminalDistribution(): TerminalDistributionResult {
    if (this.terminalDistribution) return this.terminalDistribution;
    const solved = this.solve();
    if (!solved.ok) {
      this.terminalDistribution = this.terminalDistributionFailure(
        solved.reason ?? 'solve failed'
      );
      return this.terminalDistribution;
    }
    const propagated = this.propagateTerminalMass();
    if (!propagated.ok) {
      this.terminalDistribution = this.terminalDistributionFailure(
        propagated.reason
      );
      return this.terminalDistribution;
    }
    const { absorbed, residual } = propagated;
    const entries: TerminalDistributionEntry[] = [];
    for (let i = 0; i < this.nodes.length; i++) {
      if (i % DEADLINE_CHECK_INTERVAL === 0 && this.timeBudgetExceeded()) {
        this.terminalDistribution = this.terminalDistributionFailure(
          'time budget exceeded'
        );
        return this.terminalDistribution;
      }
      const probability = absorbed[i];
      if (probability === 0) continue;
      const terminal = this.nodes[i].terminal;
      if (!terminal) continue;
      entries.push({
        probability,
        outcome: terminal.outcome,
        hpA: [...terminal.hpA],
        hpB: [...terminal.hpB],
      });
    }
    this.terminalDistribution = {
      ok: true,
      entries,
      residual,
      states: this.nodes.length,
    };
    return this.terminalDistribution;
  }

  // Raw reach value for a state key (P reach AttackerWins for 'A', P reach
  // AttackerWins∪Draw for 'D'). Used by the planner: argmax for attacker,
  // argmin for defender. Undefined if the state was not reached.
  getValue(key: string): number | undefined {
    const idx = this.keyToIndex.get(key);
    if (idx === undefined) return undefined;
    return this.values[idx];
  }

  canonicalKey(state: WorkingState): string {
    return this.model.canonicalKey(state);
  }

  getGraphStats(): SolverGraphStats {
    this.solve();
    const stats: SolverGraphStats = {
      states: this.nodes.length,
      terminalStates: 0,
      chanceStates: 0,
      attackerDecisionStates: 0,
      defenderDecisionStates: 0,
      chanceOutcomes: 0,
      assignmentOptions: 0,
    };
    for (const node of this.nodes) {
      if (node.terminal) stats.terminalStates++;
      else if (node.decisionRole === 'A') stats.attackerDecisionStates++;
      else if (node.decisionRole === 'D') stats.defenderDecisionStates++;
      else stats.chanceStates++;
      stats.chanceOutcomes += node.edges.length;
      for (const edge of node.edges) {
        stats.assignmentOptions += edge.options.length;
      }
    }
    return stats;
  }

  explainDecision(key: string): DecisionExplanation | undefined {
    const solved = this.solve();
    if (!solved.ok) return undefined;
    const index = this.keyToIndex.get(key);
    if (index === undefined) return undefined;
    const node = this.nodes[index];
    if (!node.decisionRole) return undefined;

    return {
      role: node.decisionRole,
      outcomes: node.edges.map((edge) => {
        const selected = this.chooseOption(edge.options, node.decisionRole!);
        return {
          probability: edge.prob,
          options: edge.options.map((option) => ({
            value: this.values[option],
            selected: option === selected,
          })),
        };
      }),
    };
  }

  private buildGraph(): { ok: boolean; reason?: string } {
    const initial = this.model.initialState();
    const initialKey = this.model.canonicalKey(initial);
    const stack: { state: WorkingState; key: string }[] = [
      { state: initial, key: initialKey },
    ];
    // A state can be reached by many dice outcomes before it is expanded. Keep
    // only one pending stack entry instead of scheduling duplicate work that is
    // later discarded by `expanded`.
    const scheduled = new Set<string>([initialKey]);
    // Provisional index reservation so edges can reference successors by index
    // before those successors are expanded.
    const indexOf = (key: string): number => {
      let idx = this.keyToIndex.get(key);
      if (idx === undefined) {
        idx = this.nodes.length;
        this.keyToIndex.set(key, idx);
        this.nodes.push({ terminal: null, decisionRole: null, edges: [] });
      }
      return idx;
    };
    // Terminal outcomes dedup into nodes too, keyed by outcome + HP vectors so
    // survivor information is preserved for the forward pass.
    const terminalIndexOf = (info: TerminalInfo): number => {
      const key = `T|${info.outcome}|${info.hpA.join('.')}|${info.hpB.join('.')}`;
      let idx = this.keyToIndex.get(key);
      if (idx === undefined) {
        idx = this.nodes.length;
        this.keyToIndex.set(key, idx);
        this.nodes.push({ terminal: info, decisionRole: null, edges: [] });
      }
      return idx;
    };
    const expanded = new Set<string>();

    this.initialIndex = indexOf(initialKey);

    while (stack.length > 0) {
      const { state, key } = stack.pop()!;
      scheduled.delete(key);
      if (expanded.has(key)) continue;
      expanded.add(key);
      if (this.nodes.length > this.caps.maxStates) {
        return { ok: false, reason: 'maxStates exceeded' };
      }
      // Expansion cost varies enormously by state, so check every state and
      // let BattleModel share this deadline inside its expensive work.
      if (this.timeBudgetExceeded()) {
        return { ok: false, reason: 'time budget exceeded' };
      }
      const idx = indexOf(key);

      const exp = this.model.expand(state, this.ctx);
      if (exp.kind === 'fail') {
        return { ok: false, reason: exp.reason };
      }
      if (exp.kind === 'terminal') {
        this.nodes[idx] = {
          terminal: { outcome: exp.outcome, hpA: state.hpA, hpB: state.hpB },
          decisionRole: null,
          edges: [],
        };
        continue;
      }

      const edges: Edge[] = [];
      for (let edgeIndex = 0; edgeIndex < exp.edges.length; edgeIndex++) {
        if (this.timeBudgetExceeded()) {
          return { ok: false, reason: 'time budget exceeded' };
        }
        const edge = exp.edges[edgeIndex];
        const options: number[] = [];
        for (
          let optionIndex = 0;
          optionIndex < edge.options.length;
          optionIndex++
        ) {
          if (
            optionIndex % DEADLINE_CHECK_INTERVAL === 0 &&
            this.timeBudgetExceeded()
          ) {
            return { ok: false, reason: 'time budget exceeded' };
          }
          const opt = edge.options[optionIndex];
          if ('terminal' in opt) {
            options.push(
              terminalIndexOf({
                outcome: opt.terminal,
                hpA: opt.hpA,
                hpB: opt.hpB,
              })
            );
          } else {
            const okey = this.model.canonicalKey(opt.state);
            const oidx = indexOf(okey);
            options.push(oidx);
            if (!expanded.has(okey) && !scheduled.has(okey)) {
              scheduled.add(okey);
              stack.push({ state: opt.state, key: okey });
            }
          }
          if (this.nodes.length > this.caps.maxStates) {
            return { ok: false, reason: 'maxStates exceeded' };
          }
        }
        edges.push({ prob: edge.prob, options });
      }
      this.nodes[idx] = {
        terminal: null,
        decisionRole: exp.decisionRole,
        edges,
      };
    }
    return { ok: true };
  }

  private iterate(): { ok: boolean; sweeps: number; reason?: string } {
    const n = this.nodes.length;
    this.values = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      if (i % DEADLINE_CHECK_INTERVAL === 0 && this.timeBudgetExceeded()) {
        return { ok: false, sweeps: 0, reason: 'time budget exceeded' };
      }
      const terminal = this.nodes[i].terminal;
      if (terminal) {
        this.values[i] = this.target(terminal.outcome);
      }
    }
    for (let sweep = 1; sweep <= this.caps.maxSweeps; sweep++) {
      if (this.timeBudgetExceeded()) {
        return { ok: false, sweeps: sweep - 1, reason: 'time budget exceeded' };
      }
      let maxDelta = 0;
      let work = 0;
      for (let i = 0; i < n; i++) {
        if (
          ++work % DEADLINE_CHECK_INTERVAL === 0 &&
          this.timeBudgetExceeded()
        ) {
          return {
            ok: false,
            sweeps: sweep - 1,
            reason: 'time budget exceeded',
          };
        }
        const node = this.nodes[i];
        if (node.terminal) continue; // absorbing
        let v = 0;
        for (const edge of node.edges) {
          if (
            ++work % DEADLINE_CHECK_INTERVAL === 0 &&
            this.timeBudgetExceeded()
          ) {
            return {
              ok: false,
              sweeps: sweep - 1,
              reason: 'time budget exceeded',
            };
          }
          let edgeVal: number;
          if (node.decisionRole) {
            const isMax = node.decisionRole === 'A';
            edgeVal = isMax ? -Infinity : Infinity;
            for (const opt of edge.options) {
              if (
                ++work % DEADLINE_CHECK_INTERVAL === 0 &&
                this.timeBudgetExceeded()
              ) {
                return {
                  ok: false,
                  sweeps: sweep - 1,
                  reason: 'time budget exceeded',
                };
              }
              const ov = this.values[opt];
              edgeVal = isMax ? Math.max(edgeVal, ov) : Math.min(edgeVal, ov);
            }
          } else {
            edgeVal = this.values[edge.options[0]];
          }
          v += edge.prob * edgeVal;
        }
        const delta = Math.abs(v - this.values[i]);
        if (delta > maxDelta) maxDelta = delta;
        this.values[i] = v;
      }
      if (maxDelta < this.caps.convergence) {
        if (this.timeBudgetExceeded()) {
          return {
            ok: false,
            sweeps: sweep,
            reason: 'time budget exceeded',
          };
        }
        return { ok: true, sweeps: sweep };
      }
    }
    return {
      ok: false,
      sweeps: this.caps.maxSweeps,
      reason: 'value iteration did not converge',
    };
  }

  // Picks the option the solved policy takes at a decision edge. Ties break to
  // the first optimal option; any tie-broken choice has the same win value,
  // though survivor mixes can differ between equally-optimal lines.
  private chooseOption(options: number[], decisionRole: Role): number {
    const isMax = decisionRole === 'A';
    let best = options[0];
    let bestVal = this.values[best];
    for (let i = 1; i < options.length; i++) {
      const v = this.values[options[i]];
      if (isMax ? v > bestVal : v < bestVal) {
        best = options[i];
        bestVal = v;
      }
    }
    return best;
  }

  // Pushes probability mass forward from the initial state under the solved
  // policy, accumulating mass at terminal nodes. Cycles shed mass geometrically
  // into terminals; whatever is still circulating after the step cap becomes
  // `residual` and is credited to the defender (round-cap semantics).
  private propagateForward(): OutcomeResult {
    const propagated = this.propagateTerminalMass();
    if (!propagated.ok) return this.outcomeFailure(propagated.reason);
    const { absorbed, residual } = propagated;
    const n = this.nodes.length;

    let pAttacker = 0;
    let pDefenderTerm = 0;
    let pDraw = 0;
    const attackerSurvivors: Record<string, number> = {};
    const defenderSurvivors: Record<string, number> = {};
    const compositionMass = new Map<string, SurvivorComposition>();
    for (let i = 0; i < n; i++) {
      if (i % DEADLINE_CHECK_INTERVAL === 0 && this.timeBudgetExceeded()) {
        return this.outcomeFailure('time budget exceeded');
      }
      const m = absorbed[i];
      if (m === 0) continue;
      const terminal = this.nodes[i].terminal!;
      const attackerCounts = this.model.survivorsByType('A', terminal.hpA);
      const defenderCounts = this.model.survivorsByType('D', terminal.hpB);
      const compositionKey = this.compositionKey(
        attackerCounts,
        defenderCounts
      );
      const existing = compositionMass.get(compositionKey);
      if (existing) {
        existing.probability += m;
      } else {
        compositionMass.set(compositionKey, {
          probability: m,
          attackerSurvivors: attackerCounts,
          defenderSurvivors: defenderCounts,
        });
      }

      if (terminal.outcome === 'AttackerWins') {
        pAttacker += m;
        for (const [type, count] of Object.entries(attackerCounts)) {
          attackerSurvivors[type] = (attackerSurvivors[type] ?? 0) + m * count!;
        }
      } else if (terminal.outcome === 'DefenderWins') {
        pDefenderTerm += m;
        for (const [type, count] of Object.entries(defenderCounts)) {
          defenderSurvivors[type] = (defenderSurvivors[type] ?? 0) + m * count!;
        }
      } else {
        pDraw += m;
      }
    }
    if (this.timeBudgetExceeded()) {
      return this.outcomeFailure('time budget exceeded');
    }
    // Condition survivor sums on the winning mass (residual carries no
    // survivor information, so it is excluded from the defender average).
    for (const type of Object.keys(attackerSurvivors)) {
      attackerSurvivors[type] /= pAttacker;
    }
    for (const type of Object.keys(defenderSurvivors)) {
      defenderSurvivors[type] /= pDefenderTerm;
    }

    return {
      ok: true,
      pAttacker,
      pDefender: pDefenderTerm + residual,
      pDraw,
      residual,
      attackerSurvivors,
      defenderSurvivors,
      survivorDistribution: Array.from(compositionMass.values()).sort(
        (a, b) => b.probability - a.probability
      ),
      states: this.nodes.length,
    };
  }

  private propagateTerminalMass(): TerminalMassResult {
    if (this.timeBudgetExceeded()) {
      return { ok: false, reason: 'time budget exceeded' };
    }
    const n = this.nodes.length;
    let mass = new Float64Array(n);
    const absorbed = new Float64Array(n);
    if (this.timeBudgetExceeded()) {
      return { ok: false, reason: 'time budget exceeded' };
    }
    mass[this.initialIndex] = 1;
    let pending = 1;

    for (
      let step = 0;
      step < FORWARD_MAX_STEPS && pending > FORWARD_RESIDUAL;
      step++
    ) {
      if (this.timeBudgetExceeded()) {
        return { ok: false, reason: 'time budget exceeded' };
      }
      const next = new Float64Array(n);
      if (this.timeBudgetExceeded()) {
        return { ok: false, reason: 'time budget exceeded' };
      }
      pending = 0;
      let work = 0;
      for (let i = 0; i < n; i++) {
        if (
          ++work % DEADLINE_CHECK_INTERVAL === 0 &&
          this.timeBudgetExceeded()
        ) {
          return { ok: false, reason: 'time budget exceeded' };
        }
        const m = mass[i];
        if (m === 0) continue;
        const node = this.nodes[i];
        if (node.terminal) {
          absorbed[i] += m;
          continue;
        }
        for (const edge of node.edges) {
          if (
            ++work % DEADLINE_CHECK_INTERVAL === 0 &&
            this.timeBudgetExceeded()
          ) {
            return { ok: false, reason: 'time budget exceeded' };
          }
          const targetIdx = node.decisionRole
            ? this.chooseOption(edge.options, node.decisionRole)
            : edge.options[0];
          next[targetIdx] += edge.prob * m;
        }
      }
      for (let i = 0; i < n; i++) {
        if (
          ++work % DEADLINE_CHECK_INTERVAL === 0 &&
          this.timeBudgetExceeded()
        ) {
          return { ok: false, reason: 'time budget exceeded' };
        }
        if (next[i] > 0 && !this.nodes[i].terminal) pending += next[i];
      }
      // Terminal mass that arrived this step is absorbed on the next pass.
      mass = next;
    }
    // Absorb any terminal mass still sitting in `mass` after the loop.
    for (let i = 0; i < n; i++) {
      if (i % DEADLINE_CHECK_INTERVAL === 0 && this.timeBudgetExceeded()) {
        return { ok: false, reason: 'time budget exceeded' };
      }
      if (mass[i] > 0 && this.nodes[i].terminal) absorbed[i] += mass[i];
    }

    let terminalMass = 0;
    for (let i = 0; i < n; i++) {
      if (i % DEADLINE_CHECK_INTERVAL === 0 && this.timeBudgetExceeded()) {
        return { ok: false, reason: 'time budget exceeded' };
      }
      terminalMass += absorbed[i];
    }
    if (this.timeBudgetExceeded()) {
      return { ok: false, reason: 'time budget exceeded' };
    }
    return {
      ok: true,
      absorbed,
      residual: Math.max(0, 1 - terminalMass),
    };
  }

  private timeBudgetExceeded(): boolean {
    return this.deadline !== Infinity && this.now() >= this.deadline;
  }

  private outcomeFailure(reason: string): OutcomeResult {
    return {
      ok: false,
      reason,
      pAttacker: NaN,
      pDefender: NaN,
      pDraw: NaN,
      residual: NaN,
      attackerSurvivors: {},
      defenderSurvivors: {},
      survivorDistribution: [],
      states: this.nodes.length,
    };
  }

  private terminalDistributionFailure(
    reason: string
  ): TerminalDistributionResult {
    return {
      ok: false,
      reason,
      entries: [],
      residual: NaN,
      states: this.nodes.length,
    };
  }

  private compositionKey(
    attackerSurvivors: Partial<Record<string, number>>,
    defenderSurvivors: Partial<Record<string, number>>
  ): string {
    const side = (counts: Partial<Record<string, number>>): string =>
      Object.entries(counts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([type, count]) => `${type}:${count}`)
        .join(',');
    return `A:${side(attackerSurvivors)}|D:${side(defenderSurvivors)}`;
  }
}
