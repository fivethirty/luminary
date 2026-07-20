import type { CombatOutcomeSummary } from './combat-result';
import { enumerateSlotOutcomes } from './dice-distribution';
import { Fleet } from './fleet';
import { Ship, ShipType, WeaponType } from './ship';

/** The last bucket represents six or more damage. */
export const MAX_POPULATION_DAMAGE_BUCKET = 6;

export type PopulationDamageBucket = {
  /** Exact damage for 0..5; six or more damage for the final bucket. */
  damage: number;
  exactProbability: number;
  /** Probability of inflicting at least `damage`. */
  atLeastProbability: number;
};

export type PopulationBombardmentResult = {
  /** Unconditional damage odds keyed by the final winning attacker's ID. */
  byAttacker: Record<string, PopulationDamageBucket[]>;
};

export type PopulationBombardmentOptions = {
  /**
   * Stable ID of the sector defender. Defaults to the first engine fleet, but
   * may name an omitted empty fleet when the caller filters engine inputs.
   */
  defenderFleetName?: string;
  /**
   * Treat an attacker breakthrough as an automatic population wipe. A callback
   * supports attacker-specific effects without making this engine helper know
   * about factions or technologies.
   */
  automaticWipe?: boolean | ((winningFleetName: string) => boolean);
};

type SurvivorComposition = CombatOutcomeSummary['survivorDistribution'][number];

type DamageDistribution = number[];

const WEAPON_TYPES = Object.values(WeaponType);
const SINGLE_DIE_OUTCOME_CAP = 10;

/**
 * Combines terminal combat outcomes with one population-attack roll by the
 * final non-defender fleet. The first fleet is the defender. Probabilities are
 * unconditional within each `byAttacker` row: every other fleet's win, a
 * defender win, and a draw all contribute zero damage to that attacker's row.
 *
 * Eclipse lets every surviving ship fire each non-Missile weapon once against
 * Population Cubes, which have zero Shields. Rift Cannons are included because
 * they are non-Missile weapons; their self-damage does not cancel damage rolled
 * in the same population attack.
 */
export function calculatePopulationBombardment(
  fleets: readonly Fleet[],
  survivorDistribution: readonly SurvivorComposition[],
  options: PopulationBombardmentOptions = {}
): PopulationBombardmentResult {
  const volleyCache = new Map<Fleet, Map<string, DamageDistribution>>();
  const defenderFleetName = options.defenderFleetName ?? fleets[0]?.name;
  const attackers = fleets.filter((fleet) => fleet.name !== defenderFleetName);
  const damageByAttacker = new Map(
    attackers.map((fleet) => [fleet.name, emptyDamageDistribution()])
  );

  for (const terminalOutcome of survivorDistribution) {
    const winner = terminalWinner(fleets, terminalOutcome);
    if (!winner || winner.name === defenderFleetName) {
      addZeroDamageForOtherAttackers(
        damageByAttacker,
        undefined,
        terminalOutcome.probability
      );
      continue;
    }

    if (isAutomaticWipe(options.automaticWipe, winner.name)) {
      damageByAttacker.get(winner.name)![MAX_POPULATION_DAMAGE_BUCKET] +=
        terminalOutcome.probability;
      addZeroDamageForOtherAttackers(
        damageByAttacker,
        winner.name,
        terminalOutcome.probability
      );
      continue;
    }

    const survivorCounts = terminalOutcome.survivors[winner.name] ?? {};
    const volley = cachedVolleyDistribution(
      winner,
      survivorCounts,
      volleyCache
    );
    for (let damage = 0; damage <= MAX_POPULATION_DAMAGE_BUCKET; damage++) {
      const weightedProbability = terminalOutcome.probability * volley[damage];
      damageByAttacker.get(winner.name)![damage] += weightedProbability;
    }
    addZeroDamageForOtherAttackers(
      damageByAttacker,
      winner.name,
      terminalOutcome.probability
    );
  }

  return {
    byAttacker: Object.fromEntries(
      [...damageByAttacker].map(([fleetName, distribution]) => [
        fleetName,
        damageBuckets(distribution),
      ])
    ),
  };
}

function damageBuckets(
  totalDamage: DamageDistribution
): PopulationDamageBucket[] {
  let atLeastProbability = 0;
  const buckets: PopulationDamageBucket[] = [];
  for (let damage = MAX_POPULATION_DAMAGE_BUCKET; damage >= 0; damage--) {
    atLeastProbability += totalDamage[damage];
    buckets.push({
      damage,
      exactProbability: totalDamage[damage],
      atLeastProbability,
    });
  }

  return buckets.reverse();
}

function addZeroDamageForOtherAttackers(
  damageByAttacker: ReadonlyMap<string, DamageDistribution>,
  winningFleetName: string | undefined,
  probability: number
): void {
  for (const [fleetName, distribution] of damageByAttacker) {
    if (fleetName !== winningFleetName) distribution[0] += probability;
  }
}

function terminalWinner(
  fleets: readonly Fleet[],
  outcome: SurvivorComposition
): Fleet | undefined {
  if (Object.prototype.hasOwnProperty.call(outcome, 'lastFleetStanding')) {
    if (outcome.lastFleetStanding === null) return undefined;
    const winner = fleets.find(
      (fleet) => fleet.name === outcome.lastFleetStanding
    );
    if (!winner) {
      throw new Error(
        `Population bombardment winner ${outcome.lastFleetStanding} is not in the combat setup`
      );
    }
    return winner;
  }

  // Backward-compatible fallback for caller-authored outcomes created before
  // the engine distinguished living retreaters from the fleet holding sector.
  const survivingFleets = fleets.filter(
    (fleet) => survivorCount(outcome.survivors[fleet.name]) > 0
  );

  if (survivingFleets.length > 1) {
    throw new Error(
      'Population bombardment requires terminal survivor outcomes with at most one fleet standing'
    );
  }

  return survivingFleets[0];
}

function survivorCount(
  counts: Partial<Record<ShipType, number>> | undefined
): number {
  return Object.values(counts ?? {}).reduce(
    (total, count) => total + (count ?? 0),
    0
  );
}

function cachedVolleyDistribution(
  fleet: Fleet,
  survivorCounts: Partial<Record<ShipType, number>>,
  cache: Map<Fleet, Map<string, DamageDistribution>>
): DamageDistribution {
  let fleetCache = cache.get(fleet);
  if (!fleetCache) {
    fleetCache = new Map();
    cache.set(fleet, fleetCache);
  }

  const key = Object.entries(survivorCounts)
    .filter(([, count]) => (count ?? 0) > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, count]) => `${type}:${count}`)
    .join('|');
  const cached = fleetCache.get(key);
  if (cached) return cached;

  const distribution = volleyDistribution(
    survivingShips(fleet, survivorCounts),
    fleet.antimatterSplitter
  );
  fleetCache.set(key, distribution);
  return distribution;
}

function survivingShips(
  fleet: Fleet,
  survivorCounts: Partial<Record<ShipType, number>>
): Ship[] {
  const surviving: Ship[] = [];
  const roster = fleet.getRoster();

  for (const [rawType, rawCount] of Object.entries(survivorCounts)) {
    const type = rawType as ShipType;
    const count = rawCount ?? 0;
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`Invalid survivor count for ${type}: ${count}`);
    }
    if (count === 0) continue;

    const matchingShips = roster.filter((ship) => ship.type === type);
    if (count > matchingShips.length) {
      throw new Error(
        `Survivor count for ${fleet.name} ${type} exceeds its initial roster`
      );
    }

    // Combat summaries intentionally retain counts by hull type rather than
    // individual ship identity. The browser-state invariant gives one blueprint
    // per hull type. Guard engine-only callers from silently using an ambiguous
    // partial survivor count if they construct a fleet that violates it.
    const configCount = new Set(matchingShips.map((ship) => ship.configKey()))
      .size;
    if (configCount > 1 && count < matchingShips.length) {
      throw new Error(
        `Cannot identify which ${fleet.name} ${type} configuration survived`
      );
    }

    surviving.push(...matchingShips.slice(0, count));
  }

  return surviving;
}

function volleyDistribution(
  ships: readonly Ship[],
  antimatterSplitter: boolean
): DamageDistribution {
  let distribution = unitDamageDistribution();
  const singleDieCache = new Map<string, DamageDistribution>();

  for (const ship of ships) {
    for (const weaponType of WEAPON_TYPES) {
      const dieCount = ship.cannons[weaponType];
      assertValidDieCount(dieCount, `${weaponType} Cannon`);
      if (dieCount === 0) continue;

      const cacheKey = `${ship.computers}|${weaponType}|${antimatterSplitter}`;
      let singleDie = singleDieCache.get(cacheKey);
      if (!singleDie) {
        const cannons: Partial<Record<WeaponType, number>> = {
          [weaponType]: 1,
        };
        singleDie = exactSingleDieDistribution(
          new Ship(ship.type, { computers: ship.computers, cannons }),
          antimatterSplitter
        );
        singleDieCache.set(cacheKey, singleDie);
      }

      distribution = convolveRepeated(distribution, singleDie, dieCount);
    }

    assertValidDieCount(ship.rift, 'Rift Cannon');
    if (ship.rift > 0) {
      const cacheKey = 'rift';
      let singleDie = singleDieCache.get(cacheKey);
      if (!singleDie) {
        singleDie = exactSingleDieDistribution(
          new Ship(ship.type, { rift: 1 }),
          antimatterSplitter
        );
        singleDieCache.set(cacheKey, singleDie);
      }
      distribution = convolveRepeated(distribution, singleDie, ship.rift);
    }
  }

  return distribution;
}

function exactSingleDieDistribution(
  shooter: Ship,
  antimatterSplitter: boolean
): DamageDistribution {
  const outcomes = enumerateSlotOutcomes(
    [shooter],
    false,
    [0],
    antimatterSplitter,
    SINGLE_DIE_OUTCOME_CAP
  );
  if (!outcomes) {
    throw new Error('Unable to enumerate a population-attack die');
  }

  const distribution = emptyDamageDistribution();
  for (const outcome of outcomes) {
    const damage = outcome.shots.reduce(
      (total, shot) => total + shot.damage,
      0
    );
    distribution[Math.min(MAX_POPULATION_DAMAGE_BUCKET, damage)] +=
      outcome.prob;
  }
  return distribution;
}

function convolveRepeated(
  initial: DamageDistribution,
  die: DamageDistribution,
  count: number
): DamageDistribution {
  let result = initial;
  for (let roll = 0; roll < count; roll++) {
    result = convolve(result, die);
  }
  return result;
}

function convolve(
  left: DamageDistribution,
  right: DamageDistribution
): DamageDistribution {
  const result = emptyDamageDistribution();
  for (
    let leftDamage = 0;
    leftDamage <= MAX_POPULATION_DAMAGE_BUCKET;
    leftDamage++
  ) {
    for (
      let rightDamage = 0;
      rightDamage <= MAX_POPULATION_DAMAGE_BUCKET;
      rightDamage++
    ) {
      const combinedDamage = Math.min(
        MAX_POPULATION_DAMAGE_BUCKET,
        leftDamage + rightDamage
      );
      result[combinedDamage] += left[leftDamage] * right[rightDamage];
    }
  }
  return result;
}

function emptyDamageDistribution(): DamageDistribution {
  return Array.from({ length: MAX_POPULATION_DAMAGE_BUCKET + 1 }, () => 0);
}

function unitDamageDistribution(): DamageDistribution {
  const distribution = emptyDamageDistribution();
  distribution[0] = 1;
  return distribution;
}

function isAutomaticWipe(
  automaticWipe: PopulationBombardmentOptions['automaticWipe'],
  winningFleetName: string
): boolean {
  return typeof automaticWipe === 'function'
    ? automaticWipe(winningFleetName)
    : (automaticWipe ?? false);
}

function assertValidDieCount(count: number, weaponName: string): void {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`Invalid ${weaponName} count: ${count}`);
  }
}
