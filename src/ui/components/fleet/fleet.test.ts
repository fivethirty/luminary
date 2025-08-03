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
