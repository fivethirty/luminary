import { describe, expect, test } from 'bun:test';
import { CombatSimulator } from './combat-simulator';
import { Fleet } from './fleet';
import { Ship, ShipType } from './ship';

describe('CombatSimulator', () => {
  describe('simulate', () => {
    test('tracks last fleet standing percentages', () => {
      const fleetA = new Fleet('Strong', [
        new Ship(
          ShipType.Dreadnaught,
          {
            hull: 5,
            cannons: { plasma: 3 },
          },
          () => 6
        ),
      ]);
      const fleetB = new Fleet('Medium', [
        new Ship(ShipType.Interceptor, { hull: 1 }, () => 1),
      ]);
      const fleetC = new Fleet('Weak', [
        new Ship(ShipType.Interceptor, {}, () => 1),
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
        new Ship(ShipType.Interceptor, { cannons: { ion: 1 } }, () => 6),
        new Ship(
          ShipType.Carrier,
          { hull: 2, cannons: { plasma: 2 } },
          () => 6
        ),
        new Ship(
          ShipType.Dreadnaught,
          { hull: 3, cannons: { antimatter: 2 } },
          () => 6
        ),
      ]);
      const fleetB = new Fleet('Weak', [
        new Ship(ShipType.Interceptor, {}, () => 1),
      ]);

      const simulator = new CombatSimulator();
      const results = simulator.simulate([fleetA, fleetB], 100);

      expect(results.lastFleetStanding['Mixed']).toBeCloseTo(1.0);
      expect(results.lastFleetStanding['Weak']).toBeCloseTo(0.0);

      expect(
        results.expectedSurvivors['Mixed'][ShipType.Interceptor]
      ).toBeCloseTo(1.0);
      expect(results.expectedSurvivors['Mixed'][ShipType.Carrier]).toBeCloseTo(
        1.0
      );
      expect(
        results.expectedSurvivors['Mixed'][ShipType.Dreadnaught]
      ).toBeCloseTo(1.0);

      expect(results.expectedSurvivors['Weak'][ShipType.Interceptor] || 0).toBe(
        0
      );
    });

    test('handles draws correctly', () => {
      const fleetA = new Fleet('Rift A', [
        new Ship(ShipType.Carrier, { hull: 0, rift: 1 }, () => 6),
      ]);
      const fleetB = new Fleet('Rift B', [
        new Ship(ShipType.Interceptor, { hull: 2 }, () => 1),
      ]);
      const fleetC = new Fleet('Survivor', [
        new Ship(ShipType.Interceptor, { cannons: { ion: 1 } }, () => 6),
      ]);

      const simulator = new CombatSimulator();
      const results = simulator.simulate([fleetA, fleetB, fleetC], 100);

      expect(results.lastFleetStanding['Rift A']).toBeCloseTo(0.0);
      expect(results.lastFleetStanding['Rift B']).toBeCloseTo(0.0);

      expect(results.lastFleetStanding['Survivor']).toBeCloseTo(1.0);
      expect(
        results.expectedSurvivors['Survivor'][ShipType.Interceptor]
      ).toBeCloseTo(1.0);
    });

    test('handles variable outcomes', () => {
      let rollCount = 0;
      const rolls = [6, 6, 1, 1, 1, 1];

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
          () => 6
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
  });
});
