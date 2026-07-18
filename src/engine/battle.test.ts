import { describe, expect, test } from 'bun:test';
import { Battle, BattleOutcome, Phase } from './battle';
import { Fleet } from './fleet';
import { ShipType } from './ship';
import { ship } from './test-helpers';
import {
  DICE_VALUES,
  GUARANTEED_HIT,
  GUARANTEED_MISS,
  RIFT_SELF_DAMAGE,
} from 'src/constants';

describe('Battle', () => {
  describe('fight', () => {
    test('defender cannons fire first', () => {
      const attacker = ship(
        {
          initiative: 3,
          cannons: { plasma: 1 },
        },
        ShipType.Interceptor,
        GUARANTEED_HIT
      );

      const defender = ship(
        {
          initiative: 3,
          cannons: { plasma: 1 },
        },
        ShipType.Interceptor,
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
      const attacker = ship(
        {
          initiative: 3,
          missiles: { plasma: 1 },
        },
        ShipType.Interceptor,
        GUARANTEED_HIT
      );

      const defender = ship(
        {
          initiative: 3,
          missiles: { plasma: 1 },
        },
        ShipType.Interceptor,
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
      const attacker = ship(
        {
          initiative: 3,
          missiles: { ion: 2 },
        },
        ShipType.Interceptor,
        GUARANTEED_HIT
      );

      const defender = ship(
        {
          initiative: 3,
          cannons: { antimatter: 4 },
        },
        ShipType.Interceptor,
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
      const attacker = ship(
        {
          initiative: 2,
          hull: 1,
          cannons: { plasma: 1 },
        },
        ShipType.Interceptor,
        GUARANTEED_HIT
      );

      const defender = ship(
        {
          initiative: 3,
          cannons: { plasma: 1 },
        },
        ShipType.Interceptor,
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
      const attacker = ship(
        {
          hull: 1,
          rift: 1,
        },
        ShipType.Cruiser,
        // self damage only
        RIFT_SELF_DAMAGE
      );

      const defender = ship({}, ShipType.Interceptor, GUARANTEED_MISS);

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

      const attacker = ship(
        {
          cannons: { plasma: 2 },
          rift: 1,
        },
        ShipType.Cruiser,
        () => rolls[rollCount++]
      );
      const defender = ship(
        {
          hull: 3,
        },
        ShipType.Interceptor,
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
      const riftInt = ship(
        {
          rift: 1,
          initiative: 3,
        },
        ShipType.Interceptor,
        RIFT_SELF_DAMAGE
      );
      const riftCruiser = ship(
        {
          rift: 1,
          hull: 1,
          initiative: 3,
        },
        ShipType.Cruiser,
        RIFT_SELF_DAMAGE
      );
      const nonRiftDread = ship(
        {
          cannons: { ion: 1 },
          initiative: 3,
        },
        ShipType.Cruiser,
        GUARANTEED_HIT
      );
      const defender = ship({}, ShipType.Interceptor, GUARANTEED_MISS);

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
      const attacker = ship(
        {
          cannons: { antimatter: 1 },
          initiative: 6,
        },
        ShipType.Cruiser,
        GUARANTEED_HIT
      );
      const defender1 = ship(
        {
          cannons: { ion: 1 },
        },
        ShipType.Interceptor,
        GUARANTEED_HIT
      );
      const defender2 = ship(
        {
          cannons: { ion: 1 },
        },
        ShipType.Interceptor,
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
      const attacker = ship({}, ShipType.Interceptor, GUARANTEED_HIT);

      const defender = ship({}, ShipType.Interceptor, GUARANTEED_HIT);

      const battle = new Battle(
        new Fleet('Attacker', [attacker]),
        new Fleet('Defender', [defender])
      );

      const result = battle.fight();
      expect(result.outcome).toBe(BattleOutcome.Defender);
      expect(result.victors).toEqual([defender]);
    });

    test('defender wins stalemate after missiles', () => {
      const attackers = [
        ship(
          { hull: 1, missiles: { plasma: 1 }, initiative: 1 },
          ShipType.Interceptor,
          GUARANTEED_MISS
        ),
        ship(
          { hull: 1, cannons: { plasma: 1 }, initiative: 1 },
          ShipType.Cruiser,
          GUARANTEED_HIT
        ),
      ];

      const defender = ship(
        {
          missiles: { plasma: 1 },
          initiative: 2,
        },
        ShipType.Interceptor,
        GUARANTEED_HIT
      );

      const battle = new Battle(
        new Fleet('Attacker', attackers),
        new Fleet('Defender', [defender])
      );

      const result = battle.fight();
      expect(result.outcome).toBe(BattleOutcome.Defender);
      expect(result.victors).toEqual([defender]);
    });

    test('victors are living ships from winning fleet', () => {
      const attackers = [
        ship(
          { hull: 1, cannons: { plasma: 1 }, initiative: 1 },
          ShipType.Interceptor,
          GUARANTEED_HIT
        ),
        ship(
          { hull: 1, cannons: { plasma: 1 }, initiative: 1 },
          ShipType.Interceptor,
          GUARANTEED_HIT
        ),
      ];

      const defender = ship(
        { cannons: { antimatter: 1 }, initiative: 2 },
        ShipType.Interceptor,
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
      const attacker = ship(
        {
          hull: 5,
          cannons: { ion: 1 },
        },
        ShipType.Interceptor,
        () => (hitRoll++ % 2 === 0 ? DICE_VALUES.HIT : DICE_VALUES.MISS)
      );

      const defender = ship(
        {
          hull: 4,
          cannons: { ion: 1 },
        },
        ShipType.Interceptor,
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

  describe('resumeFight', () => {
    test('resumes from a hand-built queue and fires only queued phases', () => {
      const attacker = ship(
        { initiative: 3, cannons: { plasma: 1 } },
        ShipType.Interceptor,
        GUARANTEED_HIT
      );
      const defender = ship({ initiative: 2 });
      const attackerFleet = new Fleet('Attacker', [attacker]);
      const defenderFleet = new Fleet('Defender', [defender]);
      const battle = new Battle(attackerFleet, defenderFleet);

      // Only the attacker's cannon phase remains; the defender never gets to act.
      const phase: Phase = {
        ships: [attacker],
        initiative: 3,
        shootingFleet: attackerFleet,
        targetFleet: defenderFleet,
        missilePhase: false,
      };

      const result = battle.resumeFight([phase]);
      expect(result.outcome).toBe(BattleOutcome.Attacker);
      expect(defender.isAlive()).toBe(false);
    });

    // Missiles fire exactly once because they live only in the phase queue; a
    // resumed queue that omits them must not re-fire them.
    describe('missiles do not re-fire on resume', () => {
      const buildFleets = () => {
        const attacker = ship(
          {
            initiative: 5,
            missiles: { antimatter: 2 },
            cannons: { ion: 1 },
          },
          ShipType.Interceptor,
          GUARANTEED_HIT
        );
        const defender = ship(
          { initiative: 1, hull: 4, cannons: { antimatter: 1 } },
          ShipType.Interceptor,
          GUARANTEED_HIT
        );
        const attackerFleet = new Fleet('Attacker', [attacker]);
        const defenderFleet = new Fleet('Defender', [defender]);
        const cannonPhases: Phase[] = [
          {
            ships: [attacker],
            initiative: 5,
            shootingFleet: attackerFleet,
            targetFleet: defenderFleet,
            missilePhase: false,
          },
          {
            ships: [defender],
            initiative: 1,
            shootingFleet: defenderFleet,
            targetFleet: attackerFleet,
            missilePhase: false,
          },
        ];
        const missilePhase: Phase = {
          ships: [attacker],
          initiative: 5,
          shootingFleet: attackerFleet,
          targetFleet: defenderFleet,
          missilePhase: true,
        };
        return { attackerFleet, defenderFleet, cannonPhases, missilePhase };
      };

      test('cannon-only queue: missiles stay silent, defender survives to win', () => {
        const { attackerFleet, defenderFleet, cannonPhases } = buildFleets();
        const battle = new Battle(attackerFleet, defenderFleet);
        // Without the 8-damage missile salvo the attacker only chips 1 HP, then
        // the defender's antimatter kills it.
        const result = battle.resumeFight(cannonPhases);
        expect(result.outcome).toBe(BattleOutcome.Defender);
      });

      test('queue including the missile phase: missiles fire and win', () => {
        const { attackerFleet, defenderFleet, cannonPhases, missilePhase } =
          buildFleets();
        const battle = new Battle(attackerFleet, defenderFleet);
        const result = battle.resumeFight([missilePhase, ...cannonPhases]);
        expect(result.outcome).toBe(BattleOutcome.Attacker);
      });
    });
  });
});
