import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import '../happydom';
import {
  state,
  addShipType,
  removeShipType,
  updateShipType,
  resetFleets,
  setSimulationResults,
} from '@ui/state';
import { monteCarloResults } from '@ui/test-helpers';
import { init } from './app';
import indexHtml from './index.html' with { type: 'text' };
import { ShipType } from '@calc/ship';

// Waits out the auto-simulate debounce.
const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
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

  test('auto-simulates once both fleets have ships', async () => {
    addShipType(state.fleets[0].id, ShipType.Interceptor, {
      cannons: { ion: 1 },
    });
    addShipType(state.fleets[1].id, ShipType.Cruiser, {
      cannons: { ion: 1 },
      hull: 1,
    });
    await settle();

    expect(state.simulationResults).not.toBeNull();
    expect(state.simulationResults!.victoryProbability).toBeDefined();
    expect(state.simulationResults!.drawProbability).toBeDefined();
    expect(state.simulationResults!.expectedSurvivors).toBeDefined();

    const resultsContainer = document.getElementById('results-container')!;
    const resultsElement = resultsContainer.querySelector('calc-results');
    expect(resultsElement).not.toBeNull();

    const liveBar = document.getElementById('live-bar')!;
    expect(liveBar.hidden).toBe(false);
    expect(liveBar.querySelector('.live-verdict')!.textContent).not.toBe('');
  });

  test('clears results when a fleet empties', async () => {
    addShipType(state.fleets[0].id, ShipType.Interceptor, {
      cannons: { ion: 1 },
    });
    const attacker = addShipType(state.fleets[1].id, ShipType.Cruiser, {
      cannons: { ion: 1 },
    });
    await settle();
    expect(state.simulationResults).not.toBeNull();

    removeShipType(state.fleets[1].id, attacker.id);
    await settle();

    expect(state.simulationResults).toBeNull();
    expect(document.querySelector('calc-results')).toBeNull();
    expect(document.getElementById('live-bar')!.hidden).toBe(true);
  });

  test('persists the setup and restores it on the next init', () => {
    addShipType(state.fleets[1].id, ShipType.Cruiser, { initiative: 2 });
    const saved = localStorage.getItem('luminary:setup');
    expect(saved).toBe('v=1&a.cruiser=1');

    // Simulate a fresh page load with no battle in the URL. Resetting fires
    // the save subscription, so put the snapshot back before re-initializing.
    resetFleets();
    localStorage.setItem('luminary:setup', saved!);
    setSimulationResults(null);
    document.documentElement.innerHTML = indexHtml;
    window.history.replaceState(null, '', '/');
    init();

    expect(state.fleets[1].shipTypes).toHaveLength(1);
    expect(state.fleets[1].shipTypes[0].type).toBe(ShipType.Cruiser);
    // The restored battle also lands back in the URL for sharing.
    expect(window.location.search).toBe('?v=1&a.cruiser=1');
  });
});

describe('App shared battle links', () => {
  const SHARED_QUERY =
    '?v=1&d.interceptor=3&d.interceptor.ion=1&a.cruiser=2' +
    '&a.cruiser.hull=1&a.cruiser.ion=1&a.planner=dps';

  beforeEach(() => {
    localStorage.clear();
    resetFleets();
    setSimulationResults(null);
    document.documentElement.innerHTML = indexHtml;
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  test('loads fleets from the query string and simulates on init', async () => {
    window.history.replaceState(null, '', `/${SHARED_QUERY}`);
    init();

    expect(state.fleets.length).toBe(2);
    expect(state.fleets[0].name).toBe('Defender');
    expect(state.fleets[0].shipTypes[0].type).toBe(ShipType.Interceptor);
    expect(state.fleets[0].shipTypes[0].quantity).toBe(3);
    expect(state.fleets[1].shipTypes[0].type).toBe(ShipType.Cruiser);
    expect(state.fleets[1].shipTypes[0].config.hull).toBe(1);
    expect(state.fleets[1].plannerType).toBe('dps');

    await settle();
    expect(state.simulationResults).not.toBeNull();
    const resultsElement = document
      .getElementById('results-container')!
      .querySelector('calc-results');
    expect(resultsElement).not.toBeNull();
  });

  test('a battle in the URL wins over the saved setup', () => {
    localStorage.setItem('luminary:setup', 'v=1&a.dreadnought=2');
    window.history.replaceState(null, '', '/?v=1&a.cruiser=2');
    init();

    expect(state.fleets[1].shipTypes[0].type).toBe(ShipType.Cruiser);
  });

  test('does not simulate a shared battle with an empty fleet', async () => {
    window.history.replaceState(null, '', '/?v=1&a.cruiser=2');
    init();

    expect(state.fleets[0].shipTypes.length).toBe(0);
    expect(state.fleets[1].shipTypes.length).toBe(1);
    await settle();
    expect(state.simulationResults).toBeNull();
  });

  test('records simulated battles in the recents picker', async () => {
    window.history.replaceState(null, '', `/${SHARED_QUERY}`);
    init();
    await settle();

    const select = document.getElementById(
      'recent-battles'
    ) as HTMLSelectElement;
    expect(select.hidden).toBe(false);
    const options = Array.from(select.querySelectorAll('option'));
    expect(options.length).toBe(2);
    expect(options[1].textContent).toBe('3× Interceptor vs 2× Cruiser');

    // Picking a recent battle loads it.
    resetFleets();
    select.value = options[1].value;
    select.dispatchEvent(new Event('change'));
    expect(state.fleets[0].shipTypes[0].type).toBe(ShipType.Interceptor);
    expect(state.fleets[0].shipTypes[0].quantity).toBe(3);
  });

  test('abbreviates recent battle labels on narrow screens', async () => {
    const realMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: /max-width/.test(query),
      media: query,
    })) as typeof window.matchMedia;

    try {
      window.history.replaceState(null, '', `/${SHARED_QUERY}`);
      init();
      await settle();

      const select = document.getElementById(
        'recent-battles'
      ) as HTMLSelectElement;
      const options = Array.from(select.querySelectorAll('option'));
      expect(options[1].textContent).toBe('3× I vs 2× C');
    } finally {
      window.matchMedia = realMatchMedia;
    }
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
