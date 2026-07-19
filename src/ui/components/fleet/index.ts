import html from './fleet.html' with { type: 'text' };
import './fleet.css';
import '../ship-type';
import type { ShipTypeElement } from '../ship-type';
import { ShipType, isPlayerShipType, type ShipConfig } from '@calc/ship';
import type { FleetState } from '@ui/state';
import {
  removeFleet,
  addShipType,
  getCachedShipType,
  removeShipType,
  updateShipType,
  toggleAntimatterSplitter,
  setFleetPlannerType,
} from '@ui/state';

import {
  getDefaultShipConfig,
  presetKeysForType,
  SHIP_QUANTITY_LIMITS,
  type ShipDropdownOption,
} from '@ui/ship-presets';

export class FleetElement extends HTMLElement {
  fleet!: FleetState;

  connectedCallback() {
    this.innerHTML = html;

    const nameSpan = this.querySelector('.fleet-name') as HTMLSpanElement;
    nameSpan.textContent = this.fleet.name;
    this.querySelector('.fleet')?.classList.toggle(
      'fleet-defender',
      this.getAttribute('is-defender') !== 'false'
    );
    this.querySelector('.fleet')?.classList.toggle(
      'fleet-attacker',
      this.getAttribute('is-defender') === 'false'
    );
    const fleetIndex = Number(this.getAttribute('fleet-index') ?? '0');
    if (fleetIndex > 1) {
      this.querySelector('.fleet')?.classList.add(
        `fleet-attacker-${Math.min(fleetIndex, 4)}`
      );
    }

    const removeBtn = this.querySelector('.remove-btn') as HTMLButtonElement;
    const canRemove = this.getAttribute('can-remove') !== 'false';
    if (!canRemove) {
      removeBtn.disabled = true;
    } else {
      removeBtn.addEventListener('click', () => {
        removeFleet(this.fleet.id);
        this.dispatchEvent(
          new CustomEvent('fleet-removed', {
            bubbles: true,
            detail: { fleetId: this.fleet.id },
          })
        );
      });
    }

    this.addEventListener('ship-removed', () => {
      this.updateShipSelector();
      this.updatePlannerControl();
    });

    const shipSelector = this.querySelector(
      '.ship-selector'
    ) as HTMLSelectElement;
    shipSelector.addEventListener('change', () => {
      const value = shipSelector.value;
      if (value) {
        this.addShip(value as ShipDropdownOption);
        shipSelector.value = '';
      }
    });

    this.bindPresetChips();

    const antimatterCheckbox = this.querySelector(
      '.antimatter-splitter-checkbox'
    ) as HTMLInputElement;
    antimatterCheckbox.checked = this.fleet.antimatterSplitter;
    antimatterCheckbox.addEventListener('change', () => {
      toggleAntimatterSplitter(this.fleet.id);
    });

    const plannerTypeSelect = this.querySelector(
      '.planner-type-select'
    ) as HTMLSelectElement;
    plannerTypeSelect.value = this.fleet.plannerType;
    plannerTypeSelect.addEventListener('change', () => {
      const value = plannerTypeSelect.value;
      if (value !== 'dps' && value !== 'optimal') return;
      setFleetPlannerType(this.fleet.id, value);
    });

    this.updateShipSelector();
    this.updatePlannerControl();
    this.renderShips();
  }

  // One-tap NPC opponents for the defender: tap adds the ship, tapping again
  // adds another (up to the ship's limit). The most common table-mode question
  // is "can I take this Ancient/Guardian/GCDS hex?", so those live one tap
  // away instead of inside the dropdown.
  private bindPresetChips() {
    const chips = this.querySelector('.preset-chips') as HTMLElement;
    if (this.getAttribute('is-defender') === 'false') return;
    chips.hidden = false;

    chips.querySelectorAll('.preset-picker').forEach((picker) => {
      picker.addEventListener('change', () => {
        const select = picker as HTMLSelectElement;
        const preset = select.value as ShipDropdownOption;
        select.value = '';
        if (!preset) return;
        const variantData = getDefaultShipConfig(preset);
        const existing = this.fleet.shipTypes.find(
          (st) => st.type === variantData.type
        );

        if (!existing) {
          this.addShip(preset);
          return;
        }

        if (!sameShipConfig(existing.config, variantData.config)) {
          this.addShip(preset);
          return;
        }

        if (existing.quantity < SHIP_QUANTITY_LIMITS[existing.type]) {
          updateShipType(this.fleet.id, existing.id, {
            quantity: existing.quantity + 1,
          });
          this.renderShips();
        }
      });
    });
  }

  private renderShips() {
    const shipsContainer = this.querySelector('.fleet-ships') as HTMLDivElement;
    shipsContainer.innerHTML = '';

    this.fleet.shipTypes.forEach((shipType) => {
      const shipElement = document.createElement(
        'calc-ship-type'
      ) as ShipTypeElement;
      shipElement.shipType = shipType;
      shipElement.fleetId = this.fleet.id;
      shipsContainer.appendChild(shipElement);
    });
  }

  private updateShipSelector() {
    const shipSelector = this.querySelector(
      '.ship-selector'
    ) as HTMLSelectElement;
    const existingTypes = this.fleet.shipTypes.map((st) => st.type);
    // AI ships, starbases, and orbitals may only be fielded by the defender. A
    // missing attribute defaults to defender (permissive).
    const isAttacker = this.getAttribute('is-defender') === 'false';

    const options = shipSelector.querySelectorAll('option');
    options.forEach((option) => {
      if (!option.value) return;
      const variantData = getDefaultShipConfig(
        option.value as ShipDropdownOption
      );
      const attackerForbidden =
        isAttacker &&
        (!isPlayerShipType(variantData.type) ||
          variantData.type === ShipType.Starbase ||
          variantData.type === ShipType.Orbital);
      option.hidden = attackerForbidden;
      // Types with variants (Ancient/Guardian/GCDS) stay selectable while
      // fielded — picking a variant swaps the ship's stats. Single-variant
      // types would be duplicates, so those disable.
      const hasVariants = presetKeysForType(variantData.type).length > 1;
      option.disabled =
        attackerForbidden ||
        (existingTypes.includes(variantData.type) && !hasVariants);
    });
  }

  private addShip(dropdownOption: ShipDropdownOption) {
    const variantData = getDefaultShipConfig(dropdownOption);
    const newIsPlayer = isPlayerShipType(variantData.type);

    // Selecting a variant of an already-fielded type (e.g. Ancient (WA) with
    // Ancients on the board) swaps that ship's stats to the variant's preset,
    // keeping the quantity.
    const existing = this.fleet.shipTypes.find(
      (st) => st.type === variantData.type
    );
    if (existing) {
      updateShipType(this.fleet.id, existing.id, {
        config: variantData.config,
      });
      this.renderShips();
      this.updateShipSelector();
      this.updatePlannerControl();
      return;
    }

    // A fleet can't mix player ships with NPC ships, or multiple NPC types.
    const incompatible = this.fleet.shipTypes.filter(
      (st) =>
        isPlayerShipType(st.type) !== newIsPlayer ||
        (!newIsPlayer && st.type !== variantData.type)
    );
    incompatible.forEach((st) => removeShipType(this.fleet.id, st.id));

    const hasVariants = presetKeysForType(variantData.type).length > 1;
    const cached = hasVariants
      ? undefined
      : getCachedShipType(this.fleet.id, variantData.type);
    const newShip = addShipType(
      this.fleet.id,
      variantData.type,
      cached?.config ?? variantData.config,
      Math.min(cached?.quantity ?? 1, SHIP_QUANTITY_LIMITS[variantData.type])
    );

    if (incompatible.length > 0) {
      // Some ship elements were removed; rebuild the list from state.
      this.renderShips();
    } else {
      const shipsContainer = this.querySelector(
        '.fleet-ships'
      ) as HTMLDivElement;
      const shipElement = document.createElement(
        'calc-ship-type'
      ) as ShipTypeElement;
      shipElement.shipType = newShip;
      shipElement.fleetId = this.fleet.id;
      shipsContainer.appendChild(shipElement);
    }

    this.updateShipSelector();
    this.updatePlannerControl();
  }

  // An all-AI fleet always fights with the NPC planner (see Fleet.getDamageType),
  // so lock the control to a disabled "NPC" for those fleets. Player fleets get
  // the normal, editable set of planners.
  private updatePlannerControl() {
    const select = this.querySelector(
      '.planner-type-select'
    ) as HTMLSelectElement | null;
    if (!select) return;
    const npcOption = select.querySelector(
      'option[value="npc"]'
    ) as HTMLOptionElement | null;
    const types = this.fleet.shipTypes;
    const allAi =
      types.length > 0 && types.every((st) => !isPlayerShipType(st.type));

    if (npcOption) {
      npcOption.hidden = !allAi;
      npcOption.disabled = !allAi;
    }

    select.querySelectorAll('option:not([value="npc"])').forEach((opt) => {
      const option = opt as HTMLOptionElement;
      option.hidden = allAi;
      option.disabled = allAi;
    });

    if (allAi) {
      select.value = 'npc';
      select.disabled = true;
    } else {
      select.disabled = false;
      select.value = this.fleet.plannerType;
    }
  }
}

function sameShipConfig(a: ShipConfig, b: ShipConfig): boolean {
  return (
    (a.hull ?? 0) === (b.hull ?? 0) &&
    (a.computers ?? 0) === (b.computers ?? 0) &&
    (a.shields ?? 0) === (b.shields ?? 0) &&
    (a.initiative ?? 0) === (b.initiative ?? 0) &&
    (a.heal ?? 0) === (b.heal ?? 0) &&
    (a.rift ?? 0) === (b.rift ?? 0) &&
    sameWeapons(a.cannons, b.cannons) &&
    sameWeapons(a.missiles, b.missiles)
  );
}

function sameWeapons(a: ShipConfig['cannons'], b: ShipConfig['cannons']) {
  return (
    (a?.ion ?? 0) === (b?.ion ?? 0) &&
    (a?.plasma ?? 0) === (b?.plasma ?? 0) &&
    (a?.soliton ?? 0) === (b?.soliton ?? 0) &&
    (a?.antimatter ?? 0) === (b?.antimatter ?? 0)
  );
}

customElements.define('calc-fleet', FleetElement);
