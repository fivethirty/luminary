import { ShipType, ShipConfig } from '@calc/ship';

let nextFleetId = 2;

export interface ShipTypeConfig {
  id: string;
  type: ShipType;
  quantity: number;
  config: Partial<ShipConfig>;
}

export interface FleetState {
  id: string;
  name: string;
  shipTypes: ShipTypeConfig[];
  antimatterSplitter: boolean;
}

export interface SimulationResults {
  victoryProbability: Record<string, number>;
  drawProbability: number;
  expectedSurvivors: Record<string, Record<string, number>>;
  timeTaken: number;
}

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
  },
  {
    id: 'fleet-1',
    name: 'Attacker',
    shipTypes: [],
    antimatterSplitter: false,
  },
];

export const state: State = {
  fleets: DEFAULT_FLEETS.map((f) => ({ ...f, shipTypes: [] })),
  simulationResults: null,
};

export function addFleet(): FleetState {
  const newFleet: FleetState = {
    id: `fleet-${nextFleetId}`,
    name: '',
    shipTypes: [],
    antimatterSplitter: false,
  };
  nextFleetId++;

  state.fleets.push(newFleet);
  return newFleet;
}

export function removeFleet(fleetId: string) {
  const index = state.fleets.findIndex((f) => f.id === fleetId);
  if (index > -1) {
    state.fleets.splice(index, 1);
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
  shipType: ShipType
): ShipTypeConfig {
  const fleet = getFleetById(fleetId);

  const newShip: ShipTypeConfig = {
    id: `ship-${Date.now()}-${Math.random()}`,
    type: shipType,
    quantity: 1,
    config: {},
  };

  fleet.shipTypes.push(newShip);
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
  }
}

export function removeShipType(fleetId: string, shipId: string) {
  const fleet = getFleetById(fleetId);
  const index = fleet.shipTypes.findIndex((s) => s.id === shipId);
  if (index > -1) {
    fleet.shipTypes.splice(index, 1);
  }
}

export function resetFleets() {
  state.fleets = DEFAULT_FLEETS.map((f) => ({ ...f, shipTypes: [] }));
  nextFleetId = 2;
}

export function setSimulationResults(results: SimulationResults | null) {
  state.simulationResults = results;
}

export function toggleAntimatterSplitter(fleetId: string) {
  const fleet = getFleetById(fleetId);
  fleet.antimatterSplitter = !fleet.antimatterSplitter;
}
