import html from './fleet.html' with { type: 'text' };
import './fleet.css';
import '../ship-type';
import type { ShipTypeElement } from '../ship-type';
import { ShipType, ShipConfig } from '@calc/ship';
import type { FleetState } from '@ui/state';
import { removeFleet, addShipType, toggleAntimatterSplitter } from '@ui/state';

type ShipDropdownOption =
  | 'interceptor'
  | 'cruiser'
  | 'dreadnaught'
  | 'starbase'
  | 'orbital'
  | 'ancient'
  | 'ancient-adv'
  | 'ancient-wa'
  | 'guardian'
  | 'guardian-adv'
  | 'guardian-wa'
  | 'gcds'
  | 'gcds-adv'
  | 'gcds-wa';

interface ShipVariantData {
  type: ShipType;
  config: Required<ShipConfig>;
}

function createEmptyConfig(initiative: number): Required<ShipConfig> {
  return {
    hull: 0,
    computers: 0,
    shields: 0,
    initiative,
    cannons: { ion: 0, plasma: 0, soliton: 0, antimatter: 0 },
    missiles: { ion: 0, plasma: 0, soliton: 0, antimatter: 0 },
    rift: 0,
  };
}

function getDefaultShipConfig(
  dropdownValue: ShipDropdownOption
): ShipVariantData {
  const configs: Record<ShipDropdownOption, ShipVariantData> = {
    interceptor: {
      type: ShipType.Interceptor,
      config: createEmptyConfig(3),
    },
    cruiser: {
      type: ShipType.Cruiser,
      config: createEmptyConfig(2),
    },
    dreadnaught: {
      type: ShipType.Dreadnaught,
      config: createEmptyConfig(1),
    },
    starbase: {
      type: ShipType.Starbase,
      config: createEmptyConfig(4),
    },
    orbital: {
      type: ShipType.Orbital,
      config: createEmptyConfig(4),
    },
    ancient: {
      type: ShipType.Ancient,
      config: {
        hull: 1,
        computers: 1,
        shields: 0,
        initiative: 2,
        cannons: { ion: 2, plasma: 0, soliton: 0, antimatter: 0 },
        missiles: { ion: 0, plasma: 0, soliton: 0, antimatter: 0 },
        rift: 0,
      },
    },
    'ancient-adv': {
      type: ShipType.Ancient,
      config: {
        hull: 2,
        computers: 1,
        shields: 0,
        initiative: 1,
        cannons: { ion: 0, plasma: 1, soliton: 0, antimatter: 0 },
        missiles: { ion: 0, plasma: 0, soliton: 0, antimatter: 0 },
        rift: 0,
      },
    },
    'ancient-wa': {
      type: ShipType.Ancient,
      config: {
        hull: 1,
        computers: 2,
        shields: 0,
        initiative: 3,
        cannons: { ion: 1, plasma: 0, soliton: 0, antimatter: 0 },
        missiles: { ion: 0, plasma: 0, soliton: 0, antimatter: 0 },
        rift: 0,
      },
    },
    guardian: {
      type: ShipType.Guardian,
      config: {
        hull: 2,
        computers: 2,
        shields: 0,
        initiative: 3,
        cannons: { ion: 3, plasma: 0, soliton: 0, antimatter: 0 },
        missiles: { ion: 0, plasma: 0, soliton: 0, antimatter: 0 },
        rift: 0,
      },
    },
    'guardian-adv': {
      type: ShipType.Guardian,
      config: {
        hull: 3,
        computers: 1,
        shields: 0,
        initiative: 1,
        cannons: { ion: 0, plasma: 0, soliton: 0, antimatter: 1 },
        missiles: { ion: 0, plasma: 2, soliton: 0, antimatter: 0 },
        rift: 0,
      },
    },
    'guardian-wa': {
      type: ShipType.Guardian,
      config: {
        hull: 3,
        computers: 1,
        shields: 1,
        initiative: 2,
        cannons: { ion: 0, plasma: 2, soliton: 0, antimatter: 0 },
        missiles: { ion: 0, plasma: 0, soliton: 0, antimatter: 0 },
        rift: 0,
      },
    },
    gcds: {
      type: ShipType.GCDS,
      config: {
        hull: 7,
        computers: 2,
        shields: 0,
        initiative: 0,
        cannons: { ion: 4, plasma: 0, soliton: 0, antimatter: 0 },
        missiles: { ion: 0, plasma: 0, soliton: 0, antimatter: 0 },
        rift: 0,
      },
    },
    'gcds-adv': {
      type: ShipType.GCDS,
      config: {
        hull: 3,
        computers: 2,
        shields: 0,
        initiative: 2,
        cannons: { ion: 0, plasma: 0, soliton: 0, antimatter: 1 },
        missiles: { ion: 4, plasma: 0, soliton: 0, antimatter: 0 },
        rift: 0,
      },
    },
    'gcds-wa': {
      type: ShipType.GCDS,
      config: {
        hull: 4,
        computers: 2,
        shields: 2,
        initiative: 3,
        cannons: { ion: 0, plasma: 2, soliton: 0, antimatter: 0 },
        missiles: { ion: 0, plasma: 0, soliton: 0, antimatter: 0 },
        rift: 0,
      },
    },
  };

  return configs[dropdownValue];
}

export class FleetElement extends HTMLElement {
  fleet!: FleetState;

  connectedCallback() {
    this.innerHTML = html;

    const nameSpan = this.querySelector('.fleet-name') as HTMLSpanElement;
    nameSpan.textContent = this.fleet.name;

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

    this.updateShipSelector();

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

    const options = shipSelector.querySelectorAll('option');
    options.forEach((option) => {
      if (option.value) {
        const variantData = getDefaultShipConfig(
          option.value as ShipDropdownOption
        );
        option.disabled = existingTypes.includes(variantData.type);
      }
    });
  }

  private addShip(dropdownOption: ShipDropdownOption) {
    const variantData = getDefaultShipConfig(dropdownOption);
    const newShip = addShipType(this.fleet.id, variantData.type);

    newShip.config = variantData.config;

    const shipsContainer = this.querySelector('.fleet-ships') as HTMLDivElement;
    const shipElement = document.createElement(
      'calc-ship-type'
    ) as ShipTypeElement;
    shipElement.shipType = newShip;
    shipElement.fleetId = this.fleet.id;
    shipsContainer.appendChild(shipElement);

    this.updateShipSelector();
  }
}

customElements.define('calc-fleet', FleetElement);
