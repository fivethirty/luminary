import { describe, expect, test } from 'bun:test';
import { Battle, BattleOutcome } from './battle';
import { Fleet } from './fleet';
import { Ship, ShipType } from './ship';

describe('Battle', () => {
  describe('fight', () => {
    test('defender cannons fire first', () => {
      const attacker = new Ship(
        ShipType.Interceptor,
        {
          initiative: 3,
          cannons: { plasma: 1 },
        },
        () => 6
      );

      const defender = new Ship(
        ShipType.Interceptor,
        {
          initiative: 3,
          cannons: { plasma: 1 },
        },
        () => 6
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
        () => 6
      );

      const defender = new Ship(
        ShipType.Interceptor,
        {
          initiative: 3,
          missiles: { plasma: 1 },
        },
        () => 6
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
        () => 6
      );

      const defender = new Ship(
        ShipType.Interceptor,
        {
          initiative: 3,
          cannons: { antimatter: 4 },
        },
        () => 6
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
        () => 6
      );

      const defender = new Ship(
        ShipType.Interceptor,
        {
          initiative: 3,
          cannons: { plasma: 1 },
        },
        () => 6
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
        ShipType.Carrier,
        {
          hull: 1,
          rift: 1,
        },
        () => 5
      ); // Roll 5 = self damage only

      const defender = new Ship(ShipType.Interceptor, {}, () => 1);

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
      // cannon hit, cannon hit, rift roll = 5, self damage only
      const rolls = [6, 6, 5];

      const attacker = new Ship(
        ShipType.Carrier,
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
        () => 1
      );

      const battle = new Battle(
        new Fleet('Attacker', [attacker]),
        new Fleet('Defender', [defender])
      );

      const result = battle.fight();
      expect(result.outcome).toBe(BattleOutcome.Draw);
      expect(result.victors).toEqual([]);
    });

    test('stalemate when no damage can be dealt', () => {
      const attacker = new Ship(ShipType.Interceptor, {}, () => 6);

      const defender = new Ship(ShipType.Interceptor, {}, () => 6);

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
          () => 6
        ),
        new Ship(
          ShipType.Interceptor,
          { hull: 1, cannons: { plasma: 1 }, initiative: 2 },
          () => 6
        ),
      ];

      const defender = new Ship(
        ShipType.Interceptor,
        { cannons: { antimatter: 1 }, initiative: 2 },
        () => 6
      );

      const battle = new Battle(
        new Fleet('Attacker', attackers),
        new Fleet('Defender', [defender])
      );

      const result = battle.fight();
      expect(result.outcome).toBe(BattleOutcome.Attacker);
      expect(result.victors).toEqual([attackers[1]]);
    });

    test('battle continues for many rounds', () => {
      let hitRoll = 0;
      const attacker = new Ship(
        ShipType.Interceptor,
        {
          hull: 5,
          cannons: { ion: 1 },
        },
        () => (hitRoll++ % 2 === 0 ? 6 : 1)
      );

      const defender = new Ship(
        ShipType.Interceptor,
        {
          hull: 4,
          cannons: { ion: 1 },
        },
        () => 1
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
