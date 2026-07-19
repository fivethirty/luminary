import html from './fleet.html' with { type: 'text' };
import './fleet.css';
import '../ship-type';
import type { ShipTypeElement } from '../ship-type';
import { ShipType, isPlayerShipType } from '@calc/ship';
import type { FleetState } from '@ui/state';
import {
  removeFleet,
  addShipType,
  removeShipType,
  toggleAntimatterSplitter,
  setFleetPlannerType,
} from '@ui/state';

import {
  getDefaultShipConfig,
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
      option.disabled =
        attackerForbidden || existingTypes.includes(variantData.type);
    });
  }

  private addShip(dropdownOption: ShipDropdownOption) {
    const variantData = getDefaultShipConfig(dropdownOption);
    const newIsPlayer = isPlayerShipType(variantData.type);

    if (this.fleet.shipTypes.some((st) => st.type === variantData.type)) {
      return;
    }

    // A fleet can't mix player ships with NPC ships, or multiple NPC types.
    const incompatible = this.fleet.shipTypes.filter(
      (st) =>
        isPlayerShipType(st.type) !== newIsPlayer ||
        (!newIsPlayer && st.type !== variantData.type)
    );
    incompatible.forEach((st) => removeShipType(this.fleet.id, st.id));

    const newShip = addShipType(
      this.fleet.id,
      variantData.type,
      variantData.config
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
    const types = this.fleet.shipTypes;
    const allAi =
      types.length > 0 && types.every((st) => !isPlayerShipType(st.type));

    select.querySelectorAll('option').forEach((opt) => {
      const option = opt as HTMLOptionElement;
      option.hidden = option.value === 'npc' ? !allAi : allAi;
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

customElements.define('calc-fleet', FleetElement);
