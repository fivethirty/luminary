export const MAX_FLEETS = 7;

export const FLEET_COLORS = [
  { id: 'red', label: 'Red', color: '#b91f2c', soft: '#3f171c' },
  { id: 'yellow', label: 'Yellow', color: '#d9ae32', soft: '#3f3214' },
  { id: 'green', label: 'Green', color: '#2f8f4e', soft: '#173822' },
  { id: 'blue', label: 'Blue', color: '#2f6fb7', soft: '#172c47' },
  { id: 'white', label: 'White', color: '#f2efe3', soft: '#3d3a31' },
  { id: 'black', label: 'Black', color: '#575a61', soft: '#181a20' },
  { id: 'neutral', label: 'Neutral', color: '#a87845', soft: '#342414' },
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
  { id: 'terran', label: 'Terran Directorate', shortLabel: 'Terran' },
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
