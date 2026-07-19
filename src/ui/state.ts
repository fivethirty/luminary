import { isPlayerShipType, ShipType, ShipConfig } from '@calc/ship';
import {
  defaultFleetColorId,
  type FactionId,
  type FleetColorId,
  MAX_FLEETS,
  PLAYER_FLEET_COLORS,
} from '@ui/fleet-metadata';

let nextFleetId = 2;
const lastPlayerColorByFleetId: Record<string, FleetColorId> = {};

export interface ShipTypeConfig {
  id: string;
  type: ShipType;
  quantity: number;
  config: Partial<ShipConfig>;
}

export type PlannerType = 'dps' | 'optimal';

export interface FleetState {
  id: string;
  name: string;
  shipTypes: ShipTypeConfig[];
  factionId?: FactionId;
  colorId?: FleetColorId;
  antimatterSplitter: boolean;
  // How this (player) fleet plans damage assignment:
  //  - 'dps': remove the most enemy firepower per assignment
  //  - 'optimal': play the exactly-solved optimal assignment (default)
  plannerType: PlannerType;
}

export interface CachedShipTypeConfig {
  quantity: number;
  config: Partial<ShipConfig>;
}

export interface SurvivorDistributionEntry {
  probability: number;
  survivors: Record<string, Record<string, number>>;
}

export type SimulationMethod = 'exact' | 'monte-carlo';

interface BaseSimulationResults {
  victoryProbability: Record<string, number>;
  drawProbability: number;
  expectedSurvivors: Record<string, Record<string, number>>;
  survivorDistribution: SurvivorDistributionEntry[];
  timeTaken: number;
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
    antimatterSplitter: false,
    plannerType: 'optimal',
  },
  {
    id: 'fleet-1',
    name: 'Attacker',
    shipTypes: [],
    factionId: '',
    colorId: 'blue',
    antimatterSplitter: false,
    plannerType: 'optimal',
  },
];

export const state: State = {
  fleets: DEFAULT_FLEETS.map((f) => ({ ...f, shipTypes: [] })),
  simulationResults: null,
  cachedShipTypes: {},
};

// Fleet-change subscribers (e.g. the URL sync in app.ts). Every mutation of
// fleet composition or settings notifies; simulation results do not.
const fleetChangeListeners: Array<() => void> = [];

export function onFleetsChanged(listener: () => void) {
  fleetChangeListeners.push(listener);
}

function notifyFleetsChanged() {
  fleetChangeListeners.forEach((listener) => listener());
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
    antimatterSplitter: false,
    plannerType: 'optimal',
  };
  nextFleetId++;

  state.fleets.push(newFleet);
  notifyFleetsChanged();
  return newFleet;
}

export function removeFleet(fleetId: string) {
  const index = state.fleets.findIndex((f) => f.id === fleetId);
  if (index > -1) {
    state.fleets.splice(index, 1);
    delete state.cachedShipTypes[fleetId];
    delete lastPlayerColorByFleetId[fleetId];
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

export function addShipType(
  fleetId: string,
  shipType: ShipType,
  config: Partial<ShipConfig> = {},
  quantity = 1
): ShipTypeConfig {
  const fleet = getFleetById(fleetId);

  const newShip: ShipTypeConfig = {
    id: `ship-${Date.now()}-${Math.random()}`,
    type: shipType,
    quantity,
    config: cloneShipConfig(config),
  };

  fleet.shipTypes.push(newShip);
  enforceAutomaticFleetColors();
  notifyFleetsChanged();
  return newShip;
}

export function updateShipType(
  fleetId: string,
  shipId: string,
  updates: Partial<ShipTypeConfig>
) {
  const fleet = getFleetById(fleetId);
  const ship = fleet.shipTypes.find((s) => s.id === shipId);
  if (ship) {
    Object.assign(ship, updates);
    enforceAutomaticFleetColors();
    notifyFleetsChanged();
  }
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
  };
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
  };
}

function cloneShipConfig(config: Partial<ShipConfig>): Partial<ShipConfig> {
  const clone = { ...config };
  if (config.cannons) clone.cannons = { ...config.cannons };
  if (config.missiles) clone.missiles = { ...config.missiles };
  return clone;
}

export function resetFleets() {
  state.fleets = DEFAULT_FLEETS.map((f) => ({ ...f, shipTypes: [] }));
  state.cachedShipTypes = {};
  for (const fleetId of Object.keys(lastPlayerColorByFleetId)) {
    delete lastPlayerColorByFleetId[fleetId];
  }
  nextFleetId = 2;
  notifyFleetsChanged();
}

// Replaces all fleets wholesale (e.g. when loading a shared battle link).
// Incoming fleets are expected to use sequential `fleet-<n>` ids from 0.
export function replaceFleets(fleets: FleetState[]) {
  state.fleets = normalizeFleetMetadata(fleets.slice(0, MAX_FLEETS));
  enforceAutomaticFleetColors();
  state.cachedShipTypes = {};
  nextFleetId = state.fleets.length;
  notifyFleetsChanged();
}

export function setSimulationResults(results: SimulationResults | null) {
  state.simulationResults = results;
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
  fleet.factionId = factionId;
  notifyFleetsChanged();
}

export function setFleetColor(fleetId: string, colorId: FleetColorId) {
  const fleet = getFleetById(fleetId);
  if (colorId === 'neutral') return;
  lastPlayerColorByFleetId[fleetId] = colorId;

  const otherFleet = state.fleets.find(
    (other) => other.id !== fleetId && other.colorId === colorId
  );
  if (otherFleet) {
    otherFleet.colorId =
      fleet.colorId && fleet.colorId !== 'neutral'
        ? fleet.colorId
        : firstOpenPlayerColor();
    lastPlayerColorByFleetId[otherFleet.id] = otherFleet.colorId;
  }
  fleet.colorId = colorId;
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
    if (index === 0) return;
    fleet.shipTypes = fleet.shipTypes.filter(
      (ship) =>
        isPlayerShipType(ship.type) &&
        ship.type !== ShipType.Starbase &&
        ship.type !== ShipType.Orbital
    );
  });
}

function normalizeFleetMetadata(fleets: FleetState[]): FleetState[] {
  return fleets.map((fleet, index) => ({
    ...fleet,
    factionId: fleet.factionId ?? '',
    colorId: fleet.colorId ?? defaultFleetColorId(index),
  }));
}

function enforceAutomaticFleetColors() {
  const defender = state.fleets[0];
  if (!defender) return;

  state.fleets.slice(1).forEach((fleet) => {
    if (fleet.colorId === 'neutral') {
      fleet.colorId = availableRememberedPlayerColor(fleet.id) ?? firstOpenPlayerColor();
    }
  });

  if (isNpcFleet(defender)) {
    if (defender.colorId && defender.colorId !== 'neutral') {
      lastPlayerColorByFleetId[defender.id] = defender.colorId;
    }
    defender.colorId = 'neutral';
    return;
  }

  const rememberedDefenderColor = availableRememberedPlayerColor(defender.id);
  if (defender.colorId === 'neutral' && rememberedDefenderColor) {
    defender.colorId = rememberedDefenderColor;
  }
}

export function isNpcFleet(fleet: FleetState): boolean {
  return (
    fleet.shipTypes.length > 0 &&
    fleet.shipTypes.every((ship) => !isPlayerShipType(ship.type))
  );
}

function firstOpenPlayerColor(): FleetColorId {
  const used = new Set(state.fleets.map((fleet) => fleet.colorId));
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
    (fleet) => fleet.id !== fleetId && fleet.colorId === remembered
  );
  return alreadyUsed ? undefined : remembered;
}
