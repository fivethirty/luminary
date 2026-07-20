import { describe, expect, test } from 'bun:test';
import { Fleet } from './fleet';
import {
  calculatePopulationBombardment,
  type PopulationDamageBucket,
} from './population-bombardment';
import { Ship, ShipType } from './ship';

type SurvivorOutcome = Parameters<
  typeof calculatePopulationBombardment
>[1][number];

function bucket(
  buckets: PopulationDamageBucket[],
  damage: number
): PopulationDamageBucket {
  return buckets.find((entry) => entry.damage === damage)!;
}

describe('calculatePopulationBombardment', () => {
  test('combines battle odds with cannon accuracy and ignores missiles', () => {
    const defender = new Fleet('defender', [new Ship(ShipType.Interceptor)]);
    const attacker = new Fleet('attacker', [
      new Ship(ShipType.Interceptor, {
        computers: 1,
        cannons: { ion: 1 },
        missiles: { antimatter: 4 },
      }),
    ]);
    const outcomes: SurvivorOutcome[] = [
      {
        probability: 0.25,
        survivors: {
          defender: { [ShipType.Interceptor]: 1 },
          attacker: {},
        },
      },
      {
        probability: 0.75,
        survivors: {
          defender: {},
          attacker: { [ShipType.Interceptor]: 1 },
        },
      },
    ];

    const result = calculatePopulationBombardment(
      [defender, attacker],
      outcomes
    );

    // The attacker's +1 Computer makes its Ion Cannon hit on 5 or 6. Its four
    // Antimatter Missiles do not fire against population.
    expect(bucket(result.byAttacker.attacker, 0).exactProbability).toBeCloseTo(
      0.75,
      12
    );
    expect(bucket(result.byAttacker.attacker, 1).exactProbability).toBeCloseTo(
      0.25,
      12
    );
    expect(
      bucket(result.byAttacker.attacker, 1).atLeastProbability
    ).toBeCloseTo(0.25, 12);
    expect(bucket(result.byAttacker.attacker, 2).atLeastProbability).toBe(0);
  });

  test('weights each surviving composition before rolling its weapons', () => {
    const defender = new Fleet('defender', [new Ship(ShipType.Interceptor)]);
    const attacker = new Fleet('attacker', [
      new Ship(ShipType.Interceptor, { cannons: { ion: 1 } }),
      new Ship(ShipType.Interceptor, { cannons: { ion: 1 } }),
    ]);
    const outcomes: SurvivorOutcome[] = [
      {
        probability: 0.5,
        survivors: {
          defender: {},
          attacker: { [ShipType.Interceptor]: 1 },
        },
      },
      {
        probability: 0.5,
        survivors: {
          defender: {},
          attacker: { [ShipType.Interceptor]: 2 },
        },
      },
    ];

    const result = calculatePopulationBombardment(
      [defender, attacker],
      outcomes
    );

    expect(bucket(result.byAttacker.attacker, 0).exactProbability).toBeCloseTo(
      55 / 72,
      12
    );
    expect(bucket(result.byAttacker.attacker, 1).exactProbability).toBeCloseTo(
      16 / 72,
      12
    );
    expect(bucket(result.byAttacker.attacker, 2).exactProbability).toBeCloseTo(
      1 / 72,
      12
    );
    expect(
      bucket(result.byAttacker.attacker, 1).atLeastProbability
    ).toBeCloseTo(17 / 72, 12);
    expect(
      bucket(result.byAttacker.attacker, 2).atLeastProbability
    ).toBeCloseTo(1 / 72, 12);
  });

  test('uses the final winning attacker in an n-way battle', () => {
    const defender = new Fleet('defender', [
      new Ship(ShipType.Interceptor, {
        computers: 4,
        cannons: { antimatter: 3 },
      }),
    ]);
    const firstAttacker = new Fleet('first', [
      new Ship(ShipType.Interceptor, { cannons: { ion: 1 } }),
    ]);
    const secondAttacker = new Fleet('second', [
      new Ship(ShipType.Cruiser, {
        computers: 4,
        cannons: { plasma: 1 },
      }),
    ]);
    const outcomes: SurvivorOutcome[] = [
      {
        probability: 0.2,
        survivors: {
          defender: { [ShipType.Interceptor]: 1 },
          first: {},
          second: {},
        },
      },
      {
        probability: 0.4,
        survivors: {
          defender: {},
          first: { [ShipType.Interceptor]: 1 },
          second: {},
        },
      },
      {
        probability: 0.3,
        survivors: {
          defender: {},
          first: {},
          second: { [ShipType.Cruiser]: 1 },
        },
      },
      {
        probability: 0.1,
        survivors: { defender: {}, first: {}, second: {} },
      },
    ];

    const result = calculatePopulationBombardment(
      [defender, firstAttacker, secondAttacker],
      outcomes
    );

    // First hits for 1 on a natural 6; second hits for 2 on rolls 2..6 thanks
    // to its +4 Computer. Each row also includes the chance another fleet wins.
    expect(bucket(result.byAttacker.first, 1).atLeastProbability).toBeCloseTo(
      1 / 15,
      12
    );
    expect(bucket(result.byAttacker.first, 2).atLeastProbability).toBe(0);
    expect(bucket(result.byAttacker.second, 1).atLeastProbability).toBeCloseTo(
      1 / 4,
      12
    );
    expect(bucket(result.byAttacker.second, 2).atLeastProbability).toBeCloseTo(
      1 / 4,
      12
    );
  });

  test('uses sector standing instead of treating living retreaters as winners', () => {
    const defender = new Fleet('defender', [new Ship(ShipType.Interceptor)]);
    const attacker = new Fleet('attacker', [
      new Ship(ShipType.Cruiser, { cannons: { ion: 1 } }),
    ]);
    const outcomes: SurvivorOutcome[] = [
      {
        probability: 1,
        lastFleetStanding: 'defender',
        survivors: {
          defender: { [ShipType.Interceptor]: 1 },
          attacker: { [ShipType.Cruiser]: 1 },
        },
      },
    ];

    const result = calculatePopulationBombardment(
      [defender, attacker],
      outcomes
    );

    expect(bucket(result.byAttacker.attacker, 0).exactProbability).toBe(1);
    expect(bucket(result.byAttacker.attacker, 1).atLeastProbability).toBe(0);
  });

  test('accepts an omitted empty defender by stable fleet name', () => {
    const attacker = new Fleet('attacker', [
      new Ship(ShipType.Interceptor, { cannons: { ion: 1 } }),
    ]);
    const outcomes: SurvivorOutcome[] = [
      {
        probability: 1,
        survivors: { attacker: { [ShipType.Interceptor]: 1 } },
      },
    ];

    const result = calculatePopulationBombardment([attacker], outcomes, {
      defenderFleetName: 'empty-defender',
    });

    expect(bucket(result.byAttacker.attacker, 0).exactProbability).toBeCloseTo(
      5 / 6,
      12
    );
    expect(bucket(result.byAttacker.attacker, 1).exactProbability).toBeCloseTo(
      1 / 6,
      12
    );
    expect(
      bucket(result.byAttacker.attacker, 1).atLeastProbability
    ).toBeCloseTo(1 / 6, 12);
  });

  test('includes Rift Cannons as non-Missile population weapons', () => {
    const defender = new Fleet('defender', [new Ship(ShipType.Interceptor)]);
    const attacker = new Fleet('attacker', [
      new Ship(ShipType.Cruiser, { rift: 1 }),
    ]);
    const outcomes: SurvivorOutcome[] = [
      {
        probability: 1,
        survivors: {
          defender: {},
          attacker: { [ShipType.Cruiser]: 1 },
        },
      },
    ];

    const result = calculatePopulationBombardment(
      [defender, attacker],
      outcomes
    );

    expect(bucket(result.byAttacker.attacker, 0).exactProbability).toBeCloseTo(
      3 / 6,
      12
    );
    expect(bucket(result.byAttacker.attacker, 1).exactProbability).toBeCloseTo(
      1 / 6,
      12
    );
    expect(bucket(result.byAttacker.attacker, 2).exactProbability).toBeCloseTo(
      1 / 6,
      12
    );
    expect(bucket(result.byAttacker.attacker, 3).exactProbability).toBeCloseTo(
      1 / 6,
      12
    );
    expect(
      bucket(result.byAttacker.attacker, 1).atLeastProbability
    ).toBeCloseTo(3 / 6, 12);
  });

  test('caps the final bucket at six or more damage', () => {
    const defender = new Fleet('defender', [new Ship(ShipType.Interceptor)]);
    const attacker = new Fleet('attacker', [
      new Ship(ShipType.Dreadnought, {
        computers: 4,
        cannons: { antimatter: 2 },
      }),
    ]);
    const outcomes: SurvivorOutcome[] = [
      {
        probability: 1,
        survivors: {
          defender: {},
          attacker: { [ShipType.Dreadnought]: 1 },
        },
      },
    ];

    const result = calculatePopulationBombardment(
      [defender, attacker],
      outcomes
    );

    expect(bucket(result.byAttacker.attacker, 0).exactProbability).toBeCloseTo(
      1 / 36,
      12
    );
    expect(bucket(result.byAttacker.attacker, 4).exactProbability).toBeCloseTo(
      10 / 36,
      12
    );
    expect(bucket(result.byAttacker.attacker, 6).exactProbability).toBeCloseTo(
      25 / 36,
      12
    );
    expect(
      bucket(result.byAttacker.attacker, 5).atLeastProbability
    ).toBeCloseTo(25 / 36, 12);
    expect(
      bucket(result.byAttacker.attacker, 6).atLeastProbability
    ).toBeCloseTo(25 / 36, 12);
  });

  test('supports automatic wipes without faction or technology state', () => {
    const defender = new Fleet('defender', [new Ship(ShipType.Interceptor)]);
    const attacker = new Fleet('attacker', [new Ship(ShipType.Interceptor)]);
    const outcomes: SurvivorOutcome[] = [
      {
        probability: 0.4,
        survivors: {
          defender: { [ShipType.Interceptor]: 1 },
          attacker: {},
        },
      },
      {
        probability: 0.6,
        survivors: {
          defender: {},
          attacker: { [ShipType.Interceptor]: 1 },
        },
      },
    ];

    const result = calculatePopulationBombardment(
      [defender, attacker],
      outcomes,
      { automaticWipe: (winningFleetName) => winningFleetName === 'attacker' }
    );

    expect(bucket(result.byAttacker.attacker, 0).exactProbability).toBeCloseTo(
      0.4,
      12
    );
    expect(bucket(result.byAttacker.attacker, 6).exactProbability).toBeCloseTo(
      0.6,
      12
    );
    for (let damage = 1; damage <= 6; damage++) {
      expect(
        bucket(result.byAttacker.attacker, damage).atLeastProbability
      ).toBeCloseTo(0.6, 12);
    }
  });

  test('rejects ambiguous same-hull survivor configurations', () => {
    const defender = new Fleet('defender', [new Ship(ShipType.Interceptor)]);
    const attacker = new Fleet('attacker', [
      new Ship(ShipType.Interceptor, { cannons: { ion: 1 } }),
      new Ship(ShipType.Interceptor, { cannons: { plasma: 1 } }),
    ]);
    const outcomes: SurvivorOutcome[] = [
      {
        probability: 1,
        survivors: {
          defender: {},
          attacker: { [ShipType.Interceptor]: 1 },
        },
      },
    ];

    expect(() =>
      calculatePopulationBombardment([defender, attacker], outcomes)
    ).toThrow(
      'Cannot identify which attacker Interceptor configuration survived'
    );
  });
});
