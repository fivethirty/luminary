import { ShipType } from '@calc/ship';
import type { FactionId } from '@ui/fleet-metadata';
import type { FleetState, SurvivorDistributionEntry } from '@ui/state';

const STANDARD_SHIP_RESOURCE_COSTS: Readonly<
  Partial<Record<ShipType, number>>
> = {
  [ShipType.Interceptor]: 3,
  [ShipType.Cruiser]: 5,
  [ShipType.Dreadnought]: 8,
  [ShipType.Orbital]: 4,
  [ShipType.Starbase]: 3,
};

/** Species-board build costs that differ from the standard player board. */
export const FACTION_SHIP_RESOURCE_COST_OVERRIDES: FactionShipResourceCostOverrides =
  {
    mechanema: {
      [ShipType.Interceptor]: 2,
      [ShipType.Cruiser]: 4,
      [ShipType.Dreadnought]: 7,
      [ShipType.Orbital]: 3,
      [ShipType.Starbase]: 2,
    },
    'rho-indi': {
      [ShipType.Interceptor]: 4,
      [ShipType.Cruiser]: 6,
      [ShipType.Dreadnought]: 9,
      [ShipType.Orbital]: 5,
      [ShipType.Starbase]: 4,
    },
    exiles: {
      [ShipType.Orbital]: 5,
    },
  };

export const SHIP_REPUTATION_VALUES: Readonly<Record<ShipType, number>> = {
  [ShipType.Interceptor]: 1,
  [ShipType.Cruiser]: 2,
  [ShipType.Dreadnought]: 3,
  [ShipType.Starbase]: 1,
  [ShipType.Orbital]: 1,
  [ShipType.Ancient]: 1,
  [ShipType.Guardian]: 2,
  [ShipType.GCDS]: 3,
};

type ShipResourceCosts = Readonly<Partial<Record<ShipType, number>>>;

type FactionShipResourceCostOverrides = Readonly<
  Partial<Record<FactionId, ShipResourceCosts>>
>;

interface MaterialLossOptions {
  /**
   * Overrides only the listed hulls for a faction. Other hulls retain their
   * standard costs, and the override never changes which hulls are legal.
   */
  factionCostOverrides?: FactionShipResourceCostOverrides;
}

interface MaterialLossDistributionEntry {
  resourcesLost: number;
  probability: number;
}

export interface FleetMaterialLossSummary {
  totalCost: number;
  expectedRemainingCost: number | null;
  expectedLostCost: number | null;
  lossDistribution: MaterialLossDistributionEntry[];
}

/**
 * Computes fleet value and losses from terminal survivor outcomes. Fleets that
 * contain an unpriced hull (currently NPC fleets) are omitted rather than
 * presenting their combat strength as zero resources.
 */
export function calculateMaterialLosses(
  fleets: readonly FleetState[],
  survivorDistribution: readonly SurvivorDistributionEntry[],
  options: MaterialLossOptions = {
    factionCostOverrides: FACTION_SHIP_RESOURCE_COST_OVERRIDES,
  }
): Record<string, FleetMaterialLossSummary> {
  const outcomes = positiveProbabilityOutcomes(survivorDistribution);
  const probabilityMass = outcomes.reduce(
    (sum, outcome) => sum + outcome.probability,
    0
  );
  const summaries: Record<string, FleetMaterialLossSummary> = {};

  for (const fleet of fleets) {
    const costs = costsForFleet(fleet, options.factionCostOverrides);
    const initialCounts = shipCounts(fleet);
    if (
      initialCounts.size === 0 ||
      [...initialCounts.keys()].some((type) => costs[type] === undefined)
    ) {
      continue;
    }

    const totalCost = compositionCost(initialCounts, costs);
    if (probabilityMass === 0) {
      summaries[fleet.id] = {
        totalCost,
        expectedRemainingCost: null,
        expectedLostCost: null,
        lossDistribution: [],
      };
      continue;
    }

    const probabilityByLoss = new Map<number, number>();
    let weightedRemainingCost = 0;
    for (const outcome of outcomes) {
      const remainingCost = survivorCost(
        outcome.survivors[fleet.id],
        initialCounts,
        costs
      );
      const resourcesLost = totalCost - remainingCost;
      weightedRemainingCost += outcome.probability * remainingCost;
      probabilityByLoss.set(
        resourcesLost,
        (probabilityByLoss.get(resourcesLost) ?? 0) + outcome.probability
      );
    }

    const expectedRemainingCost = weightedRemainingCost / probabilityMass;
    summaries[fleet.id] = {
      totalCost,
      expectedRemainingCost,
      expectedLostCost: totalCost - expectedRemainingCost,
      lossDistribution: [...probabilityByLoss.entries()]
        .map(([resourcesLost, probability]) => ({
          resourcesLost,
          probability: probability / probabilityMass,
        }))
        .sort((a, b) => a.resourcesLost - b.resourcesLost),
    };
  }

  return summaries;
}

type ReputationDrawCount = 0 | 1 | 2 | 3 | 4 | 5;
type PositiveReputationDrawCount = Exclude<ReputationDrawCount, 0>;

type ReputationDrawProbabilities = Record<PositiveReputationDrawCount, number> &
  Partial<Record<0, number>>;

interface FleetReputationDrawSummary {
  probabilityByDrawCount: ReputationDrawProbabilities;
  expectedDraws: number;
}

/**
 * Optional engagement-boundary telemetry for n-way battles. Each fleet entry
 * is the total composition destroyed in engagements involving that fleet for
 * this terminal outcome. An absent fleet key means it did not participate in
 * an engagement on that outcome. Attribution to an individual shot is
 * unnecessary.
 */
export interface ReputationSurvivorDistributionEntry
  extends SurvivorDistributionEntry {
  destroyedShipsCreditedToFleet?: Record<
    string,
    Partial<Record<ShipType, number>>
  >;
}

export type ReputationDrawDistributionResult =
  | {
      available: true;
      byFleet: Record<string, FleetReputationDrawSummary>;
    }
  | {
      available: false;
      reason: 'no-outcomes' | 'engagement-credit-required';
    };

/**
 * Calculates reputation tile draws for every fleet in the combat setup.
 *
 * Rules assumption: participation is one draw, destroyed hull reputation is
 * added one-for-one, and the combined total is capped at five draws. Explicit
 * engagement credit is authoritative for every battle size. Legacy two-fleet
 * outcomes may derive losses from terminal survivors when telemetry is absent;
 * n-way outcomes require it. A fleet that never reaches an engagement receives
 * zero draws for that outcome.
 */
export function calculateReputationDrawDistributions(
  fleets: readonly FleetState[],
  survivorDistribution: readonly ReputationSurvivorDistributionEntry[]
): ReputationDrawDistributionResult {
  const outcomes = positiveProbabilityOutcomes(survivorDistribution);
  const probabilityMass = outcomes.reduce(
    (sum, outcome) => sum + outcome.probability,
    0
  );
  if (probabilityMass === 0) {
    return { available: false, reason: 'no-outcomes' };
  }

  const isTwoFleetBattle = fleets.length === 2;
  if (
    !isTwoFleetBattle &&
    outcomes.some(
      (outcome) => outcome.destroyedShipsCreditedToFleet === undefined
    )
  ) {
    return { available: false, reason: 'engagement-credit-required' };
  }

  const initialCounts = new Map(
    fleets.map((fleet) => [fleet.id, shipCounts(fleet)])
  );
  const probabilityByFleet = new Map<string, ReputationDrawProbabilities>(
    fleets.map((fleet) => [fleet.id, emptyReputationDrawProbabilities()])
  );

  for (const outcome of outcomes) {
    for (let fleetIndex = 0; fleetIndex < fleets.length; fleetIndex++) {
      const fleet = fleets[fleetIndex];
      let draws: ReputationDrawCount;
      if (outcome.destroyedShipsCreditedToFleet !== undefined) {
        if (
          !Object.prototype.hasOwnProperty.call(
            outcome.destroyedShipsCreditedToFleet,
            fleet.id
          )
        ) {
          draws = 0;
        } else {
          draws = reputationDrawCount(
            outcome.destroyedShipsCreditedToFleet[fleet.id] ?? {}
          );
        }
      } else if (isTwoFleetBattle) {
        const opponent = fleets[1 - fleetIndex];
        draws = reputationDrawCount(
          destroyedComposition(
            initialCounts.get(opponent.id)!,
            outcome.survivors[opponent.id]
          )
        );
      } else {
        // N-way outcomes without telemetry are rejected above.
        draws = 0;
      }

      const probabilities = probabilityByFleet.get(fleet.id)!;
      probabilities[draws] = (probabilities[draws] ?? 0) + outcome.probability;
    }
  }

  const byFleet: Record<string, FleetReputationDrawSummary> = {};
  for (const fleet of fleets) {
    const probabilities = probabilityByFleet.get(fleet.id)!;
    for (const drawCount of reputationDrawCounts()) {
      probabilities[drawCount] =
        (probabilities[drawCount] ?? 0) / probabilityMass;
    }
    const probabilityByDrawCount: ReputationDrawProbabilities = {
      ...probabilities,
    };
    if (probabilityByDrawCount[0] === 0) {
      delete probabilityByDrawCount[0];
    }
    byFleet[fleet.id] = {
      probabilityByDrawCount,
      expectedDraws: reputationDrawCounts().reduce<number>(
        (sum, drawCount) => sum + drawCount * (probabilities[drawCount] ?? 0),
        0
      ),
    };
  }

  return { available: true, byFleet };
}

function costsForFleet(
  fleet: FleetState,
  overrides: FactionShipResourceCostOverrides | undefined
): ShipResourceCosts {
  const factionOverrides = fleet.factionId
    ? overrides?.[fleet.factionId]
    : undefined;
  return {
    ...STANDARD_SHIP_RESOURCE_COSTS,
    ...factionOverrides,
  };
}

function shipCounts(fleet: FleetState): Map<ShipType, number> {
  const counts = new Map<ShipType, number>();
  for (const shipType of fleet.shipTypes) {
    const quantity = nonNegativeFinite(shipType.quantity);
    if (quantity === 0) continue;
    counts.set(shipType.type, (counts.get(shipType.type) ?? 0) + quantity);
  }
  return counts;
}

function compositionCost(
  counts: ReadonlyMap<ShipType, number>,
  costs: ShipResourceCosts
): number {
  let cost = 0;
  for (const [type, count] of counts) {
    cost += count * costs[type]!;
  }
  return cost;
}

function survivorCost(
  survivors: Record<string, number> | undefined,
  initialCounts: ReadonlyMap<ShipType, number>,
  costs: ShipResourceCosts
): number {
  let cost = 0;
  for (const [type, initialCount] of initialCounts) {
    const survivorCount = Math.min(
      initialCount,
      nonNegativeFinite(survivors?.[type])
    );
    cost += survivorCount * costs[type]!;
  }
  return cost;
}

function destroyedComposition(
  initialCounts: ReadonlyMap<ShipType, number>,
  survivors: Record<string, number> | undefined
): Partial<Record<ShipType, number>> {
  const destroyed: Partial<Record<ShipType, number>> = {};
  for (const [type, initialCount] of initialCounts) {
    const survivorCount = Math.min(
      initialCount,
      nonNegativeFinite(survivors?.[type])
    );
    if (survivorCount < initialCount) {
      destroyed[type] = initialCount - survivorCount;
    }
  }
  return destroyed;
}

function reputationDrawCount(
  destroyed: Partial<Record<ShipType, number>>
): ReputationDrawCount {
  let destroyedReputation = 0;
  for (const [type, count] of Object.entries(destroyed)) {
    destroyedReputation +=
      SHIP_REPUTATION_VALUES[type as ShipType] * nonNegativeFinite(count);
  }
  return Math.min(
    5,
    1 + Math.floor(destroyedReputation)
  ) as ReputationDrawCount;
}

function positiveProbabilityOutcomes<T extends { probability: number }>(
  outcomes: readonly T[]
): T[] {
  return outcomes.filter(
    (outcome) => Number.isFinite(outcome.probability) && outcome.probability > 0
  );
}

function nonNegativeFinite(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function emptyReputationDrawProbabilities(): Record<
  PositiveReputationDrawCount,
  number
> &
  Record<0, number> {
  return { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

function reputationDrawCounts(): ReputationDrawCount[] {
  return [0, 1, 2, 3, 4, 5];
}
