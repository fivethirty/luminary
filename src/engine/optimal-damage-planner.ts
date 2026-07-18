import { Ship, Shot } from './ship';
import { Phase } from './battle';
import type { Fleet } from './fleet';
import { enumerateCandidates } from './candidate-enumerator';
import { BattleModel, Role, Terminal, WorkingState } from './battle-state';
import {
  DEFAULT_CAPS,
  SolverCaps,
  WinProbabilitySolver,
} from './win-probability-solver';

export type BattleContext = { attacker: Fleet; defender: Fleet };

// Interactive budget: cap the one-time solve so a large fleet falls back to the
// heuristic quickly instead of freezing. The solve is per-matchup and cached,
// so this bounds the worst-case stall, not steady-state cost.
export const DEFAULT_PLANNER_SOLVE_CAPS: SolverCaps = {
  ...DEFAULT_CAPS,
  maxMillis: 2_000,
  maxStates: 250_000,
};

export type FallbackAssign = (
  shots: Shot[],
  ships: Ship[],
  upcomingPhases: Phase[]
) => void;

/**
 * Assigns damage by looking up the exactly-solved optimal value of each
 * candidate successor state. The heavy work — building the reachable graph and
 * value-iterating to a fixed point — happens once per distinct matchup in
 * setBattleContext; every assignment is then a handful of table lookups.
 */
export class OptimalDamagePlanner {
  private ctx: BattleContext | null = null;
  private ownRole: Role = 'A';
  private attackerRoster: Ship[] = [];
  private defenderRoster: Ship[] = [];
  private model: BattleModel | null = null;
  private solver: WinProbabilitySolver | null = null;
  // Solvers persist across battles/iterations, keyed by matchup signature, so a
  // CombatSimulator run solves each unique pairing only once.
  private readonly solverCache = new Map<
    string,
    { model: BattleModel; solver: WinProbabilitySolver } | null
  >();

  constructor(
    private readonly fallback: FallbackAssign,
    private readonly solveCaps: SolverCaps = DEFAULT_PLANNER_SOLVE_CAPS
  ) {}

  setBattleContext(ctx: BattleContext, ownFleet: Fleet): void {
    this.ctx = ctx;
    this.ownRole = ownFleet === ctx.attacker ? 'A' : 'D';
    this.attackerRoster = ctx.attacker.getRoster();
    this.defenderRoster = ctx.defender.getRoster();

    const signature = this.buildSignature();
    if (this.solverCache.has(signature)) {
      const cached = this.solverCache.get(signature)!;
      this.model = cached?.model ?? null;
      this.solver = cached?.solver ?? null;
      return;
    }

    const model = new BattleModel(
      this.attackerRoster,
      this.defenderRoster,
      ctx.attacker.antimatterSplitter,
      ctx.defender.antimatterSplitter
    );
    const solver = new WinProbabilitySolver(
      model,
      this.ownRole,
      'optimal',
      this.solveCaps
    );
    const result = solver.solve();
    if (!result.ok) {
      // Too large / too slow to solve exactly → fall back to the heuristic.
      this.solverCache.set(signature, null);
      this.model = null;
      this.solver = null;
      return;
    }
    this.solverCache.set(signature, { model, solver });
    this.model = model;
    this.solver = solver;
  }

  assignDamage(
    shots: Shot[],
    targetShips: Ship[],
    upcomingPhases: Phase[]
  ): void {
    if (shots.length === 0 || targetShips.length === 0) return;
    if (!this.ctx || !this.model || !this.solver) {
      this.fallback(shots, targetShips, upcomingPhases);
      return;
    }

    const candidates = enumerateCandidates(shots, targetShips);
    if (candidates === null) {
      this.fallback(shots, targetShips, upcomingPhases);
      return;
    }
    if (candidates.length === 0) return;
    if (candidates.length === 1) {
      this.applyAssignment(targetShips, candidates[0].damageAssignments);
      return;
    }

    const nextSlot = this.nextSlotIndex(upcomingPhases);
    // Live HP in roster order; the target fleet gets each candidate applied.
    const ownIsAttacker = this.ownRole === 'A';
    const targetRoster = ownIsAttacker
      ? this.defenderRoster
      : this.attackerRoster;
    const ownHp = (
      ownIsAttacker ? this.attackerRoster : this.defenderRoster
    ).map((s) => s.remainingHP());
    const targetBaseHp = targetRoster.map((s) => s.remainingHP());
    const rosterIndex = new Map<Ship, number>();
    targetRoster.forEach((s, i) => rosterIndex.set(s, i));

    const isMax = ownIsAttacker; // attacker maximizes reach value, defender minimizes

    let bestCandidate = candidates[0];
    let bestValue = isMax ? -Infinity : Infinity;
    for (const candidate of candidates) {
      const targetHp = targetBaseHp.slice();
      for (let i = 0; i < targetShips.length; i++) {
        const idx = rosterIndex.get(targetShips[i]);
        if (idx === undefined) continue;
        const dmg = Math.min(
          candidate.damageAssignments[i],
          targetShips[i].remainingHP()
        );
        targetHp[idx] = targetShips[i].remainingHP() - dmg;
      }
      const value = this.valueOfSuccessor(ownHp, targetHp, nextSlot);
      if (value === undefined) {
        // A state the solver never reached: bail to the safe heuristic.
        this.fallback(shots, targetShips, upcomingPhases);
        return;
      }
      if (isMax ? value > bestValue : value < bestValue) {
        bestValue = value;
        bestCandidate = candidate;
      }
    }

    this.applyAssignment(targetShips, bestCandidate.damageAssignments);
  }

  // Reach value (solver convention) of the position after an assignment. A dead
  // fleet is an absorbing terminal; otherwise it is a graph-state lookup.
  private valueOfSuccessor(
    ownHp: number[],
    targetHp: number[],
    nextSlot: number
  ): number | undefined {
    const ownIsAttacker = this.ownRole === 'A';
    const hpA = ownIsAttacker ? ownHp : targetHp;
    const hpB = ownIsAttacker ? targetHp : ownHp;

    const attackerAlive = hpA.some((h) => h > 0);
    const defenderAlive = hpB.some((h) => h > 0);
    if (!attackerAlive || !defenderAlive) {
      let outcome: Terminal;
      if (!attackerAlive && !defenderAlive) outcome = 'Draw';
      else if (!attackerAlive) outcome = 'DefenderWins';
      else outcome = 'AttackerWins';
      return this.terminalValue(outcome);
    }

    const state: WorkingState = { hpA, hpB, slot: nextSlot };
    return this.solver!.getValue(this.model!.canonicalKey(state));
  }

  private terminalValue(outcome: Terminal): number {
    if (this.ownRole === 'A') return outcome === 'AttackerWins' ? 1 : 0;
    return outcome === 'AttackerWins' || outcome === 'Draw' ? 1 : 0;
  }

  // Schedule index of the next phase to resolve (front of the queue). Falls back
  // to the first cannon slot when the queue is empty (round wrap).
  private nextSlotIndex(upcomingPhases: Phase[]): number {
    if (upcomingPhases.length === 0) return this.model!.firstCannonSlot;
    const next = upcomingPhases[0];
    const role: Role = next.shootingFleet === this.ctx!.attacker ? 'A' : 'D';
    const idx = this.model!.findSlot(
      role,
      next.initiative,
      next.missilePhase ?? false
    );
    return idx >= 0 ? idx : this.model!.firstCannonSlot;
  }

  private applyAssignment(targetShips: Ship[], assignments: number[]): void {
    for (let i = 0; i < targetShips.length; i++) {
      const dmg = assignments[i];
      if (dmg <= 0) continue;
      targetShips[i].takeDamage(Math.min(dmg, targetShips[i].remainingHP()));
    }
  }

  private buildSignature(): string {
    const roster = (ships: Ship[]) =>
      ships
        .map((s) => s.configKey())
        .sort()
        .join(',');
    return `${this.ownRole}|A:${roster(this.attackerRoster)}|D:${roster(
      this.defenderRoster
    )}`;
  }
}
