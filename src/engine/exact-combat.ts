import { DamageType } from 'src/constants';
import { Fleet } from './fleet';
import { Ship, ShipType } from './ship';
import type {
  CombatOutcomeSummary,
  DestroyedShipsCreditedToFleet,
  ShipCountByType,
} from './combat-result';
import { BattleModel, Role } from './battle-state';
import {
  AssignmentMode,
  DEFAULT_CAPS,
  SolverCaps,
  TerminalDistributionResult,
  WinProbabilitySolver,
} from './win-probability-solver';

// A deliberately conservative upper bound for interactive minimax. It counts
// HP multisets for each interchangeable ship configuration across both fleets,
// then multiplies by schedule slots. The measured 8-interceptor + 4-cruiser
// mirror is 72,900 by this estimate and takes seconds in minimax despite its
// small number of ship types; policy-mode exact resolves it much faster.
export const OPTIMAL_EXACT_STATE_SPACE_CUTOFF = 50_000;
const MULTI_EXACT_RESIDUAL_TOLERANCE = 1e-9;

// Interactive budget for the app: bail out (to Monte Carlo) rather than stall
// on a fleet whose state graph is too large to solve quickly.
export const EXACT_INTERACTIVE_CAPS: SolverCaps = {
  ...DEFAULT_CAPS,
  maxMillis: 2_000,
  maxStates: 250_000,
};

// Same shape as CombatSimulator.simulate's result, plus ok/reason so callers
// can fall back to Monte Carlo when the battle is not exactly solvable.
export type ExactBattleResult = CombatOutcomeSummary & {
  ok: boolean;
  reason?: string;
  exactDiagnostics?: ExactCombatDiagnostics;
};

export type ExactCombatDiagnostics = {
  engagementRequests: number;
  engagementSolves: number;
  engagementCacheHits: number;
};

export type ExactCombatOptions = {
  // Preserve the historical default for direct callers. Interactive orchestration
  // disables this and applies the preflight once, where the chosen policy can be
  // reported to the user and will not be retried at the next fallback tier.
  plannerPreflight?: boolean;
};

export type ExactPlannerPreflightReason = 'complexity' | null;

export type ExactPlannerPreflight = {
  overrides: (DamageType | undefined)[];
  reason: ExactPlannerPreflightReason;
  estimatedStates: number;
};

type FleetState = {
  name: string;
  ships: Ship[];
  antimatterSplitter: boolean;
  damageType: DamageType;
};

type ExactBranch = {
  fleets: FleetState[];
  outcomeVariants: Map<string, OutcomeVariant>;
};

type OutcomeVariant = {
  probability: number;
  destroyedShipsCreditedToFleet: DestroyedShipsCreditedToFleet;
  retreatedSurvivors: Record<string, ShipCountByType>;
};

/**
 * Computes a two-fleet battle's outcome distribution exactly: instead of
 * sampling dice, every dice outcome's probability is propagated through the
 * state graph, so each state — and each terminal — carries its true
 * likelihood. Win rates, draw rate, and expected survivors are exact numbers
 * with zero Monte Carlo noise, and identical on every run.
 */
export function computeExactBattle(
  defender: Fleet,
  attacker: Fleet,
  caps: SolverCaps = DEFAULT_CAPS
): ExactBattleResult {
  const start = Date.now();
  const fail = (reason: string): ExactBattleResult => ({
    ok: false,
    reason,
    lastFleetStanding: {},
    drawPercentage: 0,
    expectedSurvivors: {},
    survivorDistribution: [],
    timeTaken: Date.now() - start,
  });

  const attackerType = attacker.getDamageType();
  const defenderType = defender.getDamageType();

  const decisionRoles: Role[] = [];
  if (attackerType === DamageType.OPTIMAL) decisionRoles.push('A');
  if (defenderType === DamageType.OPTIMAL) decisionRoles.push('D');

  const assignments: AssignmentMode =
    decisionRoles.length > 0 ? 'minimax' : 'policy';
  let perspective: Role = decisionRoles[0] ?? 'A';
  if (attackerType === DamageType.OPTIMAL) {
    perspective = 'A';
  } else if (defenderType === DamageType.OPTIMAL) {
    perspective = 'D';
  }

  const model = new BattleModel(
    attacker.getRoster(),
    defender.getRoster(),
    attacker.antimatterSplitter,
    defender.antimatterSplitter
  );
  const outcome = new WinProbabilitySolver(model, {
    perspective,
    assignments,
    decisionRoles,
    caps,
  }).solveOutcome();
  if (!outcome.ok) {
    return fail(outcome.reason ?? 'solve failed');
  }

  // Defender first, matching the app's fleet order.
  return {
    ok: true,
    lastFleetStanding: {
      [defender.name]: outcome.pDefender,
      [attacker.name]: outcome.pAttacker,
    },
    drawPercentage: outcome.pDraw,
    expectedSurvivors: {
      [defender.name]: outcome.defenderSurvivors as Partial<
        Record<ShipType, number>
      >,
      [attacker.name]: outcome.attackerSurvivors as Partial<
        Record<ShipType, number>
      >,
    },
    survivorDistribution: outcome.survivorDistribution.map((entry) => ({
      probability: entry.probability,
      lastFleetStanding: standingFleetForTwoFleetOutcome(
        defender.name,
        attacker.name,
        entry.defenderSurvivors as ShipCountByType,
        entry.attackerSurvivors as ShipCountByType
      ),
      survivors: {
        [defender.name]: entry.defenderSurvivors as Partial<
          Record<ShipType, number>
        >,
        [attacker.name]: entry.attackerSurvivors as Partial<
          Record<ShipType, number>
        >,
      },
      destroyedShipsCreditedToFleet: {
        [defender.name]: destroyedShipCounts(
          livingShipCounts(attacker.getRoster()),
          entry.attackerSurvivors as ShipCountByType
        ),
        [attacker.name]: destroyedShipCounts(
          livingShipCounts(defender.getRoster()),
          entry.defenderSurvivors as ShipCountByType
        ),
      },
    })),
    timeTaken: Date.now() - start,
  };
}

export function computeExactCombat(
  fleets: Fleet[],
  caps: SolverCaps = DEFAULT_CAPS,
  options: ExactCombatOptions = {}
): ExactBattleResult {
  const start = Date.now();
  const exactDiagnostics: ExactCombatDiagnostics = {
    engagementRequests: 0,
    engagementSolves: 0,
    engagementCacheHits: 0,
  };
  const engagementCache = new Map<string, TerminalDistributionResult>();
  const fail = (reason: string): ExactBattleResult => ({
    ok: false,
    reason,
    lastFleetStanding: {},
    drawPercentage: 0,
    expectedSurvivors: {},
    survivorDistribution: [],
    timeTaken: Date.now() - start,
    exactDiagnostics,
  });

  if (fleets.length < 2) {
    return fail('exact combat requires at least two fleets');
  }

  const names = fleets.map((fleet) => fleet.name);
  const initialCredits: DestroyedShipsCreditedToFleet = {};
  const initialRetreatedSurvivors: Record<string, ShipCountByType> = {};
  let branches: ExactBranch[] = [
    {
      fleets: fleets.map(fleetStateFromFleet),
      outcomeVariants: new Map([
        [
          outcomeVariantKey(initialCredits, initialRetreatedSurvivors),
          {
            probability: 1,
            destroyedShipsCreditedToFleet: initialCredits,
            retreatedSurvivors: initialRetreatedSurvivors,
          },
        ],
      ]),
    },
  ];

  while (branches.some((branch) => branch.fleets.length > 1)) {
    const nextBranches: ExactBranch[] = [];
    for (const branch of branches) {
      if (branch.fleets.length <= 1) {
        nextBranches.push(branch);
        continue;
      }

      const remainingMillis = caps.maxMillis - (Date.now() - start);
      if (caps.maxMillis !== Infinity && remainingMillis <= 0) {
        return fail('time budget exceeded');
      }

      const lastIndex = branch.fleets.length - 1;
      const secondLastIndex = branch.fleets.length - 2;
      const defenderState = branch.fleets[secondLastIndex];
      const attackerState = branch.fleets[lastIndex];
      const engagementCaps = {
        ...caps,
        maxMillis: caps.maxMillis === Infinity ? Infinity : remainingMillis,
      };
      const solved = solveEngagementCached(
        defenderState,
        attackerState,
        engagementCaps,
        options.plannerPreflight ?? true,
        engagementCache,
        exactDiagnostics
      );
      if (!solved.ok) {
        return fail(solved.reason ?? 'solve failed');
      }
      if (solved.residual > MULTI_EXACT_RESIDUAL_TOLERANCE) {
        return fail('nonterminal residual exceeded');
      }

      for (const entry of solved.entries) {
        const fleetsAfter = branch.fleets.slice(0, secondLastIndex);
        const retreatedInEngagement: Record<string, ShipCountByType> = {};
        if (entry.outcome === 'AttackerWins') {
          fleetsAfter.push(withHp(attackerState, entry.hpA));
          retainLivingRemovedFleet(
            retreatedInEngagement,
            defenderState,
            entry.hpB
          );
        } else if (entry.outcome === 'DefenderWins') {
          fleetsAfter.push(withHp(defenderState, entry.hpB));
          retainLivingRemovedFleet(
            retreatedInEngagement,
            attackerState,
            entry.hpA
          );
        } else {
          retainLivingRemovedFleet(
            retreatedInEngagement,
            defenderState,
            entry.hpB
          );
          retainLivingRemovedFleet(
            retreatedInEngagement,
            attackerState,
            entry.hpA
          );
        }
        const destroyedInEngagement: DestroyedShipsCreditedToFleet = {
          [attackerState.name]: destroyedShipCounts(
            livingShipCounts(defenderState.ships),
            survivorCountsAtHp(defenderState.ships, entry.hpB)
          ),
          [defenderState.name]: destroyedShipCounts(
            livingShipCounts(attackerState.ships),
            survivorCountsAtHp(attackerState.ships, entry.hpA)
          ),
        };
        nextBranches.push({
          fleets: fleetsAfter,
          outcomeVariants: advanceOutcomeVariants(
            branch.outcomeVariants,
            destroyedInEngagement,
            retreatedInEngagement,
            entry.probability
          ),
        });
      }
    }
    branches = mergeBranches(nextBranches);
  }

  return summarizeBranches(
    branches,
    names,
    Date.now() - start,
    exactDiagnostics
  );
}

export function exactDpsPlannerOverrides(
  fleets: readonly Fleet[]
): (DamageType | undefined)[] {
  return exactPlannerPreflight(fleets).overrides;
}

export function exactPlannerPreflight(
  fleets: readonly Fleet[]
): ExactPlannerPreflight {
  const overrides = fleets.map(() => undefined as DamageType | undefined);
  const estimatedStates = estimateExactStateSpace(fleets);

  if (fleets.length !== 2) {
    return { overrides, reason: null, estimatedStates };
  }

  if (!fleets.some(isOptimalFleet)) {
    return { overrides, reason: null, estimatedStates };
  }

  if (estimatedStates < OPTIMAL_EXACT_STATE_SPACE_CUTOFF) {
    return { overrides, reason: null, estimatedStates };
  }

  return {
    overrides: fleets.map((fleet) =>
      isOptimalFleet(fleet) ? DamageType.DPS : undefined
    ),
    reason: 'complexity',
    estimatedStates,
  };
}

/**
 * Deterministic upper bound for the exact HP-state representation. For `n`
 * interchangeable ships with max HP `h`, C(n+h, h) HP multisets exist (dead is
 * one of h+1 values). Multiplying those groups and schedule slots intentionally
 * overestimates reachability, which is appropriate for a cheap preflight.
 */
export function estimateExactStateSpace(fleets: readonly Fleet[]): number {
  if (fleets.length !== 2) return 0;
  let estimate = 1;
  let scheduleSlots = 0;

  for (const fleet of fleets) {
    const roster = fleet.getRoster();
    const groups = new Map<string, { count: number; maxHp: number }>();
    const initiatives = new Set<number>();
    const missileInitiatives = new Set<number>();
    for (const ship of roster) {
      const key = ship.configKey();
      const group = groups.get(key);
      if (group) group.count++;
      else groups.set(key, { count: 1, maxHp: ship.maxHP() });
      initiatives.add(ship.initiative);
      if (ship.hasMissiles()) missileInitiatives.add(ship.initiative);
    }
    scheduleSlots += initiatives.size + missileInitiatives.size;
    for (const group of groups.values()) {
      estimate = multiplyCapped(
        estimate,
        combinationCapped(group.count + group.maxHp, group.maxHp)
      );
    }
  }

  return multiplyCapped(estimate, Math.max(1, scheduleSlots));
}

function combinationCapped(n: number, k: number): number {
  let result = 1;
  const terms = Math.min(k, n - k);
  for (let i = 1; i <= terms; i++) {
    result = (result * (n - terms + i)) / i;
    if (result >= Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  }
  return Math.round(result);
}

function multiplyCapped(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  if (a > Number.MAX_SAFE_INTEGER / b) return Number.MAX_SAFE_INTEGER;
  return a * b;
}

function solveEngagement(
  defenderState: FleetState,
  attackerState: FleetState,
  caps: SolverCaps,
  plannerPreflight: boolean
) {
  const defender = fleetFromState(defenderState);
  const attacker = fleetFromState(attackerState);
  const overrides = plannerPreflight
    ? exactDpsPlannerOverrides([defender, attacker])
    : [undefined, undefined];
  const exactDefender = fleetFromState(defenderState, overrides[0]);
  const exactAttacker = fleetFromState(attackerState, overrides[1]);
  const attackerType = exactAttacker.getDamageType();
  const defenderType = exactDefender.getDamageType();

  const decisionRoles: Role[] = [];
  if (attackerType === DamageType.OPTIMAL) decisionRoles.push('A');
  if (defenderType === DamageType.OPTIMAL) decisionRoles.push('D');

  const assignments: AssignmentMode =
    decisionRoles.length > 0 ? 'minimax' : 'policy';
  let perspective: Role = decisionRoles[0] ?? 'A';
  if (attackerType === DamageType.OPTIMAL) {
    perspective = 'A';
  } else if (defenderType === DamageType.OPTIMAL) {
    perspective = 'D';
  }

  const model = new BattleModel(
    exactAttacker.getRoster(),
    exactDefender.getRoster(),
    exactAttacker.antimatterSplitter,
    exactDefender.antimatterSplitter
  );
  return new WinProbabilitySolver(model, {
    perspective,
    assignments,
    decisionRoles,
    caps,
  }).solveTerminalDistribution();
}

function solveEngagementCached(
  defenderState: FleetState,
  attackerState: FleetState,
  caps: SolverCaps,
  plannerPreflight: boolean,
  cache: Map<string, TerminalDistributionResult>,
  diagnostics: ExactCombatDiagnostics
): TerminalDistributionResult {
  diagnostics.engagementRequests++;
  const key = engagementCacheKey(
    defenderState,
    attackerState,
    plannerPreflight
  );
  const cached = cache.get(key);
  if (cached) {
    diagnostics.engagementCacheHits++;
    return cached;
  }

  diagnostics.engagementSolves++;
  const solved = solveEngagement(
    defenderState,
    attackerState,
    caps,
    plannerPreflight
  );
  if (solved.ok) cache.set(key, solved);
  return solved;
}

function engagementCacheKey(
  defenderState: FleetState,
  attackerState: FleetState,
  plannerPreflight: boolean
): string {
  const initiativeSlots = resolvedInitiativeSlots(defenderState, attackerState);
  const fleetKey = (fleet: FleetState, role: Role): string => {
    const ships = fleet.ships
      .map((ship) => {
        const initiativeKey = `${role}:${ship.initiative}`;
        return `${shipBehaviorKey(
          ship,
          initiativeSlots.cannon.get(initiativeKey)!,
          ship.hasMissiles()
            ? initiativeSlots.missile.get(initiativeKey)!
            : null
        )}@${ship.remainingHP()}`;
      })
      .join(',');
    return `${fleet.damageType}:${fleet.antimatterSplitter}:${ships}`;
  };
  return `preflight:${plannerPreflight}|D:${fleetKey(
    defenderState,
    'D'
  )}|A:${fleetKey(attackerState, 'A')}`;
}

function resolvedInitiativeSlots(
  defenderState: FleetState,
  attackerState: FleetState
): { cannon: Map<string, number>; missile: Map<string, number> } {
  const slotsForFleet = (fleet: FleetState, role: Role) => {
    const initiatives = Array.from(
      new Set(fleet.ships.map((ship) => ship.initiative))
    );
    return initiatives.map((initiative) => ({
      role,
      initiative,
      missile: fleet.ships.some(
        (ship) => ship.initiative === initiative && ship.hasMissiles()
      ),
    }));
  };
  const slots = [
    ...slotsForFleet(defenderState, 'D'),
    ...slotsForFleet(attackerState, 'A'),
  ];
  const sorted = (missile: boolean) =>
    slots
      .filter((slot) => !missile || slot.missile)
      .sort((left, right) => right.initiative - left.initiative);
  const toMap = (ordered: ReturnType<typeof sorted>) =>
    new Map(
      ordered.map((slot, index) => [`${slot.role}:${slot.initiative}`, index])
    );
  return { cannon: toMap(sorted(false)), missile: toMap(sorted(true)) };
}

function shipBehaviorKey(
  ship: Ship,
  cannonInitiativeSlot: number,
  missileInitiativeSlot: number | null
): string {
  return [
    ship.type,
    ship.hull,
    ship.computers,
    ship.shields,
    `c${cannonInitiativeSlot}`,
    `m${missileInitiativeSlot ?? '-'}`,
    ship.cannons.ion,
    ship.cannons.plasma,
    ship.cannons.soliton,
    ship.cannons.antimatter,
    ship.missiles.ion,
    ship.missiles.plasma,
    ship.missiles.soliton,
    ship.missiles.antimatter,
    ship.rift,
    ship.heal,
  ].join('|');
}

function fleetStateFromFleet(fleet: Fleet): FleetState {
  return {
    name: fleet.name,
    ships: fleet.getRoster().map((ship) => ship.clone()),
    antimatterSplitter: fleet.antimatterSplitter,
    damageType: fleet.getDamageType(),
  };
}

function fleetFromState(
  state: FleetState,
  damageType: DamageType = state.damageType
): Fleet {
  return new Fleet(
    state.name,
    state.ships.map((ship) => ship.clone()),
    state.antimatterSplitter,
    damageType
  );
}

function withHp(state: FleetState, hp: number[]): FleetState {
  return {
    ...state,
    ships: state.ships.map((ship, index) => {
      const clone = ship.clone();
      clone.resetDamage();
      const damage = clone.maxHP() - hp[index];
      if (damage > 0) clone.takeDamage(damage);
      return clone;
    }),
  };
}

function mergeBranches(branches: ExactBranch[]): ExactBranch[] {
  const merged = new Map<string, ExactBranch>();
  for (const branch of branches) {
    const key = branchKey(branch.fleets);
    const existing = merged.get(key);
    if (existing) {
      mergeOutcomeVariants(existing.outcomeVariants, branch.outcomeVariants);
    } else {
      merged.set(key, branch);
    }
  }
  return Array.from(merged.values());
}

function branchKey(fleets: FleetState[]): string {
  return fleets
    .map((fleet) => {
      const ships = fleet.ships
        .map((ship) => `${ship.configKey()}@${ship.remainingHP()}`)
        .join(',');
      return `${fleet.name}:${fleet.damageType}:${fleet.antimatterSplitter}:${ships}`;
    })
    .join('|');
}

function summarizeBranches(
  branches: ExactBranch[],
  names: string[],
  timeTaken: number,
  exactDiagnostics: ExactCombatDiagnostics
): ExactBattleResult {
  const lastFleetStanding = Object.fromEntries(
    names.map((name) => [name, 0])
  ) as Record<string, number>;
  const expectedSurvivorSums: Record<
    string,
    Partial<Record<ShipType, number>>
  > = Object.fromEntries(names.map((name) => [name, {}])) as Record<
    string,
    Partial<Record<ShipType, number>>
  >;
  const compositionMass = new Map<
    string,
    {
      probability: number;
      lastFleetStanding: string | null;
      survivors: Record<string, Partial<Record<ShipType, number>>>;
      destroyedShipsCreditedToFleet: DestroyedShipsCreditedToFleet;
    }
  >();
  let drawPercentage = 0;

  for (const branch of branches) {
    const standingFleetName = branch.fleets[0]?.name ?? null;
    for (const variant of branch.outcomeVariants.values()) {
      const survivors = survivorsForNames(
        names,
        branch.fleets,
        variant.retreatedSurvivors
      );
      const survivorKey = survivorCompositionKey(names, survivors);
      const compositionKey = `${survivorKey}||standing:${
        standingFleetName ?? 'draw'
      }||variant:${outcomeVariantKey(
        variant.destroyedShipsCreditedToFleet,
        variant.retreatedSurvivors
      )}`;
      const existing = compositionMass.get(compositionKey);
      if (existing) {
        existing.probability += variant.probability;
      } else {
        compositionMass.set(compositionKey, {
          probability: variant.probability,
          lastFleetStanding: standingFleetName,
          survivors,
          destroyedShipsCreditedToFleet: variant.destroyedShipsCreditedToFleet,
        });
      }

      if (branch.fleets.length === 0) {
        drawPercentage += variant.probability;
        continue;
      }

      const winner = branch.fleets[0];
      lastFleetStanding[winner.name] += variant.probability;
      const counts = survivorCounts(winner);
      for (const [type, count] of Object.entries(counts)) {
        const shipType = type as ShipType;
        expectedSurvivorSums[winner.name][shipType] =
          (expectedSurvivorSums[winner.name][shipType] ?? 0) +
          variant.probability * count!;
      }
    }
  }

  const expectedSurvivors = Object.fromEntries(
    names.map((name) => {
      const winProbability = lastFleetStanding[name];
      const sums = expectedSurvivorSums[name];
      if (winProbability === 0) return [name, {}];
      return [
        name,
        Object.fromEntries(
          Object.entries(sums).map(([type, count]) => [
            type,
            count! / winProbability,
          ])
        ),
      ];
    })
  ) as Record<string, Partial<Record<ShipType, number>>>;

  return {
    ok: true,
    lastFleetStanding,
    drawPercentage,
    expectedSurvivors,
    survivorDistribution: Array.from(compositionMass.values()).sort(
      (a, b) => b.probability - a.probability
    ),
    timeTaken,
    exactDiagnostics,
  };
}

function survivorsForNames(
  names: string[],
  fleets: FleetState[],
  retreatedSurvivors: Record<string, ShipCountByType>
): Record<string, Partial<Record<ShipType, number>>> {
  const survivors = Object.fromEntries(
    names.map((name) => [name, {}])
  ) as Record<string, Partial<Record<ShipType, number>>>;
  for (const fleet of fleets) {
    survivors[fleet.name] = survivorCounts(fleet);
  }
  for (const [fleetName, counts] of Object.entries(retreatedSurvivors)) {
    survivors[fleetName] = { ...counts };
  }
  return survivors;
}

function survivorCounts(fleet: FleetState): Partial<Record<ShipType, number>> {
  return livingShipCounts(fleet.ships);
}

function survivorCountsAtHp(
  ships: readonly Ship[],
  hp: readonly number[]
): ShipCountByType {
  const counts: ShipCountByType = {};
  for (let index = 0; index < ships.length; index++) {
    if ((hp[index] ?? 0) > 0) {
      const shipType = ships[index].type;
      counts[shipType] = (counts[shipType] ?? 0) + 1;
    }
  }
  return counts;
}

function livingShipCounts(ships: readonly Ship[]): ShipCountByType {
  const counts: ShipCountByType = {};
  for (const ship of ships) {
    if (ship.isAlive()) {
      counts[ship.type] = (counts[ship.type] ?? 0) + 1;
    }
  }
  return counts;
}

function destroyedShipCounts(
  before: ShipCountByType,
  after: ShipCountByType
): ShipCountByType {
  const destroyed: ShipCountByType = {};
  for (const shipType of Object.values(ShipType)) {
    const count = (before[shipType] ?? 0) - (after[shipType] ?? 0);
    if (count > 0) destroyed[shipType] = count;
  }
  return destroyed;
}

function retainLivingRemovedFleet(
  target: Record<string, ShipCountByType>,
  fleet: FleetState,
  hp: readonly number[]
): void {
  const counts = survivorCountsAtHp(fleet.ships, hp);
  if (shipCount(counts) > 0) target[fleet.name] = counts;
}

function advanceOutcomeVariants(
  variants: ReadonlyMap<string, OutcomeVariant>,
  destroyedInEngagement: DestroyedShipsCreditedToFleet,
  retreatedInEngagement: Record<string, ShipCountByType>,
  probability: number
): Map<string, OutcomeVariant> {
  const advanced = new Map<string, OutcomeVariant>();
  for (const variant of variants.values()) {
    const credits = cloneDestructionCredits(
      variant.destroyedShipsCreditedToFleet
    );
    const retreatedSurvivors = cloneSurvivorMap(variant.retreatedSurvivors);
    for (const [fleetName, destroyed] of Object.entries(
      destroyedInEngagement
    )) {
      const credited = credits[fleetName] ?? (credits[fleetName] = {});
      for (const [shipType, count] of Object.entries(destroyed)) {
        const type = shipType as ShipType;
        credited[type] = (credited[type] ?? 0) + count!;
      }
    }
    for (const [fleetName, counts] of Object.entries(retreatedInEngagement)) {
      retreatedSurvivors[fleetName] = { ...counts };
    }
    addOutcomeVariant(advanced, {
      probability: variant.probability * probability,
      destroyedShipsCreditedToFleet: credits,
      retreatedSurvivors,
    });
  }
  return advanced;
}

function mergeOutcomeVariants(
  target: Map<string, OutcomeVariant>,
  source: ReadonlyMap<string, OutcomeVariant>
): void {
  for (const variant of source.values()) {
    addOutcomeVariant(target, variant);
  }
}

function addOutcomeVariant(
  target: Map<string, OutcomeVariant>,
  variant: OutcomeVariant
): void {
  const key = outcomeVariantKey(
    variant.destroyedShipsCreditedToFleet,
    variant.retreatedSurvivors
  );
  const existing = target.get(key);
  if (existing) {
    existing.probability += variant.probability;
  } else {
    target.set(key, variant);
  }
}

function cloneDestructionCredits(
  credits: DestroyedShipsCreditedToFleet
): DestroyedShipsCreditedToFleet {
  return Object.fromEntries(
    Object.entries(credits).map(([fleetName, counts]) => [
      fleetName,
      { ...counts },
    ])
  );
}

function cloneSurvivorMap(
  survivors: Record<string, ShipCountByType>
): Record<string, ShipCountByType> {
  return Object.fromEntries(
    Object.entries(survivors).map(([fleetName, counts]) => [
      fleetName,
      { ...counts },
    ])
  );
}

function outcomeVariantKey(
  credits: DestroyedShipsCreditedToFleet,
  retreatedSurvivors: Record<string, ShipCountByType>
): string {
  return `${destructionCreditKey(credits)}||retreated:${shipCountMapKey(
    retreatedSurvivors
  )}`;
}

function destructionCreditKey(credits: DestroyedShipsCreditedToFleet): string {
  return shipCountMapKey(credits);
}

function shipCountMapKey(
  countsByFleet: Record<string, ShipCountByType>
): string {
  return Object.entries(countsByFleet)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fleetName, counts]) => {
      const shipCounts = Object.entries(counts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([type, count]) => `${type}:${count}`)
        .join(',');
      return `${fleetName}=${shipCounts}`;
    })
    .join('|');
}

function standingFleetForTwoFleetOutcome(
  defenderName: string,
  attackerName: string,
  defenderSurvivors: ShipCountByType,
  attackerSurvivors: ShipCountByType
): string | null {
  if (shipCount(defenderSurvivors) > 0) return defenderName;
  if (shipCount(attackerSurvivors) > 0) return attackerName;
  return null;
}

function shipCount(counts: ShipCountByType): number {
  return Object.values(counts).reduce(
    (total, count) => total + (count ?? 0),
    0
  );
}

function survivorCompositionKey(
  names: string[],
  survivors: Record<string, Partial<Record<ShipType, number>>>
): string {
  return names
    .map((name) => {
      const counts = survivors[name] ?? {};
      const shipCounts = Object.entries(counts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([type, count]) => `${type}:${count}`)
        .join(',');
      return `${name}=${shipCounts}`;
    })
    .join('|');
}

function isOptimalFleet(fleet: Fleet): boolean {
  return fleet.getDamageType() === DamageType.OPTIMAL;
}
