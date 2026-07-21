import {
  isPlayerShipType,
  ShipType,
  type ShipType as ShipTypeValue,
} from '@calc/ship';

export interface FleetShip {
  type: ShipTypeValue;
}

export function isNpcComposition(ships: readonly FleetShip[]): boolean {
  return (
    ships.length > 0 && ships.every((ship) => !isPlayerShipType(ship.type))
  );
}

/** NPC ships and player structures may only occupy the defender position. */
export function isShipTypeAllowedForRole(
  type: ShipTypeValue,
  isDefender: boolean
): boolean {
  return (
    isDefender ||
    (isPlayerShipType(type) &&
      type !== ShipType.Starbase &&
      type !== ShipType.Orbital)
  );
}

/** Player hulls may mix; an NPC fleet may contain only one NPC ship type. */
export function areShipTypesCompatible(
  existingType: ShipTypeValue,
  addedType: ShipTypeValue
): boolean {
  const existingIsPlayer = isPlayerShipType(existingType);
  const addedIsPlayer = isPlayerShipType(addedType);
  return (
    existingIsPlayer === addedIsPlayer &&
    (addedIsPlayer || existingType === addedType)
  );
}

export function incompatibleShipsForType<T extends FleetShip>(
  ships: readonly T[],
  addedType: ShipTypeValue
): T[] {
  return ships.filter((ship) => !areShipTypesCompatible(ship.type, addedType));
}

/**
 * Returns the legal first-valid composition for a fleet. Input order matters:
 * after role-invalid ships are removed, the first remaining type determines
 * whether the fleet is a player fleet or which single NPC type it contains;
 * the first row for each ship type owns that type's one fleet configuration.
 */
export function sanitizeFleetComposition<T extends FleetShip>(
  ships: readonly T[],
  isDefender: boolean
): T[] {
  const roleAllowed = ships.filter((ship) =>
    isShipTypeAllowedForRole(ship.type, isDefender)
  );
  const first = roleAllowed[0];
  if (!first) return [];
  const seenTypes = new Set<ShipTypeValue>();
  return roleAllowed.filter((ship) => {
    if (!areShipTypesCompatible(first.type, ship.type)) return false;
    if (seenTypes.has(ship.type)) return false;
    seenTypes.add(ship.type);
    return true;
  });
}
