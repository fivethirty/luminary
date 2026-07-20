import { describe, expect, test } from 'bun:test';
import { CombatSimulator } from './combat-simulator';
import { Fleet } from './fleet';
import { Ship, ShipType } from './ship';
import { DICE_VALUES, GUARANTEED_HIT, GUARANTEED_MISS } from 'src/constants';

describe('CombatSimulator', () => {
  describe('simulate', () => {
    test('tracks last fleet standing percentages', () => {
      const fleetA = new Fleet('Strong', [
        new Ship(
          ShipType.Dreadnought,
          {
            hull: 5,
            cannons: { plasma: 3 },
          },
          GUARANTEED_HIT
        ),
      ]);
      const fleetB = new Fleet('Medium', [
        new Ship(ShipType.Interceptor, { hull: 1 }, GUARANTEED_MISS),
      ]);
      const fleetC = new Fleet('Weak', [
        new Ship(ShipType.Interceptor, {}, GUARANTEED_MISS),
      ]);

      const simulator = new CombatSimulator();
      const results = simulator.simulate([fleetA, fleetB, fleetC], 100);

      expect(results.lastFleetStanding['Strong']).toBeCloseTo(1.0);
      expect(results.lastFleetStanding['Medium']).toBeCloseTo(0.0);
      expect(results.lastFleetStanding['Weak']).toBeCloseTo(0.0);
      expect(results.drawPercentage).toBeCloseTo(0.0);
    });

    test('tracks expected survivors by type', () => {
      const fleetA = new Fleet('Mixed', [
        new Ship(ShipType.Interceptor, { cannons: { ion: 1 } }, GUARANTEED_HIT),
        new Ship(
          ShipType.Cruiser,
          { hull: 2, cannons: { plasma: 2 } },
          GUARANTEED_HIT
        ),
        new Ship(
          ShipType.Dreadnought,
          { hull: 3, cannons: { antimatter: 2 } },
          GUARANTEED_HIT
        ),
      ]);
      const fleetB = new Fleet('Weak', [
        new Ship(ShipType.Interceptor, {}, GUARANTEED_MISS),
      ]);

      const simulator = new CombatSimulator();
      const results = simulator.simulate([fleetA, fleetB], 100);

      expect(results.lastFleetStanding['Mixed']).toBeCloseTo(1.0);
      expect(results.lastFleetStanding['Weak']).toBeCloseTo(0.0);

      expect(
        results.expectedSurvivors['Mixed'][ShipType.Interceptor]
      ).toBeCloseTo(1.0);
      expect(results.expectedSurvivors['Mixed'][ShipType.Cruiser]).toBeCloseTo(
        1.0
      );
      expect(
        results.expectedSurvivors['Mixed'][ShipType.Dreadnought]
      ).toBeCloseTo(1.0);

      expect(results.survivorDistribution).toHaveLength(1);
      expect(results.survivorDistribution[0].probability).toBeCloseTo(1.0);
      expect(
        results.survivorDistribution[0].survivors['Mixed'][ShipType.Interceptor]
      ).toBe(1);
      expect(
        results.survivorDistribution[0].survivors['Mixed'][ShipType.Cruiser]
      ).toBe(1);
      expect(
        results.survivorDistribution[0].survivors['Mixed'][ShipType.Dreadnought]
      ).toBe(1);

      expect(results.expectedSurvivors['Weak'][ShipType.Interceptor] || 0).toBe(
        0
      );
    });

    test('handles draws correctly', () => {
      const fleetA = new Fleet('Rift A', [
        new Ship(ShipType.Cruiser, { hull: 0, rift: 1 }, GUARANTEED_HIT),
      ]);
      const fleetB = new Fleet('Rift B', [
        new Ship(ShipType.Interceptor, { hull: 2 }, GUARANTEED_MISS),
      ]);
      const fleetC = new Fleet('Survivor', [
        new Ship(ShipType.Interceptor, { cannons: { ion: 1 } }, GUARANTEED_HIT),
      ]);

      const simulator = new CombatSimulator();
      const results = simulator.simulate([fleetC, fleetB, fleetA], 100);

      expect(results.lastFleetStanding['Rift A']).toBeCloseTo(0.0);
      expect(results.lastFleetStanding['Rift B']).toBeCloseTo(0.0);

      expect(results.lastFleetStanding['Survivor']).toBeCloseTo(1.0);
      expect(
        results.expectedSurvivors['Survivor'][ShipType.Interceptor]
      ).toBeCloseTo(1.0);
    });

    test('distinguishes a sector winner from a living retreating fleet', () => {
      const defender = new Fleet('defender', [new Ship(ShipType.Interceptor)]);
      const attacker = new Fleet('attacker', [new Ship(ShipType.Cruiser)]);

      const result = new CombatSimulator().simulate([defender, attacker], 1);

      expect(result.lastFleetStanding).toEqual({ defender: 1, attacker: 0 });
      expect(result.survivorDistribution).toEqual([
        {
          probability: 1,
          lastFleetStanding: 'defender',
          survivors: {
            defender: { [ShipType.Interceptor]: 1 },
            attacker: { [ShipType.Cruiser]: 1 },
          },
          destroyedShipsCreditedToFleet: {
            defender: {},
            attacker: {},
          },
        },
      ]);
    });

    test('handles variable outcomes', () => {
      let rollCount = 0;
      const { HIT, MISS } = DICE_VALUES;
      const rolls = [HIT, HIT, MISS, MISS, MISS, MISS];

      const fleetA = new Fleet('Variable', [
        new Ship(
          ShipType.Interceptor,
          {
            hull: 1,
            cannons: { plasma: 2 },
          },
          () => rolls[rollCount++ % rolls.length]
        ),
      ]);
      const fleetB = new Fleet('Consistent', [
        new Ship(
          ShipType.Interceptor,
          {
            hull: 1,
            cannons: { ion: 1 },
          },
          GUARANTEED_HIT
        ),
      ]);

      const simulator = new CombatSimulator();
      const results = simulator.simulate([fleetA, fleetB], 6); // Run 6 simulations to match roll pattern length

      const aWins = results.lastFleetStanding['Variable'] || 0;
      const bWins = results.lastFleetStanding['Consistent'] || 0;

      expect(aWins).toBeGreaterThan(0);
      expect(bWins).toBeGreaterThan(0);
      expect(aWins + bWins).toBeCloseTo(1.0, 1); // One fleet survives per simulation

      const aExpected =
        results.expectedSurvivors['Variable'][ShipType.Interceptor] || 0;
      const bExpected =
        results.expectedSurvivors['Consistent'][ShipType.Interceptor] || 0;
      expect(aExpected).toBeCloseTo(1.0, 1);
      expect(bExpected).toBeCloseTo(1.0, 1);
    });

    test('includes engagement destruction credit in sampled outcomes', () => {
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

      const result = new CombatSimulator().simulate(
        [defender, attacker1, attacker2],
        1
      );

      expect(result.survivorDistribution).toHaveLength(1);
      expect(
        result.survivorDistribution[0].destroyedShipsCreditedToFleet
      ).toEqual({
        defender: {},
        attacker1: { [ShipType.Interceptor]: 2 },
        attacker2: {},
      });
    });

    test('does not mark an untouched fleet as participating after a lower-pair draw', () => {
      const defender = new Fleet('defender', [
        new Ship(ShipType.Dreadnought, {}, GUARANTEED_MISS),
      ]);
      const attacker1 = new Fleet('attacker1', [
        new Ship(ShipType.Interceptor, { hull: 2 }, GUARANTEED_MISS),
      ]);
      const attacker2 = new Fleet('attacker2', [
        new Ship(
          ShipType.Cruiser,
          { rift: 1 },
          // Six: one self-damage and three target-damage, destroying both.
          GUARANTEED_HIT
        ),
      ]);

      const result = new CombatSimulator().simulate(
        [defender, attacker1, attacker2],
        1
      );

      expect(result.survivorDistribution).toHaveLength(1);
      expect(result.survivorDistribution[0].survivors).toEqual({
        defender: { [ShipType.Dreadnought]: 1 },
        attacker1: {},
        attacker2: {},
      });
      expect(
        result.survivorDistribution[0].destroyedShipsCreditedToFleet
      ).toEqual({
        attacker1: { [ShipType.Cruiser]: 1 },
        attacker2: { [ShipType.Interceptor]: 1 },
      });
    });

    test('returns completed samples when a shared deadline is reached', () => {
      let clock = 0;
      const strong = new Fleet('Strong', [
        new Ship(ShipType.Interceptor, { cannons: { ion: 1 } }, GUARANTEED_HIT),
      ]);
      const weak = new Fleet('Weak', [
        new Ship(ShipType.Interceptor, {}, GUARANTEED_MISS),
      ]);

      const results = new CombatSimulator().simulate([weak, strong], 100, {
        deadline: 3,
        deadlineCheckInterval: 1,
        now: () => clock++,
      });

      expect(results.iterations).toBe(3);
      expect(results.lastFleetStanding['Strong']).toBe(1);
      expect(results.drawPercentage).toBe(0);
    });
  });
});
