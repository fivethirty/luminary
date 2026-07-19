import { ShipType, ShipConfig } from '@calc/ship';

let nextFleetId = 2;

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
  antimatterSplitter: boolean;
  // How this (player) fleet plans damage assignment:
  //  - 'dps': remove the most enemy firepower per assignment
  //  - 'optimal': play the exactly-solved optimal assignment (default)
  plannerType: PlannerType;
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
}

const DEFAULT_FLEETS: FleetState[] = [
  {
    id: 'fleet-0',
    name: 'Defender',
    shipTypes: [],
    antimatterSplitter: false,
    plannerType: 'optimal',
  },
  {
    id: 'fleet-1',
    name: 'Attacker',
    shipTypes: [],
    antimatterSplitter: false,
    plannerType: 'optimal',
  },
];

export const state: State = {
  fleets: DEFAULT_FLEETS.map((f) => ({ ...f, shipTypes: [] })),
  simulationResults: null,
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
  const newFleet: FleetState = {
    id: `fleet-${nextFleetId}`,
    name: '',
    shipTypes: [],
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
  config: Partial<ShipConfig> = {}
): ShipTypeConfig {
  const fleet = getFleetById(fleetId);

  const newShip: ShipTypeConfig = {
    id: `ship-${Date.now()}-${Math.random()}`,
    type: shipType,
    quantity: 1,
    config,
  };

  fleet.shipTypes.push(newShip);
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
    notifyFleetsChanged();
  }
}

export function removeShipType(fleetId: string, shipId: string) {
  const fleet = getFleetById(fleetId);
  const index = fleet.shipTypes.findIndex((s) => s.id === shipId);
  if (index > -1) {
    fleet.shipTypes.splice(index, 1);
    notifyFleetsChanged();
  }
}

export function resetFleets() {
  state.fleets = DEFAULT_FLEETS.map((f) => ({ ...f, shipTypes: [] }));
  nextFleetId = 2;
  notifyFleetsChanged();
}

// Replaces all fleets wholesale (e.g. when loading a shared battle link).
// Incoming fleets are expected to use sequential `fleet-<n>` ids from 0.
export function replaceFleets(fleets: FleetState[]) {
  state.fleets = fleets;
  nextFleetId = fleets.length;
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
