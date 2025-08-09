import { describe, expect, test } from 'bun:test';
import { Battle, BattleOutcome } from './battle';
import { Fleet } from './fleet';
import { Ship, ShipType } from './ship';
import {
  DICE_VALUES,
  GUARANTEED_HIT,
  GUARANTEED_MISS,
  RIFT_SELF_DAMAGE,
} from 'src/constants';

describe('Battle', () => {
  describe('fight', () => {
    test('defender cannons fire first', () => {
      const attacker = new Ship(
        ShipType.Interceptor,
        {
          initiative: 3,
          cannons: { plasma: 1 },
        },
        GUARANTEED_HIT
      );

      const defender = new Ship(
        ShipType.Interceptor,
        {
          initiative: 3,
          cannons: { plasma: 1 },
        },
        GUARANTEED_HIT
      );

      const battle = new Battle(
        new Fleet('Attacker', [attacker]),
        new Fleet('Defender', [defender])
      );

      const result = battle.fight();
      expect(result.outcome).toBe(BattleOutcome.Defender);
      expect(result.victors).toEqual([defender]);
    });

    test('defender missiles fire first', () => {
      const attacker = new Ship(
        ShipType.Interceptor,
        {
          initiative: 3,
          missiles: { plasma: 1 },
        },
        GUARANTEED_HIT
      );

      const defender = new Ship(
        ShipType.Interceptor,
        {
          initiative: 3,
          missiles: { plasma: 1 },
        },
        GUARANTEED_HIT
      );

      const battle = new Battle(
        new Fleet('Attacker', [attacker]),
        new Fleet('Defender', [defender])
      );

      const result = battle.fight();
      expect(result.outcome).toBe(BattleOutcome.Defender);
      expect(result.victors).toEqual([defender]);
    });

    test('missles fire before cannons', () => {
      const attacker = new Ship(
        ShipType.Interceptor,
        {
          initiative: 3,
          missiles: { ion: 2 },
        },
        GUARANTEED_HIT
      );

      const defender = new Ship(
        ShipType.Interceptor,
        {
          initiative: 3,
          cannons: { antimatter: 4 },
        },
        GUARANTEED_HIT
      );

      const battle = new Battle(
        new Fleet('Attacker', [attacker]),
        new Fleet('Defender', [defender])
      );

      const result = battle.fight();
      expect(result.outcome).toBe(BattleOutcome.Attacker);
      expect(result.victors).toEqual([attacker]);
    });

    test('higher initiative first first', () => {
      const attacker = new Ship(
        ShipType.Interceptor,
        {
          initiative: 2,
          hull: 1,
          cannons: { plasma: 1 },
        },
        GUARANTEED_HIT
      );

      const defender = new Ship(
        ShipType.Interceptor,
        {
          initiative: 3,
          cannons: { plasma: 1 },
        },
        GUARANTEED_HIT
      );

      const battle = new Battle(
        new Fleet('Attacker', [attacker]),
        new Fleet('Defender', [defender])
      );

      const result = battle.fight();
      expect(result.outcome).toBe(BattleOutcome.Defender);
      expect(result.victors).toEqual([defender]);
    });

    test('rift cannon can cause self-destruction', () => {
      const attacker = new Ship(
        ShipType.Cruiser,
        {
          hull: 1,
          rift: 1,
        },
        // self damage only
        RIFT_SELF_DAMAGE
      );

      const defender = new Ship(ShipType.Interceptor, {}, GUARANTEED_MISS);

      const battle = new Battle(
        new Fleet('Attacker', [attacker]),
        new Fleet('Defender', [defender])
      );

      const result = battle.fight();
      expect(result.outcome).toBe(BattleOutcome.Defender);
      expect(result.victors).toEqual([defender]);
    });

    test('rift cannon can cause draws', () => {
      let rollCount = 0;
      // cannon hit, cannon hit, self damage only
      const rolls = [
        DICE_VALUES.HIT,
        DICE_VALUES.HIT,
        DICE_VALUES.RIFT_SELF_DAMAGE,
      ];

      const attacker = new Ship(
        ShipType.Cruiser,
        {
          cannons: { plasma: 2 },
          rift: 1,
        },
        () => rolls[rollCount++]
      );
      const defender = new Ship(
        ShipType.Interceptor,
        {
          hull: 3,
        },
        GUARANTEED_MISS
      );

      const battle = new Battle(
        new Fleet('Attacker', [attacker]),
        new Fleet('Defender', [defender])
      );

      const result = battle.fight();
      expect(result.outcome).toBe(BattleOutcome.Draw);
      expect(result.victors).toEqual([]);
    });

    test('rift cannons destroy the biggest rift ship', () => {
      const riftInt = new Ship(
        ShipType.Interceptor,
        {
          rift: 1,
          initiative: 3,
        },
        RIFT_SELF_DAMAGE
      );
      const riftCruiser = new Ship(
        ShipType.Cruiser,
        {
          rift: 1,
          hull: 1,
          initiative: 3,
        },
        RIFT_SELF_DAMAGE
      );
      const nonRiftDread = new Ship(
        ShipType.Cruiser,
        {
          cannons: { ion: 1 },
          initiative: 3,
        },
        GUARANTEED_HIT
      );
      const defender = new Ship(ShipType.Interceptor, {}, GUARANTEED_MISS);

      const battle = new Battle(
        new Fleet('Attacker', [riftInt, riftCruiser, nonRiftDread]),
        new Fleet('Defender', [defender])
      );

      const result = battle.fight();
      expect(result.outcome).toBe(BattleOutcome.Attacker);
      expect(riftInt.isAlive()).toEqual(true);
      expect(riftCruiser.isAlive()).toEqual(false);
      expect(nonRiftDread.isAlive()).toEqual(true);
    });

    test('antimatter splitter works', () => {
      const attacker = new Ship(
        ShipType.Cruiser,
        {
          cannons: { antimatter: 1 },
          initiative: 6,
        },
        GUARANTEED_HIT
      );
      const defender1 = new Ship(
        ShipType.Interceptor,
        {
          cannons: { ion: 1 },
        },
        GUARANTEED_HIT
      );
      const defender2 = new Ship(
        ShipType.Interceptor,
        {
          cannons: { ion: 1 },
        },
        GUARANTEED_HIT
      );

      const battle = new Battle(
        new Fleet('Attacker', [attacker], true),
        new Fleet('Defender', [defender1, defender2])
      );

      const result = battle.fight();
      expect(result.outcome).toBe(BattleOutcome.Attacker);
      expect(result.victors).toEqual([attacker]);
    });

    test('stalemate when no damage can be dealt', () => {
      const attacker = new Ship(ShipType.Interceptor, {}, GUARANTEED_HIT);

      const defender = new Ship(ShipType.Interceptor, {}, GUARANTEED_HIT);

      const battle = new Battle(
        new Fleet('Attacker', [attacker]),
        new Fleet('Defender', [defender])
      );

      const result = battle.fight();
      expect(result.outcome).toBe(BattleOutcome.Defender);
      expect(result.victors).toEqual([defender]);
    });

    test('victors are living ships from winning fleet', () => {
      const attackers = [
        new Ship(
          ShipType.Interceptor,
          { hull: 1, cannons: { plasma: 1 }, initiative: 1 },
          GUARANTEED_HIT
        ),
        new Ship(
          ShipType.Interceptor,
          { hull: 1, cannons: { plasma: 1 }, initiative: 1 },
          GUARANTEED_HIT
        ),
      ];

      const defender = new Ship(
        ShipType.Interceptor,
        { cannons: { antimatter: 1 }, initiative: 2 },
        GUARANTEED_HIT
      );

      const battle = new Battle(
        new Fleet('Attacker', attackers),
        new Fleet('Defender', [defender])
      );

      const result = battle.fight();
      expect(result.outcome).toBe(BattleOutcome.Attacker);
      expect(result.victors.length).toEqual(1);
    });

    test('battle continues for many rounds', () => {
      let hitRoll = 0;
      const attacker = new Ship(
        ShipType.Interceptor,
        {
          hull: 5,
          cannons: { ion: 1 },
        },
        () => (hitRoll++ % 2 === 0 ? DICE_VALUES.HIT : DICE_VALUES.MISS)
      );

      const defender = new Ship(
        ShipType.Interceptor,
        {
          hull: 4,
          cannons: { ion: 1 },
        },
        GUARANTEED_MISS
      );

      const battle = new Battle(
        new Fleet('Attacker', [attacker]),
        new Fleet('Defender', [defender])
      );

      const result = battle.fight();
      expect(result.outcome).toBe(BattleOutcome.Attacker);
      expect(result.victors).toEqual([attacker]);
    });
  });
});
