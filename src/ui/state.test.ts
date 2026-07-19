import { describe, test, expect, beforeEach } from 'bun:test';
import {
  state,
  addFleet,
  removeFleet,
  addShipType,
  getCachedShipType,
  makeFleetDefender,
  moveFleet,
  setFleetColor,
  setFleetFaction,
  updateShipType,
  removeShipType,
  resetFleets,
  setSimulationResults,
} from './state';
import { monteCarloResults } from './test-helpers';
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
      expect(state.fleets[0].plannerType).toBe('optimal');
      expect(state.fleets[0].factionId).toBe('');
      expect(state.fleets[0].colorId).toBe('neutral');
      expect(state.fleets[1].id).toBe('fleet-1');
      expect(state.fleets[1].name).toBe('Attacker');
      expect(state.fleets[1].plannerType).toBe('optimal');
      expect(state.fleets[1].colorId).toBe('blue');
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
      expect(newFleet.plannerType).toBe('optimal');
      expect(newFleet.colorId).toBe('green');
    });

    test('caps fleets at six players plus neutrals', () => {
      addFleet();
      addFleet();
      addFleet();
      addFleet();
      addFleet();

      expect(state.fleets).toHaveLength(7);
      expect(() => addFleet()).toThrow('At most 7 fleets are supported');
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

  describe('fleet metadata', () => {
    test('updates faction and board color', () => {
      setFleetFaction('fleet-1', 'rho-indi');
      setFleetColor('fleet-1', 'blue');

      expect(state.fleets[1].factionId).toBe('rho-indi');
      expect(state.fleets[1].colorId).toBe('blue');
    });

    test('swaps board colors when another fleet already uses the selected color', () => {
      setFleetColor('fleet-0', 'green');
      setFleetColor('fleet-1', 'green');

      expect(state.fleets[0].colorId).toBe('blue');
      expect(state.fleets[1].colorId).toBe('green');
    });

    test('sets the defender to neutral while it is an NPC fleet', () => {
      const ancient = addShipType('fleet-0', ShipType.Ancient);

      expect(state.fleets[0].colorId).toBe('neutral');

      removeShipType('fleet-0', ancient.id);

      expect(state.fleets[0].colorId).toBe('neutral');
    });

    test('restores the defender player color after temporary NPC ships', () => {
      setFleetFaction('fleet-0', 'terran');
      setFleetColor('fleet-0', 'blue');

      const ancient = addShipType('fleet-0', ShipType.Ancient);
      expect(state.fleets[0].factionId).toBe('terran');
      expect(state.fleets[0].colorId).toBe('neutral');

      removeShipType('fleet-0', ancient.id);
      addShipType('fleet-0', ShipType.Interceptor);

      expect(state.fleets[0].factionId).toBe('terran');
      expect(state.fleets[0].colorId).toBe('blue');
    });

    test('restores neutral NPC color when the fleet moves out of defender', () => {
      setFleetColor('fleet-0', 'blue');
      addShipType('fleet-0', ShipType.Ancient);

      expect(state.fleets[0].colorId).toBe('neutral');

      moveFleet('fleet-0', 1);

      expect(state.fleets[0].id).toBe('fleet-1');
      expect(state.fleets[1].id).toBe('fleet-0');
      expect(state.fleets[1].shipTypes).toHaveLength(0);
      expect(state.fleets[1].colorId).toBe('blue');
    });

    test('making a fleet defender prunes defender-only ships from attackers', () => {
      addShipType('fleet-0', ShipType.Ancient);
      addShipType('fleet-1', ShipType.Cruiser);

      makeFleetDefender('fleet-1');

      expect(state.fleets[0].id).toBe('fleet-1');
      expect(state.fleets[1].id).toBe('fleet-0');
      expect(state.fleets[1].shipTypes).toHaveLength(0);
    });
  });

  describe('removeShipType', () => {
    test('removes ship from fleet', () => {
      const ship = addShipType('fleet-0', ShipType.Interceptor);

      removeShipType('fleet-0', ship.id);

      expect(state.fleets[0].shipTypes).toHaveLength(0);
    });

    test('caches the removed ship configuration for the fleet', () => {
      const ship = addShipType(
        'fleet-0',
        ShipType.Dreadnought,
        { hull: 3, cannons: { plasma: 1 } },
        2
      );

      removeShipType('fleet-0', ship.id);

      expect(getCachedShipType('fleet-0', ShipType.Dreadnought)).toEqual({
        quantity: 2,
        config: { hull: 3, cannons: { plasma: 1 } },
      });
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
      const results = monteCarloResults({
        victoryProbability: { Defender: 0.6, Attacker: 0.4 },
        timeTaken: 0,
      });

      setSimulationResults(results);

      expect(state.simulationResults).toBe(results);
    });

    test('can set results to null', () => {
      setSimulationResults(
        monteCarloResults({
          victoryProbability: {},
        })
      );

      setSimulationResults(null);

      expect(state.simulationResults).toBeNull();
    });
  });
});
