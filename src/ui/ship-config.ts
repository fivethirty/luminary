import type { ShipConfig, WeaponType } from '@calc/ship';

const WEAPON_TYPES: readonly WeaponType[] = [
  'ion',
  'plasma',
  'soliton',
  'antimatter',
];

/** Returns a combat config with every optional value materialized. */
export function normalizeShipConfig(
  config: Partial<ShipConfig>
): Required<ShipConfig> {
  return {
    hull: config.hull ?? 0,
    computers: config.computers ?? 0,
    shields: config.shields ?? 0,
    initiative: config.initiative ?? 0,
    heal: config.heal ?? 0,
    rift: config.rift ?? 0,
    cannons: {
      ion: 0,
      plasma: 0,
      soliton: 0,
      antimatter: 0,
      ...config.cannons,
    },
    missiles: {
      ion: 0,
      plasma: 0,
      soliton: 0,
      antimatter: 0,
      ...config.missiles,
    },
  };
}

/** Deep-clones the nested weapon maps while preserving omitted config fields. */
export function cloneShipConfig<T extends Partial<ShipConfig>>(config: T): T {
  const clone = { ...config };
  if (config.cannons) clone.cannons = { ...config.cannons };
  if (config.missiles) clone.missiles = { ...config.missiles };
  return clone;
}

/** Compares combat behavior, treating omitted numeric values as zero. */
export function shipConfigsEqual(
  a: Partial<ShipConfig>,
  b: Partial<ShipConfig>
): boolean {
  const left = normalizeShipConfig(a);
  const right = normalizeShipConfig(b);

  return (
    left.hull === right.hull &&
    left.computers === right.computers &&
    left.shields === right.shields &&
    left.initiative === right.initiative &&
    left.heal === right.heal &&
    left.rift === right.rift &&
    WEAPON_TYPES.every(
      (weapon) =>
        left.cannons[weapon] === right.cannons[weapon] &&
        left.missiles[weapon] === right.missiles[weapon]
    )
  );
}
