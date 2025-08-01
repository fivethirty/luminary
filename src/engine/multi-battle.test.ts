import { describe, expect, test } from 'bun:test';
import { MultiBattle } from './multi-battle';
import { BattleOutcome } from './battle';
import { Fleet } from './fleet';
import { Ship, ShipType } from './ship';

describe('MultiBattle', () => {
  describe('constructor', () => {
    test('requires at least 2 fleets', () => {
      expect(() => new MultiBattle([])).toThrow(
        'MultiBattle requires at least 2 fleets'
      );
      expect(() => new MultiBattle([new Fleet('A', [])])).toThrow(
        'MultiBattle requires at least 2 fleets'
      );
    });

    test('accepts 2 or more fleets', () => {
      const fleets = [
        new Fleet('A', [new Ship(ShipType.Interceptor)]),
        new Fleet('B', [new Ship(ShipType.Interceptor)]),
      ];
      expect(() => new MultiBattle(fleets)).not.toThrow();
    });
  });

  describe('run', () => {
    test('single battle between two fleets', () => {
      const fleetA = new Fleet('A', [
        new Ship(ShipType.Interceptor, { cannons: { ion: 2 } }, () => 6),
      ]);
      const fleetB = new Fleet('B', [
        new Ship(ShipType.Interceptor, { hull: 1 }, () => 1),
      ]);

      const multiBattle = new MultiBattle([fleetA, fleetB]);
      const results = multiBattle.run();

      expect(results).toHaveLength(1);
      expect(results[0].outcome).toBe(BattleOutcome.Attacker);
      expect(results[0].victors).toHaveLength(1);
    });

    test('three fleets - winner faces next challenger', () => {
      const fleetA = new Fleet('A', [
        new Ship(ShipType.Interceptor, { cannons: { ion: 1 } }, () => 1), // Weak
      ]);
      const fleetB = new Fleet('B', [
        new Ship(ShipType.Interceptor, { cannons: { ion: 2 } }, () => 6), // Strong
      ]);
      const fleetC = new Fleet('C', [
        new Ship(ShipType.Interceptor, { hull: 1 }, () => 1), // Weak
      ]);

      const multiBattle = new MultiBattle([fleetA, fleetB, fleetC]);
      const results = multiBattle.run();

      expect(results).toHaveLength(2);
      expect(results[0].outcome).toBe(BattleOutcome.Defender);
      expect(results[1].outcome).toBe(BattleOutcome.Attacker);
    });

    test('stalemate is victory for defender', () => {
      const fleetA = new Fleet('A', [
        new Ship(ShipType.Interceptor, {}, () => 1), // No weapons
      ]);
      const fleetB = new Fleet('B', [
        new Ship(ShipType.Interceptor, {}, () => 1), // No weapons
      ]);
      const fleetC = new Fleet('C', [
        new Ship(ShipType.Interceptor, { cannons: { ion: 1 } }, () => 6),
      ]);

      const multiBattle = new MultiBattle([fleetA, fleetB, fleetC]);
      const results = multiBattle.run();

      expect(results).toHaveLength(2);
      expect(results[0].outcome).toBe(BattleOutcome.Defender);
      expect(results[1].outcome).toBe(BattleOutcome.Defender);
    });

    test('draw removes both fleets', () => {
      const fleetA = new Fleet('A', [
        new Ship(
          ShipType.Carrier,
          { hull: 0, rift: 1 },
          () => 6 // Rift roll 6 = 1 self damage, 3 target damage
        ),
      ]);
      const fleetB = new Fleet('B', [
        new Ship(ShipType.Interceptor, { hull: 2 }, () => 1),
      ]);
      const fleetC = new Fleet('C', [new Ship(ShipType.Interceptor)]);

      const multiBattle = new MultiBattle([fleetA, fleetB, fleetC]);
      const results = multiBattle.run();

      expect(results).toHaveLength(1);
      expect(results[0].outcome).toBe(BattleOutcome.Draw);

      const remaining = multiBattle.getRemainingFleets();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]).toBe(fleetC);
    });

    test('winning fleet carries damage between battles', () => {
      const shipA = new Ship(
        ShipType.Interceptor,
        {
          hull: 3,
          cannons: { ion: 2 },
        },
        () => 6
      );
      const fleetA = new Fleet('A', [shipA]);

      const fleetB = new Fleet('B', [
        new Ship(
          ShipType.Interceptor,
          {
            hull: 1,
            cannons: { ion: 1 },
          },
          () => 6
        ),
      ]);

      const fleetC = new Fleet('C', [
        new Ship(
          ShipType.Interceptor,
          {
            hull: 2,
            cannons: { ion: 2 },
          },
          () => 6
        ),
      ]);

      const multiBattle = new MultiBattle([fleetA, fleetB, fleetC]);
      const results = multiBattle.run();

      expect(results).toHaveLength(2);
      expect(results[0].outcome).toBe(BattleOutcome.Attacker);
      expect(results[1].outcome).toBe(BattleOutcome.Defender);
    });

    test('empty result when all fleets eliminated', () => {
      const fleetA = new Fleet('A', [
        new Ship(ShipType.Interceptor, { hull: 1, rift: 1 }, () => 5), // Self-destructs
      ]);
      const fleetB = new Fleet('B', [
        new Ship(ShipType.Interceptor, { hull: 1 }, () => 1),
      ]);

      const multiBattle = new MultiBattle([fleetA, fleetB]);
      const results = multiBattle.run();

      expect(results).toHaveLength(1);
      expect(results[0].outcome).toBe(BattleOutcome.Defender);

      const remaining = multiBattle.getRemainingFleets();
      expect(remaining).toHaveLength(1);
    });

    test('complex multi-fleet scenario', () => {
      const fleets = [
        new Fleet('Attacker1', [
          new Ship(
            ShipType.Interceptor,
            { initiative: 2, cannons: { ion: 1 } },
            () => 6
          ),
        ]),
        new Fleet('Attacker2', [
          new Ship(
            ShipType.Carrier,
            { initiative: 1, hull: 2, missiles: { plasma: 2 } },
            () => 6
          ),
        ]),
        new Fleet('Attacker3', [
          new Ship(
            ShipType.Dreadnaught,
            { initiative: 1, hull: 3, cannons: { antimatter: 2 } },
            () => 6
          ),
        ]),
        new Fleet('Defender', [
          new Ship(
            ShipType.Interceptor,
            { initiative: 3, cannons: { ion: 1 } },
            () => 6
          ),
          new Ship(
            ShipType.Interceptor,
            { initiative: 3, cannons: { ion: 1 } },
            () => 6
          ),
        ]),
      ];

      const multiBattle = new MultiBattle(fleets);
      const results = multiBattle.run();

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.length).toBeLessThanOrEqual(3);

      const remaining = multiBattle.getRemainingFleets();
      expect(remaining.length).toBeLessThanOrEqual(1);
    });
  });

  describe('getRemainingFleets', () => {
    test('returns copy of remaining fleets', () => {
      const fleetA = new Fleet('A', [new Ship(ShipType.Interceptor)]);
      const fleetB = new Fleet('B', [new Ship(ShipType.Interceptor)]);

      const multiBattle = new MultiBattle([fleetA, fleetB]);

      const remaining1 = multiBattle.getRemainingFleets();
      expect(remaining1).toHaveLength(2);

      remaining1.pop();

      const remaining2 = multiBattle.getRemainingFleets();
      expect(remaining2).toHaveLength(2);
    });
  });
});
