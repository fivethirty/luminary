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

type SolverOptions = {
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

// Forward-pass controls: leave at most this much probability mass circulating
// in cycles in total, and circulate no cycle for more than this many passes
// (leftover mass is credited to the defender, matching the engine's round cap).
const FORWARD_RESIDUAL = 1e-12;
const FORWARD_MAX_STEPS = 20_000;
// A cyclic component without minimax decisions up to this many states is
// solved exactly as a linear system; larger ones, and any component holding a
// decision node, are swept. Elimination is O(size^3), so this bounds its cost.
const EXACT_COMPONENT_LIMIT = 256;
// A pivot below this magnitude means the component keeps (almost) all of its
// mass forever, or the system is too ill-conditioned to trust; such a
// component is swept instead, which reproduces the least-fixed-point value.
const EXACT_PIVOT_EPSILON = 1e-9;
// Decision options whose values lie within this distance of the best value
// are ties, broken toward the lowest option index. Value iteration leaves
// residuals of about the convergence threshold, so a strict comparison would
// let those residuals pick between equally optimal lines.
export const DECISION_TIE_EPSILON = 1e-9;
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

// Strongly connected components of the state graph. Component c holds
// nodes[start[c] .. start[c + 1]), and components are listed successors first
// (see componentOrder). `cyclic` marks components that contain a cycle: more
// than one state, or one state with a self-loop.
type ComponentOrder = {
  nodes: Int32Array;
  start: Int32Array;
  cyclic: Uint8Array;
  count: number;
};

export type SolveResult = {
  ok: boolean;
  winProbability: number;
  states: number;
  sweeps: number;
  reason?: string;
};

type OutcomeResult = {
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

type TerminalDistributionEntry = {
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

type SurvivorComposition = {
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

type DecisionExplanation = {
  role: Role;
  outcomes: {
    probability: number;
    options: { value: number; selected: boolean }[];
  }[];
};

// Gaussian elimination with partial pivoting on a dense row-major `size` x
// `size` matrix; the solution replaces `rhs`. Returns false when a pivot is
// below EXACT_PIVOT_EPSILON, in which case both arrays are left partially
// reduced and must be discarded.
function solveLinearSystem(
  matrix: Float64Array,
  rhs: Float64Array,
  size: number
): boolean {
  for (let column = 0; column < size; column++) {
    let pivotRow = column;
    let pivotAbs = Math.abs(matrix[column * size + column]);
    for (let row = column + 1; row < size; row++) {
      const candidate = Math.abs(matrix[row * size + column]);
      if (candidate > pivotAbs) {
        pivotAbs = candidate;
        pivotRow = row;
      }
    }
    if (pivotAbs < EXACT_PIVOT_EPSILON) return false;
    if (pivotRow !== column) {
      for (let k = column; k < size; k++) {
        const swap = matrix[column * size + k];
        matrix[column * size + k] = matrix[pivotRow * size + k];
        matrix[pivotRow * size + k] = swap;
      }
      const swap = rhs[column];
      rhs[column] = rhs[pivotRow];
      rhs[pivotRow] = swap;
    }
    const pivot = matrix[column * size + column];
    for (let row = column + 1; row < size; row++) {
      const factor = matrix[row * size + column] / pivot;
      if (factor === 0) continue;
      for (let k = column; k < size; k++) {
        matrix[row * size + k] -= factor * matrix[column * size + k];
      }
      rhs[row] -= factor * rhs[column];
    }
  }
  for (let row = size - 1; row >= 0; row--) {
    let sum = rhs[row];
    for (let k = row + 1; k < size; k++) sum -= matrix[row * size + k] * rhs[k];
    rhs[row] = sum / matrix[row * size + row];
  }
  return true;
}

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
  private components: ComponentOrder | null = null;
  // Scratch map from node index to position inside the component being solved
  // exactly (-1 outside it); allocated once per solve.
  private componentLocal: Int32Array = new Int32Array(0);
  // Work counter for deadline checks inside nodeValue/pushMass callers.
  private work = 0;
  // Diagnostic: the most passes any cyclic component needed in the last
  // forward propagation.
  private forwardSteps = 0;

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

  // Strongly connected components of the state graph, in Tarjan emission
  // order: a component is emitted only after every component reachable from
  // it, so the order is a reverse topological order of the condensation.
  // Without healing, the only cycles are rounds in which nothing changes
  // (every shot misses), so nearly every component is a single state.
  private componentOrder():
    | { ok: true; components: ComponentOrder }
    | { ok: false; reason: 'time budget exceeded' } {
    if (this.components) return { ok: true, components: this.components };
    const n = this.nodes.length;
    // Successor lists in compressed form. Every option of every outcome is a
    // dependency, even the ones the solved policy will not take.
    const succStart = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) {
      let count = 0;
      for (const edge of this.nodes[i].edges) count += edge.options.length;
      succStart[i + 1] = succStart[i] + count;
    }
    const succ = new Int32Array(succStart[n]);
    for (let i = 0, k = 0; i < n; i++) {
      for (const edge of this.nodes[i].edges) {
        for (const option of edge.options) succ[k++] = option;
      }
    }

    // Iterative Tarjan: the graph is far too deep for recursion.
    const index = new Int32Array(n).fill(-1);
    const low = new Int32Array(n);
    const onStack = new Uint8Array(n);
    const stack = new Int32Array(n);
    const callNode = new Int32Array(n);
    const callPos = new Int32Array(n);
    const order = new Int32Array(n);
    const start: number[] = [0];
    const cyclic: number[] = [];
    let sp = 0;
    let csp = 0;
    let emitted = 0;
    let counter = 0;
    let work = 0;
    for (let root = 0; root < n; root++) {
      if (index[root] !== -1) continue;
      index[root] = low[root] = counter++;
      stack[sp++] = root;
      onStack[root] = 1;
      callNode[csp] = root;
      callPos[csp] = succStart[root];
      csp++;
      while (csp > 0) {
        if (
          ++work % DEADLINE_CHECK_INTERVAL === 0 &&
          this.timeBudgetExceeded()
        ) {
          return { ok: false, reason: 'time budget exceeded' };
        }
        const v = callNode[csp - 1];
        const p = callPos[csp - 1];
        if (p < succStart[v + 1]) {
          callPos[csp - 1] = p + 1;
          const w = succ[p];
          if (index[w] === -1) {
            index[w] = low[w] = counter++;
            stack[sp++] = w;
            onStack[w] = 1;
            callNode[csp] = w;
            callPos[csp] = succStart[w];
            csp++;
          } else if (onStack[w] === 1 && index[w] < low[v]) {
            low[v] = index[w];
          }
          continue;
        }
        csp--;
        if (csp > 0) {
          const u = callNode[csp - 1];
          if (low[v] < low[u]) low[u] = low[v];
        }
        if (low[v] !== index[v]) continue;
        const first = emitted;
        let w: number;
        do {
          w = stack[--sp];
          onStack[w] = 0;
          order[emitted++] = w;
        } while (w !== v);
        let hasCycle = emitted - first > 1;
        for (let q = succStart[v]; !hasCycle && q < succStart[v + 1]; q++) {
          hasCycle = succ[q] === v;
        }
        cyclic.push(hasCycle ? 1 : 0);
        start.push(emitted);
      }
    }
    this.components = {
      nodes: order,
      start: Int32Array.from(start),
      cyclic: Uint8Array.from(cyclic),
      count: cyclic.length,
    };
    return { ok: true, components: this.components };
  }

  // Current value of a non-terminal state from its successors' values. Adds
  // the outcomes and options it visited to `this.work` so callers can check
  // the deadline in proportion to the work done.
  private nodeValue(node: Node): number {
    let v = 0;
    for (const edge of node.edges) {
      let edgeVal: number;
      if (node.decisionRole) {
        const isMax = node.decisionRole === 'A';
        edgeVal = isMax ? -Infinity : Infinity;
        for (const opt of edge.options) {
          const ov = this.values[opt];
          edgeVal = isMax ? Math.max(edgeVal, ov) : Math.min(edgeVal, ov);
        }
        this.work += edge.options.length;
      } else {
        edgeVal = this.values[edge.options[0]];
      }
      v += edge.prob * edgeVal;
    }
    this.work += 1 + node.edges.length;
    return v;
  }

  // Solves the reach values component by component, successors first, so an
  // acyclic state is final after one evaluation. A cyclic component (healing,
  // or rounds where every shot misses) without decision nodes is solved
  // exactly as a linear system when it is small enough; otherwise it is
  // swept with Gauss-Seidel over its own states until its estimated remaining
  // error is inside the convergence threshold, or, at the sweep cap, until
  // the last sweep moved less than the threshold (the documented acceptance
  // rule). `sweeps` reports the most any swept component needed; an exactly
  // solved component counts as one.
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
    const ordered = this.componentOrder();
    if (!ordered.ok) {
      return { ok: false, sweeps: 0, reason: ordered.reason };
    }
    const { nodes: order, start, cyclic, count } = ordered.components;
    const timedOut = (sweeps: number) => ({
      ok: false,
      sweeps,
      reason: 'time budget exceeded',
    });
    let sweeps = 1;
    let nextCheck = DEADLINE_CHECK_INTERVAL;
    this.work = 0;
    this.componentLocal = new Int32Array(n).fill(-1);
    for (let c = 0; c < count; c++) {
      const from = start[c];
      const to = start[c + 1];
      if (cyclic[c] === 0) {
        const i = order[from];
        const node = this.nodes[i];
        if (!node.terminal) this.values[i] = this.nodeValue(node);
        if (this.work >= nextCheck) {
          nextCheck = this.work + DEADLINE_CHECK_INTERVAL;
          if (this.timeBudgetExceeded()) return timedOut(sweeps);
        }
        continue;
      }
      if (
        to - from <= EXACT_COMPONENT_LIMIT &&
        this.solveComponentExactly(order, from, to)
      ) {
        if (this.work >= nextCheck) {
          nextCheck = this.work + DEADLINE_CHECK_INTERVAL;
          if (this.timeBudgetExceeded()) return timedOut(sweeps);
        }
        continue;
      }
      let converged = false;
      let prevDelta = Infinity;
      let lastDelta = Infinity;
      for (let sweep = 1; sweep <= this.caps.maxSweeps; sweep++) {
        let maxDelta = 0;
        for (let k = from; k < to; k++) {
          const i = order[k];
          const node = this.nodes[i];
          if (node.terminal) continue; // absorbing
          const v = this.nodeValue(node);
          const delta = Math.abs(v - this.values[i]);
          if (delta > maxDelta) maxDelta = delta;
          this.values[i] = v;
          if (this.work >= nextCheck) {
            nextCheck = this.work + DEADLINE_CHECK_INTERVAL;
            if (this.timeBudgetExceeded()) return timedOut(sweeps);
          }
        }
        // Sweeps on a slow cycle shrink by a near-constant ratio r, which
        // leaves about r / (1 - r) times the last delta still to converge.
        // That estimate, not only the last delta, must be inside the
        // threshold; capping it lets floating-point noise that no longer
        // shrinks still count as converged.
        const ratio = maxDelta / prevDelta;
        prevDelta = maxDelta;
        lastDelta = maxDelta;
        const remaining = ratio < 1 ? Math.min(ratio / (1 - ratio), 1e4) : 1e4;
        if (maxDelta * Math.max(1, remaining) < this.caps.convergence) {
          converged = true;
          if (sweep > sweeps) sweeps = sweep;
          break;
        }
      }
      // The estimated-error stop is stricter than the documented rule. At the
      // cap, a sweep that moved less than the threshold is still accepted so
      // no input the whole-graph sweep solved is rejected here.
      if (!converged && lastDelta < this.caps.convergence) {
        converged = true;
        sweeps = this.caps.maxSweeps;
      }
      if (!converged) {
        return {
          ok: false,
          sweeps: this.caps.maxSweeps,
          reason: 'value iteration did not converge',
        };
      }
    }
    if (this.timeBudgetExceeded()) return timedOut(sweeps);
    return { ok: true, sweeps };
  }

  // Solves one cyclic, decision-free component exactly. Its reach values obey
  // v = P v + c, where P holds the outcome probabilities that stay inside the
  // component and c the probability mass flowing to successors outside it
  // (already final, since components are solved successors first), so
  // (I - P) v = c is a small dense linear system. Returns false, leaving the
  // values untouched, when the component holds a decision node or the system
  // is singular or too ill-conditioned; the caller then sweeps it instead.
  private solveComponentExactly(
    order: Int32Array,
    from: number,
    to: number
  ): boolean {
    const size = to - from;
    for (let k = from; k < to; k++) {
      if (this.nodes[order[k]].decisionRole) return false;
    }
    const local = this.componentLocal;
    for (let k = from; k < to; k++) local[order[k]] = k - from;
    const matrix = new Float64Array(size * size);
    const rhs = new Float64Array(size);
    for (let k = from; k < to; k++) {
      const row = k - from;
      const node = this.nodes[order[k]];
      matrix[row * size + row] = 1;
      for (const edge of node.edges) {
        // Decision-free nodes have exactly one successor per outcome.
        const successor = edge.options[0];
        const column = local[successor];
        if (column >= 0) matrix[row * size + column] -= edge.prob;
        else rhs[row] += edge.prob * this.values[successor];
      }
      this.work += 1 + node.edges.length;
    }
    for (let k = from; k < to; k++) local[order[k]] = -1;
    if (!solveLinearSystem(matrix, rhs, size)) return false;
    for (let row = 0; row < size; row++) {
      const v = rhs[row];
      if (!(v >= -1e-9 && v <= 1 + 1e-9)) return false;
    }
    for (let k = from; k < to; k++) {
      this.values[order[k]] = Math.min(1, Math.max(0, rhs[k - from]));
    }
    return true;
  }

  // Picks the option the solved policy takes at a decision edge: the lowest
  // option index whose value is within DECISION_TIE_EPSILON of the best. Any
  // tie-broken choice has the same win value up to that tolerance, though
  // survivor mixes can differ between equally-optimal lines, so the choice
  // must not depend on which option carries the smaller iteration residual.
  private chooseOption(options: number[], decisionRole: Role): number {
    const isMax = decisionRole === 'A';
    let bestVal = isMax ? -Infinity : Infinity;
    for (const option of options) {
      const v = this.values[option];
      if (isMax ? v > bestVal : v < bestVal) bestVal = v;
    }
    for (const option of options) {
      if (Math.abs(this.values[option] - bestVal) <= DECISION_TIE_EPSILON) {
        return option;
      }
    }
    return options[0];
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

  // Moves mass sitting on one state to its successors under the solved policy
  // (or into `absorbed` at a terminal). Counts its work like nodeValue.
  private pushMass(
    i: number,
    m: number,
    mass: Float64Array,
    absorbed: Float64Array
  ): void {
    const node = this.nodes[i];
    if (node.terminal) {
      absorbed[i] += m;
      this.work++;
      return;
    }
    for (const edge of node.edges) {
      const targetIdx = node.decisionRole
        ? this.chooseOption(edge.options, node.decisionRole)
        : edge.options[0];
      mass[targetIdx] += edge.prob * m;
    }
    this.work += 1 + node.edges.length;
  }

  // Pushes mass through the components in topological order, so an acyclic
  // state is pushed once, after all of its mass has arrived. A cyclic
  // component circulates its mass in passes until at most its share of
  // FORWARD_RESIDUAL is still in flight or FORWARD_MAX_STEPS passes have run;
  // what is left never terminates and stays out of `absorbed`, so it lands in
  // the residual the caller credits to the defender.
  private propagateTerminalMass(): TerminalMassResult {
    if (this.timeBudgetExceeded()) {
      return { ok: false, reason: 'time budget exceeded' };
    }
    const ordered = this.componentOrder();
    if (!ordered.ok) return ordered;
    const { nodes: order, start, cyclic, count } = ordered.components;
    const n = this.nodes.length;
    const mass = new Float64Array(n);
    const absorbed = new Float64Array(n);
    mass[this.initialIndex] = 1;
    let cyclicCount = 0;
    for (let c = 0; c < count; c++) cyclicCount += cyclic[c];
    const componentResidual = FORWARD_RESIDUAL / Math.max(1, cyclicCount);

    let steps = 1;
    let nextCheck = DEADLINE_CHECK_INTERVAL;
    this.work = 0;
    for (let c = count - 1; c >= 0; c--) {
      const from = start[c];
      const to = start[c + 1];
      if (cyclic[c] === 0) {
        const i = order[from];
        const m = mass[i];
        if (m === 0) continue;
        mass[i] = 0;
        this.pushMass(i, m, mass, absorbed);
        if (this.work >= nextCheck) {
          nextCheck = this.work + DEADLINE_CHECK_INTERVAL;
          if (this.timeBudgetExceeded()) {
            return { ok: false, reason: 'time budget exceeded' };
          }
        }
        continue;
      }
      // Discovery order follows the cycle's edges, so one pass carries mass
      // all the way round and only the closing edge waits for the next pass.
      for (let step = 1; step <= FORWARD_MAX_STEPS; step++) {
        for (let k = to - 1; k >= from; k--) {
          const i = order[k];
          const m = mass[i];
          if (m === 0) continue;
          mass[i] = 0;
          this.pushMass(i, m, mass, absorbed);
          if (this.work >= nextCheck) {
            nextCheck = this.work + DEADLINE_CHECK_INTERVAL;
            if (this.timeBudgetExceeded()) {
              return { ok: false, reason: 'time budget exceeded' };
            }
          }
        }
        let circulating = 0;
        for (let k = from; k < to; k++) circulating += mass[order[k]];
        if (step > steps) steps = step;
        if (circulating <= componentResidual) break;
      }
      for (let k = from; k < to; k++) mass[order[k]] = 0;
    }
    this.forwardSteps = steps;

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
