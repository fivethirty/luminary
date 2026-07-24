import {
  isPlayerShipType,
  ShipType,
  type ShipConfig,
  type ShipType as ShipTypeValue,
} from '@calc/ship';
import type { FactionId } from '@ui/fleet-metadata';
import {
  getStartingShipConfig,
  presetKeysForType,
  SHIP_QUANTITY_LIMITS,
} from '@ui/ship-presets';

interface FleetShip {
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

export function factionStructureType(
  factionId: FactionId | undefined
): ShipTypeValue | null {
  if (!factionId) return null;
  return factionId === 'exiles' ? ShipType.Orbital : ShipType.Starbase;
}

export function isShipTypeAllowedForFleet(
  type: ShipTypeValue,
  isDefender: boolean,
  factionId: FactionId | undefined
): boolean {
  if (!isShipTypeAllowedForRole(type, isDefender)) return false;
  if (factionId === 'rho-indi' && type === ShipType.Dreadnought) return false;

  const allowedStructure = factionStructureType(factionId);
  if (
    !allowedStructure ||
    (type !== ShipType.Starbase && type !== ShipType.Orbital)
  ) {
    return true;
  }
  return type === allowedStructure;
}

interface ConfiguredFleetShip extends FleetShip {
  quantity: number;
  config: Partial<ShipConfig>;
}

export function reconcileFactionStructure<T extends ConfiguredFleetShip>(
  ships: T[],
  factionId: FactionId | undefined,
  isDefender: boolean
): T[] {
  const allowedType = isDefender ? factionStructureType(factionId) : null;
  if (!allowedType) return ships;

  const invalidType =
    allowedType === ShipType.Orbital ? ShipType.Starbase : ShipType.Orbital;
  const invalidShip: ConfiguredFleetShip | undefined = ships.find(
    (ship) => ship.type === invalidType
  );
  if (!invalidShip) return ships;

  const allowedShip: ConfiguredFleetShip | undefined = ships.find(
    (ship) => ship.type === allowedType
  );
  if (allowedShip) {
    allowedShip.quantity = Math.min(
      allowedShip.quantity + invalidShip.quantity,
      SHIP_QUANTITY_LIMITS[allowedType]
    );
    return ships.filter((ship) => ship !== invalidShip);
  }

  invalidShip.type = allowedType;
  invalidShip.quantity = Math.min(
    invalidShip.quantity,
    SHIP_QUANTITY_LIMITS[allowedType]
  );
  const preset = presetKeysForType(allowedType)[0];
  if (preset) {
    invalidShip.config = getStartingShipConfig(preset, factionId).config;
  }
  return ships;
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
  isDefender: boolean,
  factionId?: FactionId
): T[] {
  const roleAllowed = ships.filter((ship) =>
    isShipTypeAllowedForFleet(ship.type, isDefender, factionId)
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
