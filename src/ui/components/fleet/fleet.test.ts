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

  test('provides an abbreviated faction name for the mobile layout', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    state.fleets[1].factionId = 'rho-indi';
    element.fleet = state.fleets[1];

    document.body.appendChild(element);

    const nameSpan = element.querySelector('.fleet-name') as HTMLSpanElement;
    expect(nameSpan.textContent).toBe('Rho Indi Syndicate');
    expect(nameSpan.dataset.shortLabel).toBe('Rho Indi');
  });

  test('keeps reorder buttons, name, and edit button in one title row', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];

    document.body.appendChild(element);

    const titleRow = element.querySelector('.fleet-title-row')!;
    expect(
      Array.from(titleRow.children).map((child) => child.className)
    ).toEqual(['role-controls', 'fleet-name text-bold', 'fleet-settings-btn']);
    expect(
      titleRow.querySelector('.fleet-settings-btn')?.textContent?.trim()
    ).toBe('Edit');
  });

  test('opens metadata editing from the role name and excludes neutral color', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];

    document.body.appendChild(element);

    const dialog = element.querySelector(
      '.fleet-settings-dialog'
    ) as HTMLDialogElement;
    const editButton = element.querySelector(
      '.fleet-settings-btn'
    ) as HTMLButtonElement;
    editButton.click();

    expect(dialog.open).toBe(true);
    expect(element.querySelectorAll('.color-option')).toHaveLength(6);
    expect(element.querySelector('.color-option[value="neutral"]')).toBeNull();
    expect(element.querySelector('.color-unset-btn')).not.toBeNull();
  });

  test('metadata dialog updates faction and selected color', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[1];

    document.body.appendChild(element);

    const factionSelect = element.querySelector(
      '.faction-select'
    ) as HTMLSelectElement;
    factionSelect.value = 'rho-indi';
    factionSelect.dispatchEvent(new Event('change'));

    const redButton = element.querySelector(
      '.color-option[value="red"]'
    ) as HTMLButtonElement;
    redButton.click();

    expect(state.fleets[1].factionId).toBe('rho-indi');
    expect(state.fleets[1].colorId).toBe('red');
    expect(state.fleets[0].colorId).toBe('neutral');
  });

  test('can return a manually selected color to its positional default', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[1];
    element.setAttribute('fleet-index', '1');

    document.body.appendChild(element);

    const unsetButton = element.querySelector(
      '.color-unset-btn'
    ) as HTMLButtonElement;
    const redButton = element.querySelector(
      '.color-option[value="red"]'
    ) as HTMLButtonElement;
    expect(unsetButton.disabled).toBe(true);
    expect(unsetButton.classList.contains('selected')).toBe(true);
    expect(unsetButton.getAttribute('aria-pressed')).toBe('true');
    expect(element.querySelector('.color-option.selected')).toBeNull();

    redButton.click();
    expect(state.fleets[1].colorId).toBe('red');
    expect(state.fleets[1].colorIsManual).toBe(true);
    expect(unsetButton.disabled).toBe(false);
    expect(unsetButton.classList.contains('selected')).toBe(false);
    expect(redButton.classList.contains('selected')).toBe(true);

    unsetButton.click();
    expect(state.fleets[1].colorId).toBe('blue');
    expect(state.fleets[1].colorIsManual).toBe(false);
    expect(unsetButton.disabled).toBe(true);
    expect(unsetButton.classList.contains('selected')).toBe(true);
    expect(redButton.classList.contains('selected')).toBe(false);
    expect(element.querySelector('.color-option.selected')).toBeNull();
  });

  test('uses the neutral defender header treatment only while color is unset', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    element.setAttribute('is-defender', 'true');

    document.body.appendChild(element);

    const fleet = element.querySelector('.fleet') as HTMLElement;
    expect(fleet.classList.contains('fleet-neutral')).toBe(true);

    const redButton = element.querySelector(
      '.color-option[value="red"]'
    ) as HTMLButtonElement;
    redButton.click();

    expect(state.fleets[0].colorId).toBe('red');
    expect(fleet.classList.contains('fleet-neutral')).toBe(false);
  });

  test('names an NPC defender The Ancients', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    element.setAttribute('is-defender', 'true');

    document.body.appendChild(element);

    addShip(element, 'ancient');

    expect(state.fleets[0].name).toBe('Defender');
    expect(element.querySelector('.fleet-name')?.textContent).toBe(
      'The Ancients'
    );
    expect(
      (element.querySelector('.fleet-settings-btn') as HTMLButtonElement).hidden
    ).toBe(true);
    expect(state.fleets[0].colorId).toBe('neutral');
  });

  test('restores defender display after removing an NPC ship', async () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    element.setAttribute('is-defender', 'true');

    document.body.appendChild(element);
    await customElements.whenDefined('calc-ship-type');

    addShip(element, 'ancient');
    const shipElement = element.querySelector('calc-ship-type')!;
    const removeButton = shipElement.querySelector(
      '.remove-btn'
    ) as HTMLButtonElement;
    removeButton.click();

    expect(state.fleets[0].name).toBe('Defender');
    expect(element.querySelector('.fleet-name')?.textContent).toBe('Defender');
    expect(
      (element.querySelector('.fleet-settings-btn') as HTMLButtonElement).hidden
    ).toBe(false);
    expect(state.fleets[0].colorId).toBe('neutral');
  });

  test('uses up and down controls to shift battle position', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[1];
    element.setAttribute('fleet-index', '1');
    element.setAttribute('fleet-count', '2');

    document.body.appendChild(element);

    let eventFired = false;
    element.addEventListener('fleet-order-changed', () => {
      eventFired = true;
    });

    const moveUpBtn = element.querySelector(
      '.move-up-btn'
    ) as HTMLButtonElement;
    const moveDownBtn = element.querySelector(
      '.move-down-btn'
    ) as HTMLButtonElement;

    expect(moveUpBtn.disabled).toBe(false);
    expect(moveDownBtn.disabled).toBe(true);

    moveUpBtn.click();

    expect(state.fleets[0].id).toBe('fleet-1');
    expect(eventFired).toBe(true);
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

  test('uses blueprint editors for players and tile artwork for NPCs in Ship tiles mode', () => {
    const player = document.createElement('calc-fleet') as FleetElement;
    player.fleet = state.fleets[0];
    player.controlMode = 'ships';
    document.body.appendChild(player);
    const shipSelect = player.querySelector(
      '.ship-selector'
    ) as HTMLSelectElement;
    shipSelect.value = 'interceptor';
    shipSelect.dispatchEvent(new Event('change'));
    expect(player.querySelector('calc-ship-blueprint')).not.toBeNull();
    expect(state.fleets[0].shipTypes[0].blueprint).toBeDefined();

    document.body.innerHTML = '';
    resetFleets();
    state.fleets[0].shipTypes.push({
      id: 'ancient',
      type: ShipType.Ancient,
      quantity: 1,
      config: {},
    });
    const npc = document.createElement('calc-fleet') as FleetElement;
    npc.fleet = state.fleets[0];
    npc.controlMode = 'ships';
    document.body.appendChild(npc);
    const ancient = npc.querySelector('calc-ship-type') as HTMLElement;
    expect(ancient).not.toBeNull();
    expect(npc.querySelector('calc-ship-blueprint')).toBeNull();
    expect(
      (ancient.querySelector('.ship-tile-image') as HTMLImageElement).src
    ).toContain('ai-anc');
    expect((ancient.querySelector('.ship-tile') as HTMLElement).hidden).toBe(
      false
    );
    expect((ancient.querySelector('.stats') as HTMLElement).hidden).toBe(true);
  });

  test('places the ship and NPC add controls together after the ship list', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];

    document.body.appendChild(element);

    const ships = element.querySelector('.fleet-ships')!;
    const addRow = element.querySelector('.fleet-add-row')!;
    const selectorControl = addRow.querySelector('.ship-selector-control');
    const selector = addRow.querySelector('.ship-selector');
    const presets = addRow.querySelector('.preset-chips');

    expect(ships.nextElementSibling).toBe(addRow);
    expect(selector?.getAttribute('aria-label')).toBe('Add ship type');
    expect(selectorControl?.nextElementSibling).toBe(presets);
    expect(selector?.querySelector('option[value=""]')).toBeNull();
    expect((selector as HTMLSelectElement).selectedIndex).toBe(-1);
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

  test('preset picker options only include selectable variants', async () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    element.setAttribute('is-defender', 'true');

    document.body.appendChild(element);
    await customElements.whenDefined('calc-ship-type');

    const ancientPicker = presetPicker(element, 'Add Ancient layout');
    expect(
      Array.from(ancientPicker.options).map((opt) => opt.textContent)
    ).toEqual(['Base', 'A', 'WA']);
    expect(
      Array.from(ancientPicker.options).some(
        (opt) => opt.textContent === 'Ancient'
      )
    ).toBe(false);
    expect(ancientPicker.selectedIndex).toBe(-1);

    choosePreset(ancientPicker, 'ancient');
    expect(ancientPicker.selectedIndex).toBe(-1);
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
    expect(addedShip.config.hull).toBe(1);
    expect(addedShip.config.computers).toBe(1);
    expect(addedShip.config.cannons?.ion).toBe(1);
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
    const npcType = ['ancient', 'guardian', 'gcds'].find(
      (type) => value === type || value.startsWith(`${type}-`)
    );
    if (npcType) {
      const label = `${npcType[0].toUpperCase()}${npcType.slice(1)}`;
      choosePreset(presetPicker(element, `Add ${label} layout`), value);
      return;
    }

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
    expect(npcPlannerOption(select)).not.toBeNull();
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      'npc',
      'dps',
      'optimal',
    ]);
  });

  test('selects NPC targeting for a player fleet', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    document.body.appendChild(element);

    const select = plannerSelect(element);
    select.value = 'npc';
    select.dispatchEvent(new Event('change'));

    expect(state.fleets[0].plannerType).toBe('npc');
    expect(select.disabled).toBe(false);
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
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      'npc',
    ]);
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
    expect(npcPlannerOption(plannerSelect(element))).not.toBeNull();
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

    // iOS may expose hidden options, so illegal structures are absent.
    for (const defenderOnly of ['starbase', 'orbital']) {
      expect(shipOption(element, defenderOnly)).toBeUndefined();
    }
    // Player options remain available.
    for (const player of ['interceptor', 'cruiser', 'dreadnought']) {
      expect(shipOption(element, player)).toBeDefined();
    }
  });

  test('the defender dropdown offers structures but omits pill-based NPCs', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0]; // the defender
    element.setAttribute('is-defender', 'true');
    document.body.appendChild(element);

    for (const defenderOnly of ['starbase', 'orbital']) {
      expect(shipOption(element, defenderOnly)).toBeDefined();
    }
    for (const npc of [
      'ancient',
      'ancient-adv',
      'ancient-wa',
      'guardian',
      'guardian-adv',
      'guardian-wa',
      'gcds',
      'gcds-adv',
      'gcds-wa',
    ]) {
      expect(shipOption(element, npc)).toBeUndefined();
    }
  });

  test('offers only the structure available to the selected faction', () => {
    state.fleets[0].factionId = 'exiles';
    const exiles = document.createElement('calc-fleet') as FleetElement;
    exiles.fleet = state.fleets[0];
    exiles.setAttribute('is-defender', 'true');
    document.body.appendChild(exiles);

    expect(shipOption(exiles, 'orbital')).toBeDefined();
    expect(shipOption(exiles, 'starbase')).toBeUndefined();

    state.fleets[0].factionId = 'terran';
    const terran = document.createElement('calc-fleet') as FleetElement;
    terran.fleet = state.fleets[0];
    terran.setAttribute('is-defender', 'true');
    document.body.appendChild(terran);

    expect(shipOption(terran, 'starbase')).toBeDefined();
    expect(shipOption(terran, 'orbital')).toBeUndefined();
  });

  test('does not offer dreadnoughts to Rho Indi', () => {
    state.fleets[1].factionId = 'rho-indi';
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[1];
    element.setAttribute('is-defender', 'false');
    document.body.appendChild(element);

    expect(shipOption(element, 'dreadnought')).toBeUndefined();
    expect(shipOption(element, 'cruiser')).toBeDefined();
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

  test('NPC pill variants stay selectable while their type is fielded', async () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    document.body.appendChild(element);

    addShip(element, 'ancient');

    const picker = presetPicker(element, 'Add Ancient layout');
    expect(Array.from(picker.options).map((option) => option.value)).toEqual([
      'ancient',
      'ancient-adv',
      'ancient-wa',
    ]);
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

  test('keeps every NPC pill available when an NPC type is added', () => {
    const element = document.createElement('calc-fleet') as FleetElement;
    element.fleet = state.fleets[0];
    element.setAttribute('is-defender', 'true');
    document.body.appendChild(element);

    addShip(element, 'ancient');

    expect(presetPicker(element, 'Add Guardian layout')).not.toBeNull();
    expect(presetPicker(element, 'Add GCDS layout')).not.toBeNull();
    expect(shipOption(element, 'cruiser')?.disabled).toBe(false);
  });
});
