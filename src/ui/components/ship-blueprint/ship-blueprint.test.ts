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
const fleetStyles = await Bun.file(
  new URL('../fleet/fleet.css', import.meta.url)
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
    const emptySlot = element.querySelector(
      '.blueprint-slot[data-slot="2"]'
    ) as HTMLButtonElement;
    expect(emptySlot.textContent).toBe('');
    expect(emptySlot.getAttribute('aria-label')).toBe('Slot 3: empty');
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
    expect(element.querySelector('.ship-type-name')).toBeNull();
    expect(element.querySelector('.blueprint-controls')).toBeNull();
    expect(
      Array.from(element.querySelector('.blueprint-editor')!.children).map(
        (child) => child.className
      )
    ).toEqual(['blueprint-visual', 'blueprint-details']);
    const header = element.querySelector('.blueprint-header')!;
    expect(Array.from(header.children).map((child) => child.className)).toEqual(
      [
        'ship-clear-btn clear-blueprint-btn',
        'blueprint-quantity',
        'remove-btn btn-icon',
      ]
    );
    const clear = header.querySelector(
      '.clear-blueprint-btn'
    ) as HTMLButtonElement;
    expect(clear.textContent).toBe('Clear');
    expect(clear.getAttribute('aria-label')).toBe(
      'Reset Interceptor to starting parts'
    );
    expect(clear.hidden).toBe(true);
    const quantity = header.querySelector('.blueprint-quantity')!;
    expect(quantity.querySelector('calc-selector')).not.toBeNull();
    expect(
      header.querySelector('.remove-btn')?.getAttribute('aria-label')
    ).toBe('Remove Interceptor');
    expect(element.querySelector('.blueprint-footer')).toBeNull();
    const driveWarning = element.querySelector('.drive-warning')!;
    expect(driveWarning.parentElement?.className).toBe('blueprint-details');
    expect(driveWarning.closest('.blueprint-canvas-wrap')).toBeNull();
    expect(driveWarning.closest('.external-section')).toBeNull();
  });

  test('clears custom parts and Muon Source back to the starting blueprint', () => {
    const ship = addOrSwapShipPreset('fleet-0', 'interceptor', {
      withBlueprint: true,
    })!;
    const element = render(ship.id);
    const clear = element.querySelector(
      '.clear-blueprint-btn'
    ) as HTMLButtonElement;

    (element.querySelector('[data-slot="2"]') as HTMLButtonElement).click();
    (
      element.querySelector(
        '.part-option[data-part-id="plc"]'
      ) as HTMLButtonElement
    ).click();
    const muon = element.querySelector('.muon-checkbox') as HTMLInputElement;
    muon.checked = true;
    muon.dispatchEvent(new Event('change'));
    expect(clear.hidden).toBe(false);

    clear.click();

    expect(ship.blueprint).toEqual({
      slots: ['nus', 'ioc', null, 'nud'],
      muonSource: false,
    });
    expect(ship.config.cannons?.plasma).toBe(0);
    expect(
      (element.querySelector('.muon-checkbox') as HTMLInputElement).checked
    ).toBe(false);
    expect(element.querySelector('.blueprint-slot.selected')).toBeNull();
    expect(clear.hidden).toBe(true);
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

  test('matches canvas heights to the dreadnought and centers narrower hulls', () => {
    const interceptor = addOrSwapShipPreset('fleet-0', 'interceptor', {
      withBlueprint: true,
    })!;
    const dreadnought = addOrSwapShipPreset('fleet-0', 'dreadnought', {
      withBlueprint: true,
    })!;
    const interceptorCanvas = render(interceptor.id).querySelector(
      '.blueprint-canvas'
    ) as HTMLElement;
    const dreadnoughtCanvas = render(dreadnought.id).querySelector(
      '.blueprint-canvas'
    ) as HTMLElement;
    const interceptorWidth = Number.parseFloat(interceptorCanvas.style.width);
    const dreadnoughtWidth = Number.parseFloat(dreadnoughtCanvas.style.width);
    const interceptorAspectRatio = Number.parseFloat(
      interceptorCanvas.style.aspectRatio
    );
    const dreadnoughtAspectRatio = Number.parseFloat(
      dreadnoughtCanvas.style.aspectRatio
    );

    expect(interceptorWidth).toBeLessThan(dreadnoughtWidth);
    expect(interceptorWidth / interceptorAspectRatio).toBeCloseTo(
      dreadnoughtWidth / dreadnoughtAspectRatio
    );
    expect(blueprintStyles).toMatch(
      /\.blueprint-canvas\s*{[^}]*margin-inline:\s*auto/
    );
  });

  test('lays out blueprint cards four, two, and one per row', () => {
    expect(fleetStyles).toMatch(
      /\.fleet-ships:has\(> \.ship-blueprint-card\)\s*{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap[^}]*justify-content:\s*center/
    );
    expect(fleetStyles).toMatch(
      /\.fleet-ships:has\(> \.ship-blueprint-card\)\s*>\s*\.ship-blueprint-card\s*{[^}]*flex:\s*0 1 calc\(50% - var\(--space-sm\)\)/
    );
    expect(fleetStyles).toMatch(
      /@media \(min-width: 60\.0625rem\)[\s\S]*\.fleet-ships:has\(> \.ship-blueprint-card\)\s*>\s*\.ship-blueprint-card\s*{[^}]*flex-basis:\s*calc\(25% - var\(--space-sm\)\)/
    );
    expect(fleetStyles).toMatch(
      /@media \(max-width: 42rem\)[\s\S]*\.fleet-ships:has\(> \.ship-blueprint-card\)\s*>\s*\.ship-blueprint-card\s*{[^}]*flex-basis:\s*100%/
    );
    expect(blueprintStyles).toMatch(
      /\.blueprint-header\s*{[^}]*display:\s*flex[^}]*justify-content:\s*flex-end/
    );
    expect(blueprintStyles).toMatch(
      /\.blueprint-canvas-wrap\s*{[^}]*border:\s*1px solid var\(--color-border\)/
    );
    expect(blueprintStyles).not.toMatch(/\.blueprint-controls/);
  });

  test('keeps stats-only ships inside compact blueprint columns', () => {
    expect(fleetStyles).toMatch(
      /\.ship-blueprint-card\s*{[^}]*height:\s*100%[^}]*overflow:\s*hidden[^}]*border:\s*1px solid var\(--color-border\)[^}]*border-radius:\s*var\(--radius-sm\)[^}]*background:\s*color-mix/
    );
    expect(fleetStyles).toMatch(
      /\.ship-blueprint-card\s*>\s*:is\(\.ship-blueprint, \.ship-type\)\s*{[^}]*height:\s*100%[^}]*margin:\s*0[^}]*border:\s*0[^}]*background:\s*transparent/
    );
    expect(fleetStyles).toMatch(
      /calc-ship-type\.ship-blueprint-card\s+\.stats-blueprint-offer\s*{[^}]*align-items:\s*stretch[^}]*flex-direction:\s*column/
    );
    expect(fleetStyles).toMatch(
      /@media \(min-width: 52\.0625rem\)[\s\S]*calc-ship-type\.ship-blueprint-card\s+\.ship-type\s+\.stats\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)[^}]*grid-template-areas:\s*none/
    );
    expect(fleetStyles).toMatch(
      /@media \(min-width: 52\.0625rem\)[\s\S]*calc-ship-type\.ship-blueprint-card\s+\.ship-type\s+\.stat-group\s*{[^}]*grid-area:\s*auto[^}]*grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/
    );
  });

  test('keeps Muon Source visible in the workbench', () => {
    const ship = addOrSwapShipPreset('fleet-0', 'interceptor', {
      withBlueprint: true,
    })!;
    const element = render(ship.id);
    const external = element.querySelector('.external-section')!;

    expect(external.tagName).toBe('SECTION');
    expect(element.querySelector('.external-summary')).toBeNull();
    expect(external.getAttribute('aria-label')).toBe('Muon Source');
    expect(
      Array.from(external.children).map((child) => child.className)
    ).toEqual(['muon-control']);
    expect(element.querySelector('.external-heading')).toBeNull();

    const muon = element.querySelector('.muon-checkbox') as HTMLInputElement;
    expect(muon.type).toBe('checkbox');
    muon.checked = true;
    muon.dispatchEvent(new Event('change'));

    expect(ship.blueprint?.muonSource).toBe(true);
    expect(muon.checked).toBe(true);

    expect(blueprintStyles).toMatch(
      /\.muon-control \.muon-checkbox\s*{[^}]*position:\s*absolute[^}]*clip-path:\s*inset\(50%\)[^}]*opacity:\s*0/
    );
    expect(blueprintStyles).toMatch(
      /\.muon-control:has\(\.muon-checkbox:checked\)\s*{[^}]*border-color:\s*var\(--color-info\)/
    );
    expect(blueprintStyles).toMatch(
      /\.external-section\s*{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/
    );
    expect(blueprintStyles).toMatch(
      /\.muon-control strong\s*{[^}]*font-size:\s*0\.68rem[^}]*font-weight:\s*600/
    );
  });

  test('immediately disables Muon Source for the other ships in its fleet', () => {
    const interceptorShip = addOrSwapShipPreset('fleet-0', 'interceptor', {
      withBlueprint: true,
    })!;
    const cruiserShip = addOrSwapShipPreset('fleet-0', 'cruiser', {
      withBlueprint: true,
    })!;
    const interceptor = render(interceptorShip.id);
    const cruiser = render(cruiserShip.id);
    const interceptorMuon = interceptor.querySelector(
      '.muon-checkbox'
    ) as HTMLInputElement;
    const cruiserMuon = cruiser.querySelector(
      '.muon-checkbox'
    ) as HTMLInputElement;

    interceptorMuon.checked = true;
    interceptorMuon.dispatchEvent(new Event('change'));

    expect(cruiserMuon.disabled).toBe(true);
    expect(cruiserMuon.title).toBe('Muon Source is installed on another ship');

    interceptorMuon.checked = false;
    interceptorMuon.dispatchEvent(new Event('change'));

    expect(cruiserMuon.disabled).toBe(false);
    expect(cruiserMuon.title).toBe('');
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

    (element.querySelector('[data-slot="0"]') as HTMLButtonElement).click();

    expect(element.querySelector('.part-dialog-title')?.textContent).toBe(
      'Replace Electron Computer'
    );
  });

  test('opens a searchable bucketed dialog with sections collapsed by default', () => {
    const ship = addOrSwapShipPreset('fleet-0', 'cruiser', {
      withBlueprint: true,
    })!;
    const element = render(ship.id);
    const firstSlot = element.querySelector(
      '[data-slot="0"]'
    ) as HTMLButtonElement;
    expect(firstSlot.classList.contains('selected')).toBe(false);
    expect(firstSlot.getAttribute('aria-pressed')).toBe('false');

    (element.querySelector('[data-slot="2"]') as HTMLButtonElement).click();
    expect(firstSlot.classList.contains('selected')).toBe(false);
    expect(firstSlot.getAttribute('aria-pressed')).toBe('false');

    const dialog = element.querySelector('.part-dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(element.querySelector('.part-dialog-title')?.textContent).toBe(
      'Fill empty slot'
    );
    expect(element.querySelector('.empty-part-btn')).toBeNull();
    expect(
      (element.querySelector('.remove-part-btn') as HTMLButtonElement).hidden
    ).toBe(true);
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

  test('clears the slot highlight when editing ends', () => {
    const ship = addOrSwapShipPreset('fleet-0', 'cruiser', {
      withBlueprint: true,
    })!;
    const element = render(ship.id);
    let slot = element.querySelector('[data-slot="2"]') as HTMLButtonElement;

    slot.click();
    expect(slot.classList.contains('selected')).toBe(true);
    expect(slot.getAttribute('aria-pressed')).toBe('true');
    (element.querySelector('.dialog-close') as HTMLButtonElement).click();
    expect(element.querySelector('.blueprint-slot.selected')).toBeNull();
    expect(slot.getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(slot);

    slot.click();
    (
      element.querySelector(
        '.part-option[data-part-id="plc"]'
      ) as HTMLButtonElement
    ).click();
    slot = element.querySelector('[data-slot="2"]') as HTMLButtonElement;
    expect(element.querySelector('.blueprint-slot.selected')).toBeNull();
    expect(slot.getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(slot);
  });

  test('searches only tile names, not headings or stats', () => {
    const ship = addOrSwapShipPreset('fleet-0', 'interceptor', {
      withBlueprint: true,
    })!;
    const element = render(ship.id);

    (element.querySelector('[data-slot="0"]') as HTMLButtonElement).click();
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

  test('loads picker images only for expanded sections', () => {
    const ship = addOrSwapShipPreset('fleet-0', 'interceptor', {
      withBlueprint: true,
    })!;
    const element = render(ship.id);

    (element.querySelector('[data-slot="0"]') as HTMLButtonElement).click();
    const sections = Array.from(
      element.querySelectorAll<HTMLDetailsElement>('.part-bucket')
    );
    const images = Array.from(
      element.querySelectorAll<HTMLImageElement>('.part-option img')
    );

    expect(images.every((image) => !image.hasAttribute('src'))).toBe(true);
    expect(images.every((image) => image.dataset.src?.endsWith('.webp'))).toBe(
      true
    );

    sections[0].open = true;
    sections[0].dispatchEvent(new Event('toggle'));

    expect(
      Array.from(
        sections[0].querySelectorAll<HTMLImageElement>('.part-option img')
      ).every((image) => image.hasAttribute('src'))
    ).toBe(true);
    expect(
      sections
        .slice(1)
        .flatMap((section) =>
          Array.from(
            section.querySelectorAll<HTMLImageElement>('.part-option img')
          )
        )
        .every((image) => !image.hasAttribute('src'))
    ).toBe(true);
  });

  test('loads only matching picker images while searching', () => {
    const ship = addOrSwapShipPreset('fleet-0', 'interceptor', {
      withBlueprint: true,
    })!;
    const element = render(ship.id);

    (element.querySelector('[data-slot="0"]') as HTMLButtonElement).click();
    const search = element.querySelector('.part-search') as HTMLInputElement;
    search.value = 'sentient hull';
    search.dispatchEvent(new Event('input'));

    const options = Array.from(
      element.querySelectorAll<HTMLButtonElement>('.part-option')
    );
    const matching = options.filter((option) => !option.hidden);
    const hidden = options.filter((option) => option.hidden);
    expect(matching).toHaveLength(2);
    expect(
      matching.every((option) =>
        option.querySelector('img')?.hasAttribute('src')
      )
    ).toBe(true);
    expect(
      hidden.every(
        (option) => !option.querySelector('img')?.hasAttribute('src')
      )
    ).toBe(true);

    search.value = '';
    search.dispatchEvent(new Event('input'));
    expect(
      Array.from(
        element.querySelectorAll<HTMLDetailsElement>('.part-bucket')
      ).every((section) => !section.open)
    ).toBe(true);
    expect(
      options.filter((option) =>
        option.querySelector('img')?.hasAttribute('src')
      )
    ).toHaveLength(2);
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
      /@media \(max-width: 28rem\)\s*{[\s\S]*\.part-dialog-header,\s*\.part-search-label,\s*\.part-dialog-actions,\s*\.part-buckets\s*{[^}]*padding-inline:\s*var\(--space-sm\)/
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

  test('only removes replacement parts and restores the starting part', () => {
    const ship = addOrSwapShipPreset('fleet-0', 'interceptor', {
      withBlueprint: true,
    })!;
    const element = render(ship.id);

    (element.querySelector('[data-slot="0"]') as HTMLButtonElement).click();
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
    expect(
      (element.querySelector('.drive-warning') as HTMLElement).hidden
    ).toBe(true);
    expect(ship.blueprint?.slots[3]).toBe('nud');
    (element.querySelector('.dialog-close') as HTMLButtonElement).click();

    (element.querySelector('[data-slot="0"]') as HTMLButtonElement).click();
    expect(remove.hidden).toBe(false);
    expect(remove.textContent).toBe('Remove Antimatter Cannon');
    remove.click();
    expect(ship.blueprint?.slots[0]).toBe('nus');
    expect(energyReadout.textContent).toBe('2/3');
    expect(energyReadout.classList.contains('invalid')).toBe(false);
    expect(
      (element.querySelector('.part-dialog') as HTMLDialogElement).open
    ).toBe(false);

    (element.querySelector('[data-slot="2"]') as HTMLButtonElement).click();
    expect(remove.hidden).toBe(true);
    (
      element.querySelector(
        '.part-option[data-part-id="plc"]'
      ) as HTMLButtonElement
    ).click();
    expect(ship.blueprint?.slots[2]).toBe('plc');
    (element.querySelector('[data-slot="2"]') as HTMLButtonElement).click();
    expect(remove.hidden).toBe(false);
    expect(remove.textContent).toBe('Remove Plasma Cannon');
    remove.click();
    expect(ship.blueprint?.slots[2]).toBeNull();
  });

  test('shows three recently used parts first in an expanded picker section', () => {
    const ship = addOrSwapShipPreset('fleet-0', 'interceptor', {
      withBlueprint: true,
    })!;
    const element = render(ship.id);

    const installFromDialog = (slot: number, partId: string) => {
      (
        element.querySelector(`[data-slot="${slot}"]`) as HTMLButtonElement
      ).click();
      (
        element.querySelector(
          `.part-option[data-part-id="${partId}"]`
        ) as HTMLButtonElement
      ).click();
    };

    installFromDialog(2, 'anc');
    installFromDialog(1, 'plc');
    installFromDialog(0, 'fus');
    (element.querySelector('[data-slot="3"]') as HTMLButtonElement).click();
    const recentSection = element.querySelector<HTMLDetailsElement>(
      '.part-bucket[data-bucket="recently-used"]'
    )!;
    const recentPartIds = () =>
      Array.from(
        recentSection.querySelectorAll<HTMLButtonElement>('.part-option')
      ).map((button) => button.dataset.partId);
    expect(element.querySelector('.part-buckets')?.firstElementChild).toBe(
      recentSection
    );
    expect(recentSection.querySelector('h4')?.textContent).toBe(
      'Recently used'
    );
    expect(recentSection.open).toBe(true);
    expect(recentPartIds()).toEqual(['fus', 'plc', 'anc']);

    expect(
      recentSection.querySelector<HTMLButtonElement>(
        '.part-option[data-part-id="anc"]'
      )
    ).not.toBeNull();
    recentSection
      .querySelector<HTMLButtonElement>('.part-option[data-part-id="anc"]')!
      .click();
    expect(ship.blueprint?.slots[3]).toBe('anc');

    (element.querySelector('[data-slot="0"]') as HTMLButtonElement).click();
    expect(
      Array.from(
        element.querySelectorAll<HTMLButtonElement>(
          '.part-bucket[data-bucket="recently-used"] .part-option'
        )
      ).map((button) => button.dataset.partId)
    ).toEqual(['anc', 'fus', 'plc']);
    (element.querySelector('.dialog-close') as HTMLButtonElement).click();
    installFromDialog(0, 'axc');
    (element.querySelector('[data-slot="1"]') as HTMLButtonElement).click();
    expect(
      Array.from(
        element.querySelectorAll<HTMLButtonElement>(
          '.part-bucket[data-bucket="recently-used"] .part-option'
        )
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
    (
      defender.querySelector(
        '.part-option[data-part-id="anc"]'
      ) as HTMLButtonElement
    ).click();

    const attackerShip = addOrSwapShipPreset('fleet-1', 'interceptor', {
      withBlueprint: true,
    })!;
    const attacker = render(attackerShip.id, 'fleet-1');

    (attacker.querySelector('[data-slot="1"]') as HTMLButtonElement).click();
    expect(
      attacker.querySelector('.part-bucket[data-bucket="recently-used"]')
    ).toBeNull();
    (
      attacker.querySelector(
        '.part-option[data-part-id="plc"]'
      ) as HTMLButtonElement
    ).click();

    (defender.querySelector('[data-slot="1"]') as HTMLButtonElement).click();
    expect(
      Array.from(
        defender.querySelectorAll<HTMLButtonElement>(
          '.part-bucket[data-bucket="recently-used"] .part-option'
        )
      ).map((button) => button.dataset.partId)
    ).toEqual(['anc']);
    (defender.querySelector('.dialog-close') as HTMLButtonElement).click();
    (attacker.querySelector('[data-slot="0"]') as HTMLButtonElement).click();
    expect(
      Array.from(
        attacker.querySelectorAll<HTMLButtonElement>(
          '.part-bucket[data-bucket="recently-used"] .part-option'
        )
      ).map((button) => button.dataset.partId)
    ).toEqual(['plc']);
  });

  test('shows fleet recent parts in every blueprint picker', () => {
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
        element.querySelectorAll<HTMLButtonElement>(
          '.part-bucket[data-bucket="recently-used"] .part-option'
        )
      ).map((button) => button.dataset.partId);
    const installFromDialog = (
      element: ShipBlueprintElement,
      slot: number,
      partId: string
    ) => {
      (
        element.querySelector(`[data-slot="${slot}"]`) as HTMLButtonElement
      ).click();
      (
        element.querySelector(
          `.part-option[data-part-id="${partId}"]`
        ) as HTMLButtonElement
      ).click();
    };

    installFromDialog(interceptor, 2, 'anc');
    (cruiser.querySelector('[data-slot="2"]') as HTMLButtonElement).click();
    expect(recentPartIds(cruiser)).toEqual(['anc']);
    (
      cruiser.querySelector(
        '.part-option[data-part-id="plc"]'
      ) as HTMLButtonElement
    ).click();
    (interceptor.querySelector('[data-slot="1"]') as HTMLButtonElement).click();
    expect(recentPartIds(interceptor)).toEqual(['plc', 'anc']);
    (interceptor.querySelector('.dialog-close') as HTMLButtonElement).click();
    (cruiser.querySelector('[data-slot="0"]') as HTMLButtonElement).click();
    expect(recentPartIds(cruiser)).toEqual(['plc', 'anc']);
  });

  test('keeps drives out of starbase and orbital pickers', () => {
    setFleetFaction('fleet-0', 'terran');
    const starbase = addOrSwapShipPreset('fleet-0', 'starbase', {
      withBlueprint: true,
    })!;
    const element = render(starbase.id);
    (element.querySelector('[data-slot="1"]') as HTMLButtonElement).click();

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
