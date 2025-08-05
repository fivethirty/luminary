import { describe, expect, test } from 'bun:test';
import { Ship, ShipType, Shot, WeaponDamage, WeaponType } from './ship';

describe('Ship', () => {
  describe('isPlayerShip', () => {
    test.each([
      { type: ShipType.Interceptor, expected: true },
      { type: ShipType.Cruiser, expected: true },
      { type: ShipType.Dreadnaught, expected: true },
      { type: ShipType.Orbital, expected: true },
      { type: ShipType.Starbase, expected: true },
      { type: ShipType.Ancient, expected: false },
      { type: ShipType.Guardian, expected: false },
      { type: ShipType.GCDS, expected: false },
    ])('$type returns $expected', ({ type, expected }) => {
      const ship = new Ship(type);
      expect(ship.isPlayerShip()).toBe(expected);
    });
  });

  const weaponTests = [
    {
      name: 'ion',
      weapons: {
        ion: 1,
        plasma: 0,
        soliton: 0,
        antimatter: 0,
      },
    },
    {
      name: 'plasma',
      weapons: {
        ion: 0,
        plasma: 1,
        soliton: 0,
        antimatter: 0,
      },
    },
    {
      name: 'soliton',
      weapons: {
        ion: 0,
        plasma: 0,
        soliton: 1,
        antimatter: 0,
      },
    },
    {
      name: 'antimatter',
      weapons: {
        ion: 0,
        plasma: 0,
        soliton: 0,
        antimatter: 1,
      },
    },
    {
      name: 'multiple',
      weapons: {
        ion: 3,
        plasma: 0,
        soliton: 0,
        antimatter: 0,
      },
    },
    {
      name: 'different types',
      weapons: {
        ion: 1,
        plasma: 0,
        soliton: 1,
        antimatter: 1,
      },
    },
  ];

  function validateShots(
    computers: number,
    weapons: Record<WeaponType, number>,
    shots: Shot[]
  ) {
    const totalShots = Object.values(weapons).reduce(
      (sum, value) => sum + value
    );
    expect(shots.length).toEqual(totalShots);
    const shotCountByDamage: Record<number, number> = {
      [WeaponDamage.ion]: 0,
      [WeaponDamage.plasma]: 0,
      [WeaponDamage.soliton]: 0,
      [WeaponDamage.antimatter]: 0,
    };
    shots.forEach((shot) => {
      expect(shot.roll).toEqual(6);
      expect(shot.computers).toEqual(computers);
      shotCountByDamage[shot.damage]++;
    });
    expect(shotCountByDamage[WeaponDamage.ion]).toEqual(weapons.ion);
    expect(shotCountByDamage[WeaponDamage.plasma]).toEqual(weapons.plasma);
    expect(shotCountByDamage[WeaponDamage.soliton]).toEqual(weapons.soliton);
    expect(shotCountByDamage[WeaponDamage.antimatter]).toEqual(
      weapons.antimatter
    );
  }

  describe('shootMissles', () => {
    test.each(weaponTests)('$name', ({ weapons }) => {
      const ship = new Ship(
        ShipType.Interceptor,
        {
          missiles: weapons,
          computers: 1,
        },
        () => 6
      );
      const shots = ship.shootMissles();
      validateShots(ship.computers, ship.missiles, shots);
    });
  });

  describe('shootCannons', () => {
    test.each(weaponTests)('$name', ({ weapons }) => {
      const ship = new Ship(
        ShipType.Interceptor,
        {
          cannons: weapons,
          computers: 1,
        },
        () => 6
      );
      const shots = ship.shootCannons();
      validateShots(ship.computers, ship.cannons, shots);
    });
  });

  describe('antimatter splitter', () => {
    test('splits antimatter cannons into 4 shots', () => {
      const mockRoll = (() => {
        let callCount = 0;
        return () => {
          callCount++;
          return callCount === 1 ? 5 : 1;
        };
      })();

      const ship = new Ship(
        ShipType.Interceptor,
        {
          cannons: { ion: 0, plasma: 0, soliton: 0, antimatter: 1 },
          computers: 2,
        },
        mockRoll
      );

      const shots = ship.shootCannons(true);

      expect(shots.length).toBe(4);
      expect(shots.every((shot) => shot.roll === 5)).toBe(true);
      expect(shots.every((shot) => shot.computers === 2)).toBe(true);
      expect(shots.every((shot) => shot.damage === 1)).toBe(true);
    });

    test('does not split non-antimatter cannons', () => {
      const ship = new Ship(
        ShipType.Interceptor,
        {
          cannons: { ion: 1, plasma: 1, soliton: 0, antimatter: 0 },
          computers: 1,
        },
        () => 6
      );

      const shots = ship.shootCannons(true);

      expect(shots.length).toBe(2);
      expect(shots[0].damage).toBe(WeaponDamage.ion);
      expect(shots[1].damage).toBe(WeaponDamage.plasma);
    });

    test('handles multiple antimatter cannons', () => {
      let rollCount = 0;
      const ship = new Ship(
        ShipType.Interceptor,
        {
          cannons: { ion: 0, plasma: 0, soliton: 0, antimatter: 2 },
          computers: 0,
        },
        () => ++rollCount
      );

      const shots = ship.shootCannons(true);

      expect(shots.length).toBe(8);
      expect(shots.slice(0, 4).every((shot) => shot.roll === 1)).toBe(true);
      expect(shots.slice(4, 8).every((shot) => shot.roll === 2)).toBe(true);
      expect(shots.every((shot) => shot.damage === 1)).toBe(true);
    });

    test('antimatter cannons without splitter work normally', () => {
      const ship = new Ship(
        ShipType.Interceptor,
        {
          cannons: { ion: 0, plasma: 0, soliton: 0, antimatter: 1 },
          computers: 3,
        },
        () => 4
      );

      const shots = ship.shootCannons(false);

      expect(shots.length).toBe(1);
      expect(shots[0].roll).toBe(4);
      expect(shots[0].computers).toBe(3);
      expect(shots[0].damage).toBe(WeaponDamage.antimatter);
    });

    test('does NOT split antimatter missiles', () => {
      const ship = new Ship(
        ShipType.Interceptor,
        {
          missiles: { ion: 0, plasma: 0, soliton: 0, antimatter: 1 },
          computers: 2,
        },
        () => 5
      );

      const shots = ship.shootMissles();

      expect(shots.length).toBe(1);
      expect(shots[0].roll).toBe(5);
      expect(shots[0].damage).toBe(WeaponDamage.antimatter);
    });
  });

  describe('shootRiftCannon', () => {
    test.each([
      {
        roll: 1,
        expected: {
          selfDamage: 0,
          targetDamage: 0,
        },
      },
      {
        roll: 2,
        expected: {
          selfDamage: 0,
          targetDamage: 0,
        },
      },
      {
        roll: 3,
        expected: {
          selfDamage: 0,
          targetDamage: 1,
        },
      },
      {
        roll: 4,
        expected: {
          selfDamage: 0,
          targetDamage: 2,
        },
      },
      {
        roll: 5,
        expected: {
          selfDamage: 1,
          targetDamage: 0,
        },
      },
      {
        roll: 6,
        expected: {
          selfDamage: 1,
          targetDamage: 3,
        },
      },
    ])('result for $roll', ({ roll, expected }) => {
      const ship = new Ship(
        ShipType.Interceptor,
        {
          rift: 1,
        },
        () => roll
      );
      const riftShots = ship.shootRiftCannon();
      expect(riftShots.length).toEqual(1);
      expect(riftShots[0]).toEqual(expected);
    });

    test('shoots the right number of shots', () => {
      const ship = new Ship(ShipType.Interceptor, { rift: 3 });
      const riftShots = ship.shootRiftCannon();
      expect(riftShots.length).toEqual(3);
    });
  });

  describe('shotHits', () => {
    test.each([
      {
        name: '1 misses',
        shot: {
          roll: 1,
          computers: 10000,
          damage: 1,
        },
        shields: 0,
        expected: false,
      },
      {
        name: '2 no shields misses',
        shot: {
          roll: 2,
          computers: 0,
          damage: 1,
        },
        shields: 0,
        expected: false,
      },
      {
        name: '3 no shields misses',
        shot: {
          roll: 2,
          computers: 0,
          damage: 1,
        },
        shields: 0,
        expected: false,
      },
      {
        name: '4 no shields misses',
        shot: {
          roll: 2,
          computers: 0,
          damage: 1,
        },
        shields: 0,
        expected: false,
      },
      {
        name: '5 no shields misses',
        shot: {
          roll: 2,
          computers: 0,
          damage: 1,
        },
        shields: 0,
        expected: false,
      },
      {
        name: '6 hits',
        shot: {
          roll: 6,
          computers: 0,
          damage: 1,
        },
        shields: 10000,
        expected: true,
      },
      {
        name: '5 hits with computers',
        shot: {
          roll: 6,
          computers: 1,
          damage: 1,
        },
        shields: 0,
        expected: true,
      },
      {
        name: '5 misses with computers and shields',
        shot: {
          roll: 0,
          computers: 1,
          damage: 1,
        },
        shields: 1,
        expected: false,
      },
    ])('$name', ({ shot, shields, expected }) => {
      const ship = new Ship(ShipType.Interceptor, { shields: shields });
      expect(ship.shotHits(shot)).toEqual(expected);
    });
  });

  describe('damage tracking', () => {
    test('can track HP', () => {
      const ship = new Ship(ShipType.Interceptor, { hull: 3 });
      expect(ship.remainingHP()).toEqual(4);
      expect(ship.isAlive()).toEqual(true);

      ship.takeDamage(1);
      expect(ship.remainingHP()).toEqual(3);
      expect(ship.isAlive()).toEqual(true);

      ship.takeDamage(2);
      expect(ship.remainingHP()).toEqual(1);
      expect(ship.isAlive()).toEqual(true);

      ship.takeDamage(1);
      expect(ship.remainingHP()).toEqual(0);
      expect(ship.isAlive()).toEqual(false);

      ship.takeDamage(10);
      expect(ship.remainingHP()).toEqual(0);
      expect(ship.isAlive()).toEqual(false);

      ship.resetDamage();
      expect(ship.remainingHP()).toEqual(4);
      expect(ship.isAlive()).toEqual(true);

      ship.takeDamage(10);
      expect(ship.remainingHP()).toEqual(0);
      expect(ship.isAlive()).toEqual(false);
    });
  });
});
