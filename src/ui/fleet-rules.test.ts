import { describe, expect, test } from 'bun:test';
import { ShipType } from '@calc/ship';
import {
  areShipTypesCompatible,
  incompatibleShipsForType,
  isNpcComposition,
  isShipTypeAllowedForRole,
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
