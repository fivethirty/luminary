import html from './ship-blueprint.html' with { type: 'text' };
import './ship-blueprint.css';
import '../ship-clear-button.css';
import '../selector';

import interceptorBlueprintImage from '../../../assets/ship-blueprints/blueprint_interceptor.webp';
import cruiserBlueprintImage from '../../../assets/ship-blueprints/blueprint_cruiser.webp';
import dreadnoughtBlueprintImage from '../../../assets/ship-blueprints/blueprint_dreadnought.webp';
import starbaseBlueprintImage from '../../../assets/ship-blueprints/blueprint_starbase.webp';
import orbitalBlueprintImage from '../../../assets/ship-blueprints/blueprint_orbital.webp';

import { ShipType } from '@calc/ship';
import type { FactionId } from '@ui/fleet-metadata';
import {
  findBlueprintPartUse,
  removeShipType,
  replaceBlueprintPart,
  resetShipBlueprint,
  setBlueprintMuonSource,
  updateShipType,
  type ShipTypeConfig,
} from '@ui/state';
import {
  BLUEPRINT_LAYOUTS,
  calculateBlueprint,
  createStartingBlueprint,
  isBlueprintSlotBlocked,
  isBlueprintShipType,
  isDiscoveryPart,
  PART_BY_ID,
  partAllowedInSlot,
  partBuckets,
  type BlueprintShipType,
  type ShipPart,
} from '@ui/ship-parts';
import {
  matchShipPreset,
  SHIP_NAMES,
  SHIP_QUANTITY_LIMITS,
} from '@ui/ship-presets';
import type { SelectorElement } from '../selector';

const BLUEPRINT_IMAGES: Record<BlueprintShipType, string> = {
  [ShipType.Interceptor]: interceptorBlueprintImage,
  [ShipType.Cruiser]: cruiserBlueprintImage,
  [ShipType.Dreadnought]: dreadnoughtBlueprintImage,
  [ShipType.Starbase]: starbaseBlueprintImage,
  [ShipType.Orbital]: orbitalBlueprintImage,
};

const RECENT_PARTS_STORAGE_KEY = 'luminary:recent-ship-parts';
const RECENT_PARTS_LIMIT = 3;

function formatSignedStat(value: number, sign: '+' | '−'): string {
  return value === 0 ? '0' : `${sign}${value}`;
}

function recentPartsStorageKey(fleetId: string): string {
  return `${RECENT_PARTS_STORAGE_KEY}:${fleetId}`;
}

function recentPartIds(fleetId: string): string[] {
  try {
    const stored = window.sessionStorage.getItem(
      recentPartsStorageKey(fleetId)
    );
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed.filter(
          (partId): partId is string =>
            typeof partId === 'string' &&
            Boolean(PART_BY_ID.get(partId)) &&
            !PART_BY_ID.get(partId)?.external &&
            !isDiscoveryPart(partId)
        )
      )
    ).slice(0, RECENT_PARTS_LIMIT);
  } catch {
    return [];
  }
}

function rememberRecentPart(fleetId: string, partId: string) {
  if (isDiscoveryPart(partId)) return;
  const partIds = [
    partId,
    ...recentPartIds(fleetId).filter((recentPartId) => recentPartId !== partId),
  ].slice(0, RECENT_PARTS_LIMIT);
  try {
    window.sessionStorage.setItem(
      recentPartsStorageKey(fleetId),
      JSON.stringify(partIds)
    );
  } catch {
    // A blocked storage API should not prevent editing the blueprint.
  }
}

export class ShipBlueprintElement extends HTMLElement {
  shipType!: ShipTypeConfig;
  fleetId!: string;
  factionId?: FactionId;

  private selectedSlot: number | null = null;
  private shipName = '';

  connectedCallback() {
    this.innerHTML = html;
    if (!isBlueprintShipType(this.shipType.type)) return;

    this.shipName =
      SHIP_NAMES[matchShipPreset(this.shipType.type, this.shipType.config)];
    const remove = this.querySelector('.remove-btn') as HTMLButtonElement;
    remove.setAttribute('aria-label', `Remove ${this.shipName}`);
    remove.addEventListener('click', () => {
      removeShipType(this.fleetId, this.shipType.id);
      this.dispatchEvent(new Event('ship-removed', { bubbles: true }));
      this.remove();
    });

    const quantity = this.querySelector('calc-selector') as SelectorElement;
    quantity.label = `${this.shipName} quantity`;
    quantity.min = 1;
    quantity.max = SHIP_QUANTITY_LIMITS[this.shipType.type];
    quantity.value = this.shipType.quantity;
    quantity.addEventListener('change', () => {
      updateShipType(this.fleetId, this.shipType.id, {
        quantity: quantity.value,
      });
    });

    const clear = this.querySelector(
      '.clear-blueprint-btn'
    ) as HTMLButtonElement;
    clear.setAttribute(
      'aria-label',
      `Reset ${this.shipName} to starting parts`
    );
    clear.addEventListener('click', () => {
      if (!resetShipBlueprint(this.fleetId, this.shipType.id)) return;
      this.clearSelectedSlot();
      this.renderEditor();
    });
    this.querySelector('.remove-part-btn')?.addEventListener('click', () =>
      this.removeSelectedPart()
    );
    this.bindDialog();
    this.renderEditor();
  }

  private get blueprintType(): BlueprintShipType {
    return this.shipType.type as BlueprintShipType;
  }

  private renderEditor() {
    const editor = this.querySelector('.blueprint-editor') as HTMLElement;
    if (!this.shipType.blueprint) {
      editor.hidden = true;
      return;
    }
    editor.hidden = false;
    this.renderClearButton();
    this.renderCanvas();
    this.renderExternalSection();
  }

  private renderClearButton() {
    const blueprint = this.shipType.blueprint!;
    const startingBlueprint = createStartingBlueprint(
      this.blueprintType,
      this.factionId
    );
    const clear = this.querySelector(
      '.clear-blueprint-btn'
    ) as HTMLButtonElement;
    clear.hidden =
      blueprint.muonSource === startingBlueprint.muonSource &&
      blueprint.slots.length === startingBlueprint.slots.length &&
      blueprint.slots.every(
        (partId, index) => partId === startingBlueprint.slots[index]
      );
  }

  private renderCanvas() {
    const layout = BLUEPRINT_LAYOUTS[this.blueprintType];
    const dreadnoughtAspectRatio =
      BLUEPRINT_LAYOUTS[ShipType.Dreadnought].aspectRatio;
    const canvas = this.querySelector('.blueprint-canvas') as HTMLElement;
    canvas.classList.toggle(
      'blueprint-canvas-dreadnought',
      this.blueprintType === ShipType.Dreadnought
    );
    canvas.style.aspectRatio = String(layout.aspectRatio);
    canvas.style.width = `${(layout.aspectRatio / dreadnoughtAspectRatio) * 100}%`;
    const background = this.querySelector(
      '.blueprint-background'
    ) as HTMLImageElement;
    background.src = BLUEPRINT_IMAGES[this.blueprintType];
    background.alt = `${this.shipName} blueprint layout`;
    background.loading = 'lazy';
    background.decoding = 'async';
    this.renderBlueprintReadouts();

    const slots = this.querySelector('.blueprint-slots') as HTMLElement;
    slots.innerHTML = '';
    this.shipType.blueprint!.slots.forEach((partId, index) => {
      const position = layout.positions[index];
      const blocked = isBlueprintSlotBlocked(
        this.blueprintType,
        index,
        this.factionId
      );
      const entry = partId ? PART_BY_ID.get(partId) : undefined;
      if (blocked) {
        const cover = document.createElement('span');
        cover.className = 'blueprint-slot blueprint-slot-blocked';
        cover.dataset.slot = String(index);
        cover.style.left = `${position.left}%`;
        cover.style.top = `${position.top}%`;
        cover.style.width = `${position.width}%`;
        cover.style.height = `${position.height}%`;
        cover.setAttribute('aria-hidden', 'true');
        slots.appendChild(cover);
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'blueprint-slot';
      button.dataset.slot = String(index);
      button.dataset.row = String(position.row);
      button.style.left = `${position.left}%`;
      button.style.top = `${position.top}%`;
      button.style.width = `${position.width}%`;
      button.style.height = `${position.height}%`;
      button.classList.toggle('selected', index === this.selectedSlot);
      button.setAttribute('aria-pressed', String(index === this.selectedSlot));
      button.setAttribute(
        'aria-label',
        `Slot ${index + 1}: ${entry?.name ?? 'empty'}`
      );

      if (entry) {
        const image = document.createElement('img');
        image.src = entry.image;
        image.alt = '';
        image.width = 128;
        image.height = 128;
        image.loading = 'lazy';
        image.decoding = 'async';
        button.appendChild(image);
      } else {
        const empty = document.createElement('span');
        empty.className = 'slot-empty';
        empty.textContent = 'Empty';
        button.appendChild(empty);
      }
      button.addEventListener('click', () => {
        this.selectedSlot = index;
        slots.querySelectorAll('.blueprint-slot').forEach((slot) => {
          const selected = slot === button;
          slot.classList.toggle('selected', selected);
          slot.setAttribute('aria-pressed', String(selected));
        });
        this.openPartDialog();
      });
      slots.appendChild(button);
    });
  }

  private canRemoveSelectedPart(): boolean {
    if (this.selectedSlot === null || !this.shipType.blueprint) return false;
    const partId = this.shipType.blueprint.slots[this.selectedSlot];
    return (
      partId !== null &&
      partId !==
        createStartingBlueprint(this.blueprintType, this.factionId).slots[
          this.selectedSlot
        ]
    );
  }

  private startingPartId(slot: number): string | null {
    return createStartingBlueprint(this.blueprintType, this.factionId).slots[
      slot
    ];
  }

  private renderExternalSection() {
    const blueprint = this.shipType.blueprint!;
    const readout = calculateBlueprint(
      this.blueprintType,
      blueprint,
      this.factionId
    );

    const muon = this.querySelector('.muon-checkbox') as HTMLInputElement;
    const muonPart = PART_BY_ID.get('mus')!;
    const muonUse = findBlueprintPartUse(this.fleetId, 'mus', {
      shipId: this.shipType.id,
      slot: 'muon',
    });
    muon.checked = blueprint.muonSource;
    muon.disabled = Boolean(muonUse && !blueprint.muonSource);
    const unavailableReason = muonUse
      ? 'Muon Source is installed on another ship'
      : '';
    muon.title = unavailableReason;
    const muonControl = this.querySelector('.muon-control') as HTMLElement;
    muonControl.title = unavailableReason;
    muon.onchange = () => {
      if (
        !setBlueprintMuonSource(this.fleetId, this.shipType.id, muon.checked)
      ) {
        muon.checked = blueprint.muonSource;
      }
      this.refreshFleetMuonControls();
      this.renderBlueprintReadouts();
      this.renderClearButton();
    };
    const muonImage = this.querySelector('.muon-image') as HTMLImageElement;
    muonImage.src = muonPart.image;
    muonImage.width = 128;
    muonImage.height = 128;
    muonImage.loading = 'lazy';
    muonImage.decoding = 'async';

    const driveWarning = this.querySelector('.drive-warning') as HTMLElement;
    const stationary =
      this.blueprintType === ShipType.Starbase ||
      this.blueprintType === ShipType.Orbital;
    driveWarning.hidden = stationary || readout.hasDrive;
  }

  private refreshFleetMuonControls() {
    document
      .querySelectorAll<ShipBlueprintElement>('calc-ship-blueprint')
      .forEach((blueprint) => {
        if (blueprint.fleetId === this.fleetId) {
          blueprint.renderExternalSection();
        }
      });
  }

  private renderBlueprintReadouts() {
    if (!this.shipType.blueprint) return;
    const readout = calculateBlueprint(
      this.blueprintType,
      this.shipType.blueprint,
      this.factionId
    );
    const stats: Record<string, { label: string; value: string }> = {
      initiative: {
        label: 'Initiative',
        value: String(readout.config.initiative),
      },
      energy: {
        label: 'Energy',
        value: `${readout.energyUse}/${readout.energySource}`,
      },
      movement: {
        label: 'Movement',
        value: readout.movement === 0 ? '—' : String(readout.movement),
      },
      computer: {
        label: 'Computer',
        value: formatSignedStat(readout.config.computers, '+'),
      },
      hull: {
        label: 'Hull',
        value: String(readout.config.hull),
      },
      shield: {
        label: 'Shield',
        value: formatSignedStat(readout.config.shields, '−'),
      },
    };
    const target = this.querySelector('.blueprint-readouts') as HTMLElement;
    target.setAttribute('aria-label', `${this.shipName} blueprint stats`);
    const stationary =
      this.blueprintType === ShipType.Starbase ||
      this.blueprintType === ShipType.Orbital;
    Object.entries(stats).forEach(([key, stat]) => {
      const element = target.querySelector(
        `[data-blueprint-stat="${key}"]`
      ) as HTMLElement;
      element.hidden = stationary && key === 'movement';
      if (element.hidden) {
        element.textContent = '';
        element.removeAttribute('aria-label');
        return;
      }
      element.textContent = stat.value;
      element.setAttribute('aria-label', `${stat.label}: ${stat.value}`);
    });
    target
      .querySelector('[data-blueprint-stat="energy"]')
      ?.classList.toggle('invalid', readout.energyBalance < 0);
  }

  private bindDialog() {
    const dialog = this.querySelector('.part-dialog') as HTMLDialogElement;
    this.querySelector('.dialog-close')?.addEventListener('click', () =>
      this.closeDialog()
    );
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) this.closeDialog();
    });
    dialog.addEventListener('close', () => {
      const selectedSlot = this.clearSelectedSlot();
      this.focusSlot(selectedSlot);
    });
    const search = this.querySelector('.part-search') as HTMLInputElement;
    search.addEventListener('input', () => this.filterParts(search.value));
  }

  private removeSelectedPart() {
    if (!this.canRemoveSelectedPart() || this.selectedSlot === null) return;
    const editedSlot = this.selectedSlot;
    if (
      replaceBlueprintPart(
        this.fleetId,
        this.shipType.id,
        this.selectedSlot,
        this.startingPartId(this.selectedSlot)
      )
    ) {
      this.closeDialog();
      this.renderEditor();
      this.focusSlot(editedSlot);
    }
  }

  private installSelectedPart(partId: string) {
    if (this.selectedSlot === null) return;
    const editedSlot = this.selectedSlot;
    if (
      replaceBlueprintPart(
        this.fleetId,
        this.shipType.id,
        this.selectedSlot,
        partId
      )
    ) {
      rememberRecentPart(this.fleetId, partId);
      this.closeDialog();
      this.renderEditor();
      this.focusSlot(editedSlot);
    }
  }

  private focusSlot(slot: number | null) {
    if (slot === null) return;
    this.querySelector<HTMLButtonElement>(
      `.blueprint-slot[data-slot="${slot}"]`
    )?.focus();
  }

  private openPartDialog() {
    if (this.selectedSlot === null || !this.shipType.blueprint) return;
    const partId = this.shipType.blueprint.slots[this.selectedSlot];
    const partName = partId ? PART_BY_ID.get(partId)?.name : undefined;
    const title = this.querySelector('.part-dialog-title') as HTMLElement;
    title.textContent = partName ? `Replace ${partName}` : 'Fill empty slot';
    const remove = this.querySelector('.remove-part-btn') as HTMLButtonElement;
    const canRemove = this.canRemoveSelectedPart();
    remove.hidden = !canRemove;
    remove.textContent = canRemove && partName ? `Remove ${partName}` : '';
    const search = this.querySelector('.part-search') as HTMLInputElement;
    search.value = '';
    this.renderPartBuckets();
    const dialog = this.querySelector('.part-dialog') as HTMLDialogElement;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    search.focus();
  }

  private closeDialog() {
    const selectedSlot = this.clearSelectedSlot();
    const dialog = this.querySelector('.part-dialog') as HTMLDialogElement;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
    this.focusSlot(selectedSlot);
  }

  private clearSelectedSlot(): number | null {
    const selectedSlot = this.selectedSlot;
    this.selectedSlot = null;
    this.querySelectorAll('.blueprint-slot').forEach((slot) => {
      slot.classList.remove('selected');
      slot.setAttribute('aria-pressed', 'false');
    });
    return selectedSlot;
  }

  private renderPartBuckets() {
    const target = this.querySelector('.part-buckets') as HTMLElement;
    target.innerHTML = '';
    const recentParts = recentPartIds(this.fleetId)
      .map((partId) => PART_BY_ID.get(partId))
      .filter((entry): entry is ShipPart => Boolean(entry))
      .filter((entry) => partAllowedInSlot(this.blueprintType, entry));
    if (recentParts.length > 0) {
      target.appendChild(
        this.partBucket('recently-used', 'Recently used', recentParts, true)
      );
    }
    partBuckets(this.blueprintType).forEach((bucket) => {
      target.appendChild(
        this.partBucket(bucket.id, bucket.label, bucket.parts)
      );
    });
    this.filterParts('');
  }

  private partBucket(
    id: string,
    label: string,
    parts: readonly ShipPart[],
    open = false
  ): HTMLDetailsElement {
    const section = document.createElement('details');
    section.className = 'part-bucket';
    section.dataset.bucket = id;
    section.open = open;
    const summary = document.createElement('summary');
    summary.className = 'disclosure-summary';
    const heading = document.createElement('h4');
    heading.textContent = label;
    summary.appendChild(heading);
    section.appendChild(summary);
    const grid = document.createElement('div');
    grid.className = 'part-grid';
    parts.forEach((entry) => grid.appendChild(this.partButton(entry)));
    section.appendChild(grid);
    section.addEventListener('toggle', () => {
      if (section.open) this.loadVisiblePartImages(section);
    });
    return section;
  }

  private partButton(entry: ShipPart): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'part-option';
    button.dataset.partId = entry.id;
    button.dataset.search = entry.name.toLowerCase();
    const use =
      this.selectedSlot !== null && isDiscoveryPart(entry.id)
        ? findBlueprintPartUse(this.fleetId, entry.id, {
            shipId: this.shipType.id,
            slot: this.selectedSlot,
          })
        : undefined;
    const currentPartId =
      this.selectedSlot === null
        ? undefined
        : this.shipType.blueprint?.slots[this.selectedSlot];
    const alreadyInstalled = currentPartId === entry.id;
    button.disabled = Boolean(use) || alreadyInstalled;
    if (use) button.title = 'This discovery tile is already installed';
    else if (alreadyInstalled) button.title = 'Already installed in this slot';

    const image = document.createElement('img');
    image.dataset.src = entry.image;
    image.alt = '';
    image.width = 128;
    image.height = 128;
    image.loading = 'lazy';
    image.decoding = 'async';
    const copy = document.createElement('span');
    copy.className = 'part-option-copy';
    const name = document.createElement('strong');
    name.textContent = entry.name;
    const tier = document.createElement('em');
    tier.textContent = entry.tier === 'technology' ? 'Tech' : entry.tier;
    copy.append(name, tier);
    button.append(image, copy);
    button.addEventListener('click', () => this.installSelectedPart(entry.id));
    return button;
  }

  private loadVisiblePartImages(section: ParentNode) {
    section
      .querySelectorAll<HTMLImageElement>('img[data-src]')
      .forEach((image) => {
        if (image.closest<HTMLElement>('.part-option')?.hidden) return;
        image.src = image.dataset.src!;
        delete image.dataset.src;
      });
  }

  private filterParts(rawQuery: string) {
    const query = rawQuery.trim().toLowerCase();
    let totalVisible = 0;
    this.querySelectorAll<HTMLDetailsElement>('.part-bucket').forEach(
      (section) => {
        let sectionVisible = 0;
        section
          .querySelectorAll<HTMLElement>('.part-option')
          .forEach((option) => {
            const visible = !query || option.dataset.search?.includes(query);
            option.hidden = !visible;
            option.style.display = visible ? '' : 'none';
            if (visible) sectionVisible++;
          });
        section.hidden = sectionVisible === 0;
        totalVisible += sectionVisible;
        if (query && !section.open) {
          section.dataset.searchOpened = '';
          section.open = true;
        } else if (!query && 'searchOpened' in section.dataset) {
          section.open = false;
          delete section.dataset.searchOpened;
        }
        if (section.open) this.loadVisiblePartImages(section);
      }
    );
    const empty = this.querySelector('.part-search-empty') as HTMLElement;
    empty.hidden = totalVisible > 0;
  }
}

if (!customElements.get('calc-ship-blueprint')) {
  customElements.define('calc-ship-blueprint', ShipBlueprintElement);
}
