import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import '../happydom';
import {
  state,
  addShipType,
  updateShipType,
  resetFleets,
  setSimulationResults,
} from '@ui/state';
import { monteCarloResults } from '@ui/test-helpers';
import { init } from './app';
import indexHtml from './index.html' with { type: 'text' };
import { ShipType } from '@calc/ship';

describe('App', () => {
  beforeEach(() => {
    resetFleets();
    setSimulationResults(null);
    document.documentElement.innerHTML = indexHtml;
    init();
  });

  test('initializes with default fleets', () => {
    expect(state.fleets.length).toBe(2);
    expect(state.fleets[0].name).toBe('Defender');
    expect(state.fleets[1].name).toBe('Attacker');

    const fleetElements = document.querySelectorAll('calc-fleet');
    expect(fleetElements.length).toBe(2);
  });

  test('add fleet button creates new fleet', () => {
    const addBtn = document.getElementById(
      'add-fleet-btn'
    ) as HTMLButtonElement;

    addBtn.click();

    expect(state.fleets.length).toBe(3);
    expect(state.fleets[2].name).toBe('Attacker 2');

    const fleetElements = document.querySelectorAll('calc-fleet');
    expect(fleetElements.length).toBe(3);
  });

  test('clear all button resets to default state', () => {
    const addBtn = document.getElementById(
      'add-fleet-btn'
    ) as HTMLButtonElement;
    addBtn.click();
    addBtn.click();
    expect(state.fleets.length).toBe(4);

    setSimulationResults(
      monteCarloResults({
        victoryProbability: { Defender: 0.5, 'Attacker 1': 0.5 },
      })
    );

    const clearBtn = document.getElementById(
      'clear-all-btn'
    ) as HTMLButtonElement;
    clearBtn.click();

    expect(state.fleets.length).toBe(2);
    expect(state.fleets[0].name).toBe('Defender');
    expect(state.fleets[1].name).toBe('Attacker');
    expect(state.simulationResults).toBeNull();

    const fleetElements = document.querySelectorAll('calc-fleet');
    expect(fleetElements.length).toBe(2);
  });

  test('run simulation creates results', () => {
    state.fleets[0].shipTypes.push({
      id: 'ship-1',
      type: 'Interceptor',
      quantity: 3,
      config: {
        cannons: { ion: 1 },
      },
    });
    state.fleets[1].shipTypes.push({
      id: 'ship-2',
      type: 'Cruiser',
      quantity: 2,
      config: {
        cannons: { ion: 1 },
        hull: 1,
      },
    });

    const runBtn = document.getElementById(
      'run-simulation-btn'
    ) as HTMLButtonElement;
    runBtn.click();

    expect(state.simulationResults).not.toBeNull();
    expect(state.simulationResults!.victoryProbability).toBeDefined();
    expect(state.simulationResults!.drawProbability).toBeDefined();
    expect(state.simulationResults!.expectedSurvivors).toBeDefined();

    const resultsContainer = document.getElementById('results-container')!;
    const resultsElement = resultsContainer.querySelector('calc-results');
    expect(resultsElement).not.toBeNull();
  });
});

describe('App shared battle links', () => {
  const SHARED_QUERY =
    '?v=1&d.interceptor=3&d.interceptor.ion=1&a.cruiser=2' +
    '&a.cruiser.hull=1&a.cruiser.ion=1&a.planner=dps';

  beforeEach(() => {
    resetFleets();
    setSimulationResults(null);
    document.documentElement.innerHTML = indexHtml;
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  test('loads fleets from the query string and simulates on init', () => {
    window.history.replaceState(null, '', `/${SHARED_QUERY}`);
    init();

    expect(state.fleets.length).toBe(2);
    expect(state.fleets[0].name).toBe('Defender');
    expect(state.fleets[0].shipTypes[0].type).toBe(ShipType.Interceptor);
    expect(state.fleets[0].shipTypes[0].quantity).toBe(3);
    expect(state.fleets[1].shipTypes[0].type).toBe(ShipType.Cruiser);
    expect(state.fleets[1].shipTypes[0].config.hull).toBe(1);
    expect(state.fleets[1].plannerType).toBe('dps');

    expect(state.simulationResults).not.toBeNull();
    const resultsElement = document
      .getElementById('results-container')!
      .querySelector('calc-results');
    expect(resultsElement).not.toBeNull();
  });

  test('does not simulate a shared battle with an empty fleet', () => {
    window.history.replaceState(null, '', '/?v=1&a.cruiser=2');
    init();

    expect(state.fleets[0].shipTypes.length).toBe(0);
    expect(state.fleets[1].shipTypes.length).toBe(1);
    expect(state.simulationResults).toBeNull();
  });

  test('ignores an unrelated or malformed query', () => {
    window.history.replaceState(null, '', '/?utm_source=discord');
    init();

    expect(state.fleets.length).toBe(2);
    expect(state.fleets.every((fleet) => fleet.shipTypes.length === 0)).toBe(
      true
    );
    expect(state.simulationResults).toBeNull();
  });

  test('updates the URL as ships are entered', () => {
    init();
    expect(window.location.search).toBe('');

    const ship = addShipType(state.fleets[1].id, ShipType.Cruiser, {
      initiative: 2,
    });
    expect(window.location.search).toBe('?v=1&a.cruiser=1');

    ship.quantity = 2;
    ship.config = { initiative: 2, hull: 1 };
    updateShipType(state.fleets[1].id, ship.id, ship);
    expect(window.location.search).toBe('?v=1&a.cruiser=2&a.cruiser.hull=1');

    resetFleets();
    expect(window.location.search).toBe('');
  });

  test('keeps the URL canonical after loading a shared battle', () => {
    window.history.replaceState(null, '', '/?v=1&a.cruiser.hull=1&junk=x');
    init();

    expect(window.location.search).toBe('?v=1&a.cruiser=1&a.cruiser.hull=1');
  });
});
