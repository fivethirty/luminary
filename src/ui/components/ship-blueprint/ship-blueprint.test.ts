import { beforeEach, describe, expect, test } from 'bun:test';
import './index';
import type { ShipBlueprintElement } from './index';
import {
  addOrSwapShipPreset,
  resetFleets,
  setFleetFaction,
  state,
} from '@ui/state';

const blueprintStyles = await Bun.file(
  new URL('./ship-blueprint.css', import.meta.url)
).text();

function render(shipId: string, fleetId = 'fleet-0'): ShipBlueprintElement {
  const fleet = state.fleets.find((candidate) => candidate.id === fleetId)!;
  const ship = fleet.shipTypes.find((candidate) => candidate.id === shipId)!;
  const element = document.createElement(
    'calc-ship-blueprint'
  ) as ShipBlueprintElement;
  element.shipType = ship;
  element.fleetId = fleetId;
  element.factionId = fleet.factionId;
  document.body.appendChild(element);
  return element;
}

describe('ShipBlueprint', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.sessionStorage.clear();
    resetFleets();
  });

  test('renders artwork slots and stats without slot-number overlays', () => {
    const ship = addOrSwapShipPreset('fleet-0', 'interceptor', {
      withBlueprint: true,
    })!;
    const element = render(ship.id);

    expect(element.querySelectorAll('.blueprint-slot')).toHaveLength(4);
    expect(element.querySelector('.slot-number')).toBeNull();
    expect(
      (element.querySelector('.blueprint-background') as HTMLImageElement).src
    ).toContain('blueprint_interceptor');
    const readouts = element.querySelector('.blueprint-readouts')!;
    expect(readouts.querySelectorAll('[data-blueprint-stat]')).toHaveLength(6);
    expect(
      readouts.querySelector('[data-blueprint-stat="initiative"]')?.textContent
    ).toBe('3');
    expect(
      readouts.querySelector('[data-blueprint-stat="energy"]')?.textContent
    ).toBe('2/3');
    expect(
      readouts.querySelector('[data-blueprint-stat="movement"]')?.textContent
    ).toBe('1');
    expect(element.querySelector('.blueprint-summary')).toBeNull();
    expect(element.querySelector('calc-ship-type')).toBeNull();
    expect(
      Array.from(element.querySelector('.blueprint-workbench')!.children).map(
        (child) => child.className
      )
    ).toEqual(['blueprint-canvas-wrap', 'blueprint-controls']);
  });

  test('positions hull and computer values over their matching header symbols', () => {
    expect(blueprintStyles).toMatch(
      /\[data-blueprint-stat='hull'\]\s*{[^}]*left:\s*54%/
    );
    expect(blueprintStyles).toMatch(
      /\[data-blueprint-stat='computer'\]\s*{[^}]*left:\s*68\.5%/
    );
  });

  test('renders hull without a plus sign', () => {
    const ship = addOrSwapShipPreset('fleet-0', 'cruiser', {
      withBlueprint: true,
    })!;
    const element = render(ship.id);
    const hull = element.querySelector(
      '[data-blueprint-stat="hull"]'
    ) as HTMLElement;
    const computer = element.querySelector(
      '[data-blueprint-stat="computer"]'
    ) as HTMLElement;

    expect(hull.textContent).toBe('1');
    expect(hull.getAttribute('aria-label')).toBe('Hull: 1');
    expect(computer.textContent).toBe('+1');
  });

  test('selects a slot before opening the searchable bucketed dialog', () => {
    const ship = addOrSwapShipPreset('fleet-0', 'cruiser', {
      withBlueprint: true,
    })!;
    const element = render(ship.id);
    const replace = element.querySelector(
      '.edit-part-btn'
    ) as HTMLButtonElement;
    expect(replace.disabled).toBe(true);

    (element.querySelector('[data-slot="2"]') as HTMLButtonElement).click();
    expect(replace.disabled).toBe(false);
    expect(element.querySelector('.selected-part')?.textContent).toContain(
      'Slot 3'
    );
    replace.click();

    const dialog = element.querySelector('.part-dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(element.querySelector('.empty-part-btn')).toBeNull();
    expect(
      Array.from(element.querySelectorAll('.part-bucket h4')).map(
        (heading) => heading.textContent
      )
    ).toEqual([
      '+ Energy',
      '+ Movement',
      '+ Initiative',
      '+ Computer',
      '+ Shield',
      '+ Hull',
      '+ Repair',
      'Cannon',
      'Missile',
    ]);

    const search = element.querySelector('.part-search') as HTMLInputElement;
    search.value = 'sentient hull';
    search.dispatchEvent(new Event('input'));
    expect(
      Array.from(element.querySelectorAll<HTMLElement>('.part-option')).filter(
        (option) => !option.hidden
      )
    ).toHaveLength(2);
    expect(element.querySelector('.part-option-copy small')).toBeNull();
  });

  test('does not display part options that do not match the search', () => {
    const ship = addOrSwapShipPreset('fleet-0', 'interceptor', {
      withBlueprint: true,
    })!;
    const element = render(ship.id);

    (element.querySelector('[data-slot="0"]') as HTMLButtonElement).click();
    (element.querySelector('.edit-part-btn') as HTMLButtonElement).click();

    const search = element.querySelector('.part-search') as HTMLInputElement;
    search.value = 'ion';
    search.dispatchEvent(new Event('input'));

    const nuclearSource = element.querySelector(
      '.part-option[data-part-id="nus"]'
    ) as HTMLButtonElement;
    expect(nuclearSource.hidden).toBe(true);

    const style = document.createElement('style');
    style.textContent = blueprintStyles;
    document.head.appendChild(style);
    try {
      expect(getComputedStyle(nuclearSource).display).toBe('none');
    } finally {
      style.remove();
    }
  });

  test('only removes replacement parts and reveals the starting part', () => {
    const ship = addOrSwapShipPreset('fleet-0', 'interceptor', {
      withBlueprint: true,
    })!;
    const element = render(ship.id);

    (element.querySelector('[data-slot="0"]') as HTMLButtonElement).click();
    (element.querySelector('.edit-part-btn') as HTMLButtonElement).click();
    const antimatter = Array.from(
      element.querySelectorAll<HTMLButtonElement>('.part-option')
    ).find((option) => option.dataset.search?.startsWith('antimatter cannon'))!;
    antimatter.click();
    expect(ship.config.cannons?.antimatter).toBe(1);
    const energyReadout = element.querySelector(
      '.blueprint-readouts [data-blueprint-stat="energy"]'
    ) as HTMLElement;
    expect(energyReadout.textContent).toBe('6/0');
    expect(energyReadout.getAttribute('aria-label')).toBe('Energy: 6/0');
    expect(energyReadout.classList.contains('invalid')).toBe(true);
    expect(element.querySelector('.energy-status')).toBeNull();
    expect(element.querySelector('.energy-track')).toBeNull();

    (element.querySelector('[data-slot="3"]') as HTMLButtonElement).click();
    const remove = element.querySelector(
      '.remove-part-btn'
    ) as HTMLButtonElement;
    expect(remove.hidden).toBe(true);

    (element.querySelector('.edit-part-btn') as HTMLButtonElement).click();
    (
      element.querySelector(
        '.part-option[data-part-id="anc"]'
      ) as HTMLButtonElement
    ).click();
    expect(remove.hidden).toBe(false);
    expect(
      (element.querySelector('.drive-warning') as HTMLElement).hidden
    ).toBe(false);

    remove.click();
    expect(
      (element.querySelector('.drive-warning') as HTMLElement).hidden
    ).toBe(true);
    expect(ship.blueprint?.slots[3]).toBe('nud');
    expect(remove.hidden).toBe(true);

    (element.querySelector('[data-slot="2"]') as HTMLButtonElement).click();
    expect(remove.hidden).toBe(true);
    (element.querySelector('.edit-part-btn') as HTMLButtonElement).click();
    (
      element.querySelector(
        '.part-option[data-part-id="plc"]'
      ) as HTMLButtonElement
    ).click();
    expect(remove.hidden).toBe(false);
    remove.click();
    expect(ship.blueprint?.slots[2]).toBeNull();
    expect(remove.hidden).toBe(true);
  });

  test('offers the three most recently added parts as direct replacements', () => {
    const ship = addOrSwapShipPreset('fleet-0', 'interceptor', {
      withBlueprint: true,
    })!;
    const element = render(ship.id);

    const installFromDialog = (slot: number, partId: string) => {
      (
        element.querySelector(`[data-slot="${slot}"]`) as HTMLButtonElement
      ).click();
      (element.querySelector('.edit-part-btn') as HTMLButtonElement).click();
      (
        element.querySelector(
          `.part-option[data-part-id="${partId}"]`
        ) as HTMLButtonElement
      ).click();
    };

    installFromDialog(2, 'anc');
    installFromDialog(1, 'plc');
    installFromDialog(0, 'fus');
    expect(
      Array.from(
        element.querySelectorAll<HTMLButtonElement>('.quick-part-btn')
      ).map((button) => button.dataset.partId)
    ).toEqual(['fus', 'plc', 'anc']);

    (element.querySelector('[data-slot="3"]') as HTMLButtonElement).click();
    (
      element.querySelector(
        '.quick-part-btn[data-part-id="anc"]'
      ) as HTMLButtonElement
    ).click();
    expect(ship.blueprint?.slots[3]).toBe('anc');
    expect(
      Array.from(
        element.querySelectorAll<HTMLButtonElement>('.quick-part-btn')
      ).map((button) => button.dataset.partId)
    ).toEqual(['anc', 'fus', 'plc']);

    installFromDialog(0, 'axc');
    expect(
      Array.from(
        element.querySelectorAll<HTMLButtonElement>('.quick-part-btn')
      ).map((button) => button.dataset.partId)
    ).toEqual(['anc', 'fus', 'plc']);
  });

  test('covers Planta-only unavailable slots and does not make them selectable', () => {
    setFleetFaction('fleet-0', 'planta');
    const ships = [
      'interceptor',
      'cruiser',
      'dreadnought',
      'starbase',
    ] as const;
    const blockedSlots = [3, 3, 4, 3];

    ships.forEach((preset, index) => {
      const ship = addOrSwapShipPreset('fleet-0', preset, {
        withBlueprint: true,
      })!;
      const element = render(ship.id);
      const blocked = element.querySelector(
        `.blueprint-slot-blocked[data-slot="${blockedSlots[index]}"]`
      );
      expect(blocked).not.toBeNull();
      expect(blocked?.tagName).toBe('SPAN');
    });
  });

  test('hides movement readouts for stationary blueprints', () => {
    setFleetFaction('fleet-0', 'terran');
    const starbase = addOrSwapShipPreset('fleet-0', 'starbase', {
      withBlueprint: true,
    })!;
    const starbaseElement = render(starbase.id);
    const starbaseMovement = starbaseElement.querySelector(
      '[data-blueprint-stat="movement"]'
    ) as HTMLElement;

    expect(starbaseMovement.hidden).toBe(true);
    expect(starbaseMovement.textContent).toBe('');

    resetFleets();
    setFleetFaction('fleet-0', 'exiles');
    const orbital = addOrSwapShipPreset('fleet-0', 'orbital', {
      withBlueprint: true,
    })!;
    const orbitalElement = render(orbital.id);
    const orbitalMovement = orbitalElement.querySelector(
      '[data-blueprint-stat="movement"]'
    ) as HTMLElement;

    expect(orbitalMovement.hidden).toBe(true);
    expect(orbitalMovement.textContent).toBe('');
  });

  test('keeps recently added parts specific to each fleet', () => {
    const defenderShip = addOrSwapShipPreset('fleet-0', 'interceptor', {
      withBlueprint: true,
    })!;
    const defender = render(defenderShip.id);
    (defender.querySelector('[data-slot="2"]') as HTMLButtonElement).click();
    (defender.querySelector('.edit-part-btn') as HTMLButtonElement).click();
    (
      defender.querySelector(
        '.part-option[data-part-id="anc"]'
      ) as HTMLButtonElement
    ).click();

    const attackerShip = addOrSwapShipPreset('fleet-1', 'interceptor', {
      withBlueprint: true,
    })!;
    const attacker = render(attackerShip.id, 'fleet-1');
    expect(attacker.querySelectorAll('.quick-part-btn')).toHaveLength(0);

    (attacker.querySelector('[data-slot="1"]') as HTMLButtonElement).click();
    (attacker.querySelector('.edit-part-btn') as HTMLButtonElement).click();
    (
      attacker.querySelector(
        '.part-option[data-part-id="plc"]'
      ) as HTMLButtonElement
    ).click();

    expect(
      Array.from(
        defender.querySelectorAll<HTMLButtonElement>('.quick-part-btn')
      ).map((button) => button.dataset.partId)
    ).toEqual(['anc']);
    expect(
      Array.from(
        attacker.querySelectorAll<HTMLButtonElement>('.quick-part-btn')
      ).map((button) => button.dataset.partId)
    ).toEqual(['plc']);
  });

  test('keeps drives out of starbase and orbital pickers', () => {
    setFleetFaction('fleet-0', 'terran');
    const starbase = addOrSwapShipPreset('fleet-0', 'starbase', {
      withBlueprint: true,
    })!;
    const element = render(starbase.id);
    (element.querySelector('[data-slot="1"]') as HTMLButtonElement).click();
    (element.querySelector('.edit-part-btn') as HTMLButtonElement).click();

    expect(
      Array.from(element.querySelectorAll<HTMLElement>('.part-option')).some(
        (option) => option.dataset.search?.includes('drive')
      )
    ).toBe(false);
    expect(
      (element.querySelector('.drive-warning') as HTMLElement).hidden
    ).toBe(true);
  });

  test('offers an explicit reset for aggregate-only custom ships', () => {
    const ship = addOrSwapShipPreset('fleet-0', 'interceptor')!;
    ship.config = { hull: 9 };
    const element = render(ship.id);
    expect(
      (element.querySelector('.blueprint-reset') as HTMLElement).hidden
    ).toBe(false);

    (
      element.querySelector('.start-blueprint-btn') as HTMLButtonElement
    ).click();
    expect(ship.blueprint?.slots).toEqual(['nus', 'ioc', null, 'nud']);
    expect(
      (element.querySelector('.blueprint-editor') as HTMLElement).hidden
    ).toBe(false);
  });
});
