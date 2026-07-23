import { ShipType, type ShipConfig, type WeaponType } from '@calc/ship';
import type { FactionId } from '@ui/fleet-metadata';

import absorptionShieldImage from '../assets/ship-parts/absorption_shield.webp';
import antimatterCannonImage from '../assets/ship-parts/antimatter_cannon.webp';
import antimatterMissileImage from '../assets/ship-parts/antimatter_missile.webp';
import axionComputerImage from '../assets/ship-parts/axion_computer.webp';
import conformalDriveImage from '../assets/ship-parts/conformal_drive.webp';
import conifoldFieldImage from '../assets/ship-parts/conifold_field.webp';
import electronComputerImage from '../assets/ship-parts/electron_computer.webp';
import fluxMissileImage from '../assets/ship-parts/flux_missile.webp';
import fluxShieldImage from '../assets/ship-parts/flux_shield.webp';
import fusionDriveImage from '../assets/ship-parts/fusion_drive.webp';
import fusionSourceImage from '../assets/ship-parts/fusion_source.webp';
import gaussShieldImage from '../assets/ship-parts/gauss_shield.webp';
import gluonComputerImage from '../assets/ship-parts/gluon_computer.webp';
import hullImage from '../assets/ship-parts/hull.webp';
import hypergridSourceImage from '../assets/ship-parts/hypergrid_source.webp';
import improvedHullImage from '../assets/ship-parts/improved_hull.webp';
import inversionShieldImage from '../assets/ship-parts/inversion_shield.webp';
import ionCannonImage from '../assets/ship-parts/ion_cannon.webp';
import ionDisruptorImage from '../assets/ship-parts/ion_disruptor.webp';
import ionMissileImage from '../assets/ship-parts/ion_missile.webp';
import ionTurretImage from '../assets/ship-parts/ion_turret.webp';
import ionTurretExileImage from '../assets/ship-parts/ion_turret_exile.webp';
import jumpDriveImage from '../assets/ship-parts/jump_drive.webp';
import morphShieldImage from '../assets/ship-parts/morph_shield.webp';
import muonSourceImage from '../assets/ship-parts/muon_source.webp';
import nonlinearDriveImage from '../assets/ship-parts/nonlinear_drive.webp';
import nuclearDriveImage from '../assets/ship-parts/nuclear_drive.webp';
import nuclearSourceImage from '../assets/ship-parts/nuclear_source.webp';
import phaseShieldImage from '../assets/ship-parts/phase_shield.webp';
import plasmaCannonImage from '../assets/ship-parts/plasma_cannon.webp';
import plasmaMissileImage from '../assets/ship-parts/plasma_missile.webp';
import plasmaTurretImage from '../assets/ship-parts/plasma_turret.webp';
import positronComputerImage from '../assets/ship-parts/positron_computer.webp';
import riftCannonImage from '../assets/ship-parts/rift_cannon.webp';
import riftConductorImage from '../assets/ship-parts/rift_conductor.webp';
import sentientHullImage from '../assets/ship-parts/sentient_hull.webp';
import shardHullImage from '../assets/ship-parts/shard_hull.webp';
import solitonCannonImage from '../assets/ship-parts/soliton_cannon.webp';
import solitonChargerImage from '../assets/ship-parts/soliton_charger.webp';
import solitonMissileImage from '../assets/ship-parts/soliton_missile.webp';
import tachyonDriveImage from '../assets/ship-parts/tachyon_drive.webp';
import tachyonSourceImage from '../assets/ship-parts/tachyon_source.webp';
import transitionDriveImage from '../assets/ship-parts/transition_drive.webp';
import zeroPointSourceImage from '../assets/ship-parts/zero_point_source.webp';

export type PartTier = 'standard' | 'technology' | 'discovery' | 'chassis';
export type DieColor = 'yellow' | 'orange' | 'blue' | 'red' | 'pink';

export interface ShipPart {
  id: string;
  name: string;
  image: string;
  tier: PartTier;
  movement?: number;
  initiative?: number;
  energyUse?: number;
  energySource?: number;
  computer?: number;
  shield?: number;
  cannons?: readonly DieColor[];
  missiles?: readonly DieColor[];
  hull?: number;
  repair?: number;
  external?: boolean;
  drive?: boolean;
  orbitalOnly?: boolean;
}

function part(
  id: string,
  name: string,
  image: string,
  tier: PartTier,
  stats: Omit<ShipPart, 'id' | 'name' | 'image' | 'tier'> = {}
): ShipPart {
  return { id, name, image, tier, ...stats };
}

// Curated from AsyncEclipse/DiscordBot data/parts.json. Community balance
// variants and duplicate aliases are intentionally excluded.
export const SHIP_PARTS: readonly ShipPart[] = [
  part('ioc', 'Ion Cannon', ionCannonImage, 'standard', {
    energyUse: 1,
    cannons: ['yellow'],
  }),
  part('elc', 'Electron Computer', electronComputerImage, 'standard', {
    computer: 1,
  }),
  part('nud', 'Nuclear Drive', nuclearDriveImage, 'standard', {
    movement: 1,
    initiative: 1,
    energyUse: 1,
    drive: true,
  }),
  part('hul', 'Hull', hullImage, 'standard', { hull: 1 }),
  part('nus', 'Nuclear Source', nuclearSourceImage, 'standard', {
    energySource: 3,
  }),

  part('anc', 'Antimatter Cannon', antimatterCannonImage, 'technology', {
    energyUse: 4,
    cannons: ['red'],
  }),
  part('plc', 'Plasma Cannon', plasmaCannonImage, 'technology', {
    energyUse: 2,
    cannons: ['orange'],
  }),
  part('rican', 'Rift Cannon', riftCannonImage, 'technology', {
    energyUse: 2,
    cannons: ['pink'],
  }),
  part('socan', 'Soliton Cannon', solitonCannonImage, 'technology', {
    energyUse: 3,
    cannons: ['blue'],
  }),
  part('poc', 'Positron Computer', positronComputerImage, 'technology', {
    computer: 2,
    energyUse: 1,
  }),
  part('glc', 'Gluon Computer', gluonComputerImage, 'technology', {
    computer: 3,
    energyUse: 2,
  }),
  part('fud', 'Fusion Drive', fusionDriveImage, 'technology', {
    movement: 2,
    initiative: 2,
    energyUse: 2,
    drive: true,
  }),
  part('tad', 'Tachyon Drive', tachyonDriveImage, 'technology', {
    movement: 3,
    initiative: 3,
    energyUse: 3,
    drive: true,
  }),
  part('trd', 'Transition Drive', transitionDriveImage, 'technology', {
    movement: 3,
    drive: true,
  }),
  part('cof', 'Conifold Field', conifoldFieldImage, 'technology', {
    hull: 3,
    energyUse: 2,
  }),
  part('imh', 'Improved Hull', improvedHullImage, 'technology', { hull: 2 }),
  part('seh', 'Sentient Hull', sentientHullImage, 'technology', {
    hull: 1,
    computer: 1,
  }),
  part('flm', 'Flux Missile', fluxMissileImage, 'technology', {
    initiative: 1,
    missiles: ['yellow', 'yellow'],
  }),
  part('plm', 'Plasma Missile', plasmaMissileImage, 'technology', {
    energyUse: 1,
    missiles: ['orange', 'orange'],
  }),
  part('abs', 'Absorption Shield', absorptionShieldImage, 'technology', {
    shield: 1,
    energySource: 4,
  }),
  part('gas', 'Gauss Shield', gaussShieldImage, 'technology', { shield: 1 }),
  part('phs', 'Phase Shield', phaseShieldImage, 'technology', {
    shield: 2,
    energyUse: 1,
  }),
  part('fus', 'Fusion Source', fusionSourceImage, 'technology', {
    energySource: 6,
  }),
  part('tas', 'Tachyon Source', tachyonSourceImage, 'technology', {
    energySource: 9,
  }),
  part('zes', 'Zero Point Source', zeroPointSourceImage, 'technology', {
    energySource: 12,
  }),

  part('nod', 'Nonlinear Drive', nonlinearDriveImage, 'discovery', {
    movement: 2,
    energySource: 2,
    drive: true,
  }),
  part('axc', 'Axion Computer', axionComputerImage, 'discovery', {
    computer: 2,
    initiative: 1,
  }),
  part('socha', 'Soliton Charger', solitonChargerImage, 'discovery', {
    energyUse: 1,
    cannons: ['blue'],
  }),
  part('iod', 'Ion Disruptor', ionDisruptorImage, 'discovery', {
    initiative: 3,
    cannons: ['yellow'],
  }),
  part('cod', 'Conformal Drive', conformalDriveImage, 'discovery', {
    movement: 4,
    initiative: 2,
    energyUse: 2,
    drive: true,
  }),
  part('jud', 'Jump Drive', jumpDriveImage, 'discovery', {
    movement: 1,
    energyUse: 2,
    drive: true,
  }),
  part('shh', 'Shard Hull', shardHullImage, 'discovery', { hull: 3 }),
  part('mos', 'Morph Shield', morphShieldImage, 'discovery', {
    shield: 1,
    repair: 1,
    initiative: 1,
  }),
  part('iot', 'Ion Turret', ionTurretImage, 'discovery', {
    cannons: ['yellow', 'yellow'],
  }),
  part('anm', 'Antimatter Missile', antimatterMissileImage, 'discovery', {
    missiles: ['red'],
  }),
  part('iom', 'Ion Missile', ionMissileImage, 'discovery', {
    missiles: ['yellow', 'yellow', 'yellow'],
  }),
  part('som', 'Soliton Missile', solitonMissileImage, 'discovery', {
    initiative: 1,
    missiles: ['blue'],
  }),
  part('ricon', 'Rift Conductor', riftConductorImage, 'discovery', {
    energyUse: 1,
    hull: 1,
    cannons: ['pink'],
  }),
  part('fls', 'Flux Shield', fluxShieldImage, 'discovery', {
    shield: 3,
    initiative: 1,
    energyUse: 2,
  }),
  part('ins', 'Inversion Shield', inversionShieldImage, 'discovery', {
    shield: 2,
    energySource: 2,
  }),
  part('hyg', 'Hypergrid Source', hypergridSourceImage, 'discovery', {
    energySource: 11,
  }),
  part('mus', 'Muon Source', muonSourceImage, 'discovery', {
    initiative: 1,
    energySource: 2,
    external: true,
  }),
  part('plt', 'Plasma Turret', plasmaTurretImage, 'discovery', {
    energyUse: 3,
    cannons: ['orange', 'orange'],
  }),

  // The Exiles' replaceable starting turret is part of the Orbital chassis,
  // not one of the eighteen discovery tiles.
  part('iotexile', 'Ion Turret', ionTurretExileImage, 'chassis', {
    energyUse: 1,
    cannons: ['yellow', 'yellow'],
    orbitalOnly: true,
  }),
];

export const PART_BY_ID = new Map(SHIP_PARTS.map((entry) => [entry.id, entry]));
export type ShipPartId = string;

export type BlueprintShipType =
  | typeof ShipType.Interceptor
  | typeof ShipType.Cruiser
  | typeof ShipType.Dreadnought
  | typeof ShipType.Starbase
  | typeof ShipType.Orbital;

const BLUEPRINT_SHIP_TYPES: readonly ShipType[] = [
  ShipType.Interceptor,
  ShipType.Cruiser,
  ShipType.Dreadnought,
  ShipType.Starbase,
  ShipType.Orbital,
];

export function isBlueprintShipType(type: ShipType): type is BlueprintShipType {
  return BLUEPRINT_SHIP_TYPES.includes(type);
}

export interface ShipBlueprint {
  slots: Array<ShipPartId | null>;
  muonSource: boolean;
}

export interface SlotPosition {
  left: number;
  top: number;
  width: number;
  height: number;
  row: number;
  column: number;
}

export interface BlueprintLayout {
  slots: number;
  aspectRatio: number;
  positions: readonly SlotPosition[];
}

export const BLUEPRINT_LAYOUTS: Record<BlueprintShipType, BlueprintLayout> = {
  [ShipType.Interceptor]: {
    slots: 4,
    aspectRatio: 817 / 766,
    positions: [
      { left: 0.8, top: 50.9, width: 33.2, height: 37.7, row: 2, column: 1 },
      { left: 32.7, top: 21.5, width: 35.1, height: 35.8, row: 1, column: 2 },
      { left: 66.2, top: 50.9, width: 33.6, height: 37.7, row: 2, column: 3 },
      { left: 32.8, top: 57.3, width: 35.0, height: 36.0, row: 3, column: 2 },
    ],
  },
  [ShipType.Cruiser]: {
    slots: 6,
    aspectRatio: 817 / 769,
    positions: [
      { left: 0.8, top: 27.6, width: 33.4, height: 36.0, row: 2, column: 1 },
      { left: 34.3, top: 22.0, width: 31.7, height: 35.5, row: 1, column: 2 },
      { left: 66.0, top: 27.6, width: 33.0, height: 36.0, row: 2, column: 3 },
      { left: 0.8, top: 63.5, width: 33.4, height: 34.3, row: 4, column: 1 },
      { left: 34.3, top: 57.5, width: 31.7, height: 34.0, row: 3, column: 2 },
      { left: 66.0, top: 63.5, width: 33.0, height: 34.3, row: 4, column: 3 },
    ],
  },
  [ShipType.Dreadnought]: {
    slots: 8,
    aspectRatio: 1088 / 775,
    positions: [
      { left: 1.2, top: 28.1, width: 25.0, height: 36.0, row: 2, column: 1 },
      { left: 25.0, top: 22.6, width: 25.3, height: 35.2, row: 1, column: 2 },
      { left: 50.3, top: 22.6, width: 23.9, height: 35.2, row: 1, column: 3 },
      { left: 74.2, top: 28.1, width: 25.1, height: 36.0, row: 2, column: 4 },
      { left: 1.2, top: 64.0, width: 25.0, height: 35.4, row: 4, column: 1 },
      { left: 26.2, top: 57.8, width: 24.1, height: 33.8, row: 3, column: 2 },
      { left: 50.3, top: 57.8, width: 23.9, height: 33.8, row: 3, column: 3 },
      { left: 74.2, top: 64.0, width: 25.1, height: 33.7, row: 4, column: 4 },
    ],
  },
  [ShipType.Starbase]: {
    slots: 5,
    aspectRatio: 817 / 766,
    positions: [
      { left: 0.8, top: 21.4, width: 35.2, height: 36.0, row: 1, column: 1 },
      { left: 34.3, top: 32.9, width: 31.7, height: 35.6, row: 2, column: 2 },
      { left: 64.4, top: 21.4, width: 35.4, height: 36.0, row: 1, column: 3 },
      { left: 0.8, top: 57.4, width: 35.2, height: 36.0, row: 3, column: 1 },
      { left: 64.4, top: 57.4, width: 35.4, height: 36.0, row: 3, column: 3 },
    ],
  },
  [ShipType.Orbital]: {
    slots: 3,
    aspectRatio: 817 / 766,
    positions: [
      { left: 0.8, top: 56.0, width: 35.2, height: 37.4, row: 3, column: 1 },
      { left: 32.7, top: 38.5, width: 35.1, height: 35.8, row: 2, column: 2 },
      { left: 64.4, top: 21.4, width: 35.4, height: 36.0, row: 1, column: 3 },
    ],
  },
};

const DEFAULT_SLOTS: Record<BlueprintShipType, Array<ShipPartId | null>> = {
  [ShipType.Interceptor]: ['nus', 'ioc', null, 'nud'],
  [ShipType.Cruiser]: ['elc', 'ioc', null, 'nus', 'hul', 'nud'],
  [ShipType.Dreadnought]: [
    'elc',
    'ioc',
    'ioc',
    null,
    'nus',
    'hul',
    'hul',
    'nud',
  ],
  [ShipType.Starbase]: ['elc', null, 'ioc', 'hul', 'hul'],
  [ShipType.Orbital]: ['hul', 'iotexile', 'elc'],
};

function factionStartingSlots(
  type: BlueprintShipType,
  factionId: FactionId | undefined
): Array<ShipPartId | null> {
  const slots = [...DEFAULT_SLOTS[type]];
  if (factionId === 'orion') {
    const empty = slots.indexOf(null);
    if (empty >= 0) slots[empty] = 'gas';
  } else if (factionId === 'exiles' && type !== ShipType.Orbital) {
    const empty = slots.indexOf(null);
    if (empty >= 0) slots[empty] = 'elc';
  } else if (factionId === 'planta') {
    if (type === ShipType.Interceptor) {
      return ['nus', 'ioc', 'nud', null];
    }
    if (type === ShipType.Cruiser) {
      return ['nus', 'ioc', null, null, 'hul', 'nud'];
    }
    if (type === ShipType.Dreadnought) {
      return ['nus', 'ioc', 'ioc', null, null, 'hul', 'hul', 'nud'];
    }
    if (type === ShipType.Starbase) {
      return ['elc', 'hul', 'ioc', null, 'hul'];
    }
  }
  return slots;
}

const PLANTA_BLOCKED_SLOTS: Partial<Record<BlueprintShipType, number>> = {
  [ShipType.Interceptor]: 3,
  [ShipType.Cruiser]: 3,
  [ShipType.Dreadnought]: 4,
  [ShipType.Starbase]: 3,
};

export function isBlueprintSlotBlocked(
  type: BlueprintShipType,
  slot: number,
  factionId: FactionId | undefined = ''
): boolean {
  return factionId === 'planta' && PLANTA_BLOCKED_SLOTS[type] === slot;
}

export function createStartingBlueprint(
  type: BlueprintShipType,
  factionId: FactionId | undefined = ''
): ShipBlueprint {
  return { slots: factionStartingSlots(type, factionId), muonSource: false };
}

export function cloneShipBlueprint(blueprint: ShipBlueprint): ShipBlueprint {
  return { slots: [...blueprint.slots], muonSource: blueprint.muonSource };
}

export function partAllowedInSlot(
  type: BlueprintShipType,
  entry: ShipPart
): boolean {
  if (entry.external) return false;
  if (entry.orbitalOnly && type !== ShipType.Orbital) return false;
  if (
    entry.drive &&
    (type === ShipType.Starbase || type === ShipType.Orbital)
  ) {
    return false;
  }
  return true;
}

export function normalizeShipBlueprint(
  type: BlueprintShipType,
  value: unknown,
  factionId: FactionId | undefined = ''
): ShipBlueprint | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<ShipBlueprint>;
  if (!Array.isArray(candidate.slots)) return undefined;
  if (candidate.slots.length !== BLUEPRINT_LAYOUTS[type].slots)
    return undefined;

  const slots: Array<ShipPartId | null> = [];
  for (const [slot, partId] of candidate.slots.entries()) {
    if (isBlueprintSlotBlocked(type, slot, factionId)) {
      slots.push(null);
      continue;
    }
    if (partId === null) {
      slots.push(null);
      continue;
    }
    if (typeof partId !== 'string') return undefined;
    const entry = PART_BY_ID.get(partId);
    if (!entry || !partAllowedInSlot(type, entry)) return undefined;
    slots.push(partId);
  }

  return { slots, muonSource: candidate.muonSource === true };
}

export interface ChassisStats {
  initiative: number;
  energy: number;
  computers: number;
  shields: number;
  hull: number;
}

export function chassisStats(
  type: BlueprintShipType,
  factionId: FactionId | undefined = ''
): ChassisStats {
  const stats: ChassisStats = {
    initiative:
      type === ShipType.Interceptor
        ? 2
        : type === ShipType.Cruiser
          ? 1
          : type === ShipType.Starbase
            ? 4
            : 0,
    energy: type === ShipType.Starbase ? 3 : 0,
    computers: 0,
    shields: 0,
    hull: 0,
  };

  if (
    factionId === 'eridani' &&
    type !== ShipType.Starbase &&
    type !== ShipType.Orbital
  ) {
    stats.energy = 1;
  } else if (factionId === 'orion') {
    stats.initiative += 1;
    stats.energy =
      type === ShipType.Interceptor
        ? 1
        : type === ShipType.Cruiser
          ? 2
          : type === ShipType.Dreadnought
            ? 3
            : stats.energy;
  } else if (factionId === 'planta') {
    stats.initiative =
      type === ShipType.Interceptor || type === ShipType.Cruiser
        ? 0
        : type === ShipType.Starbase
          ? 2
          : stats.initiative;
    stats.energy = type === ShipType.Starbase ? 5 : 2;
    stats.computers = 1;
  } else if (factionId === 'rho-indi') {
    stats.shields = 1;
  }

  if (type === ShipType.Orbital) {
    stats.initiative = 0;
    stats.energy = 4;
    stats.hull = 2;
  }

  return stats;
}

function emptyWeaponCounts(): Record<WeaponType, number> {
  return { ion: 0, plasma: 0, soliton: 0, antimatter: 0 };
}

function weaponForColor(color: Exclude<DieColor, 'pink'>): WeaponType {
  return color === 'yellow'
    ? 'ion'
    : color === 'orange'
      ? 'plasma'
      : color === 'blue'
        ? 'soliton'
        : 'antimatter';
}

export interface BlueprintReadout {
  config: Required<ShipConfig>;
  energySource: number;
  energyUse: number;
  energyBalance: number;
  movement: number;
  hasDrive: boolean;
}

export function calculateBlueprint(
  type: BlueprintShipType,
  blueprint: ShipBlueprint,
  factionId: FactionId | undefined = ''
): BlueprintReadout {
  const chassis = chassisStats(type, factionId);
  const config: Required<ShipConfig> = {
    hull: chassis.hull,
    computers: chassis.computers,
    shields: chassis.shields,
    initiative: chassis.initiative,
    cannons: emptyWeaponCounts(),
    missiles: emptyWeaponCounts(),
    rift: 0,
    heal: 0,
  };
  let energySource = chassis.energy;
  let energyUse = 0;
  let movement = 0;
  let hasDrive = false;
  const ids = [
    ...blueprint.slots.map((id, slot) =>
      isBlueprintSlotBlocked(type, slot, factionId) ? null : id
    ),
    blueprint.muonSource ? 'mus' : null,
  ];

  for (const id of ids) {
    if (!id) continue;
    const entry = PART_BY_ID.get(id);
    if (!entry) continue;
    config.hull += entry.hull ?? 0;
    config.computers += entry.computer ?? 0;
    config.shields += entry.shield ?? 0;
    config.initiative += entry.initiative ?? 0;
    config.heal += entry.repair ?? 0;
    energySource += entry.energySource ?? 0;
    energyUse += entry.energyUse ?? 0;
    movement = Math.max(movement, entry.movement ?? 0);
    hasDrive ||= entry.drive === true;
    entry.cannons?.forEach((color) => {
      if (color === 'pink') config.rift += 1;
      else {
        const weapon = weaponForColor(color);
        config.cannons![weapon] = (config.cannons![weapon] ?? 0) + 1;
      }
    });
    entry.missiles?.forEach((color) => {
      if (color !== 'pink') {
        const weapon = weaponForColor(color);
        config.missiles![weapon] = (config.missiles![weapon] ?? 0) + 1;
      }
    });
  }

  return {
    config,
    energySource,
    energyUse,
    energyBalance: energySource - energyUse,
    movement,
    hasDrive,
  };
}

type PartBucketId =
  | 'energy'
  | 'movement'
  | 'initiative'
  | 'computer'
  | 'shield'
  | 'hull'
  | 'repair'
  | 'cannon'
  | 'missile';

export interface PartBucket {
  id: PartBucketId;
  label: string;
  parts: readonly ShipPart[];
}

const DAMAGE_TYPE_ORDER: Record<DieColor, number> = {
  yellow: 1,
  orange: 2,
  blue: 3,
  red: 4,
  pink: 5,
};

function damageTypeOrder(entry: ShipPart): number {
  const dice = [...(entry.cannons ?? []), ...(entry.missiles ?? [])];
  return dice.length === 0
    ? 0
    : Math.min(...dice.map((color) => DAMAGE_TYPE_ORDER[color]));
}

function damageDiceCount(entry: ShipPart): number {
  return (entry.cannons?.length ?? 0) + (entry.missiles?.length ?? 0);
}

function bucketValue(bucketId: PartBucketId, entry: ShipPart): number {
  switch (bucketId) {
    case 'energy':
      return entry.energySource ?? 0;
    case 'movement':
      return entry.movement ?? 0;
    case 'initiative':
      return entry.initiative ?? 0;
    case 'computer':
      return entry.computer ?? 0;
    case 'shield':
      return entry.shield ?? 0;
    case 'hull':
      return entry.hull ?? 0;
    case 'repair':
      return entry.repair ?? 0;
    case 'cannon':
    case 'missile':
      return damageTypeOrder(entry);
  }
}

function comparePartsForBucket(
  bucketId: PartBucketId,
  left: ShipPart,
  right: ShipPart
): number {
  const sharedTieBreakers = (entry: ShipPart): number[] => [
    entry.hull ?? 0,
    entry.initiative ?? 0,
    entry.computer ?? 0,
    entry.shield ?? 0,
    entry.energySource ?? 0,
    entry.energyUse ?? 0,
  ];
  const isDamageBucket = bucketId === 'cannon' || bucketId === 'missile';
  const leftValues = isDamageBucket
    ? [damageTypeOrder(left), damageDiceCount(left), ...sharedTieBreakers(left)]
    : [
        bucketValue(bucketId, left),
        ...sharedTieBreakers(left),
        damageTypeOrder(left),
        damageDiceCount(left),
      ];
  const rightValues = isDamageBucket
    ? [
        damageTypeOrder(right),
        damageDiceCount(right),
        ...sharedTieBreakers(right),
      ]
    : [
        bucketValue(bucketId, right),
        ...sharedTieBreakers(right),
        damageTypeOrder(right),
        damageDiceCount(right),
      ];
  for (let index = 0; index < leftValues.length; index++) {
    const difference = leftValues[index] - rightValues[index];
    if (difference !== 0) return difference;
  }
  return 0;
}

export function partBuckets(type: BlueprintShipType): PartBucket[] {
  const available = SHIP_PARTS.filter(
    (entry) =>
      entry.id !== 'mus' &&
      entry.tier !== 'chassis' &&
      partAllowedInSlot(type, entry)
  );
  const definitions: Array<{
    id: PartBucketId;
    label: string;
    includes: (entry: ShipPart) => boolean;
  }> = [
    {
      id: 'energy',
      label: 'Energy',
      includes: (entry) => (entry.energySource ?? 0) > 0,
    },
    {
      id: 'movement',
      label: 'Movement',
      includes: (entry) => (entry.movement ?? 0) > 0,
    },
    {
      id: 'initiative',
      label: 'Initiative',
      includes: (entry) => (entry.initiative ?? 0) > 0,
    },
    {
      id: 'computer',
      label: 'Computer',
      includes: (entry) => (entry.computer ?? 0) > 0,
    },
    {
      id: 'shield',
      label: 'Shield',
      includes: (entry) => (entry.shield ?? 0) > 0,
    },
    { id: 'hull', label: 'Hull', includes: (entry) => (entry.hull ?? 0) > 0 },
    {
      id: 'repair',
      label: 'Repair',
      includes: (entry) => (entry.repair ?? 0) > 0,
    },
    {
      id: 'cannon',
      label: 'Cannon',
      includes: (entry) => (entry.cannons?.length ?? 0) > 0,
    },
    {
      id: 'missile',
      label: 'Missile',
      includes: (entry) => (entry.missiles?.length ?? 0) > 0,
    },
  ];
  if (type === ShipType.Orbital) {
    available.push(PART_BY_ID.get('iotexile')!);
  }
  return definitions
    .map(({ id, label, includes }) => ({
      id,
      label,
      parts: available
        .filter(includes)
        .sort((left, right) => comparePartsForBucket(id, left, right)),
    }))
    .filter((bucket) => bucket.parts.length > 0);
}

export function isDiscoveryPart(partId: string): boolean {
  return PART_BY_ID.get(partId)?.tier === 'discovery';
}

export function describePart(entry: ShipPart): string {
  const stats: string[] = [];
  if (entry.energySource) stats.push(`+${entry.energySource} energy`);
  if (entry.energyUse) stats.push(`−${entry.energyUse} energy`);
  if (entry.movement) stats.push(`move ${entry.movement}`);
  if (entry.initiative) stats.push(`+${entry.initiative} init`);
  if (entry.computer) stats.push(`+${entry.computer} comp`);
  if (entry.shield) stats.push(`−${entry.shield} shield`);
  if (entry.hull) stats.push(`+${entry.hull} hull`);
  if (entry.repair) stats.push(`+${entry.repair} repair`);
  if (entry.cannons?.length) stats.push(`${entry.cannons.length} cannon die`);
  if (entry.missiles?.length)
    stats.push(`${entry.missiles.length} missile die`);
  return stats.join(' · ');
}

export function externalBonusLabels(
  type: BlueprintShipType,
  factionId: FactionId | undefined = ''
): string[] {
  const stats = chassisStats(type, factionId);
  const labels: string[] = [];
  if (stats.initiative) {
    labels.push(`${stats.initiative > 0 ? '+' : ''}${stats.initiative} Init`);
  }
  if (stats.energy) labels.push(`+${stats.energy} Energy`);
  if (stats.computers) labels.push(`+${stats.computers} Comp`);
  if (stats.shields) labels.push(`−${stats.shields} Shield`);
  if (stats.hull) labels.push(`+${stats.hull} Hull`);
  return labels;
}
