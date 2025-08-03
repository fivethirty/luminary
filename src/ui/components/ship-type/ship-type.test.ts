import { test, expect, beforeEach, describe } from 'bun:test';
import './index';
import type { ShipTypeElement } from './index';
import type { SelectorElement } from '../selector';
import { state, resetFleets } from '@ui/state';
import { ShipType } from '@calc/ship';

describe('ShipType', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // Reset state
    resetFleets();
  });

  test('displays ship data', async () => {
    // Create ship config
    const shipTypeConfig = {
      id: 'test-ship',
      type: ShipType.Cruiser,
      quantity: 3,
      config: {
        hull: 2,
        computer: 1,
        cannons: {
          ion: 2,
          plasma: 1,
        },
      },
    };

    const element = document.createElement('calc-ship-type') as ShipTypeElement;
    element.shipType = shipTypeConfig;
    element.fleetId = 'fleet-0';

    document.body.appendChild(element);

    // Wait for selectors to be ready
    await customElements.whenDefined('calc-selector');

    // Check ship name
    const nameSpan = element.querySelector('.ship-type-name');
    expect(nameSpan?.textContent).toBe('Cruiser');

    // Check quantity
    const qtySelector = element.querySelector(
      'calc-selector'
    ) as SelectorElement;
    expect(qtySelector.value).toBe(3);

    // Check hull value
    const hullSelector = element.querySelector(
      '[data-stat="hull"]'
    ) as SelectorElement;
    expect(hullSelector.value).toBe(2);
  });

  test('updates state on change', async () => {
    // Add ship to state
    const shipTypeConfig = {
      id: 'test-ship-2',
      type: ShipType.Interceptor,
      quantity: 1,
      config: {},
    };

    state.fleets[0].shipTypes.push(shipTypeConfig);

    const element = document.createElement('calc-ship-type') as ShipTypeElement;
    element.shipType = shipTypeConfig;
    element.fleetId = 'fleet-0';

    document.body.appendChild(element);

    await customElements.whenDefined('calc-selector');

    // Simulate quantity change
    const qtySelector = element.querySelector(
      'calc-selector'
    ) as SelectorElement;

    // Click increment button
    const incrementBtn = qtySelector.querySelectorAll('button')[1];
    incrementBtn.click();

    // Check that state was updated
    expect(state.fleets[0].shipTypes[0].quantity).toBe(2);
  });

  test('removes itself from state', () => {
    // Add ship to state
    const shipTypeConfig = {
      id: 'test-ship-3',
      type: ShipType.Cruiser,
      quantity: 1,
      config: {},
    };

    state.fleets[0].shipTypes.push(shipTypeConfig);

    const element = document.createElement('calc-ship-type') as ShipTypeElement;
    element.shipType = shipTypeConfig;
    element.fleetId = 'fleet-0';

    document.body.appendChild(element);

    expect(state.fleets[0].shipTypes.length).toBe(1);

    const removeBtn = element.querySelector('.remove-btn') as HTMLButtonElement;
    removeBtn.click();

    // Should remove from state
    expect(state.fleets[0].shipTypes.length).toBe(0);
    // Should remove from DOM
    expect(element.parentNode).toBe(null);
  });
});
