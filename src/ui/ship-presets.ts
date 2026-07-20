import { ShipType, type ShipConfig } from '@calc/ship';

// Ship presets shared by the "+ Add ship" dropdown, the defender NPC pills,
// and the URL codec. Battle links can name a preset (e.g. `guardian-wa`) and
// only carry stats that differ from it.
export type ShipDropdownOption =
  | 'interceptor'
  | 'cruiser'
  | 'dreadnought'
  | 'starbase'
  | 'orbital'
  | 'ancient'
  | 'ancient-adv'
  | 'ancient-wa'
  | 'guardian'
  | 'guardian-adv'
  | 'guardian-wa'
  | 'gcds'
  | 'gcds-adv'
  | 'gcds-wa';

export interface ShipVariantData {
  type: ShipType;
  config: Required<ShipConfig>;
}

function createEmptyConfig(initiative: number): Required<ShipConfig> {
  return {
    hull: 0,
    computers: 0,
    shields: 0,
    initiative,
    cannons: { ion: 0, plasma: 0, soliton: 0, antimatter: 0 },
    missiles: { ion: 0, plasma: 0, soliton: 0, antimatter: 0 },
    rift: 0,
    heal: 0,
  };
}

// Base variants (plain `ancient`, `guardian`, `gcds`) must come before their
// -adv/-wa siblings: the URL codec uses the first matching key for a ship type
// as the baseline to diff against.
const SHIP_PRESETS: Record<ShipDropdownOption, ShipVariantData> = {
  interceptor: {
    type: ShipType.Interceptor,
    config: createEmptyConfig(3),
  },
  cruiser: {
    type: ShipType.Cruiser,
    config: createEmptyConfig(2),
  },
  dreadnought: {
    type: ShipType.Dreadnought,
    config: createEmptyConfig(1),
  },
  starbase: {
    type: ShipType.Starbase,
    config: createEmptyConfig(4),
  },
  orbital: {
    type: ShipType.Orbital,
    config: createEmptyConfig(4),
  },
  ancient: {
    type: ShipType.Ancient,
    config: {
      hull: 1,
      computers: 1,
      shields: 0,
      initiative: 2,
      cannons: { ion: 2, plasma: 0, soliton: 0, antimatter: 0 },
      missiles: { ion: 0, plasma: 0, soliton: 0, antimatter: 0 },
      rift: 0,
      heal: 0,
    },
  },
  'ancient-adv': {
    type: ShipType.Ancient,
    config: {
      hull: 2,
      computers: 1,
      shields: 0,
      initiative: 1,
      cannons: { ion: 0, plasma: 1, soliton: 0, antimatter: 0 },
      missiles: { ion: 0, plasma: 0, soliton: 0, antimatter: 0 },
      rift: 0,
      heal: 0,
    },
  },
  'ancient-wa': {
    type: ShipType.Ancient,
    config: {
      hull: 1,
      computers: 2,
      shields: 0,
      initiative: 3,
      cannons: { ion: 1, plasma: 0, soliton: 0, antimatter: 0 },
      missiles: { ion: 0, plasma: 0, soliton: 0, antimatter: 0 },
      rift: 0,
      heal: 0,
    },
  },
  guardian: {
    type: ShipType.Guardian,
    config: {
      hull: 2,
      computers: 2,
      shields: 0,
      initiative: 3,
      cannons: { ion: 3, plasma: 0, soliton: 0, antimatter: 0 },
      missiles: { ion: 0, plasma: 0, soliton: 0, antimatter: 0 },
      rift: 0,
      heal: 0,
    },
  },
  'guardian-adv': {
    type: ShipType.Guardian,
    config: {
      hull: 3,
      computers: 1,
      shields: 0,
      initiative: 1,
      cannons: { ion: 0, plasma: 0, soliton: 0, antimatter: 1 },
      missiles: { ion: 0, plasma: 2, soliton: 0, antimatter: 0 },
      rift: 0,
      heal: 0,
    },
  },
  'guardian-wa': {
    type: ShipType.Guardian,
    config: {
      hull: 3,
      computers: 1,
      shields: 1,
      initiative: 2,
      cannons: { ion: 0, plasma: 2, soliton: 0, antimatter: 0 },
      missiles: { ion: 0, plasma: 0, soliton: 0, antimatter: 0 },
      rift: 0,
      heal: 0,
    },
  },
  gcds: {
    type: ShipType.GCDS,
    config: {
      hull: 7,
      computers: 2,
      shields: 0,
      initiative: 0,
      cannons: { ion: 4, plasma: 0, soliton: 0, antimatter: 0 },
      missiles: { ion: 0, plasma: 0, soliton: 0, antimatter: 0 },
      rift: 0,
      heal: 0,
    },
  },
  'gcds-adv': {
    type: ShipType.GCDS,
    config: {
      hull: 3,
      computers: 2,
      shields: 0,
      initiative: 2,
      cannons: { ion: 0, plasma: 0, soliton: 0, antimatter: 1 },
      missiles: { ion: 4, plasma: 0, soliton: 0, antimatter: 0 },
      rift: 0,
      heal: 0,
    },
  },
  'gcds-wa': {
    type: ShipType.GCDS,
    config: {
      hull: 4,
      computers: 2,
      shields: 2,
      initiative: 3,
      cannons: { ion: 0, plasma: 2, soliton: 0, antimatter: 0 },
      missiles: { ion: 0, plasma: 0, soliton: 0, antimatter: 0 },
      rift: 0,
      heal: 0,
    },
  },
};

export const SHIP_PRESET_KEYS = Object.keys(
  SHIP_PRESETS
) as ShipDropdownOption[];

export function isShipPresetKey(key: string): key is ShipDropdownOption {
  return key in SHIP_PRESETS;
}

// Returns a deep copy so callers can mutate the config freely.
export function getDefaultShipConfig(
  dropdownValue: ShipDropdownOption
): ShipVariantData {
  const preset = SHIP_PRESETS[dropdownValue];
  return {
    type: preset.type,
    config: {
      ...preset.config,
      cannons: { ...preset.config.cannons },
      missiles: { ...preset.config.missiles },
    },
  };
}

export function presetKeysForType(type: ShipType): ShipDropdownOption[] {
  return SHIP_PRESET_KEYS.filter((key) => SHIP_PRESETS[key].type === type);
}

function normalizeConfig(config: Partial<ShipConfig>): Required<ShipConfig> {
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

function configsEqual(
  a: Required<ShipConfig>,
  b: Required<ShipConfig>
): boolean {
  return (
    a.hull === b.hull &&
    a.computers === b.computers &&
    a.shields === b.shields &&
    a.initiative === b.initiative &&
    a.heal === b.heal &&
    a.rift === b.rift &&
    a.cannons.ion === b.cannons.ion &&
    a.cannons.plasma === b.cannons.plasma &&
    a.cannons.soliton === b.cannons.soliton &&
    a.cannons.antimatter === b.cannons.antimatter &&
    a.missiles.ion === b.missiles.ion &&
    a.missiles.plasma === b.missiles.plasma &&
    a.missiles.soliton === b.missiles.soliton &&
    a.missiles.antimatter === b.missiles.antimatter
  );
}

export function matchShipPreset(
  type: ShipType,
  config: Partial<ShipConfig>
): ShipDropdownOption {
  const normalizedConfig = normalizeConfig(config);
  const candidates = presetKeysForType(type);
  return (
    candidates.find((candidate) =>
      configsEqual(
        normalizedConfig,
        normalizeConfig(getDefaultShipConfig(candidate).config)
      )
    ) ?? candidates[0]
  );
}

export const SHIP_QUANTITY_LIMITS: Record<ShipType, number> = {
  [ShipType.Interceptor]: 8,
  [ShipType.Cruiser]: 4,
  [ShipType.Dreadnought]: 2,
  [ShipType.Starbase]: 4,
  [ShipType.Orbital]: 1,
  [ShipType.Ancient]: 2,
  [ShipType.Guardian]: 1,
  [ShipType.GCDS]: 1,
};

// Full ship display names, keyed by preset variant so an NPC's variant shows
// (e.g. "Guardian (WA)"). Mirrors the "+ Ship Type" dropdown labels.
export const SHIP_NAMES: Record<ShipDropdownOption, string> = {
  interceptor: 'Interceptor',
  cruiser: 'Cruiser',
  dreadnought: 'Dreadnought',
  starbase: 'Starbase',
  orbital: 'Orbital',
  ancient: 'Ancient',
  'ancient-adv': 'Ancient (A)',
  'ancient-wa': 'Ancient (WA)',
  guardian: 'Guardian',
  'guardian-adv': 'Guardian (A)',
  'guardian-wa': 'Guardian (WA)',
  gcds: 'GCDS',
  'gcds-adv': 'GCDS (A)',
  'gcds-wa': 'GCDS (WA)',
};

// Short ship names for space-constrained UI (e.g. the recent battles picker on
// mobile). Player hulls get a single letter; NPCs an abbreviated name with the
// same "(A)"/"(WA)" variant tag as the full names.
export const SHIP_ABBREVIATIONS: Record<ShipDropdownOption, string> = {
  interceptor: 'I',
  cruiser: 'C',
  dreadnought: 'D',
  starbase: 'S',
  orbital: 'O',
  ancient: 'Anc',
  'ancient-adv': 'Anc (A)',
  'ancient-wa': 'Anc (WA)',
  guardian: 'Guard',
  'guardian-adv': 'Guard (A)',
  'guardian-wa': 'Guard (WA)',
  gcds: 'GCDS',
  'gcds-adv': 'GCDS (A)',
  'gcds-wa': 'GCDS (WA)',
};
