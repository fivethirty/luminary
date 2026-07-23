import { ShipType, type ShipConfig } from '@calc/ship';
import type { CombatRunDiagnostics, CombatTier } from '@calc/combat-runner';
import {
  MAX_POPULATION_DAMAGE_BUCKET,
  type PopulationBombardmentResult,
} from '@calc/population-bombardment';
import type {
  FleetMaterialLossSummary,
  ReputationDrawDistributionResult,
} from '@ui/battle-impact';
import {
  defaultFleetColorId,
  type FactionId,
  type FleetColorId,
  MAX_FLEETS,
  PLAYER_FLEET_COLORS,
} from '@ui/fleet-metadata';
import {
  incompatibleShipsForType,
  isNpcComposition,
  isShipTypeAllowedForFleet,
  isShipTypeAllowedForRole,
  reconcileFactionStructure,
  sanitizeFleetComposition,
} from '@ui/fleet-rules';
import { cloneShipConfig, shipConfigsEqual } from '@ui/ship-config';
import {
  calculateBlueprint,
  cloneShipBlueprint,
  createStartingBlueprint,
  isBlueprintShipType,
  isBlueprintSlotBlocked,
  isDiscoveryPart,
  normalizeShipBlueprint,
  PART_BY_ID,
  partAllowedInSlot,
  type ShipBlueprint,
  type BlueprintShipType,
} from '@ui/ship-parts';
import {
  getStartingShipConfig,
  presetKeysForType,
  SHIP_QUANTITY_LIMITS,
  type ShipDropdownOption,
} from '@ui/ship-presets';

let nextFleetId = 2;
const lastPlayerColorByFleetId: Record<string, FleetColorId> = {};

export interface ShipTypeConfig {
  id: string;
  type: ShipType;
  quantity: number;
  config: Partial<ShipConfig>;
  blueprint?: ShipBlueprint;
}

export type PlannerType = 'npc' | 'dps' | 'optimal';

export interface FleetState {
  id: string;
  name: string;
  shipTypes: ShipTypeConfig[];
  factionId?: FactionId;
  colorId?: FleetColorId;
  // Automatic colors follow battle position; explicitly selected colors stay
  // with the fleet when it is reordered.
  colorIsManual?: boolean;
  antimatterSplitter: boolean;
  // How this (player) fleet plans damage assignment:
  //  - 'dps': remove the most enemy firepower per assignment
  //  - 'optimal': play the exactly-solved optimal assignment (default)
  plannerType: PlannerType;
}

export interface CachedShipTypeConfig {
  quantity: number;
  config: Partial<ShipConfig>;
  blueprint?: ShipBlueprint;
}

export interface SurvivorDistributionEntry {
  probability: number;
  /** Fleet controlling the sector after combat; null represents a mutual kill. */
  lastFleetStanding?: string | null;
  survivors: Record<string, Record<string, number>>;
  destroyedShipsCreditedToFleet?: Record<
    string,
    Partial<Record<ShipType, number>>
  >;
}

export type SimulationMethod = 'exact' | 'monte-carlo';

export const DEFAULT_SECTOR_POPULATION = 2;

interface BaseSimulationResults {
  // All fleet-keyed result maps use FleetState.id. Names are presentation and
  // may change or collide; views resolve IDs to current display labels.
  victoryProbability: Record<string, number>;
  drawProbability: number;
  expectedSurvivors: Record<string, Record<string, number>>;
  survivorDistribution: SurvivorDistributionEntry[];
  materialLosses: Record<string, FleetMaterialLossSummary>;
  populationBombardment: PopulationBombardmentResult;
  reputationDraws: ReputationDrawDistributionResult;
  timeTaken: number;
  targeting: 'optimal' | 'dps-policy';
  tier: CombatTier;
  methodLabel: string;
  diagnostics: CombatRunDiagnostics;
}

export interface ExactSimulationResults extends BaseSimulationResults {
  // Deterministic probability propagation: true probabilities, identical on every run.
  method: 'exact';
  iterations?: never;
}

export interface MonteCarloSimulationResults extends BaseSimulationResults {
  // Sampled simulation: estimates with sampling noise.
  method: 'monte-carlo';
  iterations: number;
}

export type SimulationResults =
  | ExactSimulationResults
  | MonteCarloSimulationResults;

export interface State {
  fleets: FleetState[];
  simulationResults: SimulationResults | null;
  sectorPopulation: number;
  detailedOutcomesExpanded: boolean;
  cachedShipTypes: Record<
    string,
    Partial<Record<ShipType, CachedShipTypeConfig>>
  >;
}

const DEFAULT_FLEETS: FleetState[] = [
  {
    id: 'fleet-0',
    name: 'Defender',
    shipTypes: [],
    factionId: '',
    colorId: 'neutral',
    colorIsManual: false,
    antimatterSplitter: false,
    plannerType: 'optimal',
  },
  {
    id: 'fleet-1',
    name: 'Attacker',
    shipTypes: [],
    factionId: '',
    colorId: 'blue',
    colorIsManual: false,
    antimatterSplitter: false,
    plannerType: 'optimal',
  },
];

export const state: State = {
  fleets: DEFAULT_FLEETS.map((f) => ({ ...f, shipTypes: [] })),
  simulationResults: null,
  sectorPopulation: DEFAULT_SECTOR_POPULATION,
  detailedOutcomesExpanded: false,
  cachedShipTypes: {},
};

// Fleet-change subscribers (e.g. the URL sync in app.ts). Every mutation of
// fleet composition or settings notifies; simulation results do not.
const fleetChangeListeners = new Set<() => void>();

export function onFleetsChanged(listener: () => void): () => void {
  fleetChangeListeners.add(listener);
  return () => fleetChangeListeners.delete(listener);
}

function notifyFleetsChanged() {
  [...fleetChangeListeners].forEach((listener) => listener());
}

export function addFleet(): FleetState {
  if (state.fleets.length >= MAX_FLEETS) {
    throw new Error(`At most ${MAX_FLEETS} fleets are supported`);
  }

  const fleetIndex = state.fleets.length;
  const newFleet: FleetState = {
    id: `fleet-${nextFleetId}`,
    name: '',
    shipTypes: [],
    factionId: '',
    colorId: defaultFleetColorId(fleetIndex),
    colorIsManual: false,
    antimatterSplitter: false,
    plannerType: 'optimal',
  };
  nextFleetId++;

  state.fleets.push(newFleet);
  enforceAutomaticFleetColors();
  notifyFleetsChanged();
  return newFleet;
}

export function removeFleet(fleetId: string) {
  const index = state.fleets.findIndex((f) => f.id === fleetId);
  if (index > -1) {
    state.fleets.splice(index, 1);
    delete state.cachedShipTypes[fleetId];
    delete lastPlayerColorByFleetId[fleetId];
    enforceAutomaticFleetColors();
    notifyFleetsChanged();
  }
}

function getFleetById(fleetId: string): FleetState {
  const fleet = state.fleets.find((f) => f.id === fleetId);
  if (!fleet) {
    throw new Error(`Fleet ${fleetId} not found`);
  }
  return fleet;
}

function createShipTypeConfig(
  type: ShipType,
  config: Partial<ShipConfig>,
  quantity: number,
  blueprint?: ShipBlueprint
): ShipTypeConfig {
  return {
    id: `ship-${Date.now()}-${Math.random()}`,
    type,
    quantity,
    config: cloneShipConfig(config),
    ...(blueprint ? { blueprint: cloneShipBlueprint(blueprint) } : {}),
  };
}

export function addShipType(
  fleetId: string,
  shipType: ShipType,
  config: Partial<ShipConfig> = {},
  quantity = 1
): ShipTypeConfig {
  const fleet = getFleetById(fleetId);
  const isDefender = state.fleets.indexOf(fleet) === 0;
  if (!isShipTypeAllowedForRole(shipType, isDefender)) {
    throw new Error(`${shipType} cannot be fielded by an attacker fleet`);
  }
  if (!isShipTypeAllowedForFleet(shipType, isDefender, fleet.factionId)) {
    throw new Error(`${shipType} cannot be fielded by ${fleet.factionId}`);
  }

  const quantityWithinLimit = clampShipQuantity(shipType, quantity);
  const existing = fleet.shipTypes.find((ship) => ship.type === shipType);
  if (existing) {
    existing.quantity = quantityWithinLimit;
    existing.config = cloneShipConfig(config);
    delete existing.blueprint;
    notifyFleetsChanged();
    return existing;
  }

  removeIncompatibleShipTypes(fleet, shipType);

  const newShip = createShipTypeConfig(shipType, config, quantityWithinLimit);

  fleet.shipTypes.push(newShip);
  enforceAutomaticFleetColors();
  notifyFleetsChanged();
  return newShip;
}

export interface AddOrSwapShipPresetOptions {
  // NPC pill pickers increment a matching layout; ordinary selectors only add
  // or replace a layout.
  incrementMatching?: boolean;
  // Ship-tile mode creates a source blueprint in the same transaction as the
  // row, so URL/storage listeners never observe mismatched parts and stats.
  withBlueprint?: boolean;
}

/**
 * Applies a UI ship preset as one state transaction. Existing variants swap
 * config in place, incompatible ships are cached before replacement, and a
 * matching NPC pill selection may increment quantity up to its component cap.
 */
export function addOrSwapShipPreset(
  fleetId: string,
  preset: ShipDropdownOption,
  options: AddOrSwapShipPresetOptions = {}
): ShipTypeConfig | null {
  const fleet = getFleetById(fleetId);
  const fleetIndex = state.fleets.indexOf(fleet);
  const variant = getStartingShipConfig(preset, fleet.factionId);
  if (
    !isShipTypeAllowedForFleet(variant.type, fleetIndex === 0, fleet.factionId)
  ) {
    return null;
  }

  const existing = fleet.shipTypes.find((ship) => ship.type === variant.type);
  if (existing) {
    if (
      options.incrementMatching &&
      shipConfigsEqual(existing.config, variant.config)
    ) {
      const limit = SHIP_QUANTITY_LIMITS[existing.type];
      if (existing.quantity >= limit) return existing;
      existing.quantity += 1;
    } else {
      existing.config = cloneShipConfig(variant.config);
      delete existing.blueprint;
      if (options.withBlueprint && isBlueprintShipType(existing.type)) {
        existing.blueprint = createStartingBlueprint(
          existing.type,
          fleet.factionId
        );
        existing.config = calculateBlueprint(
          existing.type,
          existing.blueprint,
          fleet.factionId
        ).config;
      }
    }

    enforceAutomaticFleetColors();
    notifyFleetsChanged();
    return existing;
  }

  removeIncompatibleShipTypes(fleet, variant.type);

  const hasVariants = presetKeysForType(variant.type).length > 1;
  const cached = hasVariants
    ? undefined
    : getCachedShipType(fleet.id, variant.type);
  let blueprint = cached?.blueprint;
  let config = cached?.config ?? variant.config;
  if (options.withBlueprint && isBlueprintShipType(variant.type)) {
    blueprint ??= createStartingBlueprint(variant.type, fleet.factionId);
    config = calculateBlueprint(
      variant.type,
      blueprint,
      fleet.factionId
    ).config;
  }
  const newShip = createShipTypeConfig(
    variant.type,
    config,
    Math.min(cached?.quantity ?? 1, SHIP_QUANTITY_LIMITS[variant.type]),
    blueprint
  );
  fleet.shipTypes.push(newShip);

  enforceAutomaticFleetColors();
  notifyFleetsChanged();
  return newShip;
}

export interface ShipTypeUpdates {
  quantity?: number;
  config?: Partial<ShipConfig>;
}

export function updateShipType(
  fleetId: string,
  shipId: string,
  updates: ShipTypeUpdates
) {
  const fleet = getFleetById(fleetId);
  const ship = fleet.shipTypes.find((s) => s.id === shipId);
  if (ship) {
    if (updates.quantity !== undefined) {
      ship.quantity = clampShipQuantity(ship.type, updates.quantity);
    }
    if (updates.config !== undefined) {
      ship.config = cloneShipConfig(updates.config);
      // A free-form stat edit is a one-way conversion out of tile data.
      delete ship.blueprint;
    }
    enforceAutomaticFleetColors();
    notifyFleetsChanged();
  }
}

function clampShipQuantity(type: ShipType, quantity: number): number {
  const integer = Number.isFinite(quantity) ? Math.trunc(quantity) : 1;
  return Math.max(1, Math.min(integer, SHIP_QUANTITY_LIMITS[type]));
}

export function removeShipType(fleetId: string, shipId: string) {
  const fleet = getFleetById(fleetId);
  const index = fleet.shipTypes.findIndex((s) => s.id === shipId);
  if (index > -1) {
    cacheShipType(fleetId, fleet.shipTypes[index]);
    fleet.shipTypes.splice(index, 1);
    enforceAutomaticFleetColors();
    notifyFleetsChanged();
  }
}

function cacheShipType(fleetId: string, ship: ShipTypeConfig) {
  state.cachedShipTypes[fleetId] ??= {};
  state.cachedShipTypes[fleetId][ship.type] = {
    quantity: ship.quantity,
    config: cloneShipConfig(ship.config),
    ...(ship.blueprint
      ? { blueprint: cloneShipBlueprint(ship.blueprint) }
      : {}),
  };
}

function removeIncompatibleShipTypes(fleet: FleetState, addedType: ShipType) {
  const incompatible = incompatibleShipsForType(fleet.shipTypes, addedType);
  if (incompatible.length === 0) return;

  const removedIds = new Set(incompatible.map((ship) => ship.id));
  incompatible.forEach((ship) => cacheShipType(fleet.id, ship));
  fleet.shipTypes = fleet.shipTypes.filter((ship) => !removedIds.has(ship.id));
}

export function getCachedShipType(
  fleetId: string,
  shipType: ShipType
): CachedShipTypeConfig | undefined {
  const cached = state.cachedShipTypes[fleetId]?.[shipType];
  if (!cached) return undefined;
  return {
    quantity: cached.quantity,
    config: cloneShipConfig(cached.config),
    ...(cached.blueprint
      ? { blueprint: cloneShipBlueprint(cached.blueprint) }
      : {}),
  };
}

export interface BlueprintPartUse {
  shipId: string;
  shipType: ShipType;
  slot: number | 'muon';
}

export function findBlueprintPartUse(
  fleetId: string,
  partId: string,
  except?: { shipId: string; slot: number | 'muon' }
): BlueprintPartUse | undefined {
  const fleet = getFleetById(fleetId);
  for (const ship of fleet.shipTypes) {
    if (!ship.blueprint) continue;
    for (let slot = 0; slot < ship.blueprint.slots.length; slot++) {
      if (ship.blueprint.slots[slot] !== partId) continue;
      if (except?.shipId === ship.id && except.slot === slot) continue;
      return { shipId: ship.id, shipType: ship.type, slot };
    }
    if (partId === 'mus' && ship.blueprint.muonSource) {
      if (except?.shipId === ship.id && except.slot === 'muon') continue;
      return { shipId: ship.id, shipType: ship.type, slot: 'muon' };
    }
  }
  return undefined;
}

export function replaceBlueprintPart(
  fleetId: string,
  shipId: string,
  slot: number,
  partId: string | null
): boolean {
  const fleet = getFleetById(fleetId);
  const ship = fleet.shipTypes.find((candidate) => candidate.id === shipId);
  if (!ship?.blueprint || !isBlueprintShipType(ship.type)) return false;
  if (slot < 0 || slot >= ship.blueprint.slots.length) return false;
  if (isBlueprintSlotBlocked(ship.type, slot, fleet.factionId)) return false;
  if (
    partId === null &&
    createStartingBlueprint(ship.type, fleet.factionId).slots[slot] !== null
  ) {
    return false;
  }
  if (partId !== null) {
    const entry = PART_BY_ID.get(partId);
    if (!entry || !partAllowedInSlot(ship.type, entry)) return false;
    if (
      isDiscoveryPart(partId) &&
      findBlueprintPartUse(fleetId, partId, { shipId, slot })
    ) {
      return false;
    }
  }

  ship.blueprint.slots[slot] = partId;
  ship.config = calculateBlueprint(
    ship.type,
    ship.blueprint,
    fleet.factionId
  ).config;
  notifyFleetsChanged();
  return true;
}

export function setBlueprintMuonSource(
  fleetId: string,
  shipId: string,
  enabled: boolean
): boolean {
  const fleet = getFleetById(fleetId);
  const ship = fleet.shipTypes.find((candidate) => candidate.id === shipId);
  if (!ship?.blueprint || !isBlueprintShipType(ship.type)) return false;
  if (
    enabled &&
    findBlueprintPartUse(fleetId, 'mus', { shipId, slot: 'muon' })
  ) {
    return false;
  }
  if (ship.blueprint.muonSource === enabled) return true;
  ship.blueprint.muonSource = enabled;
  ship.config = calculateBlueprint(
    ship.type,
    ship.blueprint,
    fleet.factionId
  ).config;
  notifyFleetsChanged();
  return true;
}

export function resetShipBlueprint(fleetId: string, shipId: string): boolean {
  const fleet = getFleetById(fleetId);
  const ship = fleet.shipTypes.find((candidate) => candidate.id === shipId);
  if (!ship?.blueprint || !isBlueprintShipType(ship.type)) return false;
  const startingBlueprint = createStartingBlueprint(ship.type, fleet.factionId);
  if (shipBlueprintsEqual(ship.blueprint, startingBlueprint)) return true;

  ship.blueprint = startingBlueprint;
  ship.config = calculateBlueprint(
    ship.type,
    ship.blueprint,
    fleet.factionId
  ).config;
  notifyFleetsChanged();
  return true;
}

export function ensureShipBlueprint(
  fleetId: string,
  shipId: string,
  force = false
): boolean {
  const fleet = getFleetById(fleetId);
  const ship = fleet.shipTypes.find((candidate) => candidate.id === shipId);
  if (!ship || !isBlueprintShipType(ship.type)) return false;
  const normalized = normalizeShipBlueprint(
    ship.type,
    ship.blueprint,
    fleet.factionId
  );
  if (normalized) return true;

  const preset = presetKeysForType(ship.type)[0];
  const previousDefault = preset
    ? getStartingShipConfig(preset, fleet.factionId).config
    : undefined;
  if (
    !force &&
    previousDefault &&
    !shipConfigsEqual(ship.config, previousDefault)
  ) {
    return false;
  }
  ship.blueprint = createStartingBlueprint(ship.type, fleet.factionId);
  ship.config = calculateBlueprint(
    ship.type,
    ship.blueprint,
    fleet.factionId
  ).config;
  notifyFleetsChanged();
  return true;
}

export function resetFleets() {
  state.fleets = DEFAULT_FLEETS.map((f) => ({ ...f, shipTypes: [] }));
  state.sectorPopulation = DEFAULT_SECTOR_POPULATION;
  state.detailedOutcomesExpanded = false;
  state.cachedShipTypes = {};
  clearRememberedFleetColors();
  nextFleetId = 2;
  notifyFleetsChanged();
}

// Replaces all fleets wholesale (e.g. when loading a shared battle link).
// Incoming fleets are expected to use sequential `fleet-<n>` ids from 0.
export function replaceFleets(fleets: FleetState[]) {
  state.fleets = normalizeFleetMetadata(fleets.slice(0, MAX_FLEETS));
  enforceFleetRoleRestrictions(state.fleets);
  clearRememberedFleetColors();
  state.fleets.forEach((fleet) => {
    if (fleet.colorIsManual && fleet.colorId && fleet.colorId !== 'neutral') {
      lastPlayerColorByFleetId[fleet.id] = fleet.colorId;
    }
  });
  enforceAutomaticFleetColors();
  state.cachedShipTypes = {};
  nextFleetId = state.fleets.length;
  notifyFleetsChanged();
}

export function setSimulationResults(results: SimulationResults | null) {
  state.simulationResults = results;
}

export function setSectorPopulation(population: number) {
  if (
    !Number.isInteger(population) ||
    population < 1 ||
    population > MAX_POPULATION_DAMAGE_BUCKET
  ) {
    throw new Error(`Invalid sector population: ${population}`);
  }
  state.sectorPopulation = population;
}

export function setDetailedOutcomesExpanded(expanded: boolean) {
  state.detailedOutcomesExpanded = expanded;
}

export function toggleAntimatterSplitter(fleetId: string) {
  const fleet = getFleetById(fleetId);
  fleet.antimatterSplitter = !fleet.antimatterSplitter;
  notifyFleetsChanged();
}

export function setFleetPlannerType(fleetId: string, plannerType: PlannerType) {
  const fleet = getFleetById(fleetId);
  fleet.plannerType = plannerType;
  notifyFleetsChanged();
}

export function setFleetFaction(fleetId: string, factionId: FactionId) {
  const fleet = getFleetById(fleetId);
  const previousFactionId = fleet.factionId;
  for (const ship of fleet.shipTypes) {
    if (ship.blueprint && isBlueprintShipType(ship.type)) {
      const previousDefault = createStartingBlueprint(
        ship.type,
        previousFactionId
      );
      if (shipBlueprintsEqual(ship.blueprint, previousDefault)) {
        ship.blueprint = createStartingBlueprint(ship.type, factionId);
      }
      ship.config = calculateBlueprint(
        ship.type,
        ship.blueprint,
        factionId
      ).config;
      continue;
    }
    migrateDefaultBlueprint(ship, previousFactionId, factionId);
  }
  for (const [rawType, cached] of Object.entries(
    state.cachedShipTypes[fleet.id] ?? {}
  )) {
    if (!cached) continue;
    const cachedShip = {
      type: rawType as ShipType,
      config: cached.config,
      blueprint: cached.blueprint,
    };
    if (cachedShip.blueprint && isBlueprintShipType(cachedShip.type)) {
      const previousDefault = createStartingBlueprint(
        cachedShip.type,
        previousFactionId
      );
      if (shipBlueprintsEqual(cachedShip.blueprint, previousDefault)) {
        cachedShip.blueprint = createStartingBlueprint(
          cachedShip.type,
          factionId
        );
      }
      cachedShip.config = calculateBlueprint(
        cachedShip.type,
        cachedShip.blueprint,
        factionId
      ).config;
    } else {
      migrateDefaultBlueprint(cachedShip, previousFactionId, factionId);
    }
    cached.config = cachedShip.config;
    cached.blueprint = cachedShip.blueprint;
  }
  fleet.factionId = factionId;
  fleet.shipTypes = reconcileFactionStructure(
    fleet.shipTypes,
    factionId,
    state.fleets.indexOf(fleet) === 0
  );
  reconcileFleetBlueprints(fleet);
  removeFactionInvalidShipTypes(fleet);
  notifyFleetsChanged();
}

function shipBlueprintsEqual(a: ShipBlueprint, b: ShipBlueprint): boolean {
  return (
    a.muonSource === b.muonSource &&
    a.slots.length === b.slots.length &&
    a.slots.every((partId, index) => partId === b.slots[index])
  );
}

function reconcileFleetBlueprints(fleet: FleetState) {
  for (const ship of fleet.shipTypes) {
    if (!ship.blueprint || !isBlueprintShipType(ship.type)) continue;
    const normalized = normalizeShipBlueprint(
      ship.type,
      ship.blueprint,
      fleet.factionId
    );
    ship.blueprint =
      normalized ?? createStartingBlueprint(ship.type, fleet.factionId);
    ship.config = calculateBlueprint(
      ship.type,
      ship.blueprint,
      fleet.factionId
    ).config;
  }
}

function removeFactionInvalidShipTypes(fleet: FleetState) {
  const isDefender = state.fleets.indexOf(fleet) === 0;
  const invalid = fleet.shipTypes.filter(
    (ship) => !isShipTypeAllowedForFleet(ship.type, isDefender, fleet.factionId)
  );
  if (invalid.length === 0) return;

  const invalidIds = new Set(invalid.map((ship) => ship.id));
  invalid.forEach((ship) => cacheShipType(fleet.id, ship));
  fleet.shipTypes = fleet.shipTypes.filter((ship) => !invalidIds.has(ship.id));
}

function migrateDefaultBlueprint(
  ship: Pick<ShipTypeConfig, 'type' | 'config'>,
  previousFactionId: FactionId | undefined,
  factionId: FactionId
) {
  const preset = presetKeysForType(ship.type)[0];
  if (!preset) return;
  const previousDefault = getStartingShipConfig(
    preset,
    previousFactionId
  ).config;
  if (!shipConfigsEqual(ship.config, previousDefault)) return;
  ship.config = getStartingShipConfig(preset, factionId).config;
}

export function setFleetColor(fleetId: string, colorId: FleetColorId) {
  const fleet = getFleetById(fleetId);
  if (colorId === 'neutral') return;
  const previousColor = fleet.colorId;
  fleet.colorIsManual = true;
  lastPlayerColorByFleetId[fleetId] = colorId;

  const otherFleet = state.fleets.find(
    (other) => other.id !== fleetId && other.colorId === colorId
  );
  if (otherFleet?.colorIsManual) {
    otherFleet.colorId =
      previousColor && previousColor !== 'neutral'
        ? previousColor
        : firstOpenPlayerColor();
    lastPlayerColorByFleetId[otherFleet.id] = otherFleet.colorId;
  }
  fleet.colorId = colorId;
  enforceAutomaticFleetColors();
  notifyFleetsChanged();
}

export function unsetFleetColor(fleetId: string) {
  const fleet = getFleetById(fleetId);
  fleet.colorIsManual = false;
  delete lastPlayerColorByFleetId[fleetId];
  enforceAutomaticFleetColors();
  notifyFleetsChanged();
}

export function moveFleet(fleetId: string, targetIndex: number) {
  const fromIndex = state.fleets.findIndex((fleet) => fleet.id === fleetId);
  if (fromIndex === -1) return;

  const boundedIndex = Math.max(
    0,
    Math.min(targetIndex, state.fleets.length - 1)
  );
  if (fromIndex === boundedIndex) return;

  const [fleet] = state.fleets.splice(fromIndex, 1);
  state.fleets.splice(boundedIndex, 0, fleet);
  enforceFleetRoleRestrictions(state.fleets);
  enforceAutomaticFleetColors();
  notifyFleetsChanged();
}

export function makeFleetDefender(fleetId: string) {
  moveFleet(fleetId, 0);
}

export function enforceFleetRoleRestrictions(fleets: FleetState[]) {
  fleets.forEach((fleet, index) => {
    fleet.shipTypes = reconcileFactionStructure(
      fleet.shipTypes,
      fleet.factionId,
      index === 0
    );
    fleet.shipTypes = sanitizeFleetComposition(
      fleet.shipTypes,
      index === 0,
      fleet.factionId
    );
    reconcileFleetBlueprints(fleet);
  });
}

function normalizeFleetMetadata(fleets: FleetState[]): FleetState[] {
  return fleets.map((fleet, index) => {
    const colorId = fleet.colorId ?? defaultFleetColorId(index);
    const factionId = fleet.factionId ?? '';
    return {
      ...fleet,
      shipTypes: fleet.shipTypes.map((ship) => {
        const blueprint = isBlueprintShipType(ship.type)
          ? normalizeShipBlueprint(ship.type, ship.blueprint, factionId)
          : undefined;
        const normalizedShip: ShipTypeConfig = {
          ...ship,
          quantity: clampShipQuantity(ship.type, ship.quantity),
          config: blueprint
            ? calculateBlueprint(
                ship.type as BlueprintShipType,
                blueprint,
                factionId
              ).config
            : cloneShipConfig(ship.config),
        };
        if (blueprint) normalizedShip.blueprint = blueprint;
        else delete normalizedShip.blueprint;
        return normalizedShip;
      }),
      factionId,
      colorId,
      colorIsManual:
        fleet.colorIsManual ?? colorId !== defaultFleetColorId(index),
    };
  });
}

function enforceAutomaticFleetColors() {
  const defender = state.fleets[0];
  if (!defender) return;

  if (isNpcFleet(defender)) {
    if (
      defender.colorIsManual &&
      defender.colorId &&
      defender.colorId !== 'neutral'
    ) {
      lastPlayerColorByFleetId[defender.id] = defender.colorId;
    }
    defender.colorId = 'neutral';
  }

  const used = new Set<FleetColorId>();

  // Reserve explicit colors first. A manually colored defender may be
  // temporarily neutral while it contains NPCs; its player color is restored
  // once the fleet can use it again.
  state.fleets.forEach((fleet, index) => {
    if (!fleet.colorIsManual || (index === 0 && isNpcFleet(fleet))) return;

    if (!fleet.colorId || fleet.colorId === 'neutral') {
      const remembered = availableRememberedPlayerColor(fleet.id);
      fleet.colorId = remembered ?? firstOpenPlayerColor(used);
    }
    used.add(fleet.colorId);
  });

  // Untouched colors belong to positions, not fleet identities. Recompute
  // them after every relevant change so reordering an uncustomized battle
  // still reads as neutral defender, blue attacker, green attacker 2, etc.
  state.fleets.forEach((fleet, index) => {
    if (fleet.colorIsManual) return;

    const preferred = defaultFleetColorId(index);
    if (preferred === 'neutral' || !used.has(preferred)) {
      fleet.colorId = preferred;
    } else {
      fleet.colorId = firstOpenPlayerColor(used);
    }
    used.add(fleet.colorId);
  });
}

export function isNpcFleet(fleet: FleetState): boolean {
  return isNpcComposition(fleet.shipTypes);
}

function firstOpenPlayerColor(
  used = new Set(state.fleets.map((fleet) => fleet.colorId))
): FleetColorId {
  return (
    PLAYER_FLEET_COLORS.find((color) => !used.has(color.id))?.id ??
    PLAYER_FLEET_COLORS[0].id
  );
}

function availableRememberedPlayerColor(
  fleetId: string
): FleetColorId | undefined {
  const remembered = lastPlayerColorByFleetId[fleetId];
  if (!remembered || remembered === 'neutral') return undefined;

  const alreadyUsed = state.fleets.some(
    (fleet) =>
      fleet.id !== fleetId &&
      fleet.colorIsManual &&
      fleet.colorId === remembered
  );
  return alreadyUsed ? undefined : remembered;
}

function clearRememberedFleetColors() {
  for (const fleetId of Object.keys(lastPlayerColorByFleetId)) {
    delete lastPlayerColorByFleetId[fleetId];
  }
}
