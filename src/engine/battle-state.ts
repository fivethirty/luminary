/**
 * Pure state transitions for exact combat. This module owns schedule and
 * successor construction; WinProbabilitySolver owns graph values and policy.
 */
import { DamageType } from 'src/constants';
import { Ship, Shot, WeaponDamage } from './ship';
import { Fleet } from './fleet';
import { Phase } from './battle';
import { BinnedDamageAssignmentHelper } from './binned-damage-assignment-helper';
import { sortShotsForAssignment } from './abstract-damage-planner';
import { DpsRemovalDamagePlanner } from './dps-removal-damage-planner';
import { NpcDamagePlanner } from './npc-damage-planner';
import { enumerateSlotOutcomes, type SlotOutcome } from './dice-distribution';
import { enumerateCandidates } from './candidate-enumerator';
import { Terminal, terminalFromSurvival } from './battle-rules';

export type Role = 'A' | 'D';
export type { Terminal } from './battle-rules';

// A slot in the fixed battle schedule (fact 1): missile slots first (initiative
// descending, defender before attacker on ties), then cannon slots in the same
// order. Missile slots are consumed once; cannon slots repeat cyclically.
type Slot = { role: Role; initiative: number; missile: boolean };

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

type Expansion =
  | { kind: 'terminal'; outcome: Terminal }
  | { kind: 'move'; decisionRole: Role | null; edges: MoveEdge[] }
  | { kind: 'fail'; reason: 'expand cap exceeded' | 'time budget exceeded' };

// One dice outcome. For a heuristic slot `options` has length 1 (deterministic
// assignment); for an optimal-mode player slot it holds the candidate
// successors that slot's owner chooses among.
type MoveEdge = { prob: number; options: Successor[] };

export type ExpandContext = {
  decisionRoles: readonly Role[];
  maxOutcomes: number;
  // The solver owns the absolute deadline and passes a cheap predicate into
  // expansion so one expensive state cannot monopolize the remaining budget.
  deadlineExceeded?: () => boolean;
};

type AssignmentControl =
  | { kind: 'decision'; role: Role }
  | { kind: 'heuristic'; damageType: DamageType.NPC | DamageType.DPS };

type MaterializedFleet = { fleet: Fleet; ships: Ship[] };
type OutcomeScratch = {
  shooter: MaterializedFleet;
  target: MaterializedFleet;
  // Whether the shooter ships still hold a previous outcome's rift
  // self-damage and must be reset before the next outcome reads them.
  shooterDirty: boolean;
};

type CanonicalGroup = {
  key: string;
  indices: number[];
  hpWeights: number[];
  // Exclusive upper bound of this group's histogram code: every canonical HP
  // multiset of the group encodes below it, so groups stack as mixed radix.
  radix: number;
};

// One heuristic-assignment memo context: the target side, planner, target
// shield and missile-tail signature that fix a planner's ship ordering. When
// `groupOrderFree` is true the planner never ties two different configuration
// groups, so its sorted target sequence depends only on the per-group HP
// multisets and the memo can key on the canonical HP code; otherwise it keys
// on the raw roster HP vector, which is always exact.
type HeuristicMemoContext = { prefix: string; groupOrderFree: boolean };
// Mixed-radix layout of one side's canonical (histogram-coded) or raw HP
// vector. `radix` is the exclusive bound of the side code.
type SideCodeLayout = { radix: number };

// Everything one expansion computes before the joint advance step: for each
// dice outcome its probability, the shooter's HP after rift self-damage (null
// when unchanged) and the target HP vector of each assignment option. Vectors
// are representatives of canonical states and are shared, never mutated.
type TemplateOutcome = {
  prob: number;
  shooterHp: number[] | null;
  targets: number[][];
};
type TransitionTemplate = {
  decisionRole: Role | null;
  outcomes: TemplateOutcome[];
};

const TERMINAL_OUTCOMES: readonly Terminal[] = [
  'AttackerWins',
  'DefenderWins',
  'Draw',
];

export class BattleModel {
  readonly schedule: Slot[];
  private readonly numMissileSlots: number;
  private readonly attackerDamageType: DamageType;
  private readonly defenderDamageType: DamageType;
  private readonly attackerTemplates: Ship[];
  private readonly defenderTemplates: Ship[];
  private readonly attackerInitialHp: number[];
  private readonly defenderInitialHp: number[];
  private readonly attackerCanonicalGroups: CanonicalGroup[];
  private readonly defenderCanonicalGroups: CanonicalGroup[];
  private readonly attackerCanonicalLayout: SideCodeLayout;
  private readonly defenderCanonicalLayout: SideCodeLayout;
  // Whether (slot, canonical A, canonical D) packs into one safe integer.
  private readonly canonicalCodeFits: boolean;
  private readonly attackerRawWeights: number[];
  private readonly defenderRawWeights: number[];
  private readonly attackerRawRadix: number;
  private readonly defenderRawRadix: number;
  // Whether (outcome, raw hpA, raw hpB) packs into one safe integer.
  private readonly terminalCodeFits: boolean;
  // Fallback when a fleet is too large for numeric packing: string keys are
  // interned to dense ids so callers can still key by number.
  private readonly internedIds = new Map<string, number>();
  private readonly internedKeys: string[] = [];
  // Per slot: roster indices of ships that would contribute dice to that slot
  // while alive (initiative match plus a relevant weapon).
  private readonly slotDiceIndices: number[][];
  // Parallel to slotDiceIndices: the mixed-radix weight of each dice ship's
  // configuration group, so the living dice ships of a slot reduce to one
  // per-group count code (see transitionKey).
  private readonly slotDiceWeights: number[][];
  // Per cannon slot: whether a dice ship there carries rift dice, whose
  // self-damage makes the transition depend on the shooter's own HP.
  private readonly slotHasRift: boolean[];
  private readonly attackerMixedShields: boolean;
  private readonly defenderMixedShields: boolean;
  // Transition templates keyed by the factor of the joint state that the
  // expansion actually depends on (transitionKey). `null` marks a factor whose
  // heuristic planner ordering can tie ships of different configurations, so
  // its states are expanded individually to preserve first-seen semantics.
  private readonly transitionMemo = new Map<
    string,
    TransitionTemplate | null
  >();
  private readonly ctxSignatures = new WeakMap<ExpandContext, string>();
  private readonly slotOutcomeCache = new Map<string, SlotOutcome[]>();
  // Deterministic NPC/DPS assignment results keyed by everything the planners
  // read (see heuristicMemoKey). Values are the resulting target HP per
  // canonical group in (current HP, roster index) order.
  private readonly heuristicMemo = new Map<string, number[]>();
  private readonly heuristicContexts = new Map<string, HeuristicMemoContext>();
  private readonly shotSignatures = new WeakMap<Shot[], string>();
  private readonly slotTailSignatures: string[];
  private readonly slotTailInitiatives: number[][];
  // One helper for the whole solve: its planners only cache pure per-config
  // priorities, and the mutable engine also keeps one helper per fleet.
  private readonly assignmentHelper = new BinnedDamageAssignmentHelper();
  // Real ships for the planners and candidate enumeration, cloned once per
  // solve and reset to each outcome's HP before use (see resolveOutcome).
  private readonly attackerScratch: MaterializedFleet;
  private readonly defenderScratch: MaterializedFleet;

  constructor(
    attackerTemplates: Ship[],
    defenderTemplates: Ship[],
    private readonly attackerSplitter: boolean,
    private readonly defenderSplitter: boolean,
    attackerDamageType?: DamageType,
    defenderDamageType?: DamageType
  ) {
    this.attackerInitialHp = attackerTemplates.map((s) => s.remainingHP());
    this.defenderInitialHp = defenderTemplates.map((s) => s.remainingHP());
    this.attackerTemplates = attackerTemplates.map((s) => {
      const template = s.clone();
      template.resetDamage();
      return template;
    });
    this.defenderTemplates = defenderTemplates.map((s) => {
      const template = s.clone();
      template.resetDamage();
      return template;
    });
    this.attackerScratch = this.materializeFleet(
      this.attackerTemplates,
      this.attackerInitialHp,
      attackerSplitter
    );
    this.defenderScratch = this.materializeFleet(
      this.defenderTemplates,
      this.defenderInitialHp,
      defenderSplitter
    );
    this.attackerCanonicalGroups = this.buildCanonicalGroups(
      this.attackerTemplates
    );
    this.defenderCanonicalGroups = this.buildCanonicalGroups(
      this.defenderTemplates
    );
    this.attackerCanonicalLayout = BattleModel.canonicalLayout(
      this.attackerCanonicalGroups
    );
    this.defenderCanonicalLayout = BattleModel.canonicalLayout(
      this.defenderCanonicalGroups
    );
    this.attackerRawWeights = BattleModel.rawWeights(this.attackerTemplates);
    this.defenderRawWeights = BattleModel.rawWeights(this.defenderTemplates);
    this.attackerRawRadix = BattleModel.rawRadix(
      this.attackerTemplates,
      this.attackerRawWeights
    );
    this.defenderRawRadix = BattleModel.rawRadix(
      this.defenderTemplates,
      this.defenderRawWeights
    );
    this.schedule = this.buildSchedule();
    this.numMissileSlots = this.schedule.filter((s) => s.missile).length;
    this.slotTailInitiatives = this.schedule.map((_, index) =>
      this.targetMissileTailInitiatives(index)
    );
    this.slotTailSignatures = this.slotTailInitiatives.map(
      (initiatives, index) =>
        this.schedule[index].missile ? `m${initiatives.join(',')}` : 'c'
    );
    this.canonicalCodeFits =
      Math.max(1, this.schedule.length) *
        this.attackerCanonicalLayout.radix *
        this.defenderCanonicalLayout.radix <=
      Number.MAX_SAFE_INTEGER;
    this.terminalCodeFits =
      TERMINAL_OUTCOMES.length *
        this.attackerRawRadix *
        this.defenderRawRadix <=
      Number.MAX_SAFE_INTEGER;
    this.slotDiceIndices = this.schedule.map((slot) => {
      const templates =
        slot.role === 'A' ? this.attackerTemplates : this.defenderTemplates;
      const indices: number[] = [];
      for (let i = 0; i < templates.length; i++) {
        const ship = templates[i];
        if (ship.initiative !== slot.initiative) continue;
        if (slot.missile ? ship.hasMissiles() : ship.hasCannons()) {
          indices.push(i);
        }
      }
      return indices;
    });
    this.slotDiceWeights = this.schedule.map((slot, slotIndex) => {
      const groups =
        slot.role === 'A'
          ? this.attackerCanonicalGroups
          : this.defenderCanonicalGroups;
      const indices = this.slotDiceIndices[slotIndex];
      const groupOf = new Map<number, number>();
      groups.forEach((group, g) => {
        for (const index of group.indices) groupOf.set(index, g);
      });
      const counts = new Array<number>(groups.length).fill(0);
      for (const index of indices) counts[groupOf.get(index)!]++;
      const groupWeight = new Array<number>(groups.length).fill(0);
      let scale = 1;
      for (let g = 0; g < groups.length; g++) {
        groupWeight[g] = scale;
        scale *= counts[g] + 1;
      }
      return indices.map((index) => groupWeight[groupOf.get(index)!]);
    });
    this.slotHasRift = this.schedule.map((slot, slotIndex) => {
      if (slot.missile) return false;
      const templates =
        slot.role === 'A' ? this.attackerTemplates : this.defenderTemplates;
      return this.slotDiceIndices[slotIndex].some(
        (index) => templates[index].rift > 0
      );
    });
    this.attackerMixedShields =
      new Set(this.attackerTemplates.map((ship) => ship.shields)).size > 1;
    this.defenderMixedShields =
      new Set(this.defenderTemplates.map((ship) => ship.shields)).size > 1;
    // Inherent NPC rosters always use NPC targeting, whatever a caller passes:
    // player fleets may select NPC, DPS, or optimal, NPC fleets cannot select
    // anything else (Fleet.getDamageType applies the same rule).
    this.attackerDamageType = BattleModel.rosterDamageType(
      this.attackerTemplates,
      attackerDamageType
    );
    this.defenderDamageType = BattleModel.rosterDamageType(
      this.defenderTemplates,
      defenderDamageType
    );
  }

  private static rosterDamageType(
    templates: Ship[],
    selected: DamageType | undefined
  ): DamageType {
    if (!templates.some((ship) => ship.isPlayerShip())) return DamageType.NPC;
    return selected ?? DamageType.DPS;
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
      hpA: [...this.attackerInitialHp],
      hpB: [...this.defenderInitialHp],
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
  // This readable form and canonicalCode() identify exactly the same states.
  canonicalKey(state: WorkingState): string {
    const side = (groups: CanonicalGroup[], hp: number[]): string =>
      groups
        .map(({ key, indices, hpWeights }) => {
          let hpCode = 0;
          for (const index of indices) hpCode += hpWeights[hp[index]];
          return `${key}=${hpCode}`;
        })
        .join(';');
    return `${state.slot}|A:${side(
      this.attackerCanonicalGroups,
      state.hpA
    )}|D:${side(this.defenderCanonicalGroups, state.hpB)}`;
  }

  // Numeric form of canonicalKey(): slot, then each side's canonical group
  // histogram codes stacked as mixed radix. Falls back to an interned id of the
  // string key when the fleets are too large for one safe integer.
  canonicalCode(state: WorkingState): number {
    if (!this.canonicalCodeFits) return this.intern(this.canonicalKey(state));
    const sideA = BattleModel.canonicalSideCode(
      this.attackerCanonicalGroups,
      state.hpA
    );
    const sideD = BattleModel.canonicalSideCode(
      this.defenderCanonicalGroups,
      state.hpB
    );
    return (
      state.slot +
      this.schedule.length *
        (sideA + this.attackerCanonicalLayout.radix * sideD)
    );
  }

  // Inverse of canonicalCode(): the readable canonicalKey() of a packed code.
  canonicalKeyFromCode(code: number): string {
    if (!this.canonicalCodeFits) return this.internedKeys[code];
    const slot = code % this.schedule.length;
    let rest = (code - slot) / this.schedule.length;
    const sideA = rest % this.attackerCanonicalLayout.radix;
    rest = (rest - sideA) / this.attackerCanonicalLayout.radix;
    const side = (groups: CanonicalGroup[], sideCode: number): string => {
      const parts: string[] = [];
      let remaining = sideCode;
      for (const group of groups) {
        const hpCode = remaining % group.radix;
        remaining = (remaining - hpCode) / group.radix;
        parts.push(`${group.key}=${hpCode}`);
      }
      return parts.join(';');
    };
    return `${slot}|A:${side(this.attackerCanonicalGroups, sideA)}|D:${side(
      this.defenderCanonicalGroups,
      rest
    )}`;
  }

  // Numeric identity of an absorbing terminal: outcome plus both raw HP
  // vectors (roster order, not canonicalized) so survivor detail is preserved.
  terminalCode(outcome: Terminal, hpA: number[], hpB: number[]): number {
    if (!this.terminalCodeFits) {
      return this.intern(`T|${outcome}|${hpA.join('.')}|${hpB.join('.')}`);
    }
    const rawA = BattleModel.rawSideCode(this.attackerRawWeights, hpA);
    const rawD = BattleModel.rawSideCode(this.defenderRawWeights, hpB);
    return (
      TERMINAL_OUTCOMES.indexOf(outcome) +
      TERMINAL_OUTCOMES.length * (rawA + this.attackerRawRadix * rawD)
    );
  }

  private intern(key: string): number {
    let id = this.internedIds.get(key);
    if (id === undefined) {
      id = this.internedKeys.length;
      this.internedIds.set(key, id);
      this.internedKeys.push(key);
    }
    return id;
  }

  private static canonicalSideCode(
    groups: CanonicalGroup[],
    hp: number[]
  ): number {
    let code = 0;
    let scale = 1;
    for (let g = 0; g < groups.length; g++) {
      const { indices, hpWeights, radix } = groups[g];
      let hpCode = 0;
      for (let i = 0; i < indices.length; i++) {
        hpCode += hpWeights[hp[indices[i]]];
      }
      code += hpCode * scale;
      scale *= radix;
    }
    return code;
  }

  private static canonicalLayout(groups: CanonicalGroup[]): SideCodeLayout {
    let radix = 1;
    for (const group of groups) radix *= group.radix;
    return { radix };
  }

  private static rawWeights(templates: Ship[]): number[] {
    const weights: number[] = [];
    let scale = 1;
    for (const template of templates) {
      weights.push(scale);
      scale *= template.maxHP() + 1;
    }
    return weights;
  }

  private static rawRadix(templates: Ship[], weights: number[]): number {
    if (templates.length === 0) return 1;
    const last = templates.length - 1;
    return weights[last] * (templates[last].maxHP() + 1);
  }

  private static rawSideCode(weights: number[], hp: number[]): number {
    let code = 0;
    for (let i = 0; i < weights.length; i++) code += hp[i] * weights[i];
    return code;
  }

  private buildCanonicalGroups(templates: Ship[]): CanonicalGroup[] {
    const byKey = new Map<string, number[]>();
    templates.forEach((template, index) => {
      const key = template.configKey();
      const indices = byKey.get(key);
      if (indices) indices.push(index);
      else byKey.set(key, [index]);
    });
    return Array.from(byKey, ([key, indices]) => {
      const base = indices.length + 1;
      const maxHp = Math.max(
        ...indices.map((index) => templates[index].maxHP())
      );
      const hpWeights = [1];
      for (let hp = 1; hp <= maxHp; hp++) {
        hpWeights.push(hpWeights[hp - 1] * base);
      }
      // Largest code is every ship at maxHp: |group| * base^maxHp < base^(maxHp+1).
      const radix = hpWeights[maxHp] * base;
      return { key, indices, hpWeights, radix };
    }).sort((a, b) => a.key.localeCompare(b.key));
  }

  // Whether any living ship would roll dice in `slotIndex`. A slot with no
  // dice is a deterministic pass-through, so advance() skips it.
  private slotHasDice(
    slotIndex: number,
    hpA: number[],
    hpB: number[]
  ): boolean {
    const hp = this.schedule[slotIndex].role === 'A' ? hpA : hpB;
    const indices = this.slotDiceIndices[slotIndex];
    for (let i = 0; i < indices.length; i++) {
      if (hp[indices[i]] > 0) return true;
    }
    return false;
  }

  // Resolves a possibly dice-less working state to the state the graph
  // actually stores (the first upcoming slot with dice) or to its terminal.
  // Exact: a dice-less slot has one deterministic successor with equal value.
  resolvePassThrough(state: WorkingState): Successor {
    if (this.slotHasDice(state.slot, state.hpA, state.hpB)) return { state };
    return this.advance(state.hpA, state.hpB, state.slot);
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

  // Advance from `fromSlot` to the next slot that has dice, applying heal +
  // the mutual-no-cannons stalemate check when a full cannon cycle wraps
  // (fact 5). Slots with no living dice-rolling ship are pass-through states
  // with one deterministic successor, so they are skipped rather than stored;
  // missile slots are still consumed exactly once because the walk only moves
  // forward through the prefix and wraps to the first cannon slot.
  private advance(hpA: number[], hpB: number[], fromSlot: number): Successor {
    const terminal = terminalFromSurvival(
      this.anyAlive(hpA),
      this.anyAlive(hpB)
    );
    if (terminal) return { terminal, hpA, hpB };

    const lastSlot = this.schedule.length - 1;
    let slot = fromSlot;
    // Every living ship with cannons owns a cannon slot, so either a slot with
    // dice is found within one cycle or the wrap-around stalemate rule fires.
    for (let steps = 0; steps <= this.schedule.length; steps++) {
      if (slot === lastSlot) {
        // End of a cannon cycle: heal both fleets, then check stalemate.
        hpA = this.applyHeal(this.attackerTemplates, hpA);
        hpB = this.applyHeal(this.defenderTemplates, hpB);
        if (
          !this.hasLivingCannon(this.attackerTemplates, hpA) &&
          !this.hasLivingCannon(this.defenderTemplates, hpB)
        ) {
          return { terminal: 'DefenderWins', hpA, hpB };
        }
        slot = this.numMissileSlots;
      } else {
        slot += 1;
      }
      if (this.slotHasDice(slot, hpA, hpB))
        return { state: { hpA, hpB, slot } };
    }
    throw new Error('advance did not find a slot with dice within one cycle');
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

  private resetMaterializedFleet(
    materialized: MaterializedFleet,
    templates: Ship[],
    hp: number[]
  ): void {
    materialized.fleet.reset();
    for (let i = 0; i < materialized.ships.length; i++) {
      const damage = templates[i].maxHP() - hp[i];
      if (damage > 0) materialized.ships[i].takeDamage(damage);
    }
  }

  private livingHpVector(ships: Ship[]): number[] {
    return ships.map((s) => s.remainingHP());
  }

  // Initiatives of the target fleet's own missile phases that follow `fromSlot`
  // before the next cannon phase. DpsRemovalDamagePlanner.getShipPriority reads
  // the phase tail only to ask whether a target ship still has missiles to
  // fire (`phase.ships.includes(ship)`), and a living ship is in such a phase
  // exactly when its initiative matches one of these. Cannon slots have no tail.
  private targetMissileTailInitiatives(fromSlot: number): number[] {
    const slot = this.schedule[fromSlot];
    if (!slot.missile) return [];
    const initiatives = new Set<number>();
    for (let i = fromSlot + 1; i < this.schedule.length; i++) {
      const next = this.schedule[i];
      if (!next.missile) break;
      if (next.role !== slot.role) initiatives.add(next.initiative);
    }
    return Array.from(initiatives).sort((a, b) => a - b);
  }

  // Mixed-radix HP histogram per canonical group; equal codes mean equal
  // (configKey, HP) multisets. Same encoding as canonicalKey.
  private hpMultisetCode(groups: CanonicalGroup[], hp: number[]): string {
    let code = '';
    for (let g = 0; g < groups.length; g++) {
      const { indices, hpWeights } = groups[g];
      let groupCode = 0;
      for (let k = 0; k < indices.length; k++) {
        groupCode += hpWeights[hp[indices[k]]];
      }
      code += g === 0 ? `${groupCode}` : `,${groupCode}`;
    }
    return code;
  }

  // Shots in the order the binned helper will process them. Cached per outcome
  // object because slot outcomes are shared across every expansion of a slot.
  private shotSignature(shots: Shot[]): string {
    let signature = this.shotSignatures.get(shots);
    if (signature === undefined) {
      signature = sortShotsForAssignment(shots)
        .map((shot) => `${shot.roll},${shot.computers},${shot.damage}`)
        .join(';');
      this.shotSignatures.set(shots, signature);
    }
    return signature;
  }

  private heuristicContext(
    targetRole: Role,
    targetTemplates: Ship[],
    groups: CanonicalGroup[],
    damageType: DamageType.NPC | DamageType.DPS,
    targetShield: number,
    fromSlot: number
  ): HeuristicMemoContext {
    const tail = this.slotTailSignatures[fromSlot];
    const contextKey = `${targetRole}|${damageType}|${targetShield}|${tail}`;
    let context = this.heuristicContexts.get(contextKey);
    if (context === undefined) {
      context = {
        prefix: `${contextKey}|`,
        groupOrderFree: this.plannerOrderIsGroupFree(
          targetTemplates,
          groups,
          damageType,
          targetShield,
          this.slotTailInitiatives[fromSlot]
        ),
      };
      this.heuristicContexts.set(contextKey, context);
    }
    return context;
  }

  // Whether the planner's own ship ordering can tie two ships from different
  // configuration groups. The planners sort with a stable comparator, so a
  // tie is observable as both input orders being preserved. Representatives
  // cover every living HP so HP-dependent comparator terms are exercised. A
  // tie-free ordering makes the planner-sorted target sequence a function of
  // the per-group HP multisets alone.
  private plannerOrderIsGroupFree(
    targetTemplates: Ship[],
    groups: CanonicalGroup[],
    damageType: DamageType.NPC | DamageType.DPS,
    targetShield: number,
    tailInitiatives: number[]
  ): boolean {
    if (groups.length < 2) return true;
    const planner =
      damageType === DamageType.NPC
        ? new NpcDamagePlanner()
        : new DpsRemovalDamagePlanner();
    const representatives = groups.map(({ indices }) => {
      const template = targetTemplates[indices[0]];
      const ships: Ship[] = [];
      for (let hp = 1; hp <= template.maxHP(); hp++) {
        const ship = template.clone();
        ship.resetDamage();
        ship.takeDamage(template.maxHP() - hp);
        ships.push(ship);
      }
      return ships;
    });
    const phases: Phase[] = [];
    if (tailInitiatives.length > 0) {
      const probeFleet = new Fleet('memo-probe', [], false, DamageType.DPS);
      phases.push({
        ships: representatives
          .flat()
          .filter((ship) => tailInitiatives.includes(ship.initiative)),
        initiative: 0,
        shootingFleet: probeFleet,
        targetFleet: probeFleet,
        missilePhase: true,
      });
      phases.push({
        ships: [],
        initiative: 0,
        shootingFleet: probeFleet,
        targetFleet: probeFleet,
        missilePhase: false,
      });
    }
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        for (const a of representatives[i]) {
          for (const b of representatives[j]) {
            const ab = planner.optimallySortShips([a, b], phases, targetShield);
            const ba = planner.optimallySortShips([b, a], phases, targetShield);
            if (ab[0] === a && ba[0] === b) return false;
          }
        }
      }
    }
    return true;
  }

  // Living ships of each group in (current HP, roster index) order: the order
  // the planners' stable sort leaves interchangeable ships in.
  private encodeGroupedHp(
    groups: CanonicalGroup[],
    oldHp: number[],
    newHp: number[]
  ): number[] {
    const encoded: number[] = [];
    for (const { indices, hpWeights } of groups) {
      const maxHp = hpWeights.length - 1;
      for (let hp = 1; hp <= maxHp; hp++) {
        for (let k = 0; k < indices.length; k++) {
          const index = indices[k];
          if (oldHp[index] === hp) encoded.push(newHp[index]);
        }
      }
    }
    return encoded;
  }

  private applyGroupedHp(
    groups: CanonicalGroup[],
    oldHp: number[],
    encoded: number[]
  ): number[] {
    const result = oldHp.slice();
    let next = 0;
    for (const { indices, hpWeights } of groups) {
      const maxHp = hpWeights.length - 1;
      for (let hp = 1; hp <= maxHp; hp++) {
        for (let k = 0; k < indices.length; k++) {
          const index = indices[k];
          if (oldHp[index] === hp) result[index] = encoded[next++];
        }
      }
    }
    return result;
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
   * detected. Returns { kind: 'fail' } if a cap or shared deadline is exceeded.
   */
  expand(state: WorkingState, ctx: ExpandContext): Expansion {
    if (ctx.deadlineExceeded?.()) {
      return { kind: 'fail', reason: 'time budget exceeded' };
    }
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
    const shooterHp = shooterIsAttacker ? state.hpA : state.hpB;

    // Dice, self-damage and target assignment depend on the joint state only
    // through the transition key, so joint states sharing a key reuse one
    // template and pay only the joint advance step per outcome.
    const key = this.canonicalCodeFits ? this.transitionKey(state, ctx) : null;
    const cached = key === null ? undefined : this.transitionMemo.get(key);
    if (cached) {
      return this.composeMove(cached, shooterIsAttacker, shooterHp, state.slot);
    }
    const computed = this.computeTransition(state, ctx);
    if (computed.kind === 'fail') return computed;
    if (key !== null && cached === undefined) {
      this.transitionMemo.set(
        key,
        computed.templateUsable ? computed.template : null
      );
    }
    return this.composeMove(
      computed.template,
      shooterIsAttacker,
      shooterHp,
      state.slot
    );
  }

  // The factor of a joint state that expansion depends on: the slot and
  // context, the living dice ships of the slot by configuration group (the
  // dice), the shooter's minimum living shield when its fleet mixes shields
  // (DPS priorities read it), the shooter's whole canonical HP when the slot
  // fires missiles (phase tails read the shooter's other living ships) or
  // rift dice (self-damage changes the shooter), and the target's canonical HP.
  private transitionKey(state: WorkingState, ctx: ExpandContext): string {
    const slotIndex = state.slot;
    const slot = this.schedule[slotIndex];
    const shooterIsAttacker = slot.role === 'A';
    const shooterHp = shooterIsAttacker ? state.hpA : state.hpB;
    const targetHp = shooterIsAttacker ? state.hpB : state.hpA;
    const shooterGroups = shooterIsAttacker
      ? this.attackerCanonicalGroups
      : this.defenderCanonicalGroups;
    const targetGroups = shooterIsAttacker
      ? this.defenderCanonicalGroups
      : this.attackerCanonicalGroups;
    const diceIndices = this.slotDiceIndices[slotIndex];
    const diceWeights = this.slotDiceWeights[slotIndex];
    let diceCode = 0;
    for (let k = 0; k < diceIndices.length; k++) {
      if (shooterHp[diceIndices[k]] > 0) diceCode += diceWeights[k];
    }
    let shooterPart = 0;
    if (slot.missile || this.slotHasRift[slotIndex]) {
      shooterPart = BattleModel.canonicalSideCode(shooterGroups, shooterHp);
    } else if (
      shooterIsAttacker ? this.attackerMixedShields : this.defenderMixedShields
    ) {
      shooterPart = this.minLivingShield(
        shooterIsAttacker ? this.attackerTemplates : this.defenderTemplates,
        shooterHp
      );
    }
    const targetCode = BattleModel.canonicalSideCode(targetGroups, targetHp);
    return `${slotIndex}|${this.ctxSignature(ctx)}|${diceCode}|${shooterPart}|${targetCode}`;
  }

  private ctxSignature(ctx: ExpandContext): string {
    let signature = this.ctxSignatures.get(ctx);
    if (signature === undefined) {
      signature = `${ctx.decisionRoles.join('')}:${ctx.maxOutcomes}`;
      this.ctxSignatures.set(ctx, signature);
    }
    return signature;
  }

  private minLivingShield(templates: Ship[], hp: number[]): number {
    let min = Infinity;
    for (let i = 0; i < templates.length; i++) {
      if (hp[i] > 0 && templates[i].shields < min) min = templates[i].shields;
    }
    return min === Infinity ? 0 : min;
  }

  // Applies the joint advance step (terminal checks, slot walk, heal and
  // stalemate) to every option of a template for the given joint state.
  private composeMove(
    template: TransitionTemplate,
    shooterIsAttacker: boolean,
    shooterHp: number[],
    fromSlot: number
  ): Expansion {
    const slot = this.schedule[fromSlot];
    const edges: MoveEdge[] = new Array(template.outcomes.length);
    for (let k = 0; k < template.outcomes.length; k++) {
      const outcome = template.outcomes[k];
      const newShooterHp = outcome.shooterHp ?? shooterHp;
      const targets = outcome.targets;
      const options: Successor[] = new Array(targets.length);
      for (let t = 0; t < targets.length; t++) {
        const hpA = shooterIsAttacker ? newShooterHp : targets[t];
        const hpB = shooterIsAttacker ? targets[t] : newShooterHp;
        options[t] = this.finishSlot(hpA, hpB, fromSlot, slot);
      }
      edges[k] = { prob: outcome.prob, options };
    }
    return { kind: 'move', decisionRole: template.decisionRole, edges };
  }

  // Expands one state for real: enumerates the slot's dice outcomes and runs
  // rift self-damage plus target assignment for each. Returns the template
  // and whether other joint states with the same key may reuse it.
  private computeTransition(
    state: WorkingState,
    ctx: ExpandContext
  ):
    | { kind: 'move'; template: TransitionTemplate; templateUsable: boolean }
    | { kind: 'fail'; reason: 'expand cap exceeded' | 'time budget exceeded' } {
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
    const shooterDamageType = shooterIsAttacker
      ? this.attackerDamageType
      : this.defenderDamageType;

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

    const ordinaryDamageCeiling =
      shooterDamageType !== DamageType.NPC &&
      ctx.decisionRoles.length === 2 &&
      ctx.decisionRoles.includes(slot.role)
        ? this.usefulOrdinaryDamageCeiling(
            shooterShips,
            slot.missile,
            shooterSplitter,
            targetHp
          )
        : Infinity;

    const enemyShields = Array.from(
      new Set(
        targetHp
          .map((h, i) => (h > 0 ? targetTemplates[i].shields : null))
          .filter((s): s is number => s !== null)
      )
    );

    let diceDeadlineExceeded = false;
    const outcomeKey = [
      state.slot,
      livingShooterIdx.join(','),
      enemyShields.join(','),
      slot.missile ? 'm' : 'c',
      shooterSplitter ? 's' : 'n',
      ctx.maxOutcomes,
      ordinaryDamageCeiling,
    ].join('|');
    const cachedOutcomes = this.slotOutcomeCache.get(outcomeKey);
    let outcomes: SlotOutcome[] | null;
    if (cachedOutcomes !== undefined) {
      outcomes = cachedOutcomes;
    } else {
      outcomes = enumerateSlotOutcomes(
        shooterShips,
        slot.missile,
        enemyShields,
        slot.missile ? false : shooterSplitter,
        ctx.maxOutcomes,
        ctx.deadlineExceeded
          ? () => {
              diceDeadlineExceeded = ctx.deadlineExceeded!();
              return diceDeadlineExceeded;
            }
          : undefined,
        ordinaryDamageCeiling
      );
      if (outcomes !== null) this.slotOutcomeCache.set(outcomeKey, outcomes);
    }
    if (diceDeadlineExceeded || ctx.deadlineExceeded?.()) {
      return { kind: 'fail', reason: 'time budget exceeded' };
    }
    if (outcomes === null) {
      return { kind: 'fail', reason: 'expand cap exceeded' };
    }

    // No shooters / no dice at all: one deterministic outcome.
    if (shooterShips.length === 0 || outcomes.length === 0) {
      return {
        kind: 'move',
        template: {
          decisionRole: null,
          outcomes: [{ prob: 1, shooterHp: null, targets: [targetHp] }],
        },
        templateUsable: true,
      };
    }

    const assignmentControl = this.assignmentControl(
      slot,
      shooterDamageType,
      this.hasOneLivingConfiguration(targetTemplates, targetHp),
      ctx
    );
    const decisionRole =
      assignmentControl.kind === 'decision' ? assignmentControl.role : null;
    // A heuristic planner whose ordering can tie ships of different
    // configurations depends on the raw roster layout, so its states keep
    // per-state expansion; candidate enumeration and rift-keyed templates
    // (the key then holds the shooter's whole canonical HP) do not.
    const templateUsable =
      assignmentControl.kind === 'decision' ||
      this.slotHasRift[state.slot] ||
      this.heuristicContext(
        shooterIsAttacker ? 'D' : 'A',
        targetTemplates,
        shooterIsAttacker
          ? this.defenderCanonicalGroups
          : this.attackerCanonicalGroups,
        assignmentControl.damageType,
        this.minLivingShield(shooterTemplates, shooterHp),
        state.slot
      ).groupOrderFree;

    const scratch: OutcomeScratch = {
      shooter: shooterIsAttacker ? this.attackerScratch : this.defenderScratch,
      target: shooterIsAttacker ? this.defenderScratch : this.attackerScratch,
      shooterDirty: true,
    };

    const templateOutcomes: TemplateOutcome[] = new Array(outcomes.length);
    for (let k = 0; k < outcomes.length; k++) {
      if (ctx.deadlineExceeded?.()) {
        return { kind: 'fail', reason: 'time budget exceeded' };
      }
      const outcome = outcomes[k];
      const resolved = this.resolveOutcome(
        state,
        slot,
        outcome,
        shooterIsAttacker,
        shooterTemplates,
        targetTemplates,
        assignmentControl,
        ctx,
        scratch
      );
      if (!resolved.ok) return { kind: 'fail', reason: resolved.reason };
      templateOutcomes[k] = {
        prob: outcome.prob,
        shooterHp: resolved.shooterHp,
        targets: resolved.targets,
      };
    }
    if (ctx.deadlineExceeded?.()) {
      return { kind: 'fail', reason: 'time budget exceeded' };
    }
    return {
      kind: 'move',
      template: { decisionRole, outcomes: templateOutcomes },
      templateUsable,
    };
  }

  // Return a finite ceiling only when it actually changes at least one
  // ordinary unsplit die. The fast Infinity path avoids scanning target HP in
  // the common ion-only case.
  private usefulOrdinaryDamageCeiling(
    shooters: Ship[],
    missilePhase: boolean,
    splitter: boolean,
    targetHp: number[]
  ): number {
    let maximumUnsplitDamage = 1;
    for (const ship of shooters) {
      const weapons = missilePhase ? ship.missiles : ship.cannons;
      if (weapons.plasma > 0) {
        maximumUnsplitDamage = Math.max(
          maximumUnsplitDamage,
          WeaponDamage.plasma
        );
      }
      if (weapons.soliton > 0) {
        maximumUnsplitDamage = Math.max(
          maximumUnsplitDamage,
          WeaponDamage.soliton
        );
      }
      if (weapons.antimatter > 0 && (missilePhase || !splitter)) {
        maximumUnsplitDamage = WeaponDamage.antimatter;
        break;
      }
    }
    if (maximumUnsplitDamage === 1) return Infinity;

    let maximumTargetHp = 0;
    for (const hp of targetHp) maximumTargetHp = Math.max(maximumTargetHp, hp);
    return maximumTargetHp < maximumUnsplitDamage ? maximumTargetHp : Infinity;
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
    assignmentControl: AssignmentControl,
    ctx: ExpandContext,
    scratch: OutcomeScratch
  ):
    | { ok: true; shooterHp: number[] | null; targets: number[][] }
    | {
        ok: false;
        reason: 'expand cap exceeded' | 'time budget exceeded';
      } {
    if (ctx.deadlineExceeded?.()) {
      return { ok: false, reason: 'time budget exceeded' };
    }
    const shooterHp = shooterIsAttacker ? state.hpA : state.hpB;
    const targetHp = shooterIsAttacker ? state.hpB : state.hpA;
    // The shooter scratch fleet holds this state's HP for every outcome of one
    // expansion; it only needs a reset after an outcome applied rift
    // self-damage. The target fleet is reset when a planner or candidate
    // enumeration actually needs it.
    const shooterMat = scratch.shooter;
    const targetMat = scratch.target;
    if (scratch.shooterDirty) {
      this.resetMaterializedFleet(shooterMat, shooterTemplates, shooterHp);
      scratch.shooterDirty = false;
    }
    if (ctx.deadlineExceeded?.()) {
      return { ok: false, reason: 'time budget exceeded' };
    }

    // Apply rift self-damage to the shooter's living rift ships (NPC-assigned).
    let selfDamageApplied = false;
    if (!slot.missile && outcome.selfDamage > 0) {
      const selfShots = Array.from({ length: outcome.selfDamage }, () => ({
        roll: 6,
        computers: 0,
        damage: 1,
      }));
      const riftShips = shooterMat.fleet.getLivingRiftShips();
      if (riftShips.length > 0) {
        this.assignmentHelper.assignDamage(
          selfShots,
          riftShips,
          DamageType.NPC,
          []
        );
        selfDamageApplied = true;
        scratch.shooterDirty = true;
      }
    }
    if (ctx.deadlineExceeded?.()) {
      return { ok: false, reason: 'time budget exceeded' };
    }
    const newShooterHp = selfDamageApplied
      ? this.livingHpVector(shooterMat.ships)
      : null;

    if (outcome.shots.length === 0 || !this.anyAlive(targetHp)) {
      // No target damage this outcome.
      return { ok: true, shooterHp: newShooterHp, targets: [targetHp] };
    }

    if (assignmentControl.kind === 'decision') {
      this.resetMaterializedFleet(targetMat, targetTemplates, targetHp);
      const targetLiving = targetMat.ships.filter((s) => s.isAlive());
      let candidateDeadlineExceeded = false;
      const candidates = enumerateCandidates(outcome.shots, targetLiving, {
        shouldAbort: ctx.deadlineExceeded
          ? () => {
              candidateDeadlineExceeded = ctx.deadlineExceeded!();
              return candidateDeadlineExceeded;
            }
          : undefined,
      });
      if (candidateDeadlineExceeded || ctx.deadlineExceeded?.()) {
        return { ok: false, reason: 'time budget exceeded' };
      }
      if (candidates === null) {
        return { ok: false, reason: 'expand cap exceeded' };
      }
      if (candidates.length === 0) {
        return {
          ok: true,
          shooterHp: newShooterHp,
          targets: [this.livingHpVector(targetMat.ships)],
        };
      }
      const targets: number[][] = [];
      for (const candidate of candidates) {
        if (ctx.deadlineExceeded?.()) {
          return { ok: false, reason: 'time budget exceeded' };
        }
        const newTargetHp = targetMat.ships.map((s) => s.remainingHP());
        for (let i = 0; i < targetLiving.length; i++) {
          const dmg = Math.min(
            candidate.damageAssignments[i],
            targetLiving[i].remainingHP()
          );
          const rosterIdx = targetMat.ships.indexOf(targetLiving[i]);
          newTargetHp[rosterIdx] = targetLiving[i].remainingHP() - dmg;
        }
        targets.push(newTargetHp);
      }
      return { ok: true, shooterHp: newShooterHp, targets };
    }

    // Heuristic assignment follows the fleet's selected deterministic policy.
    // The planners are deterministic functions of the shot sequence, the
    // living targets' (config, HP) in roster order, the shooter's minimum
    // shield and the missile-phase tail, so their result is memoized on
    // exactly that. Ships sharing a configKey are interchangeable for the
    // solver (canonicalKey sorts HP within a group, and the helper's own memo
    // remaps plans across such ships), so the result is stored per group in
    // (HP, roster) order and replayed onto the current roster; with a tie-free
    // planner ordering this reproduces the planner's raw HP vector exactly.
    const targetShield = shooterMat.fleet.getMinShield();
    const targetRole: Role = shooterIsAttacker ? 'D' : 'A';
    const groups = shooterIsAttacker
      ? this.defenderCanonicalGroups
      : this.attackerCanonicalGroups;
    const context = this.heuristicContext(
      targetRole,
      targetTemplates,
      groups,
      assignmentControl.damageType,
      targetShield,
      state.slot
    );
    const targetSignature = context.groupOrderFree
      ? this.hpMultisetCode(groups, targetHp)
      : targetHp.join('.');
    const memoKey = `${context.prefix}${this.shotSignature(outcome.shots)}|${targetSignature}`;
    const cached = this.heuristicMemo.get(memoKey);
    if (cached !== undefined) {
      return {
        ok: true,
        shooterHp: newShooterHp,
        targets: [this.applyGroupedHp(groups, targetHp, cached)],
      };
    }

    this.resetMaterializedFleet(targetMat, targetTemplates, targetHp);
    const targetLiving = targetMat.ships.filter((s) => s.isAlive());
    const phases = this.buildPhaseTail(
      state.slot,
      shooterIsAttacker ? shooterMat.fleet : targetMat.fleet,
      shooterIsAttacker ? targetMat.fleet : shooterMat.fleet
    );
    this.assignmentHelper.assignDamage(
      outcome.shots,
      targetLiving,
      assignmentControl.damageType,
      phases,
      targetShield
    );
    if (ctx.deadlineExceeded?.()) {
      return { ok: false, reason: 'time budget exceeded' };
    }
    const newTargetHp = this.livingHpVector(targetMat.ships);
    this.heuristicMemo.set(
      memoKey,
      this.encodeGroupedHp(groups, targetHp, newTargetHp)
    );
    return { ok: true, shooterHp: newShooterHp, targets: [newTargetHp] };
  }

  private assignmentControl(
    slot: Slot,
    shooterDamageType: DamageType,
    targetIsHomogeneous: boolean,
    ctx: ExpandContext
  ): AssignmentControl {
    if (shooterDamageType === DamageType.NPC) {
      return { kind: 'heuristic', damageType: DamageType.NPC };
    }
    if (ctx.decisionRoles.includes(slot.role) && !targetIsHomogeneous) {
      return { kind: 'decision', role: slot.role };
    }
    return { kind: 'heuristic', damageType: DamageType.DPS };
  }

  private hasOneLivingConfiguration(templates: Ship[], hp: number[]): boolean {
    let livingConfig: string | null = null;
    for (let index = 0; index < templates.length; index++) {
      if (hp[index] <= 0) continue;
      const key = templates[index].configKey();
      if (livingConfig === null) livingConfig = key;
      else if (key !== livingConfig) return false;
    }
    return livingConfig !== null;
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
