import { describe, test, expect, beforeEach } from 'bun:test';
import {
  state,
  addFleet,
  addOrSwapShipPreset,
  removeFleet,
  addShipType,
  getCachedShipType,
  makeFleetDefender,
  moveFleet,
  setFleetColor,
  unsetFleetColor,
  setFleetFaction,
  setFleetPlannerType,
  updateShipType,
  removeShipType,
  replaceFleets,
  resetFleets,
  setDetailedOutcomesExpanded,
  setSectorPopulation,
  setSimulationResults,
  onFleetsChanged,
  ensureShipBlueprint,
  findBlueprintPartUse,
  flattenShipBlueprints,
  replaceBlueprintPart,
  setBlueprintMuonSource,
} from './state';
import { monteCarloResults } from './test-helpers';
import { ShipType, type ShipConfig } from '@calc/ship';

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

    test('defaults sector population to two', () => {
      expect(state.sectorPopulation).toBe(2);
    });

    test('defaults detailed outcomes to collapsed', () => {
      expect(state.detailedOutcomesExpanded).toBe(false);
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

    test('chooses an open automatic color when a manual fleet owns the positional default', () => {
      setFleetColor('fleet-1', 'green');

      const newFleet = addFleet();

      expect(newFleet.colorId).toBe('red');
      expect(newFleet.colorIsManual).toBe(false);
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

    test('reassigns automatic colors for fleets that move into earlier positions', () => {
      addFleet();

      removeFleet('fleet-1');

      expect(state.fleets[1].id).toBe('fleet-2');
      expect(state.fleets[1].colorId).toBe('blue');
      expect(state.fleets[1].colorIsManual).toBe(false);
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

    test('rejects defender-only ships in an attacker fleet', () => {
      expect(() => addShipType('fleet-1', ShipType.Ancient)).toThrow(
        'Ancient cannot be fielded by an attacker fleet'
      );
      expect(() => addShipType('fleet-1', ShipType.Starbase)).toThrow(
        'Starbase cannot be fielded by an attacker fleet'
      );
      expect(state.fleets[1].shipTypes).toEqual([]);
    });

    test('rejects structures unavailable to the selected faction', () => {
      setFleetFaction('fleet-0', 'exiles');

      expect(() => addShipType('fleet-0', ShipType.Starbase)).toThrow();
      expect(addOrSwapShipPreset('fleet-0', 'starbase')).toBeNull();
      expect(addOrSwapShipPreset('fleet-0', 'orbital')?.type).toBe(
        ShipType.Orbital
      );
    });

    test('rejects dreadnoughts for Rho Indi fleets', () => {
      setFleetFaction('fleet-1', 'rho-indi');

      expect(() => addShipType('fleet-1', ShipType.Dreadnought)).toThrow();
      expect(addOrSwapShipPreset('fleet-1', 'dreadnought')).toBeNull();
      expect(state.fleets[1].shipTypes).toEqual([]);
    });

    test('swaps a duplicate type in place and enforces its quantity limit', () => {
      const first = addShipType(
        'fleet-0',
        ShipType.Interceptor,
        { hull: 1 },
        2
      );

      const swapped = addShipType(
        'fleet-0',
        ShipType.Interceptor,
        { hull: 3 },
        99
      );

      expect(swapped).toBe(first);
      expect(state.fleets[0].shipTypes).toHaveLength(1);
      expect(swapped.quantity).toBe(8);
      expect(swapped.config).toEqual({ hull: 3 });
    });
  });

  describe('addOrSwapShipPreset', () => {
    test('adds player ships with their operating blueprint', () => {
      const cruiser = addOrSwapShipPreset('fleet-0', 'cruiser')!;

      expect(cruiser.config).toMatchObject({
        hull: 1,
        computers: 1,
        initiative: 2,
        cannons: { ion: 1 },
      });
    });

    test('replaces an incompatible composition with one notification', () => {
      addOrSwapShipPreset('fleet-0', 'cruiser');
      addOrSwapShipPreset('fleet-0', 'interceptor');
      let changes = 0;
      const unsubscribe = onFleetsChanged(() => changes++);

      addOrSwapShipPreset('fleet-0', 'ancient');

      expect(changes).toBe(1);
      expect(state.fleets[0].shipTypes.map((ship) => ship.type)).toEqual([
        ShipType.Ancient,
      ]);
      unsubscribe();
    });

    test('restores a cached single-variant player ship', () => {
      addShipType(
        'fleet-0',
        ShipType.Cruiser,
        { hull: 3, cannons: { plasma: 1 } },
        3
      );
      addOrSwapShipPreset('fleet-0', 'ancient');

      const restored = addOrSwapShipPreset('fleet-0', 'cruiser')!;

      expect(restored.quantity).toBe(3);
      expect(restored.config).toEqual({
        hull: 3,
        cannons: { plasma: 1 },
      });
    });

    test('increments a matching NPC pill and swaps variants in place', () => {
      const ancient = addOrSwapShipPreset('fleet-0', 'ancient')!;
      addOrSwapShipPreset('fleet-0', 'ancient', {
        incrementMatching: true,
      });
      addOrSwapShipPreset('fleet-0', 'ancient-wa', {
        incrementMatching: true,
      });

      expect(state.fleets[0].shipTypes).toHaveLength(1);
      expect(state.fleets[0].shipTypes[0]).toBe(ancient);
      expect(ancient.quantity).toBe(2);
      expect(ancient.config.computers).toBe(2);
      expect(ancient.config.initiative).toBe(3);
      expect(ancient.config.cannons?.ion).toBe(1);
    });

    test('ignores a defender-only preset selected for an attacker', () => {
      expect(addOrSwapShipPreset('fleet-1', 'ancient')).toBeNull();
      expect(state.fleets[1].shipTypes).toEqual([]);
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

    test('preserves identity and type and takes ownership of config updates', () => {
      const ship = addShipType('fleet-0', ShipType.Interceptor);
      const config: Partial<ShipConfig> = {
        hull: 2,
        cannons: { ion: 1 },
      };
      const unsafeUpdates = {
        id: 'replacement-id',
        type: ShipType.Ancient,
        quantity: 3,
        config,
      };

      updateShipType('fleet-0', ship.id, unsafeUpdates);
      config.hull = 9;
      config.cannons!.ion = 9;

      expect(ship.id).not.toBe('replacement-id');
      expect(ship.type).toBe(ShipType.Interceptor);
      expect(ship.quantity).toBe(3);
      expect(ship.config).toEqual({ hull: 2, cannons: { ion: 1 } });
    });
  });

  describe('ship blueprints', () => {
    test('adds a tile-backed ship and derives stats in the same transaction', () => {
      const cruiser = addOrSwapShipPreset('fleet-0', 'cruiser', {
        withBlueprint: true,
      })!;

      expect(cruiser.blueprint?.slots).toEqual([
        'elc',
        'ioc',
        null,
        'nus',
        'hul',
        'nud',
      ]);
      expect(cruiser.config).toMatchObject({
        hull: 1,
        computers: 1,
        initiative: 2,
        cannons: { ion: 1 },
      });
    });

    test('replacing a tile re-derives config and notifies once', () => {
      const ship = addOrSwapShipPreset('fleet-0', 'interceptor', {
        withBlueprint: true,
      })!;
      let changes = 0;
      const unsubscribe = onFleetsChanged(() => changes++);

      expect(replaceBlueprintPart('fleet-0', ship.id, 1, 'anc')).toBe(true);

      expect(changes).toBe(1);
      expect(ship.blueprint?.slots[1]).toBe('anc');
      expect(ship.config.cannons?.ion).toBe(0);
      expect(ship.config.cannons?.antimatter).toBe(1);
      unsubscribe();
    });

    test('does not clear a starting part', () => {
      const ship = addOrSwapShipPreset('fleet-0', 'interceptor', {
        withBlueprint: true,
      })!;

      expect(replaceBlueprintPart('fleet-0', ship.id, 1, null)).toBe(false);
      expect(ship.blueprint?.slots[1]).toBe('ioc');
      expect(replaceBlueprintPart('fleet-0', ship.id, 2, 'anc')).toBe(true);
      expect(replaceBlueprintPart('fleet-0', ship.id, 2, null)).toBe(true);
      expect(ship.blueprint?.slots[2]).toBeNull();
    });

    test('does not install parts in Planta blocked slots', () => {
      setFleetFaction('fleet-0', 'planta');
      const ship = addOrSwapShipPreset('fleet-0', 'interceptor', {
        withBlueprint: true,
      })!;

      expect(ship.blueprint?.slots).toEqual(['nus', 'ioc', 'nud', null]);
      expect(replaceBlueprintPart('fleet-0', ship.id, 3, 'hul')).toBe(false);
      expect(ship.blueprint?.slots[3]).toBeNull();
    });

    test('keeps each discovery and Muon Source unique within a fleet', () => {
      const interceptor = addOrSwapShipPreset('fleet-0', 'interceptor', {
        withBlueprint: true,
      })!;
      const cruiser = addOrSwapShipPreset('fleet-0', 'cruiser', {
        withBlueprint: true,
      })!;
      expect(replaceBlueprintPart('fleet-0', interceptor.id, 2, 'shh')).toBe(
        true
      );
      expect(replaceBlueprintPart('fleet-0', cruiser.id, 2, 'shh')).toBe(false);
      expect(findBlueprintPartUse('fleet-0', 'shh')?.shipId).toBe(
        interceptor.id
      );

      expect(setBlueprintMuonSource('fleet-0', interceptor.id, true)).toBe(
        true
      );
      expect(setBlueprintMuonSource('fleet-0', cruiser.id, true)).toBe(false);
    });

    test('free-form stats flatten one ship while view conversion flattens all', () => {
      const interceptor = addOrSwapShipPreset('fleet-0', 'interceptor', {
        withBlueprint: true,
      })!;
      const cruiser = addOrSwapShipPreset('fleet-0', 'cruiser', {
        withBlueprint: true,
      })!;
      updateShipType('fleet-0', interceptor.id, { config: { hull: 9 } });
      expect(interceptor.blueprint).toBeUndefined();
      expect(cruiser.blueprint).toBeDefined();

      expect(flattenShipBlueprints()).toBe(true);
      expect(cruiser.blueprint).toBeUndefined();
      expect(cruiser.config.computers).toBe(1);
    });

    test('does not guess parts for custom stats unless reset is explicit', () => {
      const ship = addShipType('fleet-0', ShipType.Interceptor, { hull: 8 });
      expect(ensureShipBlueprint('fleet-0', ship.id)).toBe(false);
      expect(ensureShipBlueprint('fleet-0', ship.id, true)).toBe(true);
      expect(ship.blueprint?.slots).toHaveLength(4);
      expect(ship.config.hull).toBe(0);
    });

    test('migrates untouched faction tiles but preserves customized slots', () => {
      const untouched = addOrSwapShipPreset('fleet-0', 'interceptor', {
        withBlueprint: true,
      })!;
      setFleetFaction('fleet-0', 'orion');
      expect(untouched.blueprint?.slots[2]).toBe('gas');
      expect(untouched.config).toMatchObject({ initiative: 4, shields: 1 });

      setFleetFaction('fleet-1', 'terran');
      const custom = addOrSwapShipPreset('fleet-1', 'interceptor', {
        withBlueprint: true,
      })!;
      replaceBlueprintPart('fleet-1', custom.id, 2, 'hul');
      setFleetFaction('fleet-1', 'orion');
      expect(custom.blueprint?.slots[2]).toBe('hul');
      expect(custom.config.hull).toBe(1);
      expect(custom.config.shields).toBe(0);
    });

    test('resets tile geometry when faction conversion changes structure type', () => {
      setFleetFaction('fleet-0', 'terran');
      const structure = addOrSwapShipPreset('fleet-0', 'starbase', {
        withBlueprint: true,
      })!;

      setFleetFaction('fleet-0', 'exiles');

      expect(structure.type).toBe(ShipType.Orbital);
      expect(structure.blueprint?.slots).toEqual(['hul', 'iotexile', 'elc']);
      expect(structure.config).toMatchObject({
        hull: 3,
        computers: 1,
        initiative: 0,
        cannons: { ion: 2 },
      });
    });
  });

  describe('replaceFleets', () => {
    test('deduplicates ship types and owns imported objects', () => {
      const config: Partial<ShipConfig> = {
        hull: 1,
        cannons: { ion: 1 },
      };
      const first = {
        id: 'imported-1',
        type: ShipType.Interceptor,
        quantity: 99,
        config,
      };
      const duplicate = {
        id: 'imported-2',
        type: ShipType.Interceptor,
        quantity: 1,
        config: { hull: 3 },
      };
      const belowLimit = {
        id: 'imported-3',
        type: ShipType.Cruiser,
        quantity: 0,
        config: {},
      };
      const nonFinite = {
        id: 'imported-4',
        type: ShipType.Dreadnought,
        quantity: Number.NaN,
        config: {},
      };
      const fleets = state.fleets.map((fleet, index) => ({
        ...fleet,
        shipTypes: index === 0 ? [first, duplicate, belowLimit, nonFinite] : [],
      }));

      replaceFleets(fleets);
      config.hull = 9;
      config.cannons!.ion = 9;
      first.quantity = 7;
      fleets[0].shipTypes.push(duplicate);

      expect(state.fleets[0].shipTypes).toHaveLength(3);
      expect(state.fleets[0].shipTypes[0]).not.toBe(first);
      expect(state.fleets[0].shipTypes[0]).toEqual({
        id: 'imported-1',
        type: ShipType.Interceptor,
        quantity: 8,
        config: { hull: 1, cannons: { ion: 1 } },
      });
      expect(state.fleets[0].shipTypes.map((ship) => ship.quantity)).toEqual([
        8, 1, 1,
      ]);
    });

    test('reconciles an imported structure with its faction', () => {
      const fleets = state.fleets.map((fleet, index) => ({
        ...fleet,
        factionId: index === 0 ? ('exiles' as const) : fleet.factionId,
        shipTypes:
          index === 0
            ? [
                {
                  id: 'imported-starbase',
                  type: ShipType.Starbase,
                  quantity: 3,
                  config: { initiative: 9 },
                },
              ]
            : [],
      }));

      replaceFleets(fleets);

      expect(state.fleets[0].shipTypes).toEqual([
        expect.objectContaining({
          id: 'imported-starbase',
          type: ShipType.Orbital,
          quantity: 1,
          config: expect.objectContaining({ initiative: 0 }),
        }),
      ]);
    });
  });

  describe('fleet metadata', () => {
    test('updates faction and board color', () => {
      setFleetFaction('fleet-1', 'rho-indi');
      setFleetColor('fleet-1', 'blue');

      expect(state.fleets[1].factionId).toBe('rho-indi');
      expect(state.fleets[1].colorId).toBe('blue');
    });

    test('allows NPC targeting for a player fleet', () => {
      setFleetPlannerType('fleet-1', 'npc');

      expect(state.fleets[1].plannerType).toBe('npc');
    });

    test('migrates an untouched operating blueprint when faction changes', () => {
      const interceptor = addOrSwapShipPreset('fleet-1', 'interceptor')!;

      setFleetFaction('fleet-1', 'orion');

      expect(interceptor.config).toMatchObject({
        shields: 1,
        initiative: 4,
        cannons: { ion: 1 },
      });
    });

    test('switches structures when their faction availability changes', () => {
      const orbital = addOrSwapShipPreset('fleet-0', 'orbital')!;
      expect(orbital.config.initiative).toBe(0);

      setFleetFaction('fleet-0', 'terran');
      expect(state.fleets[0].shipTypes).toEqual([
        expect.objectContaining({
          id: orbital.id,
          type: ShipType.Starbase,
          quantity: 1,
          config: expect.objectContaining({ initiative: 4 }),
        }),
      ]);

      setFleetFaction('fleet-0', 'exiles');
      expect(state.fleets[0].shipTypes).toEqual([
        expect.objectContaining({
          id: orbital.id,
          type: ShipType.Orbital,
          quantity: 1,
          config: expect.objectContaining({ initiative: 0 }),
        }),
      ]);
    });

    test('removes an existing dreadnought when changing to Rho Indi', () => {
      const dreadnought = addOrSwapShipPreset('fleet-1', 'dreadnought')!;
      dreadnought.quantity = 2;
      addOrSwapShipPreset('fleet-1', 'cruiser');

      setFleetFaction('fleet-1', 'rho-indi');

      expect(state.fleets[1].shipTypes.map((ship) => ship.type)).toEqual([
        ShipType.Cruiser,
      ]);
      expect(getCachedShipType('fleet-1', ShipType.Dreadnought)?.quantity).toBe(
        2
      );
    });

    test('migrates an untouched cached blueprint when faction changes', () => {
      const interceptor = addOrSwapShipPreset('fleet-1', 'interceptor')!;
      removeShipType('fleet-1', interceptor.id);

      setFleetFaction('fleet-1', 'orion');
      const restored = addOrSwapShipPreset('fleet-1', 'interceptor')!;

      expect(restored.config).toMatchObject({
        shields: 1,
        initiative: 4,
        cannons: { ion: 1 },
      });
    });

    test('preserves a customized cached blueprint when faction changes', () => {
      const interceptor = addOrSwapShipPreset('fleet-1', 'interceptor')!;
      updateShipType('fleet-1', interceptor.id, {
        config: { ...interceptor.config, hull: 2 },
      });
      removeShipType('fleet-1', interceptor.id);

      setFleetFaction('fleet-1', 'orion');
      const restored = addOrSwapShipPreset('fleet-1', 'interceptor')!;

      expect(restored.config.hull).toBe(2);
      expect(restored.config.shields).toBe(0);
      expect(restored.config.initiative).toBe(3);
    });

    test('preserves a customized blueprint when faction changes', () => {
      const interceptor = addOrSwapShipPreset('fleet-1', 'interceptor')!;
      updateShipType('fleet-1', interceptor.id, {
        config: { ...interceptor.config, hull: 2 },
      });

      setFleetFaction('fleet-1', 'orion');

      expect(interceptor.config.hull).toBe(2);
      expect(interceptor.config.shields).toBe(0);
      expect(interceptor.config.initiative).toBe(3);
    });

    test('swaps board colors when another fleet already uses the selected color', () => {
      setFleetColor('fleet-0', 'green');
      setFleetColor('fleet-1', 'green');

      expect(state.fleets[0].colorId).toBe('blue');
      expect(state.fleets[1].colorId).toBe('green');
    });

    test('automatic colors follow position when fleets are reordered', () => {
      moveFleet('fleet-0', 1);

      expect(state.fleets.map((fleet) => fleet.id)).toEqual([
        'fleet-1',
        'fleet-0',
      ]);
      expect(state.fleets.map((fleet) => fleet.colorId)).toEqual([
        'neutral',
        'blue',
      ]);
      expect(state.fleets.every((fleet) => !fleet.colorIsManual)).toBe(true);
    });

    test('a manually selected color stays with its fleet when reordered', () => {
      setFleetColor('fleet-1', 'green');
      moveFleet('fleet-1', 0);

      expect(state.fleets.map((fleet) => fleet.id)).toEqual([
        'fleet-1',
        'fleet-0',
      ]);
      expect(state.fleets.map((fleet) => fleet.colorId)).toEqual([
        'green',
        'blue',
      ]);
      expect(state.fleets[0].colorIsManual).toBe(true);
      expect(state.fleets[1].colorIsManual).toBe(false);
    });

    test('unsetting a manual color restores the positional color', () => {
      setFleetColor('fleet-1', 'red');
      expect(state.fleets[1].colorIsManual).toBe(true);

      unsetFleetColor('fleet-1');

      expect(state.fleets[1].colorId).toBe('blue');
      expect(state.fleets[1].colorIsManual).toBe(false);
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

  describe('setSectorPopulation', () => {
    test('stores a valid sector population', () => {
      setSectorPopulation(7);

      expect(state.sectorPopulation).toBe(7);
    });

    test('rejects populations outside the modeled damage range', () => {
      expect(() => setSectorPopulation(0)).toThrow();
      expect(() => setSectorPopulation(8)).toThrow();
      expect(() => setSectorPopulation(2.5)).toThrow();
      expect(state.sectorPopulation).toBe(2);
    });
  });

  describe('setDetailedOutcomesExpanded', () => {
    test('remembers the detailed outcomes disclosure state', () => {
      setDetailedOutcomesExpanded(true);

      expect(state.detailedOutcomesExpanded).toBe(true);

      setDetailedOutcomesExpanded(false);

      expect(state.detailedOutcomesExpanded).toBe(false);
    });
  });

  describe('fleet subscriptions', () => {
    test('returns an idempotent disposer', () => {
      let changes = 0;
      const unsubscribe = onFleetsChanged(() => changes++);

      addFleet();
      expect(changes).toBe(1);

      unsubscribe();
      unsubscribe();
      addFleet();
      expect(changes).toBe(1);
    });

    test('a listener can dispose itself without skipping later listeners', () => {
      const calls: string[] = [];
      let unsubscribeFirst = () => {};
      unsubscribeFirst = onFleetsChanged(() => {
        calls.push('first');
        unsubscribeFirst();
      });
      const unsubscribeSecond = onFleetsChanged(() => calls.push('second'));

      addFleet();
      addFleet();

      expect(calls).toEqual(['first', 'second', 'second']);
      unsubscribeSecond();
    });
  });
});
