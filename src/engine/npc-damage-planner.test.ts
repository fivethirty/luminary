import { describe, expect, test } from 'bun:test';
import { NpcDamagePlanner } from './npc-damage-planner';
import { Ship, ShipType, Shot, WeaponDamage } from './ship';
import { DICE_VALUES } from 'src/constants';

describe('NpcDamagePlanner', () => {
  describe('optimallySortsDice', () => {
    test('optimally sorts hits by damage descending', () => {
      const ionHit: Shot = {
        roll: DICE_VALUES.HIT,
        computers: 0,
        damage: WeaponDamage.ion,
      };
      const plasmaHit: Shot = {
        roll: DICE_VALUES.HIT,
        computers: 1,
        damage: WeaponDamage.plasma,
      };
      const solitonHit: Shot = {
        roll: DICE_VALUES.HIT,
        computers: 0,
        damage: WeaponDamage.soliton,
      };
      const antimatterHit: Shot = {
        roll: DICE_VALUES.HIT,
        computers: 0,
        damage: WeaponDamage.antimatter,
      };
      const npcDamagePlanner = new NpcDamagePlanner();
      const sortedHits = npcDamagePlanner.optimallySortShots([
        ionHit,
        solitonHit,
        plasmaHit,
        antimatterHit,
      ]);
      expect(sortedHits[0]).toBe(antimatterHit);
      expect(sortedHits[1]).toBe(solitonHit);
      expect(sortedHits[2]).toBe(plasmaHit);
      expect(sortedHits[3]).toBe(ionHit);
    });

    test('optimally sorts hits after other damage', () => {
      const ionHit: Shot = {
        roll: DICE_VALUES.HIT,
        computers: 0,
        damage: WeaponDamage.ion,
      };
      const plasmaHit: Shot = {
        roll: DICE_VALUES.HIT - 1,
        computers: 2,
        damage: WeaponDamage.plasma,
      };
      const npcDamagePlanner = new NpcDamagePlanner();
      const sortedHits = npcDamagePlanner.optimallySortShots([
        plasmaHit,
        ionHit,
      ]);
      expect(sortedHits[0]).toBe(plasmaHit);
      expect(sortedHits[1]).toBe(ionHit);
    });

    test('sorts hits plus computers in the same bucket', () => {
      const solitonHit: Shot = {
        roll: DICE_VALUES.HIT - 2,
        computers: 3,
        damage: WeaponDamage.soliton,
      };
      const plasmaHitLowRoll: Shot = {
        roll: DICE_VALUES.HIT - 2,
        computers: 2,
        damage: WeaponDamage.plasma,
      };
      const plasmaHitHighRoll: Shot = {
        roll: DICE_VALUES.HIT - 1,
        computers: 2,
        damage: WeaponDamage.plasma,
      };
      const npcDamagePlanner = new NpcDamagePlanner();
      const sortedHits = npcDamagePlanner.optimallySortShots([
        plasmaHitHighRoll,
        solitonHit,
        plasmaHitLowRoll,
      ]);
      expect(sortedHits[0]).toBe(plasmaHitLowRoll);
      expect(sortedHits[1]).toBe(solitonHit);
      expect(sortedHits[2]).toBe(plasmaHitHighRoll);
    });

    test('handles no shots', () => {
      const sortedShots = new NpcDamagePlanner().optimallySortShots([]);
      expect(sortedShots.length).toBe(0);
    });
  });

  describe('optimallySortsShips', () => {
    test('sorts by ship type', () => {
      const int = new Ship(ShipType.Interceptor, {
        initiative: 1,
      });
      const cruiser = new Ship(ShipType.Cruiser, {
        initiative: 2,
      });
      const dread = new Ship(ShipType.Dreadnaught, {
        initiative: 3,
      });

      const ships = [int, dread, cruiser];

      const sortedShips = new NpcDamagePlanner().optimallySortShips(ships);
      expect(sortedShips[0]).toBe(dread);
      expect(sortedShips[1]).toBe(cruiser);
      expect(sortedShips[2]).toBe(int);
    });
    test('sorts by ship damage', () => {
      const int = new Ship(ShipType.Interceptor, {
        hull: 2,
      });
      const intDamaged = new Ship(ShipType.Interceptor, {
        hull: 2,
      });
      const cruiser = new Ship(ShipType.Cruiser, {
        hull: 1,
      });
      intDamaged.takeDamage(1);

      const ships = [int, intDamaged, cruiser];

      const sortedShips = new NpcDamagePlanner().optimallySortShips(ships);
      expect(sortedShips[0]).toBe(cruiser);
      expect(sortedShips[1]).toBe(intDamaged);
      expect(sortedShips[2]).toBe(int);
    });
    test('handles no ships', () => {
      const sortedShips = new NpcDamagePlanner().optimallySortShips([]);
      expect(sortedShips.length).toBe(0);
    });
  });

  describe('calculateMaxScore', () => {
    test('handles when no score is possible', () => {
      const ship = new Ship(ShipType.Interceptor);
      const maxScore = new NpcDamagePlanner().calculateMaxScore(
        [ship],
        [],
        [1],
        []
      );
      expect(maxScore).toBe(0);
    });
    test('calculates the maximum score for a single ship', () => {
      const ship = new Ship(ShipType.Interceptor);
      const maxScore = new NpcDamagePlanner().calculateMaxScore(
        [ship],
        [{ roll: DICE_VALUES.HIT, computers: 0, damage: WeaponDamage.ion }],
        [1],
        []
      );
      expect(maxScore).toBeGreaterThan(0);
    });
    test('calculates the maximum score for multiple ships', () => {
      const ship1 = new Ship(ShipType.Cruiser, { hull: 1 });
      const ship2 = new Ship(ShipType.Interceptor);
      const damagePlanner = new NpcDamagePlanner();
      const result1 = damagePlanner.calculateMaxScore(
        [ship1, ship2],
        [{ roll: DICE_VALUES.HIT, computers: 0, damage: WeaponDamage.ion }],
        [1, 1],
        []
      );
      const result2 = damagePlanner.calculateMaxScore(
        [ship1, ship2],
        [{ roll: DICE_VALUES.HIT, computers: 0, damage: WeaponDamage.ion }],
        [2, 1],
        []
      );
      expect(result1).toBeGreaterThan(result2);
    });
    test('calculates the maximum score with overkill', () => {
      const ship1 = new Ship(ShipType.Cruiser);
      const ship2 = new Ship(ShipType.Interceptor);
      const damagePlanner = new NpcDamagePlanner();
      const result1 = damagePlanner.calculateMaxScore(
        [ship1, ship2],
        [{ roll: DICE_VALUES.HIT, computers: 0, damage: WeaponDamage.plasma }],
        [1, 1],
        []
      );
      const result2 = damagePlanner.calculateMaxScore(
        [ship1, ship2],
        [
          {
            roll: DICE_VALUES.HIT,
            computers: 0,
            damage: WeaponDamage.soliton,
          },
        ],
        [1, 2],
        []
      );
      expect(result1).toBe(result2);
    });
  });

  describe('evaluate', () => {
    test('determines when all ships are destroyed', () => {
      const ship = new Ship(ShipType.Interceptor);
      const result = new NpcDamagePlanner().evaluate([ship], [1], [1]);
      expect(result.allDestroyed).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    });
    test('returns a score of 0 when no ships are present', () => {
      const result = new NpcDamagePlanner().evaluate([], [], []);
      expect(result.allDestroyed).toBe(true);
      expect(result.score).toBe(0);
    });
    test('returns a score of 0 when no shots are present', () => {
      const ship = new Ship(ShipType.Interceptor);
      const result = new NpcDamagePlanner().evaluate([ship], [1], [0]);
      expect(result.allDestroyed).toBe(false);
      expect(result.score).toBe(0);
    });
    test('returns the same score regardless of overkill', () => {
      const ship = new Ship(ShipType.Interceptor);
      const result1 = new NpcDamagePlanner().evaluate([ship], [1], [1]);
      const result2 = new NpcDamagePlanner().evaluate([ship], [1], [2]);
      expect(result1.allDestroyed).toBe(true);
      expect(result2.allDestroyed).toBe(true);
      expect(result1.score).toBe(result2.score);
    });
    test('resturns a similar score for different damage assignments', () => {
      const ship1 = new Ship(ShipType.Interceptor);
      const ship2 = new Ship(ShipType.Interceptor);
      const result1 = new NpcDamagePlanner().evaluate(
        [ship1, ship2],
        [1, 1],
        [0, 1]
      );
      const result2 = new NpcDamagePlanner().evaluate(
        [ship1, ship2],
        [1, 1],
        [1, 0]
      );
      expect(result1.allDestroyed).toBe(false);
      expect(result2.allDestroyed).toBe(false);
      expect(result1.score).toBe(result2.score);
    });
    test('returns a higher score for more damage to ships', () => {
      const ship = new Ship(ShipType.Cruiser, { hull: 2 });
      const result1 = new NpcDamagePlanner().evaluate([ship], [3], [1]);
      const result2 = new NpcDamagePlanner().evaluate([ship], [3], [2]);
      expect(result1.allDestroyed).toBe(false);
      expect(result2.allDestroyed).toBe(false);
      expect(result2.score).toBeGreaterThan(result1.score);
    });
    test('returns a higher score for more damage to ships closer to destruction', () => {
      const ship1 = new Ship(ShipType.Cruiser, { hull: 2 });
      const ship2 = new Ship(ShipType.Cruiser, { hull: 2 });
      const result1 = new NpcDamagePlanner().evaluate(
        [ship1, ship2],
        [2, 3],
        [1, 0]
      );
      const result2 = new NpcDamagePlanner().evaluate(
        [ship1, ship2],
        [2, 3],
        [0, 1]
      );
      expect(result1.allDestroyed).toBe(false);
      expect(result2.allDestroyed).toBe(false);
      expect(result1.score).toBeGreaterThan(result2.score);
    });
    test('returns a higher score for destroying ships', () => {
      const ship1 = new Ship(ShipType.Interceptor);
      const ship2 = new Ship(ShipType.Cruiser, { hull: 1 });
      const result1 = new NpcDamagePlanner().evaluate(
        [ship1, ship2],
        [1, 2],
        [1, 0]
      );
      const result2 = new NpcDamagePlanner().evaluate(
        [ship1, ship2],
        [1, 2],
        [0, 1]
      );
      expect(result1.allDestroyed).toBe(false);
      expect(result2.allDestroyed).toBe(false);
      expect(result1.score).toBeGreaterThan(result2.score);
    });
    test('returns a higher score for destroying ships with higher priority', () => {
      const ship1 = new Ship(ShipType.Interceptor);
      const ship2 = new Ship(ShipType.Cruiser, { hull: 1 });
      const ship3 = new Ship(ShipType.Dreadnaught, { hull: 2 });
      const result1 = new NpcDamagePlanner().evaluate(
        [ship3, ship2, ship1],
        [3, 2, 1],
        [1, 1, 1]
      );
      const result2 = new NpcDamagePlanner().evaluate(
        [ship3, ship2, ship1],
        [3, 2, 1],
        [0, 3, 0]
      );
      expect(result1.allDestroyed).toBe(false);
      expect(result2.allDestroyed).toBe(false);
      expect(result2.score).toBeGreaterThan(result1.score);
    });
    test('returns a higher score for destroying a ship with higher priority than many ships of lower priority', () => {
      const int = new Ship(ShipType.Interceptor);
      const cruiser = new Ship(ShipType.Cruiser);
      const dread = new Ship(ShipType.Dreadnaught, { hull: 2 });
      const damagePlanner = new NpcDamagePlanner();
      const result1 = damagePlanner.evaluate(
        [dread, ...Array(4).fill(cruiser), ...Array(8).fill(int)],
        [3, ...Array(12).fill(1)],
        [0, ...Array(12).fill(1)]
      );
      const result2 = damagePlanner.evaluate(
        [dread, ...Array(4).fill(cruiser), ...Array(8).fill(int)],
        [3, ...Array(12).fill(1)],
        [3, ...Array(12).fill(0)]
      );
      expect(result1.allDestroyed).toBe(false);
      expect(result2.allDestroyed).toBe(false);
      expect(result2.score).toBeGreaterThan(result1.score);
    });

    test('returns a higher score for damaging a ship with higher priority than many ships of lower priority', () => {
      const int = new Ship(ShipType.Interceptor);
      const cruiser = new Ship(ShipType.Cruiser);
      const dread = new Ship(ShipType.Dreadnaught, { hull: 2 });
      const damagePlanner = new NpcDamagePlanner();
      const result1 = damagePlanner.evaluate(
        [dread, ...Array(4).fill(cruiser), ...Array(8).fill(int)],
        [3, ...Array(12).fill(2)],
        [0, ...Array(12).fill(1)]
      );
      const result2 = damagePlanner.evaluate(
        [dread, ...Array(4).fill(cruiser), ...Array(8).fill(int)],
        [4, ...Array(12).fill(2)],
        [1, ...Array(12).fill(0)]
      );
      expect(result1.allDestroyed).toBe(false);
      expect(result2.allDestroyed).toBe(false);
      expect(result2.score).toBeGreaterThan(result1.score);
    });

    test('returns a higher score for destroying a smaller ship than damaging a bigger ship', () => {
      const int = new Ship(ShipType.Interceptor);
      const cruiser = new Ship(ShipType.Cruiser, { hull: 2 });
      const dread = new Ship(ShipType.Dreadnaught, { hull: 3 });
      const damagePlanner = new NpcDamagePlanner();
      const result1 = damagePlanner.evaluate(
        [dread, cruiser, int],
        [3, 2, 1],
        [0, 0, 1]
      );
      const result2 = damagePlanner.evaluate(
        [dread, cruiser, int],
        [3, 2, 1],
        [0, 1, 0]
      );
      expect(result1.allDestroyed).toBe(false);
      expect(result2.allDestroyed).toBe(false);
      expect(result1.score).toBeGreaterThan(result2.score);
    });
  });
});
