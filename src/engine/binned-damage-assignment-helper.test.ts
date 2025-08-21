import { describe, expect, test } from 'bun:test';
import { Ship, ShipType, Shot } from './ship';
import { DICE_VALUES } from 'src/constants';
import { BinnedDamageAssignmentHelper } from './binned-damage-assignment-helper';

describe('BinnedDamageAssignment', () => {
  describe('assignDamage', () => {
    test('destroys highest priority ship it can', () => {
      const dread = new Ship(ShipType.Dreadnaught, { hull: 3 });
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

      new BinnedDamageAssignmentHelper().assignDamage(shots, ships);

      expect(interceptor.remainingHP()).toBe(2);
      expect(cruiser.isAlive()).toBe(false);
      expect(dread.remainingHP()).toBe(4);
    });

    test('targets highest priority hit cannot destroy', () => {
      const dread = new Ship(ShipType.Dreadnaught, { hull: 3 });
      const cruiser = new Ship(ShipType.Cruiser, { hull: 4 });
      const ships = [cruiser, dread];

      const shots: Shot[] = [
        {
          roll: DICE_VALUES.HIT,
          computers: 0,
          damage: 1,
        },
      ];

      new BinnedDamageAssignmentHelper().assignDamage(shots, ships);

      expect(dread.remainingHP()).toBe(3);
      expect(cruiser.remainingHP()).toBe(5);
    });

    test('targets lowest hp ship if same priority', () => {
      const dread1 = new Ship(ShipType.Dreadnaught, { hull: 3 });
      const dread2 = new Ship(ShipType.Dreadnaught, { hull: 3 });
      const ships = [dread1, dread2];

      const shot = { roll: DICE_VALUES.HIT, computers: 0, damage: 1 };
      const shots: Shot[] = [shot, shot];

      new BinnedDamageAssignmentHelper().assignDamage(shots, ships);

      const hpPool = new Set()
        .add(dread1.remainingHP())
        .add(dread2.remainingHP());
      expect(hpPool).toContain(2);
      expect(hpPool).toContain(4);
    });

    test('hits nothing if unable', () => {
      const dread = new Ship(ShipType.Dreadnaught, { hull: 3 });
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

      new BinnedDamageAssignmentHelper().assignDamage(shots, ships);
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

      new BinnedDamageAssignmentHelper().assignDamage(shots, ships);

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

      new BinnedDamageAssignmentHelper().assignDamage(shots, ships);

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

      new BinnedDamageAssignmentHelper().assignDamage(shots, ships);

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

      new BinnedDamageAssignmentHelper().assignDamage(shots, ships);

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

      new BinnedDamageAssignmentHelper().assignDamage(shots, ships);

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

      new BinnedDamageAssignmentHelper().assignDamage(shots, ships);

      expect(ship1.isAlive()).toBe(true);
      expect(ship1.remainingHP()).toBe(1);
      expect(ship2.isAlive()).toBe(false);
      expect(ship2.remainingHP()).toBe(0);
    });

    test('spreads damage when unable to kill', () => {
      const ship1 = new Ship(ShipType.Interceptor, { hull: 2, shields: 1 });
      const ship2 = new Ship(ShipType.Cruiser, { hull: 2, shields: 2 });
      const ships = [ship1, ship2];

      const shots: Shot[] = [
        { roll: DICE_VALUES.HIT - 1, computers: 2, damage: 1 },
        { roll: DICE_VALUES.HIT, computers: 0, damage: 1 },
      ];

      new BinnedDamageAssignmentHelper().assignDamage(shots, ships);

      expect(ship1.isAlive()).toBe(true);
      expect(ship1.remainingHP()).toBe(2);
      expect(ship2.isAlive()).toBe(true);
      expect(ship2.remainingHP()).toBe(2);
    });
  });
});
