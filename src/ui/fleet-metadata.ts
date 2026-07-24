import type { ShipType } from '@calc/ship';
import { isNpcComposition } from '@ui/fleet-rules';

export const MAX_FLEETS = 7;

// Physical player colors stay recognizable across themes, while the light
// result pair is dark enough for text and its tint is safe behind that text.
const FLEET_COLORS = [
  {
    id: 'red',
    label: 'Red',
    color: '#b91f2c',
    soft: '#3f171c',
    lightResult: '#a61b29',
    lightResultSoft: '#f7e1e4',
  },
  {
    id: 'yellow',
    label: 'Yellow',
    color: '#d9ae32',
    soft: '#3f3214',
    lightResult: '#765900',
    lightResultSoft: '#f3eac8',
  },
  {
    id: 'green',
    label: 'Green',
    color: '#2f8f4e',
    soft: '#173822',
    lightResult: '#176b3a',
    lightResultSoft: '#dcefe3',
  },
  {
    id: 'blue',
    label: 'Blue',
    color: '#2f6fb7',
    soft: '#172c47',
    lightResult: '#155fa0',
    lightResultSoft: '#dceafb',
  },
  {
    id: 'white',
    label: 'White',
    color: '#f2efe3',
    soft: '#3d3a31',
    lightResult: '#586270',
    lightResultSoft: '#edf0f3',
  },
  {
    id: 'black',
    label: 'Black',
    color: '#575a61',
    soft: '#181a20',
    lightResult: '#23262d',
    lightResultSoft: '#e1e4e8',
  },
  {
    id: 'neutral',
    label: 'Neutral',
    color: '#a87845',
    soft: '#342414',
    lightResult: '#8a4a12',
    lightResultSoft: '#f2e3d4',
  },
] as const;

export type FleetColorId = (typeof FLEET_COLORS)[number]['id'];

export const PLAYER_FLEET_COLORS = FLEET_COLORS.filter(
  (color) => color.id !== 'neutral'
);

const DEFAULT_FLEET_COLOR_IDS: FleetColorId[] = [
  'neutral',
  'blue',
  'green',
  'red',
  'yellow',
  'white',
  'black',
];

export const FACTIONS = [
  { id: '', label: 'No faction' },
  { id: 'terran', label: 'Terran', shortLabel: 'Terran' },
  { id: 'eridani', label: 'Eridani Empire', shortLabel: 'Eridani' },
  { id: 'planta', label: 'Planta', shortLabel: 'Planta' },
  { id: 'mechanema', label: 'Mechanema', shortLabel: 'Mechanema' },
  { id: 'hydran', label: 'Hydran Progress', shortLabel: 'Hydran' },
  { id: 'draco', label: 'Descendants of Draco', shortLabel: 'Draco' },
  { id: 'orion', label: 'Orion Hegemony', shortLabel: 'Orion' },
  { id: 'rho-indi', label: 'Rho Indi Syndicate', shortLabel: 'Rho Indi' },
  { id: 'lyra', label: 'Enlightened of Lyra', shortLabel: 'Lyra' },
  { id: 'exiles', label: 'Exiles', shortLabel: 'Exiles' },
  { id: 'magellan', label: 'Wardens of Magellan', shortLabel: 'Magellan' },
] as const;

export type FactionId = (typeof FACTIONS)[number]['id'];

export function fleetColor(colorId: FleetColorId | undefined, index = 0) {
  return (
    FLEET_COLORS.find((color) => color.id === colorId) ??
    FLEET_COLORS[index % FLEET_COLORS.length]
  );
}

export function defaultFleetColorId(index: number): FleetColorId {
  return DEFAULT_FLEET_COLOR_IDS[index % DEFAULT_FLEET_COLOR_IDS.length];
}

export function isFleetColorId(value: string): value is FleetColorId {
  return FLEET_COLORS.some((color) => color.id === value);
}

export function isFactionId(value: string): value is FactionId {
  return FACTIONS.some((faction) => faction.id === value);
}

export function factionLabel(factionId: FactionId | undefined): string | null {
  if (!factionId) return null;
  return FACTIONS.find((faction) => faction.id === factionId)?.label ?? null;
}

export function factionShortLabel(
  factionId: FactionId | undefined
): string | null {
  if (!factionId) return null;
  const faction = FACTIONS.find((candidate) => candidate.id === factionId);
  return faction && 'shortLabel' in faction ? faction.shortLabel : null;
}

interface FleetNameSource {
  factionId?: FactionId;
  shipTypes: readonly { type: ShipType }[];
}

export function fleetRoleName(index: number, fleetCount: number): string {
  if (index === 0) return 'Defender';
  return fleetCount === 2 ? 'Attacker' : `Attacker ${index}`;
}

/** The unqualified name for one fleet, before duplicate suffixes are added. */
export function baseFleetName(
  fleet: FleetNameSource,
  index: number,
  fleetCount: number
): string {
  if (index === 0 && isNpcComposition(fleet.shipTypes)) {
    return 'The Ancients';
  }
  return factionLabel(fleet.factionId) ?? fleetRoleName(index, fleetCount);
}

/** Derives stable, unique display names without mutating the fleet snapshot. */
export function deriveFleetNames(fleets: readonly FleetNameSource[]): string[] {
  const baseNames = fleets.map((fleet, index) =>
    baseFleetName(fleet, index, fleets.length)
  );
  return makeNamesUnique(baseNames);
}

/** Derives compact, unique labels for space-constrained fleet summaries. */
export function deriveShortFleetNames(
  fleets: readonly FleetNameSource[]
): string[] {
  const baseNames = fleets.map((fleet, index) => {
    if (index === 0 && isNpcComposition(fleet.shipTypes)) {
      return 'The Ancients';
    }
    return (
      factionShortLabel(fleet.factionId) ?? fleetRoleName(index, fleets.length)
    );
  });
  return makeNamesUnique(baseNames);
}

function makeNamesUnique(baseNames: readonly string[]): string[] {
  const counts = new Map<string, number>();
  baseNames.forEach((name) => counts.set(name, (counts.get(name) ?? 0) + 1));
  const seen = new Map<string, number>();

  return baseNames.map((name) => {
    const occurrence = (seen.get(name) ?? 0) + 1;
    seen.set(name, occurrence);
    return (counts.get(name) ?? 0) > 1 ? `${name} ${occurrence}` : name;
  });
}
