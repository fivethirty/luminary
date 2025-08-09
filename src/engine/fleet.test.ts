import { describe, expect, test } from 'bun:test';
import { Ship, ShipType } from './ship';
import { Fleet } from './fleet';
import { DICE_VALUES, GUARANTEED_HIT, RIFT_MISS } from 'src/constants';

describe('Fleet', () => {
  describe('getInitiatives', () => {
    test.each([
      {
        name: 'single ship',
        ships: [new Ship(ShipType.Interceptor, { initiative: 3 })],
        expected: new Set<number>([3]),
      },
      {
        name: 'two ships with the same initiative',
        ships: [
          new Ship(ShipType.Interceptor, { initiative: 3 }),
          new Ship(ShipType.Interceptor, { initiative: 3 }),
        ],
        expected: new Set<number>([3]),
      },
      {
        name: 'two ships with different initiative',
        ships: [
          new Ship(ShipType.Interceptor, { initiative: 3 }),
          new Ship(ShipType.Cruiser, { initiative: 2 }),
        ],
        expected: new Set<number>([3, 2]),
      },
    ])('$name', ({ ships, expected }) => {
      const fleet = new Fleet('my fleet', ships);
      expect(fleet.getInitiatives()).toEqual(expected);
    });
  });

  const shootingTests = [
    {
      name: 'no ships at initiative',
      ships: [
        new Ship(ShipType.Interceptor, { initiative: 3 }),
        new Ship(ShipType.Cruiser, { initiative: 2 }),
      ],
      initiative: 4,
      expectedShotCount: 0,
    },
    {
      name: 'single ship with weapons',
      ships: [
        new Ship(
          ShipType.Interceptor,
          {
            initiative: 3,
            missiles: { ion: 2 },
            cannons: { plasma: 1 },
          },
          GUARANTEED_HIT
        ),
      ],
      initiative: 3,
      expectedMissileCount: 2,
      expectedCannonCount: 1,
    },
    {
      name: 'multiple ships at same initiative',
      ships: [
        new Ship(
          ShipType.Interceptor,
          {
            initiative: 3,
            missiles: { ion: 1 },
            cannons: { ion: 1 },
          },
          GUARANTEED_HIT
        ),
        new Ship(
          ShipType.Cruiser,
          {
            initiative: 3,
            missiles: { plasma: 2 },
            cannons: { plasma: 2 },
          },
          GUARANTEED_HIT
        ),
        new Ship(
          ShipType.Dreadnaught,
          {
            initiative: 2,
            missiles: { antimatter: 1 },
            cannons: { antimatter: 1 },
          },
          GUARANTEED_HIT
        ),
      ],
      initiative: 3,
      expectedMissileCount: 3,
      expectedCannonCount: 3,
    },
    {
      name: 'dead ships dont shoot',
      ships: [
        new Ship(
          ShipType.Interceptor,
          {
            initiative: 3,
            missiles: { ion: 2 },
            cannons: { ion: 2 },
            hull: 1,
          },
          GUARANTEED_HIT
        ),
      ],
      initiative: 3,
      setupFleet: (fleet: Fleet) => {
        fleet['ships'][0].takeDamage(2);
      },
      expectedShotCount: 0,
    },
  ];

  describe('shootMissilesForInitiative', () => {
    test.each(shootingTests)(
      '$name',
      ({
        ships,
        initiative,
        expectedShotCount,
        expectedMissileCount,
        setupFleet,
      }) => {
        const fleet = new Fleet('test fleet', ships);
        if (setupFleet) setupFleet(fleet);

        const shots = fleet.shootMissilesForInitiative(initiative, 0);
        const expected = expectedShotCount ?? expectedMissileCount ?? 0;
        expect(shots.length).toEqual(expected);
      }
    );

    test('only shoots missiles', () => {
      const ship = new Ship(
        ShipType.Interceptor,
        {
          initiative: 3,
          missiles: { ion: 2 },
          cannons: { plasma: 3 },
        },
        GUARANTEED_HIT
      );
      const fleet = new Fleet('test', [ship]);

      const shots = fleet.shootMissilesForInitiative(3, 0);
      expect(shots.length).toBe(2);

      shots.forEach((shot) => {
        expect(shot.damage).toBe(1);
      });
    });
  });

  describe('shootCannonsForInitiative', () => {
    test.each(shootingTests)(
      '$name',
      ({
        ships,
        initiative,
        expectedShotCount,
        expectedCannonCount,
        setupFleet,
      }) => {
        const fleet = new Fleet('test fleet', ships);
        if (setupFleet) setupFleet(fleet);

        const shots = fleet.shootCannonsForInitiative(initiative, 0);
        const expected = expectedShotCount ?? expectedCannonCount ?? 0;
        expect(shots.length).toEqual(expected);
      }
    );

    test('only shoots cannons', () => {
      const ship = new Ship(
        ShipType.Interceptor,
        {
          initiative: 3,
          missiles: { ion: 2 },
          cannons: { plasma: 3 },
        },
        GUARANTEED_HIT
      );
      const fleet = new Fleet('test', [ship]);

      const shots = fleet.shootCannonsForInitiative(3, 0);
      expect(shots.length).toBe(3);

      shots.forEach((shot) => {
        expect(shot.damage).toBe(2);
      });
    });
  });

  describe('shootRiftCannonsForInitiative', () => {
    test.each([
      {
        name: 'no rift cannons',
        ships: [new Ship(ShipType.Interceptor, { initiative: 3 })],
        initiative: 3,
        expectedShotCount: 0,
      },
      {
        name: 'single ship with rift',
        ships: [
          new Ship(
            ShipType.Cruiser,
            {
              initiative: 2,
              rift: 2,
            },
            GUARANTEED_HIT
          ),
        ],
        initiative: 2,
        expectedShotCount: 2,
      },
      {
        name: 'multiple ships with rift',
        ships: [
          new Ship(
            ShipType.Dreadnaught,
            {
              initiative: 1,
              rift: 1,
            },
            GUARANTEED_HIT
          ),
          new Ship(
            ShipType.Cruiser,
            {
              initiative: 1,
              rift: 3,
            },
            GUARANTEED_HIT
          ),
          new Ship(
            ShipType.Cruiser,
            {
              initiative: 1,
              rift: 3,
            },
            RIFT_MISS
          ),
        ],
        initiative: 1,
        expectedShotCount: 4,
      },
    ])('$name', ({ ships, initiative, expectedShotCount }) => {
      const fleet = new Fleet('test fleet', ships);

      const shots = fleet.shootRiftCannonsForInitiative(initiative);
      expect(shots.length).toEqual(expectedShotCount);
    });
  });

  describe('isAlive', () => {
    test.each([
      {
        name: 'all ships alive',
        ships: [new Ship(ShipType.Interceptor), new Ship(ShipType.Cruiser)],
        expected: true,
      },
      {
        name: 'one ship dead, one alive',
        ships: [
          new Ship(ShipType.Cruiser),
          new Ship(ShipType.Interceptor, { hull: 1 }),
        ],
        setupFleet: (fleet: Fleet) => {
          fleet['ships'][0].takeDamage(2);
        },
        expected: true,
      },
      {
        name: 'all ships dead',
        ships: [
          new Ship(ShipType.Cruiser, { hull: 2 }),
          new Ship(ShipType.Interceptor, { hull: 1 }),
        ],
        setupFleet: (fleet: Fleet) => {
          fleet['ships'][0].takeDamage(3);
          fleet['ships'][1].takeDamage(2);
        },
        expected: false,
      },
    ])('$name', ({ ships, expected, setupFleet }) => {
      const fleet = new Fleet('test fleet', ships);
      if (setupFleet) setupFleet(fleet);

      expect(fleet.isAlive()).toEqual(expected);
    });
  });

  describe('getLivingShips', () => {
    test('returns all ships when all are alive', () => {
      const ship1 = new Ship(ShipType.Interceptor);
      const ship2 = new Ship(ShipType.Cruiser);
      const fleet = new Fleet('test', [ship1, ship2]);

      const living = fleet.getLivingShips();
      expect(living).toHaveLength(2);
      expect(living).toContain(ship1);
      expect(living).toContain(ship2);
    });

    test('returns only living ships', () => {
      const ship1 = new Ship(ShipType.Interceptor, { hull: 1 });
      const ship2 = new Ship(ShipType.Cruiser);
      const ship3 = new Ship(ShipType.Dreadnaught);
      const fleet = new Fleet('test', [ship1, ship2, ship3]);

      // Kill ship1
      ship1.takeDamage(2);

      const living = fleet.getLivingShips();
      expect(living).toHaveLength(2);
      expect(living).not.toContain(ship1);
      expect(living).toContain(ship2);
      expect(living).toContain(ship3);
    });

    test('returns empty array when all ships are dead', () => {
      const ship1 = new Ship(ShipType.Interceptor, { hull: 1 });
      const ship2 = new Ship(ShipType.Cruiser, { hull: 2 });
      const fleet = new Fleet('test', [ship1, ship2]);

      ship1.takeDamage(2);
      ship2.takeDamage(3);

      const living = fleet.getLivingShips();
      expect(living).toHaveLength(0);
    });
  });

  describe('reset', () => {
    test('restores all ships', () => {
      const ship1 = new Ship(ShipType.Interceptor, { hull: 1 });
      const ship2 = new Ship(ShipType.Cruiser, { hull: 2 });
      const fleet = new Fleet('test', [ship1, ship2]);

      ship1.takeDamage(1);
      ship2.takeDamage(2);

      expect(ship1.remainingHP()).toBe(1);
      expect(ship2.remainingHP()).toBe(1);

      fleet.reset();

      expect(ship1.remainingHP()).toBe(2);
      expect(ship2.remainingHP()).toBe(3);
    });
  });

  describe('antimatter splitter', () => {
    test('passes antimatter splitter flag to ships when shooting', () => {
      let capturedSplitterFlag: boolean | undefined;

      const mockShip = new Ship(
        ShipType.Interceptor,
        {
          initiative: 3,
          cannons: { antimatter: 1 },
        },
        GUARANTEED_HIT
      );

      // Override shootCannons to capture the flag
      mockShip.shootCannons = (
        _minShields: number,
        antimatterSplitter?: boolean
      ) => {
        capturedSplitterFlag = antimatterSplitter;
        return [];
      };

      const fleetWithSplitter = new Fleet('test', [mockShip], true);
      fleetWithSplitter.shootCannonsForInitiative(3, 0);
      expect(capturedSplitterFlag).toBe(true);

      const fleetWithoutSplitter = new Fleet('test', [mockShip], false);
      fleetWithoutSplitter.shootCannonsForInitiative(3, 0);
      expect(capturedSplitterFlag).toBe(false);
    });

    test('antimatter splitter creates correct number of shots', () => {
      const ship = new Ship(
        ShipType.Interceptor,
        {
          initiative: 2,
          cannons: { antimatter: 1 },
        },
        GUARANTEED_HIT
      );

      const fleetWithSplitter = new Fleet('test', [ship], true);
      const shots = fleetWithSplitter.shootCannonsForInitiative(2, 0);

      expect(shots.length).toBe(4);
      expect(shots.every((shot) => shot.roll === DICE_VALUES.HIT)).toBe(true);
      expect(shots.every((shot) => shot.damage === 1)).toBe(true);
    });
  });
});
