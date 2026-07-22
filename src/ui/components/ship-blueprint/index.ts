import html from './ship-blueprint.html' with { type: 'text' };
import './ship-blueprint.css';
import '../selector';

import interceptorBlueprintImage from '../../../assets/ship-blueprints/blueprint_interceptor.png';
import cruiserBlueprintImage from '../../../assets/ship-blueprints/blueprint_cruiser.png';
import dreadnoughtBlueprintImage from '../../../assets/ship-blueprints/blueprint_dreadnought.png';
import starbaseBlueprintImage from '../../../assets/ship-blueprints/blueprint_starbase.png';
import orbitalBlueprintImage from '../../../assets/ship-blueprints/blueprint_orbital.png';

import { ShipType } from '@calc/ship';
import type { FactionId } from '@ui/fleet-metadata';
import {
  ensureShipBlueprint,
  findBlueprintPartUse,
  removeShipType,
  replaceBlueprintPart,
  setBlueprintMuonSource,
  updateShipType,
  type ShipTypeConfig,
} from '@ui/state';
import {
  BLUEPRINT_LAYOUTS,
  calculateBlueprint,
  createStartingBlueprint,
  describePart,
  externalBonusLabels,
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
const RECENT_PARTS_LIMIT = 2;

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
    const name = this.querySelector('.ship-type-name') as HTMLElement;
    name.textContent = this.shipName;

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

    this.querySelector('.start-blueprint-btn')?.addEventListener(
      'click',
      () => {
        if (ensureShipBlueprint(this.fleetId, this.shipType.id, true)) {
          this.selectedSlot = null;
          this.renderEditor();
        }
      }
    );
    this.querySelector('.edit-part-btn')?.addEventListener('click', () =>
      this.openPartDialog()
    );
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
    const reset = this.querySelector('.blueprint-reset') as HTMLElement;
    const editor = this.querySelector('.blueprint-editor') as HTMLElement;
    if (!this.shipType.blueprint) {
      reset.hidden = false;
      editor.hidden = true;
      return;
    }
    reset.hidden = true;
    editor.hidden = false;
    this.renderCanvas();
    this.renderExternalSection();
    this.renderSelection();
  }

  private renderCanvas() {
    const layout = BLUEPRINT_LAYOUTS[this.blueprintType];
    const canvas = this.querySelector('.blueprint-canvas') as HTMLElement;
    canvas.style.aspectRatio = String(layout.aspectRatio);
    const background = this.querySelector(
      '.blueprint-background'
    ) as HTMLImageElement;
    background.src = BLUEPRINT_IMAGES[this.blueprintType];
    background.alt = `${this.shipName} blueprint layout`;
    this.renderBlueprintReadouts();

    const slots = this.querySelector('.blueprint-slots') as HTMLElement;
    slots.innerHTML = '';
    this.shipType.blueprint!.slots.forEach((partId, index) => {
      const position = layout.positions[index];
      const entry = partId ? PART_BY_ID.get(partId) : undefined;
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

      const number = document.createElement('span');
      number.className = 'slot-number';
      number.textContent = String(index + 1);
      button.appendChild(number);
      if (entry) {
        const image = document.createElement('img');
        image.src = entry.image;
        image.alt = '';
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
        this.renderSelection();
      });
      slots.appendChild(button);
    });
  }

  private renderSelection() {
    const selected = this.querySelector('.selected-part') as HTMLElement;
    const replace = this.querySelector('.edit-part-btn') as HTMLButtonElement;
    const remove = this.querySelector('.remove-part-btn') as HTMLButtonElement;
    if (this.selectedSlot === null || !this.shipType.blueprint) {
      selected.textContent = 'Select a ship slot';
      replace.disabled = true;
      remove.disabled = true;
      remove.hidden = true;
      this.renderRecentParts();
      return;
    }
    const partId = this.shipType.blueprint.slots[this.selectedSlot];
    const entry = PART_BY_ID.get(partId ?? '');
    selected.textContent = `Slot ${this.selectedSlot + 1} · ${entry?.name ?? 'Empty'}`;
    replace.disabled = false;
    const canRemove = this.canRemoveSelectedPart();
    remove.disabled = !canRemove;
    remove.hidden = !canRemove;
    this.renderRecentParts();
  }

  private startingPartId(slot: number): string | null {
    return createStartingBlueprint(this.blueprintType, this.factionId).slots[
      slot
    ];
  }

  private canRemoveSelectedPart(): boolean {
    if (this.selectedSlot === null || !this.shipType.blueprint) return false;
    return (
      this.shipType.blueprint.slots[this.selectedSlot] !==
      this.startingPartId(this.selectedSlot)
    );
  }

  private renderRecentParts() {
    const section = this.querySelector('.recent-parts') as HTMLElement;
    const target = this.querySelector('.recent-parts-list') as HTMLElement;
    const partIds = recentPartIds(this.fleetId);
    section.hidden = partIds.length === 0;
    target.innerHTML = '';
    partIds.forEach((partId) => {
      const entry = PART_BY_ID.get(partId);
      if (!entry) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'quick-part-btn';
      button.dataset.partId = partId;

      const currentPartId =
        this.selectedSlot === null
          ? undefined
          : this.shipType.blueprint?.slots[this.selectedSlot];
      const use =
        this.selectedSlot !== null && isDiscoveryPart(partId)
          ? findBlueprintPartUse(this.fleetId, partId, {
              shipId: this.shipType.id,
              slot: this.selectedSlot,
            })
          : undefined;
      const disallowed = !partAllowedInSlot(this.blueprintType, entry);
      const noSelection = this.selectedSlot === null;
      const alreadyInstalled = currentPartId === partId;
      button.disabled =
        noSelection || disallowed || alreadyInstalled || Boolean(use);
      const unavailableReason = noSelection
        ? 'Select a ship slot first'
        : disallowed
          ? 'Cannot be installed on this ship'
          : alreadyInstalled
            ? 'Already installed in this slot'
            : use
              ? 'This discovery tile is already installed'
              : undefined;
      if (unavailableReason) button.title = unavailableReason;
      button.setAttribute(
        'aria-label',
        unavailableReason
          ? `${entry.name}. ${unavailableReason}`
          : `Replace slot ${this.selectedSlot! + 1} with ${entry.name}`
      );

      const image = document.createElement('img');
      image.src = entry.image;
      image.alt = '';
      const name = document.createElement('span');
      name.textContent = entry.name;
      button.append(image, name);
      button.addEventListener('click', () => this.installSelectedPart(partId));
      target.appendChild(button);
    });
  }

  private renderExternalSection() {
    const blueprint = this.shipType.blueprint!;
    const readout = calculateBlueprint(
      this.blueprintType,
      blueprint,
      this.factionId
    );
    const bonuses = this.querySelector('.external-bonuses') as HTMLElement;
    bonuses.innerHTML = '';
    externalBonusLabels(this.blueprintType, this.factionId).forEach((label) => {
      const chip = document.createElement('span');
      chip.textContent = label;
      bonuses.appendChild(chip);
    });

    const muon = this.querySelector('.muon-checkbox') as HTMLInputElement;
    const muonPart = PART_BY_ID.get('mus')!;
    const muonUse = findBlueprintPartUse(this.fleetId, 'mus', {
      shipId: this.shipType.id,
      slot: 'muon',
    });
    muon.checked = blueprint.muonSource;
    muon.disabled = Boolean(muonUse && !blueprint.muonSource);
    muon.title = muonUse ? 'Muon Source is installed on another ship' : '';
    muon.onchange = () => {
      if (
        !setBlueprintMuonSource(this.fleetId, this.shipType.id, muon.checked)
      ) {
        muon.checked = blueprint.muonSource;
      }
      this.renderExternalSection();
      this.renderBlueprintReadouts();
    };
    const muonImage = this.querySelector('.muon-image') as HTMLImageElement;
    muonImage.src = muonPart.image;

    const driveWarning = this.querySelector('.drive-warning') as HTMLElement;
    const stationary =
      this.blueprintType === ShipType.Starbase ||
      this.blueprintType === ShipType.Orbital;
    driveWarning.hidden = stationary || readout.hasDrive;
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
        value: formatSignedStat(readout.config.hull, '+'),
      },
      shield: {
        label: 'Shield',
        value: formatSignedStat(readout.config.shields, '−'),
      },
    };
    const target = this.querySelector('.blueprint-readouts') as HTMLElement;
    target.setAttribute('aria-label', `${this.shipName} blueprint stats`);
    Object.entries(stats).forEach(([key, stat]) => {
      const element = target.querySelector(
        `[data-blueprint-stat="${key}"]`
      ) as HTMLElement;
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
    const search = this.querySelector('.part-search') as HTMLInputElement;
    search.addEventListener('input', () => this.filterParts(search.value));
  }

  private removeSelectedPart() {
    if (!this.canRemoveSelectedPart() || this.selectedSlot === null) return;
    if (
      replaceBlueprintPart(
        this.fleetId,
        this.shipType.id,
        this.selectedSlot,
        this.startingPartId(this.selectedSlot)
      )
    ) {
      this.renderEditor();
      this.focusSelectedSlot();
    }
  }

  private installSelectedPart(partId: string) {
    if (this.selectedSlot === null) return;
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
      this.focusSelectedSlot();
    }
  }

  private focusSelectedSlot() {
    if (this.selectedSlot === null) return;
    this.querySelector<HTMLButtonElement>(
      `.blueprint-slot[data-slot="${this.selectedSlot}"]`
    )?.focus();
  }

  private openPartDialog() {
    if (this.selectedSlot === null || !this.shipType.blueprint) return;
    const slotNumber = this.querySelector('.dialog-slot-number') as HTMLElement;
    slotNumber.textContent = String(this.selectedSlot + 1);
    const search = this.querySelector('.part-search') as HTMLInputElement;
    search.value = '';
    this.renderPartBuckets();
    const dialog = this.querySelector('.part-dialog') as HTMLDialogElement;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    search.focus();
  }

  private closeDialog() {
    const dialog = this.querySelector('.part-dialog') as HTMLDialogElement;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  private renderPartBuckets() {
    const target = this.querySelector('.part-buckets') as HTMLElement;
    target.innerHTML = '';
    partBuckets(this.blueprintType).forEach((bucket) => {
      const section = document.createElement('section');
      section.className = 'part-bucket';
      section.dataset.bucket = bucket.id;
      const heading = document.createElement('h4');
      heading.textContent = bucket.label;
      section.appendChild(heading);
      const grid = document.createElement('div');
      grid.className = 'part-grid';
      bucket.parts.forEach((entry) => grid.appendChild(this.partButton(entry)));
      section.appendChild(grid);
      target.appendChild(section);
    });
    this.filterParts('');
  }

  private partButton(entry: ShipPart): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'part-option';
    button.dataset.partId = entry.id;
    button.dataset.search =
      `${entry.name} ${entry.tier} ${describePart(entry)}`.toLowerCase();
    const use =
      this.selectedSlot !== null && isDiscoveryPart(entry.id)
        ? findBlueprintPartUse(this.fleetId, entry.id, {
            shipId: this.shipType.id,
            slot: this.selectedSlot,
          })
        : undefined;
    button.disabled = Boolean(use);
    if (use) button.title = 'This discovery tile is already installed';

    const image = document.createElement('img');
    image.src = entry.image;
    image.alt = '';
    const copy = document.createElement('span');
    copy.className = 'part-option-copy';
    const name = document.createElement('strong');
    name.textContent = entry.name;
    const stats = document.createElement('small');
    stats.textContent = use ? 'Already installed' : describePart(entry);
    const tier = document.createElement('em');
    tier.textContent = entry.tier === 'technology' ? 'Tech' : entry.tier;
    copy.append(name, stats, tier);
    button.append(image, copy);
    button.addEventListener('click', () => this.installSelectedPart(entry.id));
    return button;
  }

  private filterParts(rawQuery: string) {
    const query = rawQuery.trim().toLowerCase();
    let totalVisible = 0;
    this.querySelectorAll<HTMLElement>('.part-bucket').forEach((section) => {
      let sectionVisible = 0;
      section
        .querySelectorAll<HTMLElement>('.part-option')
        .forEach((option) => {
          const visible = !query || option.dataset.search?.includes(query);
          option.hidden = !visible;
          if (visible) sectionVisible++;
        });
      section.hidden = sectionVisible === 0;
      totalVisible += sectionVisible;
    });
    const empty = this.querySelector('.part-search-empty') as HTMLElement;
    empty.hidden = totalVisible > 0;
  }
}

if (!customElements.get('calc-ship-blueprint')) {
  customElements.define('calc-ship-blueprint', ShipBlueprintElement);
}
