import { test, expect, beforeEach, describe } from 'bun:test';
import './index';
import type { FleetElement } from './index';
import { state, resetFleets } from '@ui/state';
import { ShipType } from '@calc/ship';

describe('Fleet', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetFleets();
  });

  test('displays fleet name', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0]; // Use defender fleet

    document.body.appendChild(element);

    const nameSpan = element.querySelector('.fleet-name') as HTMLSpanElement;
    expect(nameSpan.textContent).toBe('Defender');
  });

  test('can add ships', async () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];

    document.body.appendChild(element);

    await customElements.whenDefined('calc-ship-type');

    const shipSelector = element.querySelector(
      '.ship-selector'
    ) as HTMLSelectElement;
    shipSelector.value = 'interceptor';
    shipSelector.dispatchEvent(new Event('change'));

    expect(state.fleets[0].shipTypes.length).toBe(1);
    expect(state.fleets[0].shipTypes[0].type).toBe(ShipType.Interceptor);

    const shipElements = element.querySelectorAll('calc-ship-type');
    expect(shipElements.length).toBe(1);
    expect(shipSelector.value).toBe('');
  });

  test('respects can-remove attribute', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    element.setAttribute('can-remove', 'false');

    document.body.appendChild(element);

    const removeBtn = element.querySelector('.remove-btn') as HTMLButtonElement;
    expect(removeBtn.disabled).toBe(true);
  });

  test('removes itself from state', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[1];
    element.setAttribute('can-remove', 'true');

    document.body.appendChild(element);

    expect(state.fleets.length).toBe(2);

    let eventFired = false;
    element.addEventListener('fleet-removed', (e) => {
      eventFired = true;
      expect((e as CustomEvent).detail.fleetId).toBe('fleet-1');
    });

    const removeBtn = element.querySelector('.remove-btn') as HTMLButtonElement;
    removeBtn.click();

    expect(state.fleets.length).toBe(1);
    expect(eventFired).toBe(true);
  });

  test('disables already added ship types in selector', async () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    document.body.appendChild(element);

    const shipSelector = element.querySelector(
      '.ship-selector'
    ) as HTMLSelectElement;
    shipSelector.value = 'interceptor';
    shipSelector.dispatchEvent(new Event('change'));

    const interceptorOption = Array.from(shipSelector.options).find(
      (opt) => opt.value === 'interceptor'
    );
    expect(interceptorOption?.disabled).toBe(true);
  });

  test('assigns correct default stats to new ships', async () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    document.body.appendChild(element);

    const shipSelector = element.querySelector(
      '.ship-selector'
    ) as HTMLSelectElement;
    shipSelector.value = 'cruiser';
    shipSelector.dispatchEvent(new Event('change'));

    const addedShip = state.fleets[0].shipTypes[0];
    expect(addedShip.type).toBe(ShipType.Cruiser);
    expect(addedShip.config.hull).toBe(0);
    expect(addedShip.config.initiative).toBe(2);
  });

  const plannerSelect = (element: FleetElement): HTMLSelectElement =>
    element.querySelector('.planner-type-select') as HTMLSelectElement;

  const addShip = (element: FleetElement, value: string) => {
    const selector = element.querySelector(
      '.ship-selector'
    ) as HTMLSelectElement;
    selector.value = value;
    selector.dispatchEvent(new Event('change'));
  };

  test('shows an editable player planner for an empty fleet', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    document.body.appendChild(element);
    const select = plannerSelect(element);
    expect(select.disabled).toBe(false);
    expect(select.value).toBe(state.fleets[0].plannerType);
    expect(select.value).not.toBe('npc');
  });

  test('locks the planner to NPC when the fleet is all AI ships', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    document.body.appendChild(element);

    addShip(element, 'ancient');
    addShip(element, 'guardian');

    const select = plannerSelect(element);
    expect(select.disabled).toBe(true);
    expect(select.value).toBe('npc');
  });

  test('ignores NPC planner change events', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    document.body.appendChild(element);

    addShip(element, 'ancient');
    const select = plannerSelect(element);
    select.dispatchEvent(new Event('change'));

    expect(state.fleets[0].plannerType).toBe('optimal');
    expect(select.value).toBe('npc');
  });

  test('restores an editable planner when a player ship is added', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    document.body.appendChild(element);

    addShip(element, 'ancient');
    expect(plannerSelect(element).disabled).toBe(true);
    expect(plannerSelect(element).value).toBe('npc');

    // Adding a player ship makes the fleet non-AI again.
    addShip(element, 'cruiser');
    expect(plannerSelect(element).disabled).toBe(false);
    expect(plannerSelect(element).value).toBe(state.fleets[0].plannerType);
  });

  const shipOption = (element: FleetElement, value: string) =>
    Array.from(
      (element.querySelector('.ship-selector') as HTMLSelectElement).options
    ).find((opt) => opt.value === value);

  test('attacker fleets do not offer defender-only ships', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[1]; // an attacker
    element.setAttribute('is-defender', 'false');
    document.body.appendChild(element);

    // Defender-only options are hidden and disabled.
    for (const defenderOnly of [
      'starbase',
      'orbital',
      'ancient',
      'ancient-adv',
      'guardian',
      'gcds',
      'gcds-wa',
    ]) {
      expect(shipOption(element, defenderOnly)?.hidden).toBe(true);
      expect(shipOption(element, defenderOnly)?.disabled).toBe(true);
    }
    // Player options remain available.
    for (const player of ['interceptor', 'cruiser', 'dreadnought']) {
      expect(shipOption(element, player)?.hidden).toBe(false);
    }
  });

  test('the defender fleet offers AI ships', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0]; // the defender
    element.setAttribute('is-defender', 'true');
    document.body.appendChild(element);

    for (const defenderOnly of [
      'starbase',
      'orbital',
      'ancient',
      'guardian',
      'gcds',
    ]) {
      expect(shipOption(element, defenderOnly)?.hidden).toBe(false);
    }
  });

  test('adding a player ship evicts AI ships (no mixing)', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    element.setAttribute('is-defender', 'true');
    document.body.appendChild(element);

    addShip(element, 'ancient');
    addShip(element, 'guardian');
    expect(state.fleets[0].shipTypes.map((st) => st.type)).toEqual([
      ShipType.Ancient,
      ShipType.Guardian,
    ]);

    // Adding a player ship clears the AI ships.
    addShip(element, 'cruiser');
    expect(state.fleets[0].shipTypes.map((st) => st.type)).toEqual([
      ShipType.Cruiser,
    ]);
    expect(element.querySelectorAll('calc-ship-type').length).toBe(1);
  });

  test('adding an AI ship evicts player ships (no mixing)', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    element.setAttribute('is-defender', 'true');
    document.body.appendChild(element);

    addShip(element, 'cruiser');
    addShip(element, 'interceptor');
    expect(state.fleets[0].shipTypes).toHaveLength(2);

    addShip(element, 'guardian');
    expect(state.fleets[0].shipTypes.map((st) => st.type)).toEqual([
      ShipType.Guardian,
    ]);
    expect(element.querySelectorAll('calc-ship-type').length).toBe(1);
  });

  test('disables all variants when base ship type is added', async () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    document.body.appendChild(element);

    const shipSelector = element.querySelector(
      '.ship-selector'
    ) as HTMLSelectElement;
    shipSelector.value = 'ancient';
    shipSelector.dispatchEvent(new Event('change'));

    const ancientOption = Array.from(shipSelector.options).find(
      (opt) => opt.value === 'ancient'
    );
    const ancientAdvOption = Array.from(shipSelector.options).find(
      (opt) => opt.value === 'ancient-adv'
    );
    const ancientWaOption = Array.from(shipSelector.options).find(
      (opt) => opt.value === 'ancient-wa'
    );

    expect(ancientOption?.disabled).toBe(true);
    expect(ancientAdvOption?.disabled).toBe(true);
    expect(ancientWaOption?.disabled).toBe(true);
  });
});
