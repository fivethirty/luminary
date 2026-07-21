import { describe, expect, test } from 'bun:test';
import { ShipType } from '@calc/ship';
import type { FleetState, SurvivorDistributionEntry } from '@ui/state';
import {
  calculateMaterialLosses,
  calculateReputationDrawDistributions,
  FACTION_SHIP_RESOURCE_COST_OVERRIDES,
  SHIP_REPUTATION_VALUES,
  type ReputationSurvivorDistributionEntry,
} from './battle-impact';

describe('material losses', () => {
  test('calculates total cost, expected loss, and the loss distribution', () => {
    const fleets = [
      fleet('defender', [
        [ShipType.Interceptor, 2],
        [ShipType.Cruiser, 1],
        [ShipType.Dreadnought, 1],
      ]),
      fleet('attacker', [
        [ShipType.Orbital, 1],
        [ShipType.Starbase, 1],
      ]),
    ];
    const outcomes: SurvivorDistributionEntry[] = [
      outcome(0.25, {
        defender: { Dreadnought: 1, Cruiser: 1 },
        attacker: { Orbital: 1 },
      }),
      outcome(0.75, {
        defender: { Interceptor: 1 },
        attacker: {},
      }),
    ];

    const losses = calculateMaterialLosses(fleets, outcomes);

    expect(losses.defender.totalCost).toBe(19);
    expect(losses.defender.expectedRemainingCost).toBe(5.5);
    expect(losses.defender.expectedLostCost).toBe(13.5);
    expect(losses.defender.lossDistribution).toEqual([
      { resourcesLost: 6, probability: 0.25 },
      { resourcesLost: 16, probability: 0.75 },
    ]);
    expect(losses.attacker.totalCost).toBe(7);
    expect(losses.attacker.expectedLostCost).toBe(6);
  });

  test('applies faction overrides without replacing standard fallback costs', () => {
    const fleets = [
      fleet(
        'exiles',
        [
          [ShipType.Orbital, 2],
          [ShipType.Interceptor, 1],
        ],
        'exiles'
      ),
    ];
    const outcomes = [outcome(1, { exiles: { Orbital: 1 } })];

    const losses = calculateMaterialLosses(fleets, outcomes, {
      factionCostOverrides: {
        exiles: { [ShipType.Orbital]: 6 },
      },
    });

    expect(losses.exiles.totalCost).toBe(15);
    expect(losses.exiles.expectedRemainingCost).toBe(6);
    expect(losses.exiles.expectedLostCost).toBe(9);
  });

  test('uses the built-in species-board cost overrides by default', () => {
    const fleets = [
      fleet(
        'mechanema',
        [
          [ShipType.Interceptor, 1],
          [ShipType.Cruiser, 1],
          [ShipType.Dreadnought, 1],
          [ShipType.Orbital, 1],
          [ShipType.Starbase, 1],
        ],
        'mechanema'
      ),
      fleet(
        'rho-indi',
        [
          [ShipType.Interceptor, 1],
          [ShipType.Cruiser, 1],
          [ShipType.Dreadnought, 1],
          [ShipType.Orbital, 1],
          [ShipType.Starbase, 1],
        ],
        'rho-indi'
      ),
      fleet('exiles', [[ShipType.Orbital, 1]], 'exiles'),
    ];

    const losses = calculateMaterialLosses(fleets, [
      outcome(1, { mechanema: {}, 'rho-indi': {}, exiles: {} }),
    ]);

    expect(FACTION_SHIP_RESOURCE_COST_OVERRIDES.mechanema).toBeDefined();
    expect(losses.mechanema.totalCost).toBe(18);
    expect(losses['rho-indi'].totalCost).toBe(28);
    expect(losses.exiles.totalCost).toBe(5);
  });

  test('omits unpriced NPC fleets instead of reporting zero resources', () => {
    const losses = calculateMaterialLosses(
      [fleet('ancients', [[ShipType.Ancient, 2]])],
      [outcome(1, { ancients: {} })]
    );

    expect(losses).toEqual({});
  });

  test('keeps initial cost but reports unavailable expectations without outcomes', () => {
    const losses = calculateMaterialLosses(
      [fleet('fleet', [[ShipType.Cruiser, 2]])],
      []
    );

    expect(losses.fleet).toEqual({
      totalCost: 10,
      expectedRemainingCost: null,
      expectedLostCost: null,
      lossDistribution: [],
    });
  });

  test('does not count living retreaters as material lost', () => {
    const fleets = [
      fleet('defender', [[ShipType.Interceptor, 1]]),
      fleet('attacker', [[ShipType.Cruiser, 1]]),
    ];
    const losses = calculateMaterialLosses(fleets, [
      {
        probability: 1,
        survivors: {
          defender: { Interceptor: 1 },
          attacker: { Cruiser: 1 },
        },
      },
    ]);

    expect(losses.defender.expectedLostCost).toBe(0);
    expect(losses.attacker.expectedLostCost).toBe(0);
  });
});

describe('reputation tile draws', () => {
  test('assigns the documented reputation values to every combat hull', () => {
    expect(SHIP_REPUTATION_VALUES).toEqual({
      Interceptor: 1,
      Cruiser: 2,
      Dreadnought: 3,
      Starbase: 1,
      Orbital: 1,
      Ancient: 1,
      Guardian: 2,
      GCDS: 3,
    });
  });

  test('derives exact two-fleet draw distributions from terminal survivors', () => {
    const fleets = [
      fleet('defender', [
        [ShipType.Dreadnought, 1],
        [ShipType.Interceptor, 1],
      ]),
      fleet('attacker', [[ShipType.Cruiser, 2]]),
    ];
    const outcomes = [
      outcome(0.5, {
        defender: { Dreadnought: 1 },
        attacker: { Cruiser: 1 },
      }),
      outcome(0.5, { defender: {}, attacker: {} }),
    ];

    const result = calculateReputationDrawDistributions(fleets, outcomes);

    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.byFleet.defender.probabilityByDrawCount).toEqual({
      1: 0,
      2: 0,
      3: 0.5,
      4: 0,
      5: 0.5,
    });
    expect(result.byFleet.defender.expectedDraws).toBe(4);
    expect(result.byFleet.attacker.probabilityByDrawCount).toEqual({
      1: 0,
      2: 0.5,
      3: 0,
      4: 0,
      5: 0.5,
    });
    expect(result.byFleet.attacker.expectedDraws).toBe(3.5);
  });

  test('caps participation plus kill value at five total draws', () => {
    const fleets = [
      fleet('defender', [[ShipType.Interceptor, 1]]),
      fleet('attacker', [
        [ShipType.GCDS, 1],
        [ShipType.Guardian, 1],
      ]),
    ];

    const result = calculateReputationDrawDistributions(fleets, [
      outcome(1, { defender: { Interceptor: 1 }, attacker: {} }),
    ]);

    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.byFleet.defender.probabilityByDrawCount[5]).toBe(1);
    expect(result.byFleet.defender.expectedDraws).toBe(5);
  });

  test('prefers explicit two-fleet engagement credit over survivor inference', () => {
    const fleets = [
      fleet('defender', [[ShipType.Interceptor, 1]]),
      fleet('attacker', [[ShipType.Cruiser, 1]]),
    ];
    const outcomes: ReputationSurvivorDistributionEntry[] = [
      {
        ...outcome(1, {
          defender: { Interceptor: 1 },
          attacker: {},
        }),
        destroyedShipsCreditedToFleet: {
          defender: {},
          attacker: {},
        },
      },
    ];

    const result = calculateReputationDrawDistributions(fleets, outcomes);

    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.byFleet.defender.probabilityByDrawCount[1]).toBe(1);
    expect(result.byFleet.attacker.probabilityByDrawCount[1]).toBe(1);
  });

  test('requires engagement credit for n-way terminal outcomes', () => {
    const result = calculateReputationDrawDistributions(
      [
        fleet('defender', [[ShipType.Interceptor, 1]]),
        fleet('attacker-1', [[ShipType.Cruiser, 1]]),
        fleet('attacker-2', [[ShipType.Dreadnought, 1]]),
      ],
      [outcome(1, { defender: {}, 'attacker-1': {}, 'attacker-2': {} })]
    );

    expect(result).toEqual({
      available: false,
      reason: 'engagement-credit-required',
    });
  });

  test('uses explicit engagement destruction credit for n-way outcomes', () => {
    const fleets = [
      fleet('defender', [[ShipType.GCDS, 1]]),
      fleet('attacker-1', [
        [ShipType.Cruiser, 1],
        [ShipType.Guardian, 1],
      ]),
      fleet('attacker-2', [
        [ShipType.Dreadnought, 1],
        [ShipType.Ancient, 1],
      ]),
    ];
    const outcomes: ReputationSurvivorDistributionEntry[] = [
      {
        ...outcome(0.25, {
          defender: { GCDS: 1 },
          'attacker-1': {},
          'attacker-2': {},
        }),
        destroyedShipsCreditedToFleet: {
          defender: { Cruiser: 1 },
          'attacker-1': {},
          'attacker-2': { Guardian: 1, GCDS: 1 },
        },
      },
      {
        ...outcome(0.75, {
          defender: {},
          'attacker-1': {},
          'attacker-2': { Ancient: 1 },
        }),
        destroyedShipsCreditedToFleet: {
          defender: { Ancient: 1 },
          'attacker-1': { Guardian: 1 },
          'attacker-2': { Dreadnought: 1, Interceptor: 1 },
        },
      },
    ];

    const result = calculateReputationDrawDistributions(fleets, outcomes);

    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.byFleet.defender.probabilityByDrawCount).toEqual({
      1: 0,
      2: 0.75,
      3: 0.25,
      4: 0,
      5: 0,
    });
    expect(result.byFleet['attacker-1'].probabilityByDrawCount).toEqual({
      1: 0.25,
      2: 0,
      3: 0.75,
      4: 0,
      5: 0,
    });
    expect(result.byFleet['attacker-2'].probabilityByDrawCount[5]).toBe(1);
  });

  test('awards zero draws when the lower fleets draw before the top fleet engages', () => {
    const fleets = [
      fleet('defender', [[ShipType.Dreadnought, 1]]),
      fleet('attacker-1', [[ShipType.Cruiser, 1]]),
      fleet('attacker-2', [[ShipType.Interceptor, 1]]),
    ];
    const outcomes: ReputationSurvivorDistributionEntry[] = [
      {
        ...outcome(1, {
          defender: { Dreadnought: 1 },
          'attacker-1': {},
          'attacker-2': {},
        }),
        destroyedShipsCreditedToFleet: {
          'attacker-1': { Interceptor: 1 },
          'attacker-2': { Cruiser: 1 },
        },
      },
    ];

    const result = calculateReputationDrawDistributions(fleets, outcomes);

    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.byFleet.defender.probabilityByDrawCount).toEqual({
      0: 1,
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    });
    expect(result.byFleet.defender.expectedDraws).toBe(0);
    expect(result.byFleet['attacker-1'].probabilityByDrawCount[2]).toBe(1);
    expect(result.byFleet['attacker-2'].probabilityByDrawCount[3]).toBe(1);
  });

  test('reports unavailable when no positive-probability outcomes exist', () => {
    const result = calculateReputationDrawDistributions(
      [
        fleet('defender', [[ShipType.Interceptor, 1]]),
        fleet('attacker', [[ShipType.Interceptor, 1]]),
      ],
      []
    );

    expect(result).toEqual({ available: false, reason: 'no-outcomes' });
  });
});

function fleet(
  id: string,
  ships: [ShipType, number][],
  factionId: FleetState['factionId'] = ''
): FleetState {
  return {
    id,
    name: id,
    factionId,
    colorId: 'blue',
    colorIsManual: false,
    antimatterSplitter: false,
    plannerType: 'optimal',
    shipTypes: ships.map(([type, quantity], index) => ({
      id: `${id}-ship-${index}`,
      type,
      quantity,
      config: {},
    })),
  };
}

function outcome(
  probability: number,
  survivors: Record<string, Record<string, number>>
): SurvivorDistributionEntry {
  return { probability, survivors };
}
