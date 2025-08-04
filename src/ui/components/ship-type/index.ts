import html from './ship-type.html' with { type: 'text' };
import './ship-type.css';
import '../selector';
import '../stat-cube';
import type { SelectorElement } from '../selector';
import type { StatCubeElement } from '../stat-cube';
import type { ShipTypeConfig } from '@ui/state';
import { removeShipType, updateShipType } from '@ui/state';
import type { WeaponType } from '@calc/ship';

export class ShipTypeElement extends HTMLElement {
  shipType!: ShipTypeConfig;
  fleetId!: string;

  connectedCallback() {
    this.innerHTML = html as string;

    const removeBtn = this.querySelector('.remove-btn') as HTMLButtonElement;
    removeBtn.addEventListener('click', () => {
      removeShipType(this.fleetId, this.shipType.id);
      this.dispatchEvent(new Event('ship-removed', { bubbles: true }));
      this.remove();
    });

    const nameSpan = this.querySelector('.ship-type-name') as HTMLSpanElement;
    nameSpan.textContent = this.shipType.type;

    this.bindSelectors();
  }

  private bindSelectors() {
    const qtyInput = this.querySelector('calc-selector') as SelectorElement;
    if (qtyInput) {
      qtyInput.min = 1;
      qtyInput.max = 99;
      qtyInput.value = this.shipType.quantity;
      qtyInput.addEventListener('change', () => {
        this.shipType.quantity = qtyInput.value;
        updateShipType(this.fleetId, this.shipType.id, this.shipType);
      });
    }

    const statConfigs: Array<{
      stat: string;
      label: string;
      getValue: () => number;
      setValue: (value: number) => void;
    }> = [
      {
        stat: 'initiative',
        label: 'Init',
        getValue: () => this.shipType.config.initiative || 0,
        setValue: (value) => {
          this.shipType.config.initiative = value;
        },
      },
      {
        stat: 'hull',
        label: 'Hull',
        getValue: () => this.shipType.config.hull || 0,
        setValue: (value) => {
          this.shipType.config.hull = value;
        },
      },
      {
        stat: 'computer',
        label: 'Comp',
        getValue: () => this.shipType.config.computers || 0,
        setValue: (value) => {
          this.shipType.config.computers = value;
        },
      },
      {
        stat: 'shield',
        label: 'Shield',
        getValue: () => this.shipType.config.shields || 0,
        setValue: (value) => {
          this.shipType.config.shields = value;
        },
      },
      {
        stat: 'rift-cannon',
        label: 'Rift C',
        getValue: () => this.shipType.config.rift || 0,
        setValue: (value) => {
          this.shipType.config.rift = value;
        },
      },
    ];

    const weaponTypes: Array<{ type: WeaponType; label: string }> = [
      { type: 'ion', label: 'Ion' },
      { type: 'plasma', label: 'Pls' },
      { type: 'soliton', label: 'Sol' },
      { type: 'antimatter', label: 'Ant' },
    ];

    weaponTypes.forEach(({ type, label }) => {
      statConfigs.push({
        stat: `${type}-cannon`,
        label: `${label} C`,
        getValue: () => this.shipType.config.cannons?.[type] || 0,
        setValue: (value) => {
          if (!this.shipType.config.cannons) {
            this.shipType.config.cannons = {
              ion: 0,
              plasma: 0,
              soliton: 0,
              antimatter: 0,
            };
          }
          this.shipType.config.cannons[type] = value;
        },
      });
    });

    // Add missiles
    weaponTypes.forEach(({ type, label }) => {
      statConfigs.push({
        stat: `${type}-missile`,
        label: `${label} M`,
        getValue: () => this.shipType.config.missiles?.[type] || 0,
        setValue: (value) => {
          if (!this.shipType.config.missiles) {
            this.shipType.config.missiles = {
              ion: 0,
              plasma: 0,
              soliton: 0,
              antimatter: 0,
            };
          }
          this.shipType.config.missiles[type] = value;
        },
      });
    });

    // Bind all stat cubes
    statConfigs.forEach(({ stat, label, getValue, setValue }) => {
      const cube = this.querySelector(
        `[data-stat="${stat}"]`
      ) as StatCubeElement;
      if (cube) {
        cube.label = label;
        cube.value = getValue();
        cube.addEventListener('change', () => {
          setValue(cube.value);
          updateShipType(this.fleetId, this.shipType.id, this.shipType);
        });
      }
    });
  }
}

customElements.define('calc-ship-type', ShipTypeElement);
