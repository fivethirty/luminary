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
    expect(element.querySelector('.ship-type-name')?.textContent).toBe(
      'Interceptor'
    );
    expect(
      Array.from(element.querySelector('.blueprint-workbench')!.children).map(
        (child) => child.className
      )
    ).toEqual(['blueprint-visual', 'blueprint-controls']);
    const controls = element.querySelector('.blueprint-controls')!;
    const header = element.querySelector('.blueprint-header')!;
    expect(controls.querySelector('.blueprint-header')).toBeNull();
    expect(Array.from(header.children).map((child) => child.className)).toEqual(
      ['ship-type-name text-bold', 'quantity', 'remove-btn btn-icon']
    );
    expect(
      header.querySelector('.remove-btn')?.getAttribute('aria-label')
    ).toBe('Remove Interceptor');
    expect(
      Array.from(controls.querySelector('.slot-actions')!.children).map(
        (child) => child.className
      )
    ).toEqual(['drive-warning', 'slot-action-buttons', 'selected-part-name']);
    const driveWarning = element.querySelector('.drive-warning')!;
    expect(driveWarning.parentElement?.className).toBe('slot-actions');
    expect(driveWarning.closest('.blueprint-canvas-wrap')).toBeNull();
    expect(driveWarning.closest('.external-section')).toBeNull();
  });

  test('positions hull and computer values over their matching header symbols', () => {
    expect(blueprintStyles).toMatch(
      /\[data-blueprint-stat='hull'\]\s*{[^}]*left:\s*54%/
    );
    expect(blueprintStyles).toMatch(
      /\[data-blueprint-stat='computer'\]\s*{[^}]*left:\s*68\.5%/
    );
  });

  test('constrains dreadnought stats to the narrower header artwork', () => {
    const ship = addOrSwapShipPreset('fleet-0', 'dreadnought', {
      withBlueprint: true,
    })!;
    const element = render(ship.id);

    expect(
      element
        .querySelector('.blueprint-canvas')
        ?.classList.contains('blueprint-canvas-dreadnought')
    ).toBe(true);
    expect(blueprintStyles).toMatch(
      /\.blueprint-canvas-dreadnought\s+\.blueprint-readouts\s*{[^}]*width:\s*75\.092%/
    );
  });

  test('uses a compact, unified desktop workbench', () => {
    expect(blueprintStyles).toMatch(
      /@media \(min-width: 60\.0625rem\)[\s\S]*grid-template-columns:\s*max-content minmax\(0, 1fr\)/
    );
    expect(blueprintStyles).toMatch(
      /\.blueprint-controls\s*{[^}]*grid-template-areas:\s*'actions actions'\s*'recent external'/
    );
    expect(blueprintStyles).toMatch(
      /\.blueprint-controls\s*{[^}]*border:\s*1px solid var\(--color-border\)/
    );
    expect(blueprintStyles).toMatch(
      /\.slot-actions\s*{[^}]*display:\s*flex[^}]*gap:\s*var\(--space-xs\)/
    );
    expect(blueprintStyles).not.toMatch(/\.remove-part-btn\s*{[^}]*color:/);
    expect(blueprintStyles).toMatch(
      /\.selected-part-name\s*{[^}]*text-align:\s*left/
    );
    expect(blueprintStyles).toMatch(
      /@media \(max-width: 46rem\)\s*{[\s\S]*\.selected-part-name\s*{[^}]*display:\s*none[^}]*}[\s\S]*\.slot-action-buttons\s*{[^}]*width:\s*100%[^}]*}[\s\S]*\.slot-action-buttons button\s*{[^}]*flex:\s*1 1 50%/
    );
  });

  test('keeps external bonuses and Muon Source visible in the workbench', () => {
    const ship = addOrSwapShipPreset('fleet-0', 'interceptor', {
      withBlueprint: true,
    })!;
    const element = render(ship.id);
    const external = element.querySelector('.external-section')!;

    expect(external.tagName).toBe('SECTION');
    expect(element.querySelector('.external-summary')).toBeNull();
    expect(external.getAttribute('aria-label')).toBe(
      'External bonuses and Muon Source'
    );
    expect(
      Array.from(external.children).map((child) => child.className)
    ).toEqual(['muon-control', 'external-heading']);
    expect(
      Array.from(external.querySelectorAll('.external-bonuses span')).map(
        (bonus) => bonus.textContent
      )
    ).toEqual(['+2 Init']);

    const muon = element.querySelector('.muon-checkbox') as HTMLInputElement;
    expect(muon.type).toBe('checkbox');
    muon.checked = true;
    muon.dispatchEvent(new Event('change'));

    expect(ship.blueprint?.muonSource).toBe(true);
    expect(muon.checked).toBe(true);

    const dreadnought = addOrSwapShipPreset('fleet-0', 'dreadnought', {
      withBlueprint: true,
    })!;
    const dreadnoughtElement = render(dreadnought.id);
    expect(
      (dreadnoughtElement.querySelector('.external-heading') as HTMLElement)
        .hidden
    ).toBe(true);
    expect(
      dreadnoughtElement.querySelectorAll('.external-bonuses span')
    ).toHaveLength(0);
    expect(blueprintStyles).toMatch(
      /\.external-heading\s*{[^}]*margin-left:\s*auto/
    );
    expect(blueprintStyles).toMatch(
      /\.muon-control \.muon-checkbox\s*{[^}]*position:\s*absolute[^}]*clip-path:\s*inset\(50%\)[^}]*opacity:\s*0/
    );
    expect(blueprintStyles).toMatch(
      /\.muon-control:has\(\.muon-checkbox:checked\)\s*{[^}]*border-color:\s*var\(--color-info\)/
    );
    expect(blueprintStyles).toMatch(
      /@container blueprint-controls \(max-width: 52rem\)[\s\S]*\.external-bonuses\s*{[^}]*flex-direction:\s*column[^}]*align-items:\s*flex-end/
    );
    expect(blueprintStyles).toMatch(
      /\.muon-control strong\s*{[^}]*font-size:\s*0\.68rem[^}]*font-weight:\s*600/
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

  test('names the selected part in the picker heading', () => {
    const ship = addOrSwapShipPreset('fleet-0', 'cruiser', {
      withBlueprint: true,
    })!;
    const element = render(ship.id);

    (element.querySelector('.edit-part-btn') as HTMLButtonElement).click();

    expect(element.querySelector('.part-dialog-title')?.textContent).toBe(
      'Replace Electron Computer'
    );
  });

  test('opens a searchable bucketed dialog with sections collapsed by default', () => {
    const ship = addOrSwapShipPreset('fleet-0', 'cruiser', {
      withBlueprint: true,
    })!;
    const element = render(ship.id);
    const replace = element.querySelector(
      '.edit-part-btn'
    ) as HTMLButtonElement;
    const firstSlot = element.querySelector(
      '[data-slot="0"]'
    ) as HTMLButtonElement;
    expect(firstSlot.classList.contains('selected')).toBe(true);
    expect(firstSlot.getAttribute('aria-pressed')).toBe('true');
    expect(replace.disabled).toBe(false);
    const selectedPartName = element.querySelector(
      '.selected-part-name'
    ) as HTMLElement;
    expect(selectedPartName.textContent).toBe('Electron Computer');
    expect(selectedPartName.hidden).toBe(false);
    expect(replace.getAttribute('aria-label')).toBe('Edit Electron Computer');

    (element.querySelector('[data-slot="2"]') as HTMLButtonElement).click();
    expect(firstSlot.classList.contains('selected')).toBe(false);
    expect(firstSlot.getAttribute('aria-pressed')).toBe('false');
    expect(replace.getAttribute('aria-label')).toBe('Fill empty slot');
    expect(selectedPartName.textContent).toBe('');
    expect(selectedPartName.hidden).toBe(true);
    replace.click();

    const dialog = element.querySelector('.part-dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(element.querySelector('.part-dialog-title')?.textContent).toBe(
      'Fill empty slot'
    );
    expect(element.querySelector('.empty-part-btn')).toBeNull();
    expect(
      Array.from(element.querySelectorAll('.part-bucket h4')).map(
        (heading) => heading.textContent
      )
    ).toEqual([
      'Energy',
      'Movement',
      'Initiative',
      'Computer',
      'Shield',
      'Hull',
      'Repair',
      'Cannon',
      'Missile',
    ]);
    const buckets = Array.from(
      element.querySelectorAll<HTMLDetailsElement>('.part-bucket')
    );
    expect(
      buckets.every((section) =>
        section
          .querySelector('summary')
          ?.classList.contains('disclosure-summary')
      )
    ).toBe(true);
    expect(buckets.every((section) => !section.open)).toBe(true);
    (buckets[0].querySelector('summary') as HTMLElement).click();
    expect(buckets[0].open).toBe(true);
    buckets[0].open = false;

    const search = element.querySelector('.part-search') as HTMLInputElement;
    search.value = 'sentient hull';
    search.dispatchEvent(new Event('input'));
    expect(buckets.every((section) => section.open)).toBe(true);
    expect(
      Array.from(element.querySelectorAll<HTMLElement>('.part-option')).filter(
        (option) => !option.hidden
      )
    ).toHaveLength(2);
    expect(element.querySelector('.part-option-copy small')).toBeNull();
  });

  test('searches only tile names, not headings or stats', () => {
    const ship = addOrSwapShipPreset('fleet-0', 'interceptor', {
      withBlueprint: true,
    })!;
    const element = render(ship.id);

    (element.querySelector('.edit-part-btn') as HTMLButtonElement).click();
    const search = element.querySelector('.part-search') as HTMLInputElement;
    search.value = 'initiative';
    search.dispatchEvent(new Event('input'));

    expect(
      Array.from(element.querySelectorAll<HTMLElement>('.part-option')).filter(
        (option) => !option.hidden
      )
    ).toHaveLength(0);
    expect(
      (element.querySelector('.part-search-empty') as HTMLElement).hidden
    ).toBe(false);

    search.value = 'nuclear source';
    search.dispatchEvent(new Event('input'));
    const visibleOptions = Array.from(
      element.querySelectorAll<HTMLElement>('.part-option')
    ).filter((option) => !option.hidden);
    expect(visibleOptions).toHaveLength(1);
    expect(visibleOptions[0].dataset.partId).toBe('nus');
  });

  test('keeps the scrolling picker content in its own paint layer', () => {
    expect(blueprintStyles).toMatch(
      /\.part-buckets\s*{[^}]*contain:\s*paint[^}]*isolation:\s*isolate/
    );
    expect(blueprintStyles).not.toMatch(/position:\s*sticky/);
    expect(blueprintStyles).toMatch(
      /\.part-search-label\s*{[^}]*padding:\s*var\(--space-md\)/
    );
    expect(blueprintStyles).toMatch(
      /\.part-buckets\s*{[^}]*padding:\s*var\(--space-md\)/
    );
    expect(blueprintStyles).toMatch(
      /@media \(max-width: 28rem\)\s*{[\s\S]*\.part-dialog-header,\s*\.part-search-label,\s*\.part-buckets\s*{[^}]*padding-inline:\s*var\(--space-sm\)/
    );
  });

  test('locks background scrolling while the parts picker is open', () => {
    expect(blueprintStyles).toMatch(
      /:is\(html, body\):has\(\.part-dialog\[open\]\)\s*{[^}]*overflow:\s*hidden/
    );
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
    expect(remove.hidden).toBe(false);
    expect(remove.disabled).toBe(true);

    (element.querySelector('.edit-part-btn') as HTMLButtonElement).click();
    (
      element.querySelector(
        '.part-option[data-part-id="anc"]'
      ) as HTMLButtonElement
    ).click();
    expect(remove.hidden).toBe(false);
    expect(remove.disabled).toBe(false);
    expect(
      (element.querySelector('.drive-warning') as HTMLElement).hidden
    ).toBe(false);

    remove.click();
    expect(
      (element.querySelector('.drive-warning') as HTMLElement).hidden
    ).toBe(true);
    expect(ship.blueprint?.slots[3]).toBe('nud');
    expect(remove.hidden).toBe(false);
    expect(remove.disabled).toBe(true);

    (element.querySelector('[data-slot="2"]') as HTMLButtonElement).click();
    expect(remove.hidden).toBe(false);
    expect(remove.disabled).toBe(true);
    (element.querySelector('.edit-part-btn') as HTMLButtonElement).click();
    (
      element.querySelector(
        '.part-option[data-part-id="plc"]'
      ) as HTMLButtonElement
    ).click();
    expect(remove.hidden).toBe(false);
    expect(remove.disabled).toBe(false);
    remove.click();
    expect(ship.blueprint?.slots[2]).toBeNull();
    expect(remove.hidden).toBe(false);
    expect(remove.disabled).toBe(true);
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

  test('updates recent parts across blueprints in the same fleet', () => {
    const interceptorShip = addOrSwapShipPreset('fleet-0', 'interceptor', {
      withBlueprint: true,
    })!;
    const cruiserShip = addOrSwapShipPreset('fleet-0', 'cruiser', {
      withBlueprint: true,
    })!;
    const interceptor = render(interceptorShip.id);
    const cruiser = render(cruiserShip.id);
    const recentPartIds = (element: ShipBlueprintElement) =>
      Array.from(
        element.querySelectorAll<HTMLButtonElement>('.quick-part-btn')
      ).map((button) => button.dataset.partId);
    const installFromDialog = (
      element: ShipBlueprintElement,
      slot: number,
      partId: string
    ) => {
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

    installFromDialog(interceptor, 2, 'anc');
    expect(recentPartIds(interceptor)).toEqual(['anc']);
    expect(recentPartIds(cruiser)).toEqual(['anc']);

    installFromDialog(cruiser, 2, 'plc');
    expect(recentPartIds(interceptor)).toEqual(['plc', 'anc']);
    expect(recentPartIds(cruiser)).toEqual(['plc', 'anc']);
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
});
