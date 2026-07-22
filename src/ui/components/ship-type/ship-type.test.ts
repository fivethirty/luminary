import { test, expect, beforeEach, describe } from 'bun:test';
import './index';
import type { ShipTypeElement } from './index';
import type { SelectorElement } from '../selector';
import type { StatCubeElement } from '../stat-cube';
import { addOrSwapShipPreset, state, resetFleets } from '@ui/state';
import { ShipType } from '@calc/ship';
import { getStartingShipConfig } from '@ui/ship-presets';

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

  test('marks stats changed from faction-aware defaults but not quantity', () => {
    const shipTypeConfig = {
      id: 'test-modified-cruiser',
      type: ShipType.Cruiser,
      quantity: 1,
      config: getStartingShipConfig('cruiser', 'orion').config,
    };
    state.fleets[0].factionId = 'orion';
    state.fleets[0].shipTypes.push(shipTypeConfig);

    const element = document.createElement('calc-ship-type') as ShipTypeElement;
    element.shipType = shipTypeConfig;
    element.fleetId = 'fleet-0';
    element.factionId = 'orion';
    document.body.appendChild(element);

    const quantity = element.querySelector('calc-selector') as SelectorElement;
    const hull = element.querySelector('[data-stat="hull"]') as StatCubeElement;

    expect(element.querySelector('[modified]')).toBeNull();

    (hull.querySelector('.stat-inc') as HTMLButtonElement).click();
    expect(hull.hasAttribute('modified')).toBe(true);
    (hull.querySelector('.stat-dec') as HTMLButtonElement).click();
    expect(hull.hasAttribute('modified')).toBe(false);

    (quantity.querySelector('.selector-inc') as HTMLButtonElement).click();
    expect(quantity.hasAttribute('modified')).toBe(false);
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
    expect(element.querySelector('[data-stat][modified]')).toBeNull();
  });

  test.each([
    {
      preset: 'ancient' as const,
      assetName: 'ai-anc',
      accessibleName: 'Ancient ship tile',
    },
    {
      preset: 'ancient-adv' as const,
      assetName: 'ai-ancadv',
      accessibleName: 'Ancient (A) ship tile',
    },
    {
      preset: 'ancient-wa' as const,
      assetName: 'ai-ancwa',
      accessibleName: 'Ancient (WA) ship tile',
    },
    {
      preset: 'guardian' as const,
      assetName: 'ai-grd',
      accessibleName: 'Guardian ship tile',
    },
    {
      preset: 'guardian-adv' as const,
      assetName: 'ai-grdadv',
      accessibleName: 'Guardian (A) ship tile',
    },
    {
      preset: 'guardian-wa' as const,
      assetName: 'ai-grdwa',
      accessibleName: 'Guardian (WA) ship tile',
    },
    {
      preset: 'gcds' as const,
      assetName: 'ai-gcds',
      accessibleName: 'GCDS ship tile',
    },
    {
      preset: 'gcds-adv' as const,
      assetName: 'ai-gcdsadv',
      accessibleName: 'GCDS (A) ship tile',
    },
    {
      preset: 'gcds-wa' as const,
      assetName: 'ai-gcdswa',
      accessibleName: 'GCDS (WA) ship tile',
    },
  ])(
    'displays the $preset artwork in Ship tiles mode',
    ({ preset, assetName, accessibleName }) => {
      const shipTypeConfig = {
        id: `test-${preset}-tile`,
        type: getStartingShipConfig(preset).type,
        quantity: 1,
        config: getStartingShipConfig(preset).config,
      };
      const element = document.createElement(
        'calc-ship-type'
      ) as ShipTypeElement;
      element.shipType = shipTypeConfig;
      element.fleetId = 'fleet-0';
      element.tileMode = true;

      document.body.appendChild(element);

      const tile = element.querySelector('.ship-tile') as HTMLElement;
      const image = tile.querySelector('img') as HTMLImageElement;
      expect(tile.hidden).toBe(false);
      expect(image.src).toContain(assetName);
      expect(image.alt).toBe(accessibleName);
      expect((element.querySelector('.stats') as HTMLElement).hidden).toBe(
        true
      );
    }
  );

  test('keeps stat rows for NPCs outside Ship tiles mode', () => {
    const shipTypeConfig = {
      id: 'test-guardian-tile-fallback',
      type: ShipType.Guardian,
      quantity: 1,
      config: getStartingShipConfig('guardian').config,
    };
    const element = document.createElement('calc-ship-type') as ShipTypeElement;
    element.shipType = shipTypeConfig;
    element.fleetId = 'fleet-0';

    document.body.appendChild(element);

    expect((element.querySelector('.ship-tile') as HTMLElement).hidden).toBe(
      true
    );
    expect((element.querySelector('.stats') as HTMLElement).hidden).toBe(false);
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

  test('warns before a stat edit detaches a blueprint-backed ship', () => {
    const ship = addOrSwapShipPreset('fleet-0', 'interceptor', {
      withBlueprint: true,
    })!;
    const element = document.createElement('calc-ship-type') as ShipTypeElement;
    element.shipType = ship;
    element.fleetId = 'fleet-0';
    document.body.appendChild(element);

    const notice = element.querySelector(
      '.blueprint-backed-notice'
    ) as HTMLElement;
    expect(notice.hidden).toBe(false);
    expect(notice.textContent?.trim()).toBe(
      '⚠ Blueprint will be lost on edit'
    );

    const hull = element.querySelector('[data-stat="hull"]') as HTMLElement;
    (hull.querySelector('.stat-inc') as HTMLButtonElement).click();

    expect(ship.blueprint).toBeUndefined();
    expect(notice.hidden).toBe(true);
  });

  test('keeps aggregate stats visible before explicitly replacing them with a blueprint', () => {
    const ship = addOrSwapShipPreset('fleet-0', 'interceptor')!;
    ship.config = { hull: 9 };
    const element = document.createElement('calc-ship-type') as ShipTypeElement;
    element.shipType = ship;
    element.fleetId = 'fleet-0';
    element.offerBlueprintReplacement = true;
    document.body.appendChild(element);

    const offer = element.querySelector(
      '.stats-blueprint-offer'
    ) as HTMLElement;
    const hull = element.querySelector('[data-stat="hull"]') as StatCubeElement;
    expect(offer.hidden).toBe(false);
    expect(offer.querySelector('strong')?.textContent).toBe(
      '⚠ Stats only! Parts unknown.'
    );
    expect(hull.value).toBe(9);
    expect(element.querySelector('.stats-blueprint-description')).toBeNull();

    let created = false;
    element.addEventListener('ship-blueprint-created', () => {
      created = true;
    });
    (offer.querySelector('.start-blueprint-btn') as HTMLButtonElement).click();

    expect(created).toBe(true);
    expect(ship.blueprint?.slots).toEqual(['nus', 'ioc', null, 'nud']);
    expect(ship.config.hull).toBe(0);
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
