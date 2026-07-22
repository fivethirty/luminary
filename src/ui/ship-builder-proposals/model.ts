export type PartTier = 'standard' | 'technology' | 'discovery';

export type PartCategory =
  | 'cannon'
  | 'missile'
  | 'computer'
  | 'shield'
  | 'hull'
  | 'drive'
  | 'source';

export type DieColor = 'yellow' | 'orange' | 'blue' | 'red' | 'pink';

export interface PartStats {
  movement?: number;
  initiative?: number;
  energyUse?: number;
  energySource?: number;
  computer?: number;
  shield?: number;
  cannons?: DieColor[];
  missiles?: DieColor[];
  hull?: number;
  repair?: number;
  external?: boolean;
}

export interface ShipPart extends PartStats {
  id: string;
  name: string;
  tier: PartTier;
  category: PartCategory;
}

function definePart(
  id: string,
  name: string,
  tier: PartTier,
  category: PartCategory,
  stats: PartStats = {}
): ShipPart {
  return { id, name, tier, category, ...stats };
}

// Curated from AsyncEclipse/DiscordBot's data/parts.json. The two community
// balance variants are intentionally omitted. Nuclear Drive is basic per its
// description, and the undocumented Nonlinear Drive is the eighteenth
// discovery part, matching the physical inventory described for this study.
export const SHIP_PARTS: readonly ShipPart[] = [
  definePart('ioc', 'Ion Cannon', 'standard', 'cannon', {
    energyUse: 1,
    cannons: ['yellow'],
  }),
  definePart('elc', 'Electron Computer', 'standard', 'computer', {
    computer: 1,
  }),
  definePart('nud', 'Nuclear Drive', 'standard', 'drive', {
    movement: 1,
    initiative: 1,
    energyUse: 1,
  }),
  definePart('hul', 'Hull', 'standard', 'hull', { hull: 1 }),
  definePart('nus', 'Nuclear Source', 'standard', 'source', {
    energySource: 3,
  }),

  definePart('anc', 'Antimatter Cannon', 'technology', 'cannon', {
    energyUse: 4,
    cannons: ['red'],
  }),
  definePart('plc', 'Plasma Cannon', 'technology', 'cannon', {
    energyUse: 2,
    cannons: ['orange'],
  }),
  definePart('rican', 'Rift Cannon', 'technology', 'cannon', {
    energyUse: 2,
    cannons: ['pink'],
  }),
  definePart('socan', 'Soliton Cannon', 'technology', 'cannon', {
    energyUse: 3,
    cannons: ['blue'],
  }),
  definePart('poc', 'Positron Computer', 'technology', 'computer', {
    computer: 2,
    energyUse: 1,
  }),
  definePart('glc', 'Gluon Computer', 'technology', 'computer', {
    computer: 3,
    energyUse: 2,
  }),
  definePart('fud', 'Fusion Drive', 'technology', 'drive', {
    movement: 2,
    initiative: 2,
    energyUse: 2,
  }),
  definePart('tad', 'Tachyon Drive', 'technology', 'drive', {
    movement: 3,
    initiative: 3,
    energyUse: 3,
  }),
  definePart('trd', 'Transition Drive', 'technology', 'drive', {
    movement: 3,
  }),
  definePart('cof', 'Conifold Field', 'technology', 'hull', {
    hull: 3,
    energyUse: 2,
  }),
  definePart('imh', 'Improved Hull', 'technology', 'hull', { hull: 2 }),
  definePart('seh', 'Sentient Hull', 'technology', 'hull', {
    hull: 1,
    computer: 1,
  }),
  definePart('flm', 'Flux Missile', 'technology', 'missile', {
    initiative: 1,
    missiles: ['yellow', 'yellow'],
  }),
  definePart('plm', 'Plasma Missile', 'technology', 'missile', {
    energyUse: 1,
    missiles: ['orange', 'orange'],
  }),
  definePart('abs', 'Absorption Shield', 'technology', 'shield', {
    shield: 1,
    energySource: 4,
  }),
  definePart('gas', 'Gauss Shield', 'technology', 'shield', { shield: 1 }),
  definePart('phs', 'Phase Shield', 'technology', 'shield', {
    shield: 2,
    energyUse: 1,
  }),
  definePart('fus', 'Fusion Source', 'technology', 'source', {
    energySource: 6,
  }),
  definePart('tas', 'Tachyon Source', 'technology', 'source', {
    energySource: 9,
  }),
  definePart('zes', 'Zero Point Source', 'technology', 'source', {
    energySource: 12,
  }),

  definePart('nod', 'Nonlinear Drive', 'discovery', 'drive', {
    movement: 2,
    energySource: 2,
  }),
  definePart('axc', 'Axion Computer', 'discovery', 'computer', {
    computer: 2,
    initiative: 1,
  }),
  definePart('socha', 'Soliton Charger', 'discovery', 'cannon', {
    energyUse: 1,
    cannons: ['blue'],
  }),
  definePart('iod', 'Ion Disruptor', 'discovery', 'cannon', {
    initiative: 3,
    cannons: ['yellow'],
  }),
  definePart('cod', 'Conformal Drive', 'discovery', 'drive', {
    movement: 4,
    initiative: 2,
    energyUse: 2,
  }),
  definePart('jud', 'Jump Drive', 'discovery', 'drive', {
    movement: 1,
    energyUse: 2,
  }),
  definePart('shh', 'Shard Hull', 'discovery', 'hull', { hull: 3 }),
  definePart('mos', 'Morph Shield', 'discovery', 'shield', {
    shield: 1,
    repair: 1,
    initiative: 1,
  }),
  definePart('iot', 'Ion Turret', 'discovery', 'cannon', {
    cannons: ['yellow', 'yellow'],
  }),
  definePart('anm', 'Antimatter Missile', 'discovery', 'missile', {
    missiles: ['red'],
  }),
  definePart('iom', 'Ion Missile', 'discovery', 'missile', {
    missiles: ['yellow', 'yellow', 'yellow'],
  }),
  definePart('som', 'Soliton Missile', 'discovery', 'missile', {
    initiative: 1,
    missiles: ['blue'],
  }),
  definePart('ricon', 'Rift Conductor', 'discovery', 'cannon', {
    energyUse: 1,
    hull: 1,
    cannons: ['pink'],
  }),
  definePart('fls', 'Flux Shield', 'discovery', 'shield', {
    shield: 3,
    initiative: 1,
    energyUse: 2,
  }),
  definePart('ins', 'Inversion Shield', 'discovery', 'shield', {
    shield: 2,
    energySource: 2,
  }),
  definePart('hyg', 'Hypergrid Source', 'discovery', 'source', {
    energySource: 11,
  }),
  definePart('mus', 'Muon Source', 'discovery', 'source', {
    initiative: 1,
    energySource: 2,
    external: true,
  }),
  definePart('plt', 'Plasma Turret', 'discovery', 'cannon', {
    energyUse: 3,
    cannons: ['orange', 'orange'],
  }),
];

export const PART_BY_ID = new Map(SHIP_PARTS.map((part) => [part.id, part]));

export const PART_CATEGORIES: readonly PartCategory[] = [
  'cannon',
  'missile',
  'computer',
  'shield',
  'hull',
  'drive',
  'source',
];

export type ShipKind =
  | 'interceptor'
  | 'cruiser'
  | 'dreadnought'
  | 'starbase'
  | 'orbital';

export interface ShipDefinition {
  id: ShipKind;
  name: string;
  shortName: string;
  slots: number;
  baseInitiative: number;
}

export const SHIP_DEFINITIONS: Record<ShipKind, ShipDefinition> = {
  interceptor: {
    id: 'interceptor',
    name: 'Interceptor',
    shortName: 'I',
    slots: 4,
    baseInitiative: 3,
  },
  cruiser: {
    id: 'cruiser',
    name: 'Cruiser',
    shortName: 'C',
    slots: 6,
    baseInitiative: 2,
  },
  dreadnought: {
    id: 'dreadnought',
    name: 'Dreadnought',
    shortName: 'D',
    slots: 8,
    baseInitiative: 1,
  },
  starbase: {
    id: 'starbase',
    name: 'Starbase',
    shortName: 'S',
    slots: 5,
    baseInitiative: 4,
  },
  orbital: {
    id: 'orbital',
    name: 'Orbital',
    shortName: 'O',
    slots: 3,
    baseInitiative: 0,
  },
};

export const SHIP_KINDS = Object.keys(SHIP_DEFINITIONS) as ShipKind[];

export type FactionId = 'generic' | 'planta' | 'orion' | 'rho-indi' | 'exiles';

export interface FactionDefinition {
  id: FactionId;
  name: string;
  unavailableShips?: ShipKind[];
}

export const FACTIONS: readonly FactionDefinition[] = [
  { id: 'generic', name: 'Hydran Progress · generic' },
  { id: 'planta', name: 'Planta' },
  { id: 'orion', name: 'Orion Hegemony' },
  {
    id: 'rho-indi',
    name: 'Rho Indi Syndicate',
    unavailableShips: ['dreadnought'],
  },
  { id: 'exiles', name: 'The Exiles', unavailableShips: ['starbase'] },
];

export interface FixedBonus {
  label: string;
  kind: 'initiative' | 'computer' | 'shield';
  value: number;
}

export function fixedBonuses(
  factionId: FactionId,
  ship: ShipKind
): FixedBonus[] {
  if (factionId === 'rho-indi') {
    return [{ label: '−1 shield', kind: 'shield', value: 1 }];
  }
  if (factionId === 'orion') {
    return [
      { label: '−1 shield', kind: 'shield', value: 1 },
      { label: '+1 initiative', kind: 'initiative', value: 1 },
    ];
  }
  if (factionId === 'planta') {
    if (ship === 'interceptor') {
      return [
        { label: '+1 computer', kind: 'computer', value: 1 },
        { label: '−2 initiative', kind: 'initiative', value: -2 },
      ];
    }
    if (ship === 'cruiser') {
      return [{ label: '−1 initiative', kind: 'initiative', value: -1 }];
    }
    if (ship === 'starbase') {
      return [
        { label: '+1 computer', kind: 'computer', value: 1 },
        { label: '−2 initiative', kind: 'initiative', value: -2 },
      ];
    }
  }
  if (factionId === 'exiles' && ship !== 'orbital') {
    return [{ label: '+1 computer', kind: 'computer', value: 1 }];
  }
  return [];
}

export function isShipAvailable(factionId: FactionId, ship: ShipKind): boolean {
  const faction = FACTIONS.find((entry) => entry.id === factionId);
  return !faction?.unavailableShips?.includes(ship);
}

export interface BlueprintState {
  slots: Array<string | null>;
  externalPart: string | null;
}

export interface BuilderState {
  factionId: FactionId;
  unlockedTech: Set<string>;
  blueprints: Record<ShipKind, BlueprintState>;
}

const STARTING_BLUEPRINTS: Record<ShipKind, Array<string | null>> = {
  interceptor: ['nus', 'ioc', 'nud', null],
  cruiser: ['elc', 'nus', 'ioc', 'hul', 'nud', null],
  dreadnought: ['elc', 'nus', 'ioc', 'ioc', 'hul', 'hul', 'nud', null],
  starbase: ['elc', 'nus', 'ioc', 'hul', 'hul'],
  orbital: ['nus', 'ioc', 'hul'],
};

export function createBuilderState(): BuilderState {
  return {
    factionId: 'generic',
    unlockedTech: new Set(['plc', 'poc', 'fud', 'imh', 'gas']),
    blueprints: Object.fromEntries(
      SHIP_KINDS.map((ship) => [
        ship,
        { slots: [...STARTING_BLUEPRINTS[ship]], externalPart: null },
      ])
    ) as Record<ShipKind, BlueprintState>,
  };
}

export type PlacementTarget = number | 'external';

export interface DiscoveryUse {
  ship: ShipKind;
  target: PlacementTarget;
}

export function findDiscoveryUse(
  state: BuilderState,
  partId: string
): DiscoveryUse | null {
  for (const ship of SHIP_KINDS) {
    const blueprint = state.blueprints[ship];
    const slot = blueprint.slots.indexOf(partId);
    if (slot >= 0) return { ship, target: slot };
    if (blueprint.externalPart === partId) return { ship, target: 'external' };
  }
  return null;
}

export interface PlacementCheck {
  allowed: boolean;
  reason?: string;
}

export function canPlacePart(
  state: BuilderState,
  ship: ShipKind,
  target: PlacementTarget,
  partId: string
): PlacementCheck {
  const part = PART_BY_ID.get(partId);
  if (!part) return { allowed: false, reason: 'Unknown part' };
  if (!isShipAvailable(state.factionId, ship)) {
    return { allowed: false, reason: 'Ship unavailable to this faction' };
  }
  if ((target === 'external') !== Boolean(part.external)) {
    return {
      allowed: false,
      reason: part.external
        ? 'Muon Source uses the external socket'
        : 'This part must occupy a blueprint slot',
    };
  }
  if (part.tier === 'technology' && !state.unlockedTech.has(part.id)) {
    return { allowed: false, reason: 'Technology not unlocked' };
  }
  if (part.tier === 'discovery') {
    const use = findDiscoveryUse(state, part.id);
    if (use && (use.ship !== ship || use.target !== target)) {
      return {
        allowed: false,
        reason: `Already installed on ${SHIP_DEFINITIONS[use.ship].name}`,
      };
    }
  }
  return { allowed: true };
}

export function placePart(
  state: BuilderState,
  ship: ShipKind,
  target: PlacementTarget,
  partId: string | null
): PlacementCheck {
  const blueprint = state.blueprints[ship];
  if (
    target !== 'external' &&
    (target < 0 || target >= blueprint.slots.length)
  ) {
    return { allowed: false, reason: 'Unknown slot' };
  }
  if (partId === null) {
    if (target === 'external') blueprint.externalPart = null;
    else blueprint.slots[target] = null;
    return { allowed: true };
  }
  const check = canPlacePart(state, ship, target, partId);
  if (!check.allowed) return check;
  if (target === 'external') blueprint.externalPart = partId;
  else blueprint.slots[target] = partId;
  return { allowed: true };
}

export interface BlueprintStats {
  energySource: number;
  energyUse: number;
  energyBalance: number;
  movement: number;
  initiative: number;
  computer: number;
  shield: number;
  hull: number;
  repair: number;
  cannons: Record<DieColor, number>;
  missiles: Record<DieColor, number>;
}

function emptyDice(): Record<DieColor, number> {
  return { yellow: 0, orange: 0, blue: 0, red: 0, pink: 0 };
}

export function calculateBlueprintStats(
  state: BuilderState,
  ship: ShipKind
): BlueprintStats {
  const result: BlueprintStats = {
    energySource: 0,
    energyUse: 0,
    energyBalance: 0,
    movement: 0,
    initiative: SHIP_DEFINITIONS[ship].baseInitiative,
    computer: 0,
    shield: 0,
    hull: 0,
    repair: 0,
    cannons: emptyDice(),
    missiles: emptyDice(),
  };
  const blueprint = state.blueprints[ship];
  const installed = [...blueprint.slots, blueprint.externalPart]
    .map((partId) => (partId ? PART_BY_ID.get(partId) : undefined))
    .filter((part): part is ShipPart => Boolean(part));
  for (const part of installed) {
    result.energySource += part.energySource ?? 0;
    result.energyUse += part.energyUse ?? 0;
    result.movement = Math.max(result.movement, part.movement ?? 0);
    result.initiative += part.initiative ?? 0;
    result.computer += part.computer ?? 0;
    result.shield += part.shield ?? 0;
    result.hull += part.hull ?? 0;
    result.repair += part.repair ?? 0;
    part.cannons?.forEach((die) => result.cannons[die]++);
    part.missiles?.forEach((die) => result.missiles[die]++);
  }
  for (const bonus of fixedBonuses(state.factionId, ship)) {
    result[bonus.kind] += bonus.value;
  }
  result.energyBalance = result.energySource - result.energyUse;
  return result;
}

export function countPartsByTier(tier: PartTier): number {
  return SHIP_PARTS.filter((part) => part.tier === tier).length;
}
