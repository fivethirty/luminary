/**
 * Pure state transitions for exact combat. This module owns schedule and
 * successor construction; WinProbabilitySolver owns graph values and policy.
 */
import { DamageType } from 'src/constants';
import { Ship, Shot } from './ship';
import { Fleet } from './fleet';
import { Phase } from './battle';
import { BinnedDamageAssignmentHelper } from './binned-damage-assignment-helper';
import { enumerateSlotOutcomes } from './dice-distribution';
import { enumerateCandidates } from './candidate-enumerator';
import { Terminal, terminalFromSurvival } from './battle-rules';

export type Role = 'A' | 'D';
export type { Terminal } from './battle-rules';

// A slot in the fixed battle schedule (fact 1): missile slots first (initiative
// descending, defender before attacker on ties), then cannon slots in the same
// order. Missile slots are consumed once; cannon slots repeat cyclically.
export type Slot = { role: Role; initiative: number; missile: boolean };

// HP aligned to each fleet's original roster order (0 = dead) plus the schedule
// position. Roster order is preserved so heuristic materialization matches the
// engine's first-seen ordering.
export type WorkingState = {
  hpA: number[];
  hpB: number[];
  slot: number;
};

// A successor of one dice outcome + assignment: either an absorbing terminal
// (with the final HP vectors, so survivors can be read off) or the next working
// state (already advanced/healed).
export type Successor =
  | { terminal: Terminal; hpA: number[]; hpB: number[] }
  | { state: WorkingState };

export type Expansion =
  | { kind: 'terminal'; outcome: Terminal }
  | { kind: 'move'; decisionRole: Role | null; edges: MoveEdge[] }
  | { kind: 'fail' };

// One dice outcome. For a heuristic slot `options` has length 1 (deterministic
// assignment); for an optimal-mode player slot it holds the candidate
// successors that slot's owner chooses among.
export type MoveEdge = { prob: number; options: Successor[] };

export type ExpandContext = {
  decisionRoles: readonly Role[];
  maxOutcomes: number;
};

type AssignmentControl =
  | { kind: 'decision'; role: Role }
  | { kind: 'heuristic'; damageType: DamageType.NPC | DamageType.DPS };

export class BattleModel {
  readonly schedule: Slot[];
  private readonly numMissileSlots: number;
  private readonly attackerIsNpc: boolean;
  private readonly defenderIsNpc: boolean;

  constructor(
    private readonly attackerTemplates: Ship[],
    private readonly defenderTemplates: Ship[],
    private readonly attackerSplitter: boolean,
    private readonly defenderSplitter: boolean
  ) {
    this.schedule = this.buildSchedule();
    this.numMissileSlots = this.schedule.filter((s) => s.missile).length;
    this.attackerIsNpc = !attackerTemplates.some((s) => s.isPlayerShip());
    this.defenderIsNpc = !defenderTemplates.some((s) => s.isPlayerShip());
  }

  // Mirrors getAllPhases(): each fleet contributes a cannon slot for every
  // distinct initiative and a missile slot for every initiative holding a
  // missile ship; then missiles-first, initiative-descending, defender-first.
  private buildSchedule(): Slot[] {
    const forFleet = (templates: Ship[], role: Role): Slot[] => {
      const initiatives = Array.from(
        new Set(templates.map((s) => s.initiative))
      );
      const cannon: Slot[] = initiatives.map((initiative) => ({
        role,
        initiative,
        missile: false,
      }));
      const hasMissiles = templates.some((s) => s.hasMissiles());
      if (!hasMissiles) return cannon;
      const missile: Slot[] = initiatives
        .filter((initiative) =>
          templates.some((s) => s.initiative === initiative && s.hasMissiles())
        )
        .map((initiative) => ({ role, initiative, missile: true }));
      return [...missile, ...cannon];
    };

    // Defender phases first in the array so the stable sort keeps defender ahead
    // of attacker on ties (matches battle.ts).
    const combined = [
      ...forFleet(this.defenderTemplates, 'D'),
      ...forFleet(this.attackerTemplates, 'A'),
    ];
    return combined
      .map((slot, index) => ({ slot, index }))
      .sort((a, b) => {
        if (a.slot.missile !== b.slot.missile) {
          return a.slot.missile ? -1 : 1;
        }
        if (a.slot.initiative !== b.slot.initiative) {
          return b.slot.initiative - a.slot.initiative;
        }
        return a.index - b.index; // stable: defender before attacker
      })
      .map((entry) => entry.slot);
  }

  initialState(): WorkingState {
    return {
      hpA: this.attackerTemplates.map((s) => s.maxHP()),
      hpB: this.defenderTemplates.map((s) => s.maxHP()),
      slot: 0,
    };
  }

  // Index of the first cannon slot (where a wrapped round resumes).
  get firstCannonSlot(): number {
    return this.numMissileSlots;
  }

  // Schedule index of a slot by descriptor, or -1 if none matches.
  findSlot(role: Role, initiative: number, missile: boolean): number {
    return this.schedule.findIndex(
      (s) =>
        s.role === role && s.initiative === initiative && s.missile === missile
    );
  }

  // Interchangeable ships (same config) collapse: sort HP within each config
  // group. Slot index captures missile-consumption (missiles are a prefix).
  canonicalKey(state: WorkingState): string {
    const side = (templates: Ship[], hp: number[]): string => {
      const groups = new Map<string, number[]>();
      for (let i = 0; i < templates.length; i++) {
        const key = templates[i].configKey();
        const list = groups.get(key);
        if (list) list.push(hp[i]);
        else groups.set(key, [hp[i]]);
      }
      return Array.from(groups.entries())
        .map(
          ([key, hps]) =>
            `${key}=${hps
              .slice()
              .sort((a, b) => a - b)
              .join('.')}`
        )
        .sort()
        .join(';');
    };
    return `${state.slot}|A:${side(this.attackerTemplates, state.hpA)}|D:${side(
      this.defenderTemplates,
      state.hpB
    )}`;
  }

  private anyAlive(hp: number[]): boolean {
    return hp.some((h) => h > 0);
  }

  private hasLivingCannon(templates: Ship[], hp: number[]): boolean {
    for (let i = 0; i < templates.length; i++) {
      if (hp[i] > 0 && templates[i].hasCannons()) return true;
    }
    return false;
  }

  // Advance from `fromSlot` to the next slot, applying heal + the mutual-no-
  // cannons stalemate check when a full cannon cycle wraps (fact 5).
  private advance(hpA: number[], hpB: number[], fromSlot: number): Successor {
    const terminal = terminalFromSurvival(
      this.anyAlive(hpA),
      this.anyAlive(hpB)
    );
    if (terminal) return { terminal, hpA, hpB };

    const lastSlot = this.schedule.length - 1;
    if (fromSlot === lastSlot) {
      // End of a cannon cycle: heal both fleets, then check stalemate.
      const healedA = this.applyHeal(this.attackerTemplates, hpA);
      const healedB = this.applyHeal(this.defenderTemplates, hpB);
      if (
        !this.hasLivingCannon(this.attackerTemplates, healedA) &&
        !this.hasLivingCannon(this.defenderTemplates, healedB)
      ) {
        return { terminal: 'DefenderWins', hpA: healedA, hpB: healedB };
      }
      return {
        state: { hpA: healedA, hpB: healedB, slot: this.numMissileSlots },
      };
    }
    return { state: { hpA, hpB, slot: fromSlot + 1 } };
  }

  private applyHeal(templates: Ship[], hp: number[]): number[] {
    return hp.map((h, i) => {
      if (h <= 0) return h; // dead ships don't heal
      const heal = templates[i].heal;
      if (heal <= 0) return h;
      return Math.min(templates[i].maxHP(), h + heal);
    });
  }

  private materializeFleet(
    templates: Ship[],
    hp: number[],
    splitter: boolean
  ): { fleet: Fleet; ships: Ship[] } {
    const ships = templates.map((template, i) => {
      const clone = template.clone();
      const damage = template.maxHP() - hp[i];
      if (damage > 0) clone.takeDamage(damage);
      return clone;
    });
    const fleet = new Fleet('mat', ships, splitter, DamageType.DPS);
    return { fleet, ships };
  }

  private livingHpVector(ships: Ship[]): number[] {
    return ships.map((s) => s.remainingHP());
  }

  // The upcoming-phase tail a heuristic planner reads. Only leading missile
  // phases matter (DPS returns cannon priority at the first non-missile phase),
  // so cannon slots need no tail; missile slots need the remaining missile
  // phases (referencing the materialized target ships) plus one cannon phase.
  private buildPhaseTail(
    fromSlot: number,
    attackerFleet: Fleet,
    defenderFleet: Fleet
  ): Phase[] {
    if (!this.schedule[fromSlot].missile) return [];
    const tail: Phase[] = [];
    for (let i = fromSlot + 1; i < this.schedule.length; i++) {
      const slot = this.schedule[i];
      if (!slot.missile) break;
      const shootingFleet = slot.role === 'A' ? attackerFleet : defenderFleet;
      const targetFleet = slot.role === 'A' ? defenderFleet : attackerFleet;
      tail.push({
        ships: shootingFleet.getLivingShipsAtInitiative(slot.initiative),
        initiative: slot.initiative,
        shootingFleet,
        targetFleet,
        missilePhase: true,
      });
    }
    // A single placeholder cannon phase to end the leading-missile run.
    tail.push({
      ships: [],
      initiative: 0,
      shootingFleet: attackerFleet,
      targetFleet: defenderFleet,
      missilePhase: false,
    });
    return tail;
  }

  /**
   * Expands one state into its dice/assignment structure. Successor states are
   * already advanced (slot moved, heal + stalemate applied) and terminals
   * detected. Returns { kind: 'fail' } if a cap is exceeded.
   */
  expand(state: WorkingState, ctx: ExpandContext): Expansion {
    if (!this.anyAlive(state.hpA)) {
      return {
        kind: 'terminal',
        outcome: this.anyAlive(state.hpB) ? 'DefenderWins' : 'Draw',
      };
    }
    if (!this.anyAlive(state.hpB)) {
      return { kind: 'terminal', outcome: 'AttackerWins' };
    }

    const slot = this.schedule[state.slot];
    const shooterIsAttacker = slot.role === 'A';
    const shooterTemplates = shooterIsAttacker
      ? this.attackerTemplates
      : this.defenderTemplates;
    const shooterHp = shooterIsAttacker ? state.hpA : state.hpB;
    const targetTemplates = shooterIsAttacker
      ? this.defenderTemplates
      : this.attackerTemplates;
    const targetHp = shooterIsAttacker ? state.hpB : state.hpA;
    const shooterSplitter = shooterIsAttacker
      ? this.attackerSplitter
      : this.defenderSplitter;
    const shooterIsNpc = shooterIsAttacker
      ? this.attackerIsNpc
      : this.defenderIsNpc;

    // Living shooters at this initiative.
    const livingShooterIdx: number[] = [];
    for (let i = 0; i < shooterTemplates.length; i++) {
      if (
        shooterHp[i] > 0 &&
        shooterTemplates[i].initiative === slot.initiative
      ) {
        livingShooterIdx.push(i);
      }
    }
    const shooterShips = livingShooterIdx.map((i) => shooterTemplates[i]);

    const enemyShields = Array.from(
      new Set(
        targetHp
          .map((h, i) => (h > 0 ? targetTemplates[i].shields : null))
          .filter((s): s is number => s !== null)
      )
    );

    const outcomes = enumerateSlotOutcomes(
      shooterShips,
      slot.missile,
      enemyShields,
      slot.missile ? false : shooterSplitter,
      ctx.maxOutcomes
    );
    if (outcomes === null) return { kind: 'fail' };

    // No shooters / no dice at all: deterministic advance.
    if (shooterShips.length === 0 || outcomes.length === 0) {
      const succ = this.advance(state.hpA, state.hpB, state.slot);
      return {
        kind: 'move',
        decisionRole: null,
        edges: [{ prob: 1, options: [succ] }],
      };
    }

    const assignmentControl = this.assignmentControl(slot, shooterIsNpc, ctx);
    const decisionRole =
      assignmentControl.kind === 'decision' ? assignmentControl.role : null;

    const edges: MoveEdge[] = [];
    for (const outcome of outcomes) {
      const options = this.resolveOutcome(
        state,
        slot,
        outcome,
        shooterIsAttacker,
        shooterTemplates,
        targetTemplates,
        assignmentControl
      );
      if (options === null) return { kind: 'fail' };
      edges.push({ prob: outcome.prob, options });
    }
    return { kind: 'move', decisionRole, edges };
  }

  // Applies rift self-damage and target assignment for one dice outcome, then
  // advances into successor state(s). One successor for heuristic slots; the
  // candidate successors for an optimal player-fleet decision slot.
  private resolveOutcome(
    state: WorkingState,
    slot: Slot,
    outcome: { shots: Shot[]; selfDamage: number },
    shooterIsAttacker: boolean,
    shooterTemplates: Ship[],
    targetTemplates: Ship[],
    assignmentControl: AssignmentControl
  ): Successor[] | null {
    const shooterHp = shooterIsAttacker ? state.hpA : state.hpB;
    const targetHp = shooterIsAttacker ? state.hpB : state.hpA;
    const shooterSplitFlag = shooterIsAttacker
      ? this.attackerSplitter
      : this.defenderSplitter;

    // Materialize both fleets so heuristics/candidates run against real ships.
    const shooterMat = this.materializeFleet(
      shooterTemplates,
      shooterHp,
      shooterSplitFlag
    );
    const targetMat = this.materializeFleet(
      targetTemplates,
      targetHp,
      shooterIsAttacker ? this.defenderSplitter : this.attackerSplitter
    );

    // Apply rift self-damage to the shooter's living rift ships (NPC-assigned).
    if (!slot.missile && outcome.selfDamage > 0) {
      const selfShots = Array.from({ length: outcome.selfDamage }, () => ({
        roll: 6,
        computers: 0,
        damage: 1,
      }));
      const riftShips = shooterMat.fleet.getLivingRiftShips();
      if (riftShips.length > 0) {
        new BinnedDamageAssignmentHelper().assignDamage(
          selfShots,
          riftShips,
          DamageType.NPC,
          []
        );
      }
    }
    const newShooterHp = this.livingHpVector(shooterMat.ships);

    const targetLiving = targetMat.ships.filter((s) => s.isAlive());

    const buildSuccessor = (): Successor => {
      const newTargetHp = this.livingHpVector(targetMat.ships);
      const hpA = shooterIsAttacker ? newShooterHp : newTargetHp;
      const hpB = shooterIsAttacker ? newTargetHp : newShooterHp;
      return this.finishSlot(hpA, hpB, state.slot, slot);
    };

    if (outcome.shots.length === 0 || targetLiving.length === 0) {
      // No target damage this outcome.
      return [buildSuccessor()];
    }

    if (assignmentControl.kind === 'decision') {
      const candidates = enumerateCandidates(outcome.shots, targetLiving);
      if (candidates === null) return null;
      if (candidates.length === 0) return [buildSuccessor()];
      return candidates.map((candidate) => {
        const newTargetHp = targetMat.ships.map((s) => s.remainingHP());
        for (let i = 0; i < targetLiving.length; i++) {
          const dmg = Math.min(
            candidate.damageAssignments[i],
            targetLiving[i].remainingHP()
          );
          const rosterIdx = targetMat.ships.indexOf(targetLiving[i]);
          newTargetHp[rosterIdx] = targetLiving[i].remainingHP() - dmg;
        }
        const hpA = shooterIsAttacker ? newShooterHp : newTargetHp;
        const hpB = shooterIsAttacker ? newTargetHp : newShooterHp;
        return this.finishSlot(hpA, hpB, state.slot, slot);
      });
    }

    // Heuristic assignment: DPS for player fleets, NPC otherwise.
    const phases = this.buildPhaseTail(
      state.slot,
      shooterIsAttacker ? shooterMat.fleet : targetMat.fleet,
      shooterIsAttacker ? targetMat.fleet : shooterMat.fleet
    );
    new BinnedDamageAssignmentHelper().assignDamage(
      outcome.shots,
      targetLiving,
      assignmentControl.damageType,
      phases
    );
    return [buildSuccessor()];
  }

  private assignmentControl(
    slot: Slot,
    shooterIsNpc: boolean,
    ctx: ExpandContext
  ): AssignmentControl {
    if (shooterIsNpc) {
      return { kind: 'heuristic', damageType: DamageType.NPC };
    }
    if (ctx.decisionRoles.includes(slot.role)) {
      return { kind: 'decision', role: slot.role };
    }
    return { kind: 'heuristic', damageType: DamageType.DPS };
  }

  // Terminal check after a slot's damage (fact 4), else advance.
  private finishSlot(
    hpA: number[],
    hpB: number[],
    fromSlot: number,
    slot: Slot
  ): Successor {
    const attackerAlive = this.anyAlive(hpA);
    const defenderAlive = this.anyAlive(hpB);
    if (slot.missile) {
      // Missile phases only check target death (battle.ts resolveMissilePhase).
      if (slot.role === 'A' && !defenderAlive)
        return { terminal: 'AttackerWins', hpA, hpB };
      if (slot.role === 'D' && !attackerAlive)
        return { terminal: 'DefenderWins', hpA, hpB };
      return this.advance(hpA, hpB, fromSlot);
    }
    const terminal = terminalFromSurvival(attackerAlive, defenderAlive);
    if (terminal) return { terminal, hpA, hpB };
    return this.advance(hpA, hpB, fromSlot);
  }

  // Living-ship counts by type for one side of a terminal HP vector.
  survivorsByType(role: Role, hp: number[]): Partial<Record<string, number>> {
    const templates =
      role === 'A' ? this.attackerTemplates : this.defenderTemplates;
    const counts: Partial<Record<string, number>> = {};
    for (let i = 0; i < templates.length; i++) {
      if (hp[i] > 0) {
        counts[templates[i].type] = (counts[templates[i].type] ?? 0) + 1;
      }
    }
    return counts;
  }
}
