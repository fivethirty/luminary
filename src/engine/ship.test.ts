import { describe, expect, test } from 'bun:test';
import { Ship, ShipType, Shot, WeaponDamage, WeaponType } from './ship';

describe('Ship', () => {
  test.each([
    {
      type: ShipType.Interceptor,
      expected: () => emptyShip(ShipType.Interceptor),
    },
    {
      type: ShipType.Carrier,
      expected: () => emptyShip(ShipType.Carrier),
    },
    {
      type: ShipType.Dreadnaught,
      expected: () => emptyShip(ShipType.Dreadnaught),
    },
    {
      type: ShipType.Orbital,
      expected: () => emptyShip(ShipType.Orbital),
    },
    {
      type: ShipType.Starbase,
      expected: () => emptyShip(ShipType.Starbase),
    },
    {
      type: ShipType.Ancient,
      expected: () => {
        const ship = emptyShip(ShipType.Ancient);
        ship.hull = 1;
        ship.computers = 1;
        ship.cannons.ion = 2;
        ship.initiative = 2;
        return ship;
      },
    },
    {
      type: ShipType.Guardian,
      expected: () => {
        const ship = emptyShip(ShipType.Guardian);
        ship.hull = 2;
        ship.computers = 2;
        ship.cannons.ion = 3;
        ship.initiative = 3;
        return ship;
      },
    },
    {
      type: ShipType.GCDS,
      expected: () => {
        const ship = emptyShip(ShipType.GCDS);
        ship.hull = 7;
        ship.computers = 2;
        ship.cannons.ion = 4;
        return ship;
      },
    },
  ])('constructor: $type', ({ type, expected }) => {
    const ship = new Ship(type);
    expect(ship).toMatchObject(expected());
  });

  test.each([
    { type: ShipType.Interceptor, expected: true },
    { type: ShipType.Carrier, expected: true },
    { type: ShipType.Dreadnaught, expected: true },
    { type: ShipType.Orbital, expected: true },
    { type: ShipType.Starbase, expected: true },
    { type: ShipType.Ancient, expected: false },
    { type: ShipType.Guardian, expected: false },
    { type: ShipType.GCDS, expected: false },
  ])('isPlayerShip: $type returns $expected', ({ type, expected }) => {
    const ship = new Ship(type);
    expect(ship.isPlayerShip()).toBe(expected);
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

  const hitRoller = () => 6;
  const missRoller = () => 1;

  test.each(weaponTests)('shootMissles: $name', ({ weapons }) => {
    const ship = new Ship(ShipType.Interceptor, hitRoller);
    ship.missiles = weapons;
    ship.computers = 1;
    const shots = ship.shootMissles();
    validateShots(ship.computers, ship.missiles, shots);
  });

  test.each(weaponTests)('shootCannons: $name', ({ weapons }) => {
    const ship = new Ship(ShipType.Interceptor, hitRoller);
    ship.cannons = weapons;
    ship.computers = 1;
    const shots = ship.shootCannons();
    validateShots(ship.computers, ship.cannons, shots);
  });

  test('shootMissles: does not return misses', () => {
    const ship = new Ship(ShipType.Interceptor, missRoller);
    ship.missiles = {
      ion: 1,
      plasma: 1,
      soliton: 1,
      antimatter: 1,
    };
    ship.computers = 1;
    const shots = ship.shootMissles();
    expect(shots.length).toEqual(0);
  });

  test('shootCannons: does not return misses', () => {
    const ship = new Ship(ShipType.Interceptor, missRoller);
    ship.cannons = {
      ion: 1,
      plasma: 1,
      soliton: 1,
      antimatter: 1,
    };
    ship.computers = 1;
    const shots = ship.shootMissles();
    expect(shots.length).toEqual(0);
  });

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
  ])('shootRiftCannon: result for $roll', ({ roll, expected }) => {
    const ship = new Ship(ShipType.Interceptor, () => roll);
    ship.rift = 1;
    const riftShots = ship.shootRiftCannon();
    expect(riftShots.length).toEqual(1);
    expect(riftShots[0]).toEqual(expected);
  });

  test('shootRiftCannon: shoots the right number of shots', () => {
    const ship = new Ship(ShipType.Interceptor);
    ship.rift = 3;
    const riftShots = ship.shootRiftCannon();
    expect(riftShots.length).toEqual(3);
  });

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
  ])('shotHits: $name', ({ shot, shields, expected }) => {
    const ship = new Ship(ShipType.Interceptor);
    ship.shields = shields;
    expect(ship.shotHits(shot)).toEqual(expected);
  });

  test('can track HP', () => {
    const ship = new Ship(ShipType.Interceptor);
    ship.hull = 3;
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

function emptyShip(type: ShipType): Ship {
  return {
    type: type,
    hull: 0,
    computers: 0,
    shields: 0,
    initiative: 0,
    missiles: {
      ion: 0,
      plasma: 0,
      soliton: 0,
      antimatter: 0,
    },
    cannons: {
      ion: 0,
      plasma: 0,
      soliton: 0,
      antimatter: 0,
    },
    rift: 0,
  } as Ship;
}
