import { test, expect, beforeEach, describe } from 'bun:test';
import './index';
import type { FleetElement } from './index';
import { state, resetFleets, removeShipType } from '@ui/state';
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

  test('preset chips add NPCs to the defender, tapping again adds more', async () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    element.setAttribute('is-defender', 'true');

    document.body.appendChild(element);
    await customElements.whenDefined('calc-ship-type');

    const chips = element.querySelector('.preset-chips') as HTMLElement;
    expect(chips.hidden).toBe(false);

    const ancientPicker = presetPicker(element, 'Add Ancient layout');

    choosePreset(ancientPicker, 'ancient');
    expect(state.fleets[0].shipTypes).toHaveLength(1);
    expect(state.fleets[0].shipTypes[0].type).toBe(ShipType.Ancient);
    expect(state.fleets[0].shipTypes[0].quantity).toBe(1);
    expect(state.fleets[0].shipTypes[0].config.hull).toBe(1);

    choosePreset(ancientPicker, 'ancient');
    expect(state.fleets[0].shipTypes[0].quantity).toBe(2);

    // Ancients cap at 2; a third tap is a no-op.
    choosePreset(ancientPicker, 'ancient');
    expect(state.fleets[0].shipTypes[0].quantity).toBe(2);
  });

  test('preset chips swap NPC variants directly', async () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    element.setAttribute('is-defender', 'true');

    document.body.appendChild(element);
    await customElements.whenDefined('calc-ship-type');

    const ancientPicker = presetPicker(element, 'Add Ancient layout');

    choosePreset(ancientPicker, 'ancient');
    state.fleets[0].shipTypes[0].quantity = 2;
    choosePreset(ancientPicker, 'ancient-wa');

    expect(state.fleets[0].shipTypes).toHaveLength(1);
    const ship = state.fleets[0].shipTypes[0];
    expect(ship.type).toBe(ShipType.Ancient);
    expect(ship.quantity).toBe(2);
    expect(ship.config.computers).toBe(2);
    expect(ship.config.initiative).toBe(3);
    expect(ship.config.cannons?.ion).toBe(1);
  });

  test('preset chips are hidden for attackers', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[1];
    element.setAttribute('is-defender', 'false');

    document.body.appendChild(element);

    const chips = element.querySelector('.preset-chips') as HTMLElement;
    expect(chips.hidden).toBe(true);
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

  test('restores a recently removed single-variant ship configuration', async () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    document.body.appendChild(element);

    addShip(element, 'dreadnought');
    const dreadnought = state.fleets[0].shipTypes[0];
    dreadnought.quantity = 2;
    dreadnought.config = {
      hull: 4,
      computers: 2,
      cannons: { plasma: 1 },
    };
    removeShipType(state.fleets[0].id, dreadnought.id);

    addShip(element, 'cruiser');
    addShip(element, 'dreadnought');

    expect(state.fleets[0].shipTypes).toHaveLength(2);
    const restored = state.fleets[0].shipTypes.find(
      (ship) => ship.type === ShipType.Dreadnought
    )!;
    expect(restored.type).toBe(ShipType.Dreadnought);
    expect(restored.quantity).toBe(2);
    expect(restored.config).toEqual({
      hull: 4,
      computers: 2,
      cannons: { plasma: 1 },
    });
  });

  const plannerSelect = (element: FleetElement): HTMLSelectElement =>
    element.querySelector('.planner-type-select') as HTMLSelectElement;

  const npcPlannerOption = (
    select: HTMLSelectElement
  ): HTMLOptionElement | null =>
    select.querySelector('option[value="npc"]') as HTMLOptionElement | null;

  const presetPicker = (
    element: FleetElement,
    label: string
  ): HTMLSelectElement =>
    element.querySelector(`[aria-label="${label}"]`) as HTMLSelectElement;

  const choosePreset = (picker: HTMLSelectElement, value: string) => {
    picker.value = value;
    picker.dispatchEvent(new Event('change'));
  };

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
    expect(npcPlannerOption(select)).toBeNull();
  });

  test('locks the planner to NPC when the fleet is all AI ships', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    document.body.appendChild(element);

    addShip(element, 'ancient');
    addShip(element, 'guardian');

    const select = plannerSelect(element);
    expect(state.fleets[0].shipTypes.map((st) => st.type)).toEqual([
      ShipType.Guardian,
    ]);
    expect(select.disabled).toBe(true);
    expect(select.value).toBe('npc');
    expect(npcPlannerOption(select)?.disabled).toBe(false);
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
    expect(npcPlannerOption(plannerSelect(element))).toBeNull();
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

  test('adding a player ship evicts NPC ships (no mixing)', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    element.setAttribute('is-defender', 'true');
    document.body.appendChild(element);

    addShip(element, 'ancient');
    expect(state.fleets[0].shipTypes.map((st) => st.type)).toEqual([
      ShipType.Ancient,
    ]);

    // Adding a player ship clears the NPC ships.
    addShip(element, 'cruiser');
    expect(state.fleets[0].shipTypes.map((st) => st.type)).toEqual([
      ShipType.Cruiser,
    ]);
    expect(element.querySelectorAll('calc-ship-type').length).toBe(1);
  });

  test('adding an NPC ship evicts a different NPC type', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    element.setAttribute('is-defender', 'true');
    document.body.appendChild(element);

    addShip(element, 'ancient');
    addShip(element, 'guardian');

    expect(state.fleets[0].shipTypes.map((st) => st.type)).toEqual([
      ShipType.Guardian,
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

  test('variants stay selectable while their type is fielded', async () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    document.body.appendChild(element);

    addShip(element, 'ancient');

    expect(shipOption(element, 'ancient')?.disabled).toBe(false);
    expect(shipOption(element, 'ancient-adv')?.disabled).toBe(false);
    expect(shipOption(element, 'ancient-wa')?.disabled).toBe(false);
  });

  test('selecting a variant swaps the fielded ship stats in place', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    element.setAttribute('is-defender', 'true');
    document.body.appendChild(element);

    addShip(element, 'ancient');
    state.fleets[0].shipTypes[0].quantity = 2;

    addShip(element, 'ancient-wa');

    expect(state.fleets[0].shipTypes).toHaveLength(1);
    const ship = state.fleets[0].shipTypes[0];
    expect(ship.type).toBe(ShipType.Ancient);
    expect(ship.quantity).toBe(2);
    expect(ship.config.computers).toBe(2);
    expect(ship.config.initiative).toBe(3);
    expect(ship.config.cannons?.ion).toBe(1);
    expect(element.querySelectorAll('calc-ship-type').length).toBe(1);
  });

  test('allows selecting a different NPC type when an NPC type is added', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    element.setAttribute('is-defender', 'true');
    document.body.appendChild(element);

    addShip(element, 'ancient');

    expect(shipOption(element, 'guardian')?.disabled).toBe(false);
    expect(shipOption(element, 'guardian-adv')?.disabled).toBe(false);
    expect(shipOption(element, 'gcds')?.disabled).toBe(false);
    expect(shipOption(element, 'cruiser')?.disabled).toBe(false);
  });
});
