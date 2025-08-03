import { describe, test, expect, beforeEach } from 'bun:test';
import {
  state,
  addFleet,
  removeFleet,
  addShipType,
  updateShipType,
  removeShipType,
  resetFleets,
  setSimulationResults,
} from './state';
import { ShipType } from '@calc/ship';

describe('State', () => {
  beforeEach(() => {
    resetFleets();
    setSimulationResults(null);
  });

  describe('initial state', () => {
    test('has default fleets', () => {
      expect(state.fleets).toHaveLength(2);
      expect(state.fleets[0].id).toBe('fleet-0');
      expect(state.fleets[0].name).toBe('Defender');
      expect(state.fleets[1].id).toBe('fleet-1');
      expect(state.fleets[1].name).toBe('Attacker');
    });

    test('has no simulation results', () => {
      expect(state.simulationResults).toBeNull();
    });
  });

  describe('addFleet', () => {
    test('adds new fleet to state', () => {
      const newFleet = addFleet();
      expect(state.fleets).toHaveLength(3);
      expect(newFleet.shipTypes).toEqual([]);
      expect(newFleet.name).toBe('');
      expect(newFleet.id).toBe('fleet-2');
    });

    test('returns a newly created fleet', () => {
      const newFleet = addFleet();
      const lastFleet = state.fleets[state.fleets.length - 1];
      expect(newFleet).toBe(lastFleet);
    });
  });

  describe('removeFleet', () => {
    test('removes fleet by id', () => {
      removeFleet('fleet-1');
      expect(state.fleets).toHaveLength(1);
      expect(state.fleets[0].id).toBe('fleet-0');
    });

    test('does nothing if fleet not found', () => {
      removeFleet('non-existent');
      expect(state.fleets).toHaveLength(2);
    });
  });

  describe('addShipType', () => {
    test('adds ship to fleet', () => {
      const newShip = addShipType('fleet-0', ShipType.Interceptor);
      expect(state.fleets[0].shipTypes).toHaveLength(1);
      expect(newShip.type).toBe(ShipType.Interceptor);
      expect(newShip.quantity).toBe(1);
      expect(newShip.config).toEqual({});
    });

    test('generates unique ship id', () => {
      const ship1 = addShipType('fleet-0', ShipType.Interceptor);
      const ship2 = addShipType('fleet-0', ShipType.Cruiser);

      expect(ship1.id).not.toBe(ship2.id);
    });
  });

  describe('updateShipType', () => {
    test('updates ship properties', () => {
      const ship = addShipType('fleet-0', ShipType.Interceptor);

      updateShipType('fleet-0', ship.id, {
        quantity: 5,
        config: { hull: 2 },
      });

      expect(ship.quantity).toBe(5);
      expect(ship.config).toEqual({ hull: 2 });
    });
  });

  describe('removeShipType', () => {
    test('removes ship from fleet', () => {
      const ship = addShipType('fleet-0', ShipType.Interceptor);

      removeShipType('fleet-0', ship.id);

      expect(state.fleets[0].shipTypes).toHaveLength(0);
    });
  });

  describe('resetFleets', () => {
    test('resets to default fleets', () => {
      addFleet();
      addShipType('fleet-0', ShipType.Interceptor);

      resetFleets();

      expect(state.fleets).toHaveLength(2);
      expect(state.fleets[0].shipTypes).toHaveLength(0);
      expect(state.fleets[1].shipTypes).toHaveLength(0);
    });

    test('creates new fleet objects', () => {
      const originalDefender = state.fleets[0];

      resetFleets();

      expect(state.fleets[0]).not.toBe(originalDefender);
      expect(state.fleets[0].id).toBe('fleet-0');
    });
  });

  describe('setSimulationResults', () => {
    test('sets simulation results', () => {
      const results = {
        victoryProbability: { Defender: 0.6, Attacker: 0.4 },
        drawProbability: 0,
        expectedSurvivors: {},
      };

      setSimulationResults(results);

      expect(state.simulationResults).toBe(results);
    });

    test('can set results to null', () => {
      setSimulationResults({
        victoryProbability: {},
        drawProbability: 0,
        expectedSurvivors: {},
      });

      setSimulationResults(null);

      expect(state.simulationResults).toBeNull();
    });
  });
});
