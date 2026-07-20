import { DamageType } from 'src/constants';
import { Fleet } from './fleet';
import { Ship, ShipType } from './ship';
import { CombatOutcomeSummary } from './combat-result';
import { BattleModel, Role } from './battle-state';
import {
  AssignmentMode,
  DEFAULT_CAPS,
  SolverCaps,
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
};

export type ExactCombatOptions = {
  // Preserve the historical default for direct callers. Interactive orchestration
  // disables this and applies the preflight once, where the chosen policy can be
  // reported to the user and will not be retried at the next fallback tier.
  plannerPreflight?: boolean;
};

export type ExactPlannerPreflightReason =
  | 'trivial-target'
  | 'complexity'
  | null;

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
  probability: number;
  fleets: FleetState[];
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
      survivors: {
        [defender.name]: entry.defenderSurvivors as Partial<
          Record<ShipType, number>
        >,
        [attacker.name]: entry.attackerSurvivors as Partial<
          Record<ShipType, number>
        >,
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
  const fail = (reason: string): ExactBattleResult => ({
    ok: false,
    reason,
    lastFleetStanding: {},
    drawPercentage: 0,
    expectedSurvivors: {},
    survivorDistribution: [],
    timeTaken: Date.now() - start,
  });

  if (fleets.length < 2) {
    return fail('exact combat requires at least two fleets');
  }

  const names = fleets.map((fleet) => fleet.name);
  let branches: ExactBranch[] = [
    {
      probability: 1,
      fleets: fleets.map(fleetStateFromFleet),
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
      const solved = solveEngagement(
        defenderState,
        attackerState,
        engagementCaps,
        options.plannerPreflight ?? true
      );
      if (!solved.ok) {
        return fail(solved.reason ?? 'solve failed');
      }
      if (solved.residual > MULTI_EXACT_RESIDUAL_TOLERANCE) {
        return fail('nonterminal residual exceeded');
      }

      for (const entry of solved.entries) {
        const fleetsAfter = branch.fleets.slice(0, secondLastIndex);
        if (entry.outcome === 'AttackerWins') {
          fleetsAfter.push(withHp(attackerState, entry.hpA));
        } else if (entry.outcome === 'DefenderWins') {
          fleetsAfter.push(withHp(defenderState, entry.hpB));
        }
        nextBranches.push({
          probability: branch.probability * entry.probability,
          fleets: fleetsAfter,
        });
      }
    }
    branches = mergeBranches(nextBranches);
  }

  return summarizeBranches(branches, names, Date.now() - start);
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

  if (hasSingleShipType(fleets[0]) && isOptimalFleet(fleets[1])) {
    overrides[1] = DamageType.DPS;
  }
  if (hasSingleShipType(fleets[1]) && isOptimalFleet(fleets[0])) {
    overrides[0] = DamageType.DPS;
  }
  if (overrides.some(Boolean)) {
    return { overrides, reason: 'trivial-target', estimatedStates };
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
      existing.probability += branch.probability;
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
  timeTaken: number
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
      survivors: Record<string, Partial<Record<ShipType, number>>>;
    }
  >();
  let drawPercentage = 0;

  for (const branch of branches) {
    const survivors = survivorsForNames(names, branch.fleets);
    const compositionKey = survivorCompositionKey(names, survivors);
    const existing = compositionMass.get(compositionKey);
    if (existing) {
      existing.probability += branch.probability;
    } else {
      compositionMass.set(compositionKey, {
        probability: branch.probability,
        survivors,
      });
    }

    if (branch.fleets.length === 0) {
      drawPercentage += branch.probability;
      continue;
    }

    const winner = branch.fleets[0];
    lastFleetStanding[winner.name] += branch.probability;
    const counts = survivorCounts(winner);
    for (const [type, count] of Object.entries(counts)) {
      const shipType = type as ShipType;
      expectedSurvivorSums[winner.name][shipType] =
        (expectedSurvivorSums[winner.name][shipType] ?? 0) +
        branch.probability * count!;
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
  };
}

function survivorsForNames(
  names: string[],
  fleets: FleetState[]
): Record<string, Partial<Record<ShipType, number>>> {
  const survivors = Object.fromEntries(
    names.map((name) => [name, {}])
  ) as Record<string, Partial<Record<ShipType, number>>>;
  for (const fleet of fleets) {
    survivors[fleet.name] = survivorCounts(fleet);
  }
  return survivors;
}

function survivorCounts(fleet: FleetState): Partial<Record<ShipType, number>> {
  const counts: Partial<Record<ShipType, number>> = {};
  for (const ship of fleet.ships) {
    if (ship.isAlive()) {
      counts[ship.type] = (counts[ship.type] ?? 0) + 1;
    }
  }
  return counts;
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

function hasSingleShipType(fleet: Fleet): boolean {
  return shipTypeCount(fleet) <= 1;
}

function shipTypeCount(fleet: Fleet): number {
  return new Set(fleet.getRoster().map((ship) => ship.type)).size;
}

function isOptimalFleet(fleet: Fleet): boolean {
  return fleet.getDamageType() === DamageType.OPTIMAL;
}
