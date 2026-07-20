import { test, expect, beforeEach, describe } from 'bun:test';
import './index';
import type { ShipTypeElement } from './index';
import type { SelectorElement } from '../selector';
import { state, resetFleets } from '@ui/state';
import { ShipType } from '@calc/ship';

describe('ShipType', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetFleets();
  });

  test('displays ship data', async () => {
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

    await customElements.whenDefined('calc-selector');

    const nameSpan = element.querySelector('.ship-type-name');
    expect(nameSpan?.textContent).toBe('Cruiser');

    const qtySelector = element.querySelector(
      'calc-selector'
    ) as SelectorElement;
    expect(qtySelector.value).toBe(3);

    const hullSelector = element.querySelector(
      '[data-stat="hull"]'
    ) as SelectorElement;
    expect(hullSelector.value).toBe(2);
  });

  test('groups stats under section headings with short weapon labels', () => {
    const shipTypeConfig = {
      id: 'test-ship-labels',
      type: ShipType.Interceptor,
      quantity: 1,
      config: {},
    };

    const element = document.createElement('calc-ship-type') as ShipTypeElement;
    element.shipType = shipTypeConfig;
    element.fleetId = 'fleet-0';

    document.body.appendChild(element);

    expect(
      Array.from(element.querySelectorAll('.stat-group-title')).map(
        (title) => title.textContent
      )
    ).toEqual(['Systems', 'Cannons', 'Missiles']);
    expect(
      element.querySelector('[data-stat="ion-cannon"] label')?.textContent
    ).toBe('Ion');
    expect(
      element.querySelector('[data-stat="ion-missile"] label')?.textContent
    ).toBe('Flux');
    expect(
      element.querySelector('[data-stat="rift-cannon"] label')?.textContent
    ).toBe('Rift');
    expect(
      element
        .querySelector('[data-stat="computer"] input')
        ?.getAttribute('aria-label')
    ).toBe('Interceptor computer');
    expect(
      element.querySelector('.stat-group-core')?.getAttribute('aria-label')
    ).toBe('Interceptor systems');
    expect(
      element
        .querySelector('calc-selector .selector')
        ?.getAttribute('aria-label')
    ).toBe('Interceptor quantity');
    expect(
      element.querySelector('.remove-btn')?.getAttribute('aria-label')
    ).toBe('Remove Interceptor');
  });

  test('displays NPC variant names', () => {
    const shipTypeConfig = {
      id: 'test-ancient-wa-name',
      type: ShipType.Ancient,
      quantity: 1,
      config: {
        hull: 1,
        computers: 2,
        initiative: 3,
        cannons: { ion: 1 },
      },
    };

    const element = document.createElement('calc-ship-type') as ShipTypeElement;
    element.shipType = shipTypeConfig;
    element.fleetId = 'fleet-0';

    document.body.appendChild(element);

    expect(element.querySelector('.ship-type-name')?.textContent).toBe(
      'Ancient (WA)'
    );
  });

  test('updates state on change', async () => {
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

    const qtySelector = element.querySelector(
      'calc-selector'
    ) as SelectorElement;

    const incrementBtn = qtySelector.querySelectorAll('button')[1];
    incrementBtn.click();

    expect(state.fleets[0].shipTypes[0].quantity).toBe(2);
  });

  test('enforces player missile component limits', () => {
    const shipTypeConfig = {
      id: 'test-missile-limits',
      type: ShipType.Cruiser,
      quantity: 1,
      config: {},
    };

    state.fleets[0].shipTypes.push(shipTypeConfig);

    const element = document.createElement('calc-ship-type') as ShipTypeElement;
    element.shipType = shipTypeConfig;
    element.fleetId = 'fleet-0';

    document.body.appendChild(element);

    const plasma = element.querySelector(
      '[data-stat="plasma-missile"]'
    ) as HTMLElement;
    const soliton = element.querySelector(
      '[data-stat="soliton-missile"]'
    ) as HTMLElement;
    const antimatter = element.querySelector(
      '[data-stat="antimatter-missile"]'
    ) as HTMLElement;

    (plasma.querySelector('.stat-inc') as HTMLButtonElement).click();
    expect(state.fleets[0].shipTypes[0].config.missiles?.plasma).toBe(2);

    const solitonInc = soliton.querySelector('.stat-inc') as HTMLButtonElement;
    solitonInc.click();
    expect(solitonInc.disabled).toBe(true);
    solitonInc.click();
    expect(state.fleets[0].shipTypes[0].config.missiles?.soliton).toBe(1);

    const antimatterInput = antimatter.querySelector(
      'input'
    ) as HTMLInputElement;
    const antimatterInc = antimatter.querySelector(
      '.stat-inc'
    ) as HTMLButtonElement;
    antimatterInput.value = '9';
    antimatterInput.dispatchEvent(new Event('change'));
    expect(state.fleets[0].shipTypes[0].config.missiles?.antimatter).toBe(1);
    expect(antimatterInc.disabled).toBe(true);
  });

  test('normalizes existing missile component values when rendering', () => {
    const shipTypeConfig = {
      id: 'test-existing-missile-limits',
      type: ShipType.Cruiser,
      quantity: 1,
      config: {
        missiles: { plasma: 1, soliton: 2, antimatter: 3 },
      },
    };
    state.fleets[0].shipTypes.push(shipTypeConfig);

    const element = document.createElement('calc-ship-type') as ShipTypeElement;
    element.shipType = shipTypeConfig;
    element.fleetId = 'fleet-0';

    document.body.appendChild(element);

    expect(shipTypeConfig.config.missiles?.plasma).toBe(2);
    expect(shipTypeConfig.config.missiles?.soliton).toBe(1);
    expect(shipTypeConfig.config.missiles?.antimatter).toBe(1);
  });

  test('disables NPC ship layout stats', () => {
    const shipTypeConfig = {
      id: 'test-ancient',
      type: ShipType.Ancient,
      quantity: 1,
      config: {
        computers: 1,
        cannons: { ion: 2 },
      },
    };

    state.fleets[0].shipTypes.push(shipTypeConfig);

    const element = document.createElement('calc-ship-type') as ShipTypeElement;
    element.shipType = shipTypeConfig;
    element.fleetId = 'fleet-0';

    document.body.appendChild(element);

    const compCube = element.querySelector(
      '[data-stat="computer"]'
    ) as HTMLElement;
    const input = compCube.querySelector('input') as HTMLInputElement;
    const inc = compCube.querySelector('.stat-inc') as HTMLButtonElement;

    expect(compCube.hasAttribute('disabled')).toBe(true);
    expect(input.disabled).toBe(true);
    expect(inc.disabled).toBe(true);
  });

  test.each([
    [ShipType.Interceptor, 8],
    [ShipType.Cruiser, 4],
    [ShipType.Dreadnought, 2],
    [ShipType.Orbital, 1],
    [ShipType.Starbase, 4],
    [ShipType.Ancient, 2],
    [ShipType.Guardian, 1],
    [ShipType.GCDS, 1],
  ])('caps %s quantity at %i', async (type, max) => {
    const shipTypeConfig = {
      id: `test-${type}`,
      type,
      quantity: max,
      config: {},
    };

    state.fleets[0].shipTypes.push(shipTypeConfig);

    const element = document.createElement('calc-ship-type') as ShipTypeElement;
    element.shipType = shipTypeConfig;
    element.fleetId = 'fleet-0';

    document.body.appendChild(element);

    await customElements.whenDefined('calc-selector');

    const qtySelector = element.querySelector(
      'calc-selector'
    ) as SelectorElement;
    const incrementBtn = qtySelector.querySelectorAll('button')[1];

    expect(qtySelector.max).toBe(max);
    expect(incrementBtn.disabled).toBe(true);
    incrementBtn.click();

    expect(state.fleets[0].shipTypes[0].quantity).toBe(max);
  });

  test('removes itself from state', () => {
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

    expect(state.fleets[0].shipTypes.length).toBe(0);
    expect(element.parentNode).toBe(null);
  });
});
