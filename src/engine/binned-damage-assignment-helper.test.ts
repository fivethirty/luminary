import { describe, expect, test } from 'bun:test';
import { Ship, ShipType, Shot } from './ship';
import { DamageType, DICE_VALUES } from 'src/constants';
import { BinnedDamageAssignmentHelper } from './binned-damage-assignment-helper';
import { AbstractDamagePlanner, Plan } from './abstract-damage-planner';

class CountingDamagePlanner extends AbstractDamagePlanner {
  evaluations = 0;

  evaluate(
    _ships: Ship[],
    remainingHp: number[],
    damageAssignments: number[]
  ): Plan {
    this.evaluations++;
    const score = damageAssignments.reduce(
      (total, damage, index) => total + Math.min(damage, remainingHp[index]),
      0
    );
    return {
      score,
      allDestroyed: false,
      damageAssignments,
    };
  }

  optimallySortShips(ships: Ship[]): Ship[] {
    return ships.slice();
  }

  calculateMaxScore(): number {
    return Number.POSITIVE_INFINITY;
  }
}

describe('BinnedDamageAssignment', () => {
  describe('assignDamage', () => {
    test('destroys highest priority ship it can', () => {
      const dread = new Ship(ShipType.Dreadnought, { hull: 3 });
      const cruiser = new Ship(ShipType.Cruiser, { hull: 2 });
      const interceptor = new Ship(ShipType.Interceptor, { hull: 1 });
      const ships = [dread, cruiser, interceptor];

      const shots: Shot[] = [
        {
          roll: DICE_VALUES.HIT,
          computers: 0,
          damage: 3,
        },
      ];

      new BinnedDamageAssignmentHelper().assignDamage(
        shots,
        ships,
        DamageType.NPC
      );

      expect(interceptor.remainingHP()).toBe(2);
      expect(cruiser.isAlive()).toBe(false);
      expect(dread.remainingHP()).toBe(4);
    });

    test('targets highest priority hit cannot destroy', () => {
      const dread = new Ship(ShipType.Dreadnought, { hull: 3 });
      const cruiser = new Ship(ShipType.Cruiser, { hull: 4 });
      const ships = [cruiser, dread];

      const shots: Shot[] = [
        {
          roll: DICE_VALUES.HIT,
          computers: 0,
          damage: 1,
        },
      ];

      new BinnedDamageAssignmentHelper().assignDamage(
        shots,
        ships,
        DamageType.NPC
      );

      expect(dread.remainingHP()).toBe(3);
      expect(cruiser.remainingHP()).toBe(5);
    });

    test('targets lowest hp ship if same priority', () => {
      const dread1 = new Ship(ShipType.Dreadnought, { hull: 3 });
      const dread2 = new Ship(ShipType.Dreadnought, { hull: 3 });
      const ships = [dread1, dread2];

      const shot = { roll: DICE_VALUES.HIT, computers: 0, damage: 1 };
      const shots: Shot[] = [shot, shot];

      new BinnedDamageAssignmentHelper().assignDamage(
        shots,
        ships,
        DamageType.NPC
      );

      const hpPool = new Set()
        .add(dread1.remainingHP())
        .add(dread2.remainingHP());
      expect(hpPool).toContain(2);
      expect(hpPool).toContain(4);
    });

    test('hits nothing if unable', () => {
      const dread = new Ship(ShipType.Dreadnought, { hull: 3 });
      const carrier = new Ship(ShipType.Cruiser, { hull: 2 });
      const interceptor = new Ship(ShipType.Interceptor, { hull: 1 });
      const ships = [dread, carrier, interceptor];

      const shots: Shot[] = [
        {
          roll: 1,
          computers: 0,
          damage: 3,
        },
      ];

      new BinnedDamageAssignmentHelper().assignDamage(
        shots,
        ships,
        DamageType.NPC
      );
      expect(dread.remainingHP()).toBe(4);
      expect(carrier.remainingHP()).toBe(3);
      expect(interceptor.remainingHP()).toBe(2);
    });

    test('processes multiple shots', () => {
      const ship1 = new Ship(ShipType.Interceptor, { hull: 1 });
      const ship2 = new Ship(ShipType.Interceptor, { hull: 1 });
      const ships = [ship1, ship2];

      const shots: Shot[] = [
        { roll: DICE_VALUES.HIT, computers: 0, damage: 2 },
        { roll: DICE_VALUES.HIT, computers: 0, damage: 2 },
      ];

      new BinnedDamageAssignmentHelper().assignDamage(
        shots,
        ships,
        DamageType.NPC
      );

      expect(ship1.isAlive()).toBe(false);
      expect(ship2.isAlive()).toBe(false);
    });

    test('destroys the largest ship if possible', () => {
      const ship1 = new Ship(ShipType.Interceptor, { hull: 1 });
      const ship2 = new Ship(ShipType.Interceptor, { hull: 1 });
      const ship3 = new Ship(ShipType.Cruiser, { hull: 3 });
      const ships = [ship1, ship2, ship3];

      const shots: Shot[] = [
        { roll: DICE_VALUES.HIT, computers: 0, damage: 2 },
        { roll: DICE_VALUES.HIT, computers: 0, damage: 2 },
      ];

      new BinnedDamageAssignmentHelper().assignDamage(
        shots,
        ships,
        DamageType.NPC
      );

      expect(ship1.isAlive()).toBe(true);
      expect(ship2.isAlive()).toBe(true);
      expect(ship3.isAlive()).toBe(false);
    });

    test('destroys all ships if possible', () => {
      const ship1 = new Ship(ShipType.Interceptor, { hull: 2 });
      const ship2 = new Ship(ShipType.Cruiser, { hull: 3 });
      const ships = [ship1, ship2];

      const shots: Shot[] = [
        { roll: DICE_VALUES.HIT, computers: 0, damage: 1 },
        { roll: DICE_VALUES.HIT, computers: 0, damage: 2 },
        { roll: DICE_VALUES.HIT, computers: 0, damage: 4 },
      ];

      new BinnedDamageAssignmentHelper().assignDamage(
        shots,
        ships,
        DamageType.NPC
      );

      expect(ship1.isAlive()).toBe(false);
      expect(ship2.isAlive()).toBe(false);
    });

    test('destroys all ships if shielding allows', () => {
      const ship1 = new Ship(ShipType.Interceptor, { hull: 1, shields: 2 });
      const ship2 = new Ship(ShipType.Cruiser, { hull: 1, shields: 1 });
      const ships = [ship1, ship2];

      const shots: Shot[] = [
        { roll: DICE_VALUES.HIT - 1, computers: 3, damage: 2 },
        { roll: DICE_VALUES.HIT - 1, computers: 2, damage: 2 },
      ];

      new BinnedDamageAssignmentHelper().assignDamage(
        shots,
        ships,
        DamageType.NPC
      );

      expect(ship1.isAlive()).toBe(false);
      expect(ship2.isAlive()).toBe(false);
    });

    test('destroys all ships with smart grouping if shielding allows', () => {
      const ship1 = new Ship(ShipType.Interceptor, { hull: 2, shields: 2 });
      const ship2 = new Ship(ShipType.Cruiser, { hull: 3, shields: 1 });
      const ships = [ship1, ship2];

      const shots: Shot[] = [
        { roll: DICE_VALUES.HIT - 1, computers: 3, damage: 4 }, // Should be assigned to ship1, since it's the only damage that can hit it
        { roll: DICE_VALUES.HIT - 1, computers: 2, damage: 2 },
        { roll: DICE_VALUES.HIT - 1, computers: 2, damage: 2 },
      ];

      new BinnedDamageAssignmentHelper().assignDamage(
        shots,
        ships,
        DamageType.NPC
      );

      expect(ship1.isAlive()).toBe(false);
      expect(ship2.isAlive()).toBe(false);
    });

    test('maximizes damage with shielding', () => {
      const ship1 = new Ship(ShipType.Interceptor, { hull: 1, shields: 1 });
      const ship2 = new Ship(ShipType.Cruiser, { hull: 1, shields: 2 });
      const ships = [ship1, ship2];

      const shots: Shot[] = [
        { roll: DICE_VALUES.HIT - 1, computers: 2, damage: 1 },
        { roll: DICE_VALUES.HIT, computers: 0, damage: 1 },
        { roll: DICE_VALUES.HIT, computers: 0, damage: 1 },
      ];

      new BinnedDamageAssignmentHelper().assignDamage(
        shots,
        ships,
        DamageType.NPC
      );

      expect(ship1.isAlive()).toBe(true);
      expect(ship1.remainingHP()).toBe(1);
      expect(ship2.isAlive()).toBe(false);
      expect(ship2.remainingHP()).toBe(0);
    });

    test('DPS avoids overkill when two same-priority kills are available', () => {
      const woundedAncient = new Ship(ShipType.Ancient, { hull: 1 });
      const fullAncient = new Ship(ShipType.Ancient, { hull: 1 });
      woundedAncient.takeDamage(1);
      const ships = [woundedAncient, fullAncient];

      new BinnedDamageAssignmentHelper().assignDamage(
        [{ roll: DICE_VALUES.HIT, computers: 0, damage: 2 }],
        ships,
        DamageType.DPS
      );

      expect(woundedAncient.remainingHP()).toBe(1);
      expect(fullAncient.isAlive()).toBe(false);
    });

    test('DPS memo keeps differently configured ships of one type distinct', () => {
      const plasmaCruiser = new Ship(ShipType.Cruiser, {
        hull: 3,
        computers: 1,
        cannons: { plasma: 1 },
      });
      const ionCruiser = new Ship(ShipType.Cruiser, {
        hull: 1,
        computers: 1,
        initiative: 3,
        cannons: { ion: 1 },
      });
      const highDpsCruiser = new Ship(ShipType.Cruiser, {
        hull: 1,
        computers: 2,
        initiative: 3,
        cannons: { ion: 2, plasma: 1 },
      });

      new BinnedDamageAssignmentHelper().assignDamage(
        [
          { roll: DICE_VALUES.HIT, computers: 2, damage: 4 },
          { roll: 4, computers: 3, damage: 1 },
          { roll: DICE_VALUES.HIT, computers: 3, damage: 3 },
        ],
        [plasmaCruiser, ionCruiser, highDpsCruiser],
        DamageType.DPS
      );

      expect(highDpsCruiser.isAlive()).toBe(false);
      expect(plasmaCruiser.isAlive()).toBe(false);
      expect(ionCruiser.remainingHP()).toBe(1);
    });

    test('memo collapses permutation-equivalent identical configurations', () => {
      const ships = Array.from(
        { length: 6 },
        () => new Ship(ShipType.Cruiser, { hull: 1, shields: 1 })
      );
      ships[0].takeDamage(1);
      const shots = Array.from({ length: 6 }, () => ({
        roll: DICE_VALUES.HIT,
        computers: 0,
        damage: 1,
      }));
      const planner = new CountingDamagePlanner();
      const helper = new BinnedDamageAssignmentHelper();
      (
        helper as unknown as { npcDamagePlanner: AbstractDamagePlanner }
      ).npcDamagePlanner = planner;

      helper.assignDamage(shots, ships, DamageType.NPC);

      // The naive indexed tree has 6^6 leaves. HP-multiset memoization visits
      // only the distinct physical states, leaving ample room for refactors
      // without turning this into a wall-clock benchmark. Starting one ship
      // wounded also verifies that cached plans are remapped to concrete
      // indices instead of merely returning a permuted assignment vector.
      expect(planner.evaluations).toBeLessThan(100);
      expect(ships.reduce((hp, ship) => hp + ship.remainingHP(), 0)).toBe(5);
    });

    test('continues after an unassignable shot', () => {
      const cruiser = new Ship(ShipType.Cruiser, { shields: 2 });

      new BinnedDamageAssignmentHelper().assignDamage(
        [
          { roll: 2, computers: 0, damage: 1 },
          { roll: DICE_VALUES.HIT, computers: 0, damage: 1 },
        ],
        [cruiser],
        DamageType.DPS
      );

      expect(cruiser.remainingHP()).toBe(0);
    });

    test('spreads damage when unable to kill', () => {
      const ship1 = new Ship(ShipType.Interceptor, { hull: 2, shields: 1 });
      const ship2 = new Ship(ShipType.Cruiser, { hull: 2, shields: 2 });
      const ships = [ship1, ship2];

      const shots: Shot[] = [
        { roll: DICE_VALUES.HIT - 1, computers: 2, damage: 1 },
        { roll: DICE_VALUES.HIT, computers: 0, damage: 1 },
      ];

      new BinnedDamageAssignmentHelper().assignDamage(
        shots,
        ships,
        DamageType.NPC
      );

      expect(ship1.isAlive()).toBe(true);
      expect(ship1.remainingHP()).toBe(2);
      expect(ship2.isAlive()).toBe(true);
      expect(ship2.remainingHP()).toBe(2);
    });
  });
});
