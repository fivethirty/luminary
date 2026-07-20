import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import '../happydom';
import {
  state,
  addShipType,
  removeShipType,
  updateShipType,
  resetFleets,
  setSimulationResults,
  setFleetFaction,
} from '@ui/state';
import { monteCarloResults } from '@ui/test-helpers';
import {
  loadSteppersPreference,
  loadThemePreference,
  saveSteppersPreference,
  saveThemePreference,
} from '@ui/preferences';
import { init } from './app';
import { exactDpsPlannerOverrides } from '@calc/exact-combat';
import indexHtml from './index.html' with { type: 'text' };
import { Ship, ShipType } from '@calc/ship';
import { Fleet } from '@calc/fleet';
import { DamageType } from './constants';

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

  test('reinitializing disposes the previous listeners and subscriptions', () => {
    init();

    const addBtn = document.getElementById(
      'add-fleet-btn'
    ) as HTMLButtonElement;
    addBtn.click();

    expect(state.fleets).toHaveLength(3);
  });

  test('a superseded disposer cannot cancel the active simulation timer', async () => {
    const staleDispose = init();
    init();

    setSimulationResults(monteCarloResults());
    addShipType(state.fleets[0].id, ShipType.Interceptor, {
      cannons: { ion: 1 },
    });
    staleDispose();

    await settle();
    expect(state.simulationResults).toBeNull();
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

  test('places the fleet actions together after the fleet list', () => {
    const fleets = document.getElementById('fleets')!;
    const addRow = document.querySelector('.add-fleet-row')!;

    expect(fleets.nextElementSibling).toBe(addRow);
    expect(addRow.querySelector('#add-fleet-btn')).not.toBeNull();
    expect(addRow.querySelector('#clear-all-btn')).not.toBeNull();
  });

  test('uses selected faction as the fleet name', () => {
    const factionSelect = document.querySelector(
      'calc-fleet .faction-select'
    ) as HTMLSelectElement;
    factionSelect.value = 'terran';
    factionSelect.dispatchEvent(new Event('change'));

    expect(state.fleets[0].name).toBe('Terran Directorate');
    expect(state.fleets[1].name).toBe('Attacker');

    const fleetNames = Array.from(document.querySelectorAll('.fleet-name')).map(
      (name) => name.textContent
    );
    expect(fleetNames).toEqual(['Terran Directorate', 'Attacker']);
  });

  test('uses The Ancients for an NPC defender fleet', async () => {
    const defender = document.querySelector('calc-fleet')!;
    const ancientPicker = defender.querySelector(
      '[aria-label="Add Ancient layout"]'
    ) as HTMLSelectElement;

    ancientPicker.value = 'ancient';
    ancientPicker.dispatchEvent(new Event('change'));

    await settle();

    expect(state.fleets[0].name).toBe('The Ancients');
    expect(defender.querySelector('.fleet-name')?.textContent).toBe(
      'The Ancients'
    );
    expect(state.fleets[0].colorId).toBe('neutral');
  });

  test('restores defender name after removing the last NPC ship', async () => {
    const defender = document.querySelector('calc-fleet')!;
    const ancientPicker = defender.querySelector(
      '[aria-label="Add Ancient layout"]'
    ) as HTMLSelectElement;

    ancientPicker.value = 'ancient';
    ancientPicker.dispatchEvent(new Event('change'));
    await settle();

    const removeButton = defender.querySelector(
      'calc-ship-type .remove-btn'
    ) as HTMLButtonElement;
    removeButton.click();

    expect(defender.querySelector('.fleet-name')?.textContent).toBe('Defender');
  });

  test('add fleet button stops at six players plus neutrals', () => {
    const addBtn = document.getElementById(
      'add-fleet-btn'
    ) as HTMLButtonElement;

    for (let index = 0; index < 5; index++) addBtn.click();

    expect(state.fleets.length).toBe(7);
    expect(addBtn.disabled).toBe(true);

    addBtn.click();
    expect(state.fleets.length).toBe(7);
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
    expect(clearBtn.textContent).toBe('Clear setup');
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
    expect(
      state.simulationResults!.materialLosses[state.fleets[0].id].totalCost
    ).toBe(3);
    expect(
      state.simulationResults!.populationBombardment.byAttacker[
        state.fleets[1].id
      ]
    ).toHaveLength(7);
    expect(state.simulationResults!.reputationDraws.available).toBe(true);
    expect(state.simulationResults!.tier).toBe('exact-optimal');
    expect(state.simulationResults!.methodLabel).toBe(
      'Exact · optimal targeting'
    );
    expect(state.simulationResults!.diagnostics.attempts).not.toHaveLength(0);

    const resultsContainer = document.getElementById('results-container')!;
    const resultsElement = resultsContainer.querySelector('calc-results');
    expect(resultsElement).not.toBeNull();

    const liveBar = document.getElementById('live-bar')!;
    expect(liveBar.hidden).toBe(false);
    expect(liveBar.tagName).toBe('BUTTON');
    expect(liveBar.getAttribute('aria-label')).toContain('View full results');
    expect(liveBar.querySelector('.live-verdict')!.textContent).not.toBe('');
  });

  test('hides live odds on the about page', async () => {
    addShipType(state.fleets[0].id, ShipType.Interceptor, {
      cannons: { ion: 1 },
    });
    addShipType(state.fleets[1].id, ShipType.Cruiser, {
      cannons: { ion: 1 },
      hull: 1,
    });
    await settle();

    const liveBar = document.getElementById('live-bar')!;
    expect(liveBar.hidden).toBe(false);

    (document.querySelector('a[href="/about"]') as HTMLAnchorElement).click();
    expect(window.location.pathname).toBe('/about');
    expect(liveBar.hidden).toBe(true);

    (document.querySelector('a[href="/"]') as HTMLAnchorElement).click();
    expect(window.location.pathname).toBe('/');
    expect(liveBar.hidden).toBe(false);
  });

  test('auto-simulates three fleets with exact combat', async () => {
    const addBtn = document.getElementById(
      'add-fleet-btn'
    ) as HTMLButtonElement;
    addBtn.click();

    for (const fleet of state.fleets) {
      addShipType(fleet.id, ShipType.Interceptor, { cannons: { ion: 1 } });
    }
    await settle();

    expect(state.simulationResults).not.toBeNull();
    expect(state.simulationResults!.method).toBe('exact');
    expect(
      state.simulationResults!.victoryProbability[state.fleets[0].id]
    ).toBeCloseTo(66 / 121, 9);
    expect(
      state.simulationResults!.victoryProbability[state.fleets[1].id]
    ).toBeCloseTo(30 / 121, 9);
    expect(
      state.simulationResults!.victoryProbability[state.fleets[2].id]
    ).toBeCloseTo(25 / 121, 9);
    expect(state.simulationResults!.reputationDraws.available).toBe(true);
    if (state.simulationResults!.reputationDraws.available) {
      expect(
        Object.keys(state.simulationResults!.reputationDraws.byFleet)
      ).toEqual(state.fleets.map((fleet) => fleet.id));
    }
  });

  test('treats attacker victory over Planta as an automatic population wipe', async () => {
    setFleetFaction(state.fleets[0].id, 'planta');
    addShipType(state.fleets[0].id, ShipType.Interceptor);
    addShipType(state.fleets[1].id, ShipType.Cruiser, {
      computers: 4,
      cannons: { ion: 1 },
    });

    await settle();

    const results = state.simulationResults!;
    const attackerWin = results.victoryProbability[state.fleets[1].id];
    const attackerBombardment =
      results.populationBombardment.byAttacker[state.fleets[1].id];
    for (const bucket of attackerBombardment.slice(1)) {
      expect(bucket.atLeastProbability).toBeCloseTo(attackerWin, 12);
    }
  });

  test('auto-simulates populated fleets while an added fleet is empty', async () => {
    const addBtn = document.getElementById(
      'add-fleet-btn'
    ) as HTMLButtonElement;
    addBtn.click();

    addShipType(state.fleets[0].id, ShipType.Interceptor, {
      cannons: { ion: 1 },
    });
    addShipType(state.fleets[1].id, ShipType.Cruiser, {
      cannons: { ion: 1 },
      hull: 1,
    });
    await settle();

    expect(state.fleets[2].shipTypes).toHaveLength(0);
    expect(state.simulationResults).not.toBeNull();
    expect(
      state.simulationResults!.victoryProbability[state.fleets[2].id]
    ).toBeUndefined();
    expect(document.querySelector('calc-results')).not.toBeNull();
  });

  test('keeps duplicate faction attackers separate in live odds', async () => {
    const addBtn = document.getElementById(
      'add-fleet-btn'
    ) as HTMLButtonElement;
    addBtn.click();

    setFleetFaction(state.fleets[1].id, 'terran');
    setFleetFaction(state.fleets[2].id, 'terran');
    addShipType(state.fleets[0].id, ShipType.Ancient, {
      hull: 1,
      computers: 1,
      initiative: 2,
      cannons: { ion: 2 },
    });
    addShipType(state.fleets[1].id, ShipType.Interceptor);
    addShipType(state.fleets[2].id, ShipType.Interceptor, {
      hull: 1,
      cannons: { ion: 1 },
    });

    await settle();

    expect(state.fleets[1].name).toBe('Terran Directorate 1');
    expect(state.fleets[2].name).toBe('Terran Directorate 2');
    expect(
      state.simulationResults!.victoryProbability[state.fleets[1].id]
    ).toBe(0);
    expect(
      state.simulationResults!.victoryProbability[state.fleets[2].id]
    ).toBeGreaterThan(0);
  });

  test('uses DPS exact fallback when both fleets have 3+ ship types', () => {
    const defender = new Fleet(
      'Defender',
      [
        new Ship(ShipType.Interceptor, { hull: 1 }),
        new Ship(ShipType.Cruiser, { hull: 2 }),
        new Ship(ShipType.Dreadnought, { hull: 2 }),
        new Ship(ShipType.Starbase, { hull: 1 }),
      ],
      false,
      DamageType.OPTIMAL
    );
    const attacker = new Fleet(
      'Attacker',
      [
        new Ship(ShipType.Interceptor, { hull: 2 }),
        new Ship(ShipType.Cruiser, { hull: 2 }),
        new Ship(ShipType.Dreadnought, { hull: 6 }),
        new Ship(ShipType.Dreadnought, { hull: 6 }),
      ],
      false,
      DamageType.OPTIMAL
    );

    expect(exactDpsPlannerOverrides([defender, attacker])).toEqual([
      DamageType.DPS,
      DamageType.DPS,
    ]);

    const dpsDefender = new Fleet(
      'Defender',
      defender.getRoster(),
      false,
      DamageType.DPS
    );
    const dpsAttacker = new Fleet(
      'Attacker',
      attacker.getRoster(),
      false,
      DamageType.DPS
    );

    expect(exactDpsPlannerOverrides([dpsDefender, dpsAttacker])).toEqual([
      undefined,
      undefined,
    ]);
  });

  test('keeps small two-type battles optimal below the state estimate cutoff', () => {
    const defender = new Fleet(
      'Defender',
      [
        new Ship(ShipType.Cruiser, { hull: 1 }),
        new Ship(ShipType.Dreadnought, { hull: 1 }),
      ],
      false,
      DamageType.OPTIMAL
    );
    const attacker = new Fleet(
      'Attacker',
      [
        new Ship(ShipType.Interceptor, { hull: 1 }),
        new Ship(ShipType.Starbase, { hull: 1 }),
      ],
      false,
      DamageType.OPTIMAL
    );

    expect(exactDpsPlannerOverrides([defender, attacker])).toEqual([
      undefined,
      undefined,
    ]);
  });

  test('keeps optimal mode when homogeneous targeting is reduced in the solver', () => {
    const singleTypeDefender = new Fleet(
      'Defender',
      [
        new Ship(ShipType.Interceptor, { hull: 10 }),
        new Ship(ShipType.Interceptor, { hull: 10 }),
      ],
      false,
      DamageType.OPTIMAL
    );
    const mixedAttacker = new Fleet(
      'Attacker',
      [
        new Ship(ShipType.Cruiser, { hull: 2 }),
        new Ship(ShipType.Dreadnought, { hull: 6 }),
      ],
      false,
      DamageType.OPTIMAL
    );

    expect(
      exactDpsPlannerOverrides([singleTypeDefender, mixedAttacker])
    ).toEqual([undefined, undefined]);
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

  test('renders ship stat configurations from the query string', async () => {
    window.history.replaceState(
      null,
      '',
      '/?v=1&d.interceptor=1&d.interceptor.hull=1&d.interceptor.comp=1' +
        '&d.interceptor.ion=1&a.cruiser=1&a.cruiser.hull=2' +
        '&a.cruiser.comp=1&a.cruiser.plasma=1&a.cruiser.plasma-m=1'
    );

    init();
    await customElements.whenDefined('calc-stat-cube');

    const ships = document.querySelectorAll('calc-ship-type');
    const statValue = (ship: Element, stat: string) =>
      ship
        .querySelector(`[data-stat="${stat}"] input`)
        ?.getAttribute('value') ??
      (ship.querySelector(`[data-stat="${stat}"] input`) as HTMLInputElement)
        ?.value;

    expect(ships[0].querySelector('.ship-type-name')?.textContent).toBe(
      'Interceptor'
    );
    expect(statValue(ships[0], 'hull')).toBe('1');
    expect(statValue(ships[0], 'computer')).toBe('+1');
    expect(statValue(ships[0], 'ion-cannon')).toBe('1');

    expect(ships[1].querySelector('.ship-type-name')?.textContent).toBe(
      'Cruiser'
    );
    expect(statValue(ships[1], 'hull')).toBe('2');
    expect(statValue(ships[1], 'computer')).toBe('+1');
    expect(statValue(ships[1], 'plasma-cannon')).toBe('1');
    expect(statValue(ships[1], 'plasma-missile')).toBe('2');
  });

  test('a battle in the URL wins over the saved setup', () => {
    localStorage.setItem('luminary:setup', 'v=1&a.dreadnought=2');
    window.history.replaceState(null, '', '/?v=1&a.cruiser=2');
    init();

    expect(state.fleets[1].shipTypes[0].type).toBe(ShipType.Cruiser);
    expect(state.fleets[1].shipTypes[0].config.hull).toBe(0);
    expect(state.fleets[1].shipTypes[0].config.cannons?.ion).toBe(0);
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
    expect(document.getElementById('recent-battles-control')?.hidden).toBe(
      false
    );
    const options = Array.from(select.querySelectorAll('option'));
    expect(options).toHaveLength(1);
    expect(options[0].value).not.toBe('');
    expect(options[0].textContent).toBe('3× Interceptor vs 2× Cruiser');
    expect(select.selectedIndex).toBe(-1);

    // Picking a recent battle loads it.
    resetFleets();
    select.value = options[0].value;
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
      expect(options[0].textContent).toBe('3× I vs 2× C');
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

    updateShipType(state.fleets[1].id, ship.id, {
      quantity: 2,
      config: { initiative: 2, hull: 1 },
    });
    expect(window.location.search).toBe('?v=1&a.cruiser=2&a.cruiser.hull=1');

    resetFleets();
    expect(window.location.search).toBe('');
  });

  test('serializes UI operating blueprints explicitly for v1 link safety', () => {
    init();
    const attackerSelector = document.querySelectorAll<HTMLSelectElement>(
      'calc-fleet .ship-selector'
    )[1];

    attackerSelector.value = 'cruiser';
    attackerSelector.dispatchEvent(new Event('change'));

    expect(window.location.search).toBe(
      '?v=1&a.cruiser=1&a.cruiser.hull=1&a.cruiser.comp=1&a.cruiser.ion=1'
    );
  });

  test('keeps the URL canonical after loading a shared battle', () => {
    window.history.replaceState(null, '', '/?v=1&a.cruiser.hull=1&junk=x');
    init();

    expect(window.location.search).toBe('?v=1&a.cruiser=1&a.cruiser.hull=1');
  });
});

describe('App steppers preference', () => {
  beforeEach(() => {
    localStorage.clear();
    resetFleets();
    setSimulationResults(null);
    document.cookie = 'luminary:steppers=; Max-Age=0; Path=/';
    document.documentElement.innerHTML = indexHtml;
  });

  afterEach(() => {
    document.cookie = 'luminary:steppers=; Max-Age=0; Path=/';
  });

  test('defaults to steppers on', () => {
    init();

    const toggle = document.getElementById('steppers-toggle')!;
    expect(
      toggle.querySelector('[data-steppers="on"]')?.classList.contains('active')
    ).toBe(true);
    expect(document.body.classList.contains('no-steppers')).toBe(false);
  });

  test('turning steppers off applies the layout class and saves the cookie', () => {
    init();

    const toggle = document.getElementById('steppers-toggle')!;
    (
      toggle.querySelector('[data-steppers="off"]') as HTMLButtonElement
    ).click();

    expect(document.body.classList.contains('no-steppers')).toBe(true);
    expect(loadSteppersPreference()).toBe(false);
  });

  test('restores a saved off preference on init', () => {
    saveSteppersPreference(false);

    init();

    const toggle = document.getElementById('steppers-toggle')!;
    expect(
      toggle
        .querySelector('[data-steppers="off"]')
        ?.classList.contains('active')
    ).toBe(true);
    expect(document.body.classList.contains('no-steppers')).toBe(true);
  });
});

describe('App theme preference', () => {
  beforeEach(() => {
    localStorage.clear();
    resetFleets();
    setSimulationResults(null);
    document.cookie = 'luminary:theme=; Max-Age=0; Path=/';
    delete document.documentElement.dataset.theme;
    document.documentElement.innerHTML = indexHtml;
  });

  afterEach(() => {
    document.cookie = 'luminary:theme=; Max-Age=0; Path=/';
    delete document.documentElement.dataset.theme;
  });

  test('follows the system by default and saves an explicit theme', () => {
    init();

    const select = document.getElementById('theme-select') as HTMLSelectElement;
    expect(select.value).toBe('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();

    select.value = 'light';
    select.dispatchEvent(new Event('change'));
    expect(loadThemePreference()).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  test('restores an explicit saved theme', () => {
    saveThemePreference('dark');
    init();

    const select = document.getElementById('theme-select') as HTMLSelectElement;
    expect(select.value).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
