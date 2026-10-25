import { describe, expect, test } from 'bun:test';
import { MultiBattle } from './multi-battle';
import { BattleOutcome } from './battle';
import { Fleet } from './fleet';
import { Ship, ShipType } from './ship';
import {
  GUARANTEED_HIT,
  GUARANTEED_MISS,
  RIFT_SELF_DAMAGE,
} from 'src/constants';

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
      const defender = new Fleet('defender', [
        new Ship(ShipType.Interceptor, { hull: 1 }, GUARANTEED_MISS),
      ]);
      const attacker = new Fleet('attacker', [
        new Ship(ShipType.Interceptor, { cannons: { ion: 2 } }, GUARANTEED_HIT),
      ]);

      const multiBattle = new MultiBattle([defender, attacker]);
      const results = multiBattle.run();

      expect(results).toHaveLength(1);
      expect(results[0].outcome).toBe(BattleOutcome.Attacker);
      expect(results[0].victors).toHaveLength(1);
    });

    test('three fleets - winner faces next challenger', () => {
      const defender = new Fleet('defender', [
        new Ship(
          ShipType.Interceptor,
          { cannons: { ion: 1 } },
          GUARANTEED_MISS
        ),
      ]);
      const attacker1 = new Fleet('attacker1', [
        new Ship(ShipType.Interceptor, { cannons: { ion: 2 } }, GUARANTEED_HIT),
      ]);
      const attacker2 = new Fleet('attacker2', [
        new Ship(ShipType.Interceptor, { hull: 1 }, GUARANTEED_MISS),
      ]);

      const multiBattle = new MultiBattle([defender, attacker1, attacker2]);
      const results = multiBattle.run();

      expect(results).toHaveLength(2);
      expect(results[0].outcome).toBe(BattleOutcome.Defender);
      expect(results[1].outcome).toBe(BattleOutcome.Attacker);
    });

    test('credits destroyed hulls only to fleets in each engagement', () => {
      const defender = new Fleet('defender', [
        new Ship(ShipType.Interceptor, {}, GUARANTEED_MISS),
      ]);
      const attacker1 = new Fleet('attacker1', [
        new Ship(
          ShipType.Interceptor,
          { initiative: 2, cannons: { ion: 1 } },
          GUARANTEED_HIT
        ),
      ]);
      const attacker2 = new Fleet('attacker2', [
        new Ship(ShipType.Interceptor, {}, GUARANTEED_MISS),
      ]);

      const multiBattle = new MultiBattle([defender, attacker1, attacker2]);
      multiBattle.run();

      expect(multiBattle.getDestroyedShipsCreditedToFleet()).toEqual({
        defender: {},
        attacker1: { [ShipType.Interceptor]: 2 },
        attacker2: {},
      });
    });

    test('stalemate is victory for defender', () => {
      const defender = new Fleet('defender', [
        new Ship(ShipType.Interceptor, {}, GUARANTEED_MISS),
      ]);
      const attacker = new Fleet('attacker', [
        new Ship(ShipType.Interceptor, {}, GUARANTEED_MISS),
      ]);

      const multiBattle = new MultiBattle([defender, attacker]);
      const results = multiBattle.run();

      expect(results).toHaveLength(1);
      expect(results[0].outcome).toBe(BattleOutcome.Defender);
    });

    test('draw removes both fleets', () => {
      const defender = new Fleet('defender', [new Ship(ShipType.Interceptor)]);
      const attacker1 = new Fleet('attacker1', [
        new Ship(ShipType.Interceptor, { hull: 2 }, GUARANTEED_MISS),
      ]);
      const attacker2 = new Fleet('attacker2', [
        new Ship(
          ShipType.Cruiser,
          { hull: 0, rift: 1 },
          // Rift roll 1 self damage, 3 target damage
          GUARANTEED_HIT
        ),
      ]);

      const multiBattle = new MultiBattle([defender, attacker1, attacker2]);
      const results = multiBattle.run();

      expect(results).toHaveLength(1);
      expect(results[0].outcome).toBe(BattleOutcome.Draw);

      const remaining = multiBattle.getRemainingFleets();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]).toBe(defender);
      expect(multiBattle.getDestroyedShipsCreditedToFleet()).toEqual({
        attacker1: { [ShipType.Cruiser]: 1 },
        attacker2: { [ShipType.Interceptor]: 1 },
      });
    });

    test('records a fleet that retreats from its only battle, including after a draw', () => {
      // attacker3's rift die destroys attacker2 and itself; attacker1 then
      // attacks the defender without having fought, and neither side is armed.
      const unarmed = (name: string, type: ShipType) =>
        new Fleet(name, [new Ship(type, {}, GUARANTEED_MISS)]);
      const multiBattle = new MultiBattle([
        unarmed('defender', ShipType.Starbase),
        unarmed('attacker1', ShipType.Interceptor),
        unarmed('attacker2', ShipType.Interceptor),
        new Fleet('attacker3', [
          new Ship(ShipType.Cruiser, { hull: 0, rift: 1 }, GUARANTEED_HIT),
        ]),
      ]);
      const results = multiBattle.run();

      expect(results.map((result) => result.outcome)).toEqual([
        BattleOutcome.Draw,
        BattleOutcome.Defender,
      ]);
      expect(multiBattle.getRetreatedFromOnlyBattle()).toEqual(['attacker1']);
    });

    test('does not record a retreat after an earlier engagement', () => {
      // attacker2's missile destroys attacker1, then (firing again in the next
      // engagement) only dents the unarmed Starbase, and the two stalemate: it
      // retreats, but it fought attacker1 first.
      const multiBattle = new MultiBattle([
        new Fleet('defender', [
          new Ship(ShipType.Starbase, { hull: 2 }, GUARANTEED_MISS),
        ]),
        new Fleet('attacker1', [
          new Ship(ShipType.Interceptor, {}, GUARANTEED_MISS),
        ]),
        new Fleet('attacker2', [
          new Ship(ShipType.Cruiser, { missiles: { ion: 1 } }, GUARANTEED_HIT),
        ]),
      ]);
      const results = multiBattle.run();

      expect(results.map((result) => result.outcome)).toEqual([
        BattleOutcome.Attacker,
        BattleOutcome.Defender,
      ]);
      expect(multiBattle.getRetreatedFromOnlyBattle()).toEqual([]);
    });

    test('winning fleet carries damage between battles', () => {
      const defender = new Fleet('defender', [
        new Ship(
          ShipType.Interceptor,
          {
            hull: 3,
            cannons: { ion: 2 },
          },
          GUARANTEED_HIT
        ),
      ]);

      const attacker1 = new Fleet('attacker1', [
        new Ship(
          ShipType.Interceptor,
          {
            hull: 1,
            cannons: { ion: 1 },
          },
          GUARANTEED_HIT
        ),
      ]);

      const attacker2 = new Fleet('attacker2', [
        new Ship(
          ShipType.Interceptor,
          {
            hull: 2,
            cannons: { ion: 2 },
          },
          GUARANTEED_HIT
        ),
      ]);

      const multiBattle = new MultiBattle([defender, attacker1, attacker2]);
      const results = multiBattle.run();

      expect(results).toHaveLength(2);
      expect(results[0].outcome).toBe(BattleOutcome.Attacker);
      expect(results[1].outcome).toBe(BattleOutcome.Defender);
    });

    test('empty result when all fleets eliminated', () => {
      const defender = new Fleet('defender', [
        new Ship(ShipType.Interceptor, { hull: 1 }, GUARANTEED_MISS),
      ]);
      const attacker = new Fleet('attacker', [
        new Ship(ShipType.Interceptor, { hull: 1, rift: 1 }, RIFT_SELF_DAMAGE), // Self-destructs
      ]);

      const multiBattle = new MultiBattle([defender, attacker]);
      const results = multiBattle.run();

      expect(results).toHaveLength(1);
      expect(results[0].outcome).toBe(BattleOutcome.Defender);

      const remaining = multiBattle.getRemainingFleets();
      expect(remaining).toHaveLength(1);
    });

    test('battles all fleets', () => {
      const fleets = [
        new Fleet('Defender', [
          new Ship(
            ShipType.Interceptor,
            { initiative: 3, cannons: { ion: 1 } },
            GUARANTEED_HIT
          ),
          new Ship(
            ShipType.Interceptor,
            { initiative: 3, cannons: { ion: 1 } },
            GUARANTEED_HIT
          ),
        ]),
        new Fleet('Attacker1', [
          new Ship(
            ShipType.Interceptor,
            { initiative: 2, cannons: { ion: 1 } },
            GUARANTEED_HIT
          ),
        ]),
        new Fleet('Attacker2', [
          new Ship(
            ShipType.Cruiser,
            { initiative: 1, hull: 2, missiles: { plasma: 2 } },
            GUARANTEED_HIT
          ),
        ]),
        new Fleet('Attacker3', [
          new Ship(
            ShipType.Dreadnought,
            { initiative: 1, hull: 3, cannons: { antimatter: 2 } },
            GUARANTEED_HIT
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
      const defender = new Fleet('defender', [new Ship(ShipType.Interceptor)]);
      const attacker = new Fleet('attacker', [new Ship(ShipType.Interceptor)]);

      const multiBattle = new MultiBattle([defender, attacker]);

      const remaining1 = multiBattle.getRemainingFleets();
      expect(remaining1).toHaveLength(2);

      remaining1.pop();

      const remaining2 = multiBattle.getRemainingFleets();
      expect(remaining2).toHaveLength(2);
    });
  });
});
