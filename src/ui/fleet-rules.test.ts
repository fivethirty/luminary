import { describe, expect, test } from 'bun:test';
import { ShipType, type ShipType as ShipTypeValue } from '@calc/ship';
import {
  areShipTypesCompatible,
  factionStructureType,
  incompatibleShipsForType,
  isNpcComposition,
  isShipTypeAllowedForFleet,
  isShipTypeAllowedForRole,
  reconcileFactionStructure,
  sanitizeFleetComposition,
} from './fleet-rules';

describe('fleet composition rules', () => {
  test('allows NPCs and structures only in the defender position', () => {
    expect(isShipTypeAllowedForRole(ShipType.Ancient, true)).toBe(true);
    expect(isShipTypeAllowedForRole(ShipType.Starbase, true)).toBe(true);
    expect(isShipTypeAllowedForRole(ShipType.Ancient, false)).toBe(false);
    expect(isShipTypeAllowedForRole(ShipType.Starbase, false)).toBe(false);
    expect(isShipTypeAllowedForRole(ShipType.Cruiser, false)).toBe(true);
  });

  test('allows only the faction-specific structure when a faction is selected', () => {
    expect(factionStructureType('exiles')).toBe(ShipType.Orbital);
    expect(factionStructureType('terran')).toBe(ShipType.Starbase);
    expect(factionStructureType('')).toBeNull();

    expect(isShipTypeAllowedForFleet(ShipType.Orbital, true, '')).toBe(true);
    expect(isShipTypeAllowedForFleet(ShipType.Starbase, true, '')).toBe(true);
    expect(isShipTypeAllowedForFleet(ShipType.Orbital, true, 'exiles')).toBe(
      true
    );
    expect(isShipTypeAllowedForFleet(ShipType.Starbase, true, 'exiles')).toBe(
      false
    );
    expect(isShipTypeAllowedForFleet(ShipType.Orbital, true, 'terran')).toBe(
      false
    );
    expect(isShipTypeAllowedForFleet(ShipType.Starbase, true, 'terran')).toBe(
      true
    );
  });

  test('does not allow Rho Indi to field dreadnoughts', () => {
    expect(
      isShipTypeAllowedForFleet(ShipType.Dreadnought, false, 'rho-indi')
    ).toBe(false);
    expect(
      isShipTypeAllowedForFleet(ShipType.Dreadnought, true, 'rho-indi')
    ).toBe(false);
    expect(
      isShipTypeAllowedForFleet(ShipType.Dreadnought, false, 'terran')
    ).toBe(true);
  });

  test('reconciles structures to the selected faction blueprint', () => {
    const ships: Array<{
      type: ShipTypeValue;
      quantity: number;
      config: { initiative: number };
    }> = [
      {
        type: ShipType.Starbase,
        quantity: 3,
        config: { initiative: 9 },
      },
    ];

    reconcileFactionStructure(ships, 'exiles', true);
    expect(ships).toEqual([
      {
        type: ShipType.Orbital,
        quantity: 1,
        config: expect.objectContaining({ initiative: 0 }),
      },
    ]);

    reconcileFactionStructure(ships, 'terran', true);
    expect(ships).toEqual([
      {
        type: ShipType.Starbase,
        quantity: 1,
        config: expect.objectContaining({ initiative: 4 }),
      },
    ]);
  });

  test('allows player hulls to mix but only one NPC type', () => {
    expect(areShipTypesCompatible(ShipType.Interceptor, ShipType.Cruiser)).toBe(
      true
    );
    expect(areShipTypesCompatible(ShipType.Ancient, ShipType.Ancient)).toBe(
      true
    );
    expect(areShipTypesCompatible(ShipType.Ancient, ShipType.Guardian)).toBe(
      false
    );
    expect(areShipTypesCompatible(ShipType.Ancient, ShipType.Cruiser)).toBe(
      false
    );
  });

  test('identifies the ships replaced by a newly selected type', () => {
    const ships = [
      { id: 'ancient', type: ShipType.Ancient },
      { id: 'guardian', type: ShipType.Guardian },
    ];
    expect(
      incompatibleShipsForType(ships, ShipType.Guardian).map((ship) => ship.id)
    ).toEqual(['ancient']);
  });

  test('sanitizes in first-valid order after applying role restrictions', () => {
    const attackerShips = [
      { type: ShipType.Ancient },
      { type: ShipType.Starbase },
      { type: ShipType.Cruiser },
      { type: ShipType.Interceptor },
    ];
    expect(
      sanitizeFleetComposition(attackerShips, false).map((ship) => ship.type)
    ).toEqual([ShipType.Cruiser, ShipType.Interceptor]);

    const defenderShips = [
      { type: ShipType.Guardian },
      { type: ShipType.Ancient },
      { type: ShipType.Cruiser },
    ];
    expect(
      sanitizeFleetComposition(defenderShips, true).map((ship) => ship.type)
    ).toEqual([ShipType.Guardian]);
  });

  test('sanitizes faction-invalid structures', () => {
    const structures = [
      { type: ShipType.Starbase },
      { type: ShipType.Orbital },
    ];

    expect(
      sanitizeFleetComposition(structures, true, 'exiles').map(
        (ship) => ship.type
      )
    ).toEqual([ShipType.Orbital]);
    expect(
      sanitizeFleetComposition(structures, true, 'terran').map(
        (ship) => ship.type
      )
    ).toEqual([ShipType.Starbase]);
  });

  test('sanitizes dreadnoughts from Rho Indi fleets', () => {
    const ships = [{ type: ShipType.Dreadnought }, { type: ShipType.Cruiser }];

    expect(
      sanitizeFleetComposition(ships, false, 'rho-indi').map(
        (ship) => ship.type
      )
    ).toEqual([ShipType.Cruiser]);
  });

  test('keeps only the first configuration row for each ship type', () => {
    const first = { id: 'first', type: ShipType.Interceptor };
    const duplicate = { id: 'duplicate', type: ShipType.Interceptor };

    expect(sanitizeFleetComposition([first, duplicate], true)).toEqual([first]);
  });

  test('recognizes only populated all-NPC compositions', () => {
    expect(isNpcComposition([])).toBe(false);
    expect(isNpcComposition([{ type: ShipType.Ancient }])).toBe(true);
    expect(isNpcComposition([{ type: ShipType.Cruiser }])).toBe(false);
  });
});
