import { type ShipConfig, type WeaponType } from '@calc/ship';
import { formatCompactFleetComposition } from '@ui/fleet-composition';
import {
  getDefaultShipConfig,
  getStartingShipConfig,
  isShipPresetKey,
  matchShipPreset,
  SHIP_ABBREVIATIONS,
  SHIP_NAMES,
  SHIP_QUANTITY_LIMITS,
  type ShipDropdownOption,
} from '@ui/ship-presets';
import {
  defaultFleetColorId,
  isFactionId,
  isFleetColorId,
  MAX_FLEETS,
  type FactionId,
  type FleetColorId,
} from '@ui/fleet-metadata';
import {
  reconcileFactionStructure,
  sanitizeFleetComposition,
} from '@ui/fleet-rules';
import { normalizeShipConfig, shipConfigsEqual } from '@ui/ship-config';
import {
  calculateBlueprint,
  isBlueprintShipType,
  isDiscoveryPart,
  normalizeShipBlueprint,
} from '@ui/ship-parts';
import type {
  FleetState,
  PlannerType,
  ShipTypeConfig,
  SimulationResults,
} from '@ui/state';

// Battle setups are shared as a human-readable query string, e.g.
//   ?v=2&d.guardian-wa=1&a.cruiser=2&a.cruiser.hull=2
// Params are `<fleet>.<preset>=<quantity>` plus `<fleet>.<preset>.<stat>=<n>`
// for stats that differ from the faction's operating defaults, and per-fleet flags
// `<fleet>.ams=1` (antimatter splitter), `<fleet>.planner=dps`,
// `<fleet>.faction=rho-indi`, and `<fleet>.color=red`. Fleet keys
// are `d` (defender) and `a`, `a2`...`a6` (attackers). Ships whose config
// exactly matches a preset variant (e.g. `guardian-wa`) are named as that
// variant with no stat params. Decoding is lenient: unknown params are
// ignored, numbers are clamped to UI limits, and fleet composition rules
// (NPCs defend only, no mixed player/NPC fleets) are enforced.
const LEGACY_SHARE_VERSION = '1';
const SHARE_VERSION = '2';
const MAX_STAT = 99;

interface StatField {
  key: string;
  get: (config: Required<ShipConfig>) => number;
  set: (config: Required<ShipConfig>, value: number) => void;
}

function weaponFields(
  slot: 'cannons' | 'missiles',
  suffix: string
): StatField[] {
  const weapons: WeaponType[] = ['ion', 'plasma', 'soliton', 'antimatter'];
  return weapons.map((weapon) => ({
    key: `${weapon}${suffix}`,
    get: (config) => config[slot][weapon] ?? 0,
    set: (config, value) => {
      config[slot][weapon] = value;
    },
  }));
}

const STAT_FIELDS: StatField[] = [
  {
    key: 'hull',
    get: (c) => c.hull,
    set: (c, v) => {
      c.hull = v;
    },
  },
  {
    key: 'comp',
    get: (c) => c.computers,
    set: (c, v) => {
      c.computers = v;
    },
  },
  {
    key: 'shield',
    get: (c) => c.shields,
    set: (c, v) => {
      c.shields = v;
    },
  },
  {
    key: 'init',
    get: (c) => c.initiative,
    set: (c, v) => {
      c.initiative = v;
    },
  },
  {
    key: 'heal',
    get: (c) => c.heal,
    set: (c, v) => {
      c.heal = v;
    },
  },
  {
    key: 'rift',
    get: (c) => c.rift,
    set: (c, v) => {
      c.rift = v;
    },
  },
  ...weaponFields('cannons', ''),
  ...weaponFields('missiles', '-m'),
];

const STAT_FIELDS_BY_KEY = new Map(
  STAT_FIELDS.map((field) => [field.key, field])
);

function fleetKey(index: number): string {
  if (index === 0) return 'd';
  return index === 1 ? 'a' : `a${index}`;
}

function fleetIndexFromKey(key: string): number | null {
  if (key === 'd') return 0;
  if (key === 'a' || key === 'a1') return 1;
  const match = /^a([2-9])$/.exec(key);
  if (!match) return null;
  const index = Number(match[1]);
  return index < MAX_FLEETS ? index : null;
}

function encodeShip(
  key: string,
  shipType: ShipTypeConfig,
  params: [string, string][],
  factionId: FactionId
) {
  const config = normalizeShipConfig(shipType.config);
  const preset = matchShipPreset(shipType.type, shipType.config);
  const presetConfig = normalizeShipConfig(
    getStartingShipConfig(preset, factionId).config
  );
  const exact = shipConfigsEqual(config, presetConfig);

  params.push([`${key}.${preset}`, String(shipType.quantity)]);

  if (!exact) {
    for (const field of STAT_FIELDS) {
      if (field.get(config) !== field.get(presetConfig)) {
        params.push([
          `${key}.${preset}.${field.key}`,
          String(field.get(config)),
        ]);
      }
    }
  }

  if (isBlueprintShipType(shipType.type)) {
    const blueprint = normalizeShipBlueprint(shipType.type, shipType.blueprint);
    if (
      blueprint &&
      shipConfigsEqual(
        shipType.config,
        calculateBlueprint(shipType.type, blueprint, factionId).config
      )
    ) {
      params.push([
        `${key}.${preset}.parts`,
        blueprint.slots.map((partId) => partId ?? '_').join('-'),
      ]);
      if (blueprint.muonSource) {
        params.push([`${key}.${preset}.muon`, '1']);
      }
    }
  }
}

// Returns the query string for a battle ('' when there is nothing to share).
export function encodeBattleQuery(fleets: FleetState[]): string {
  const params: [string, string][] = [];

  fleets.slice(0, MAX_FLEETS).forEach((fleet, index) => {
    const key = fleetKey(index);
    fleet.shipTypes.forEach((shipType) =>
      encodeShip(key, shipType, params, fleet.factionId ?? '')
    );
    if (fleet.antimatterSplitter) {
      params.push([`${key}.ams`, '1']);
    }
    if (fleet.plannerType !== 'optimal') {
      params.push([`${key}.planner`, fleet.plannerType]);
    }
    if (fleet.factionId) {
      params.push([`${key}.faction`, fleet.factionId]);
    }
    const colorIsManual =
      fleet.colorIsManual ??
      (fleet.colorId !== undefined &&
        fleet.colorId !== defaultFleetColorId(index));
    if (fleet.colorId && colorIsManual) {
      params.push([`${key}.color`, fleet.colorId]);
    }
  });

  if (params.length === 0) return '';
  return new URLSearchParams([['v', SHARE_VERSION], ...params]).toString();
}

function clampStat(value: number): number {
  return Math.min(MAX_STAT, Math.max(0, Math.round(value)));
}

interface FleetDraft {
  ships: Map<ShipDropdownOption, ShipTypeConfig>;
  factionId: FactionId;
  colorId?: FleetColorId;
  colorIsManual: boolean;
  antimatterSplitter: boolean;
  plannerType: PlannerType;
  blueprintParts: Map<ShipDropdownOption, string>;
  blueprintMuons: Set<ShipDropdownOption>;
}

function draftShip(
  draft: FleetDraft,
  preset: ShipDropdownOption,
  fleetIndex: number,
  shipIndex: number,
  version: string
): ShipTypeConfig | null {
  const existing = draft.ships.get(preset);
  if (existing) return existing;

  const variant =
    version === SHARE_VERSION
      ? getStartingShipConfig(preset, draft.factionId)
      : getDefaultShipConfig(preset);
  // One entry per ship type: a second preset of the same type (e.g. `ancient`
  // and `ancient-wa`) is ignored, matching the UI's dropdown behavior.
  const typeTaken = [...draft.ships.values()].some(
    (ship) => ship.type === variant.type
  );
  if (typeTaken) return null;

  const ship: ShipTypeConfig = {
    id: `ship-shared-${fleetIndex}-${shipIndex}`,
    type: variant.type,
    quantity: 1,
    config: variant.config,
  };
  draft.ships.set(preset, ship);
  return ship;
}

export function parseBattleQuery(search: string): FleetState[] | null {
  const params = new URLSearchParams(search);
  const version = params.get('v');
  if (version !== LEGACY_SHARE_VERSION && version !== SHARE_VERSION) {
    return null;
  }

  const drafts = new Map<number, FleetDraft>();
  const getDraft = (index: number): FleetDraft => {
    let draft = drafts.get(index);
    if (!draft) {
      draft = {
        ships: new Map(),
        factionId: '',
        colorId: undefined,
        colorIsManual: false,
        antimatterSplitter: false,
        plannerType: 'optimal',
        blueprintParts: new Map(),
        blueprintMuons: new Set(),
      };
      drafts.set(index, draft);
    }
    return draft;
  };

  // Version 2 ship params are based on faction-aware defaults. Read faction
  // metadata first so decoding is independent of query-parameter order.
  if (version === SHARE_VERSION) {
    for (const [key, value] of params.entries()) {
      const parts = key.split('.');
      if (parts.length !== 2 || parts[1] !== 'faction') continue;
      const fleetIndex = fleetIndexFromKey(parts[0]);
      if (fleetIndex !== null && isFactionId(value)) {
        getDraft(fleetIndex).factionId = value;
      }
    }
  }

  let recognized = false;
  for (const [key, value] of params.entries()) {
    const parts = key.split('.');
    if (parts.length < 2 || parts.length > 3) continue;
    const fleetIndex = fleetIndexFromKey(parts[0]);
    if (fleetIndex === null) continue;

    if (parts.length === 2 && parts[1] === 'ams') {
      getDraft(fleetIndex).antimatterSplitter = value === '1';
      recognized = true;
      continue;
    }
    if (parts.length === 2 && parts[1] === 'planner') {
      if (value === 'npc' || value === 'dps' || value === 'optimal') {
        getDraft(fleetIndex).plannerType = value;
        recognized = true;
      }
      continue;
    }
    if (parts.length === 2 && parts[1] === 'faction') {
      if (isFactionId(value)) {
        getDraft(fleetIndex).factionId = value;
        recognized = true;
      }
      continue;
    }
    if (parts.length === 2 && parts[1] === 'color') {
      if (isFleetColorId(value)) {
        getDraft(fleetIndex).colorId = value;
        getDraft(fleetIndex).colorIsManual = true;
        recognized = true;
      }
      continue;
    }

    if (!isShipPresetKey(parts[1])) continue;
    const draft = getDraft(fleetIndex);
    const ship = draftShip(
      draft,
      parts[1],
      fleetIndex,
      draft.ships.size,
      version
    );
    if (!ship) continue;

    const numeric = Number(value);
    if (parts.length === 2) {
      recognized = true;
      if (Number.isFinite(numeric)) {
        ship.quantity = Math.min(
          SHIP_QUANTITY_LIMITS[ship.type],
          Math.max(1, Math.round(numeric))
        );
      }
      continue;
    }

    if (parts[2] === 'parts') {
      draft.blueprintParts.set(parts[1], value);
      recognized = true;
      continue;
    }
    if (parts[2] === 'muon') {
      if (value === '1') draft.blueprintMuons.add(parts[1]);
      recognized = true;
      continue;
    }

    const field = STAT_FIELDS_BY_KEY.get(parts[2]);
    if (field && Number.isFinite(numeric)) {
      field.set(ship.config as Required<ShipConfig>, clampStat(numeric));
      recognized = true;
    }
  }

  if (!recognized) return null;

  finalizeBlueprintDrafts(drafts);

  const fleetCount = Math.max(2, ...[...drafts.keys()].map((i) => i + 1));
  return Array.from({ length: fleetCount }, (_, index) => {
    const draft = drafts.get(index);
    const isDefender = index === 0;
    const factionId = draft?.factionId ?? '';
    const reconciledShips = draft
      ? reconcileFactionStructure(
          [...draft.ships.values()],
          factionId,
          isDefender
        )
      : [];
    const shipTypes = sanitizeFleetComposition(
      reconciledShips,
      isDefender,
      factionId
    );
    shipTypes.forEach((ship) => {
      if (!ship.blueprint) return;
      if (!isBlueprintShipType(ship.type)) {
        delete ship.blueprint;
        return;
      }
      const blueprint = normalizeShipBlueprint(ship.type, ship.blueprint);
      if (!blueprint) {
        delete ship.blueprint;
        return;
      }
      ship.blueprint = blueprint;
      ship.config = calculateBlueprint(ship.type, blueprint, factionId).config;
    });
    return {
      id: `fleet-${index}`,
      name: '',
      shipTypes,
      factionId,
      colorId: draft?.colorId ?? defaultFleetColorId(index),
      colorIsManual: draft?.colorIsManual ?? false,
      antimatterSplitter: draft?.antimatterSplitter ?? false,
      plannerType: draft?.plannerType ?? 'optimal',
    };
  });
}

function finalizeBlueprintDrafts(drafts: Map<number, FleetDraft>) {
  for (const draft of drafts.values()) {
    const usedDiscoveries = new Set<string>();
    for (const [preset, ship] of draft.ships) {
      const encoded = draft.blueprintParts.get(preset);
      if (!encoded || !isBlueprintShipType(ship.type)) continue;
      const slots = encoded
        .split('-')
        .map((partId) => (partId === '_' ? null : partId));
      const blueprint = normalizeShipBlueprint(ship.type, {
        slots,
        muonSource: draft.blueprintMuons.has(preset),
      });
      if (!blueprint) continue;

      const discoveries = blueprint.slots.filter((partId): partId is string =>
        Boolean(partId && isDiscoveryPart(partId))
      );
      if (blueprint.muonSource) discoveries.push('mus');
      if (
        new Set(discoveries).size !== discoveries.length ||
        discoveries.some((partId) => usedDiscoveries.has(partId))
      ) {
        continue;
      }
      discoveries.forEach((partId) => usedDiscoveries.add(partId));
      ship.blueprint = blueprint;
      ship.config = calculateBlueprint(
        ship.type,
        blueprint,
        draft.factionId
      ).config;
    }
  }
}

// The full shareable URL for a battle, based on the current page location.
export function battleUrl(fleets: FleetState[]): string {
  const query = encodeBattleQuery(fleets);
  const base = window.location.origin + window.location.pathname;
  return query ? `${base}?${query}` : base;
}

function fleetLineup(fleet: FleetState, short = false): string {
  if (short) {
    const composition: Record<string, number> = {};
    const abbreviations: Record<string, string> = {};
    for (const shipType of fleet.shipTypes) {
      composition[shipType.type] =
        (composition[shipType.type] ?? 0) + shipType.quantity;
      abbreviations[shipType.type] =
        SHIP_ABBREVIATIONS[matchShipPreset(shipType.type, shipType.config)];
    }
    return formatCompactFleetComposition(composition, abbreviations);
  }

  if (fleet.shipTypes.length === 0) return 'Empty fleet';
  return fleet.shipTypes
    .map((shipType) => {
      const name = SHIP_NAMES[matchShipPreset(shipType.type, shipType.config)];
      if (shipType.quantity === 1) return name;
      return `${shipType.quantity}× ${name}`;
    })
    .join(', ');
}

// A compact one-line description of the matchup, e.g. "2× Cruiser vs Guardian".
// NPC variants are tagged in both forms ("Guardian (WA)" / "Guard (WA)");
// `short` also single-letters player hulls for tight spaces.
export function battleLabel(fleets: FleetState[], short = false): string {
  return fleets.map((fleet) => fleetLineup(fleet, short)).join(' vs ');
}

function formatCount(count: number): string {
  return count % 1 === 0 ? count.toString() : count.toFixed(1);
}

const BAR_WIDTH = 20;

function oddsBar(probability: number): string {
  const filled = Math.round(probability * BAR_WIDTH);
  return '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
}

function resultForFleet<T>(
  byFleet: Record<string, T>,
  fleet: FleetState
): T | undefined {
  // Results are ID-keyed. The name fallback keeps the formatter tolerant of
  // older callers and hand-built test/report data at this presentation edge.
  return byFleet[fleet.id] ?? byFleet[fleet.name];
}

// A plain-text battle report sized for chat: a one-line matchup, a fenced
// monospace block with the odds bars, and the share URL left bare so chat
// clients unfurl it.
export function formatChatReport(
  fleets: FleetState[],
  results: SimulationResults,
  url?: string
): string {
  const rows: [string, number][] = fleets.map((fleet) => [
    fleet.name,
    resultForFleet(results.victoryProbability, fleet) ?? 0,
  ]);
  if (results.drawProbability > 0) {
    rows.push(['Draw', results.drawProbability]);
  }

  const nameWidth = Math.max(...rows.map(([name]) => name.length));
  const lines = rows.map(([name, probability]) => {
    const percent = `${(probability * 100).toFixed(1)}%`;
    return `${name.padEnd(nameWidth)}  ${percent.padStart(6)}  ${oddsBar(probability)}`;
  });

  const survivorParts = fleets.flatMap((fleet) => {
    const survivors = Object.entries(
      resultForFleet(results.expectedSurvivors, fleet) ?? {}
    )
      .filter(([, count]) => count > 0)
      .map(([type, count]) => `${formatCount(count)}× ${type}`);
    return survivors.length > 0
      ? [`${fleet.name} ${survivors.join(', ')}`]
      : [];
  });
  if (survivorParts.length > 0) {
    lines.push('', `Avg survivors (wins): ${survivorParts.join(' · ')}`);
  }

  const matchup = fleets.map((fleet) => fleetLineup(fleet)).join('  vs  ');
  const report = `⚔ ${matchup}\n\`\`\`\n${lines.join('\n')}\n\`\`\``;
  return url ? `${report}\n${url}` : report;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
