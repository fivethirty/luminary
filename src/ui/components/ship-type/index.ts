import html from './ship-type.html' with { type: 'text' };
import './ship-type.css';
import '../selector';
import '../stat-cube';
import type { SelectorElement } from '../selector';
import type { StatCubeElement } from '../stat-cube';
import type { ShipTypeConfig } from '@ui/state';
import { removeShipType, updateShipType } from '@ui/state';
import { isPlayerShipType, type ShipConfig, type WeaponType } from '@calc/ship';
import { cloneShipConfig } from '@ui/ship-config';
import {
  matchShipPreset,
  SHIP_NAMES,
  SHIP_QUANTITY_LIMITS,
} from '@ui/ship-presets';

export class ShipTypeElement extends HTMLElement {
  shipType!: ShipTypeConfig;
  fleetId!: string;

  connectedCallback() {
    this.innerHTML = html;

    const removeBtn = this.querySelector('.remove-btn') as HTMLButtonElement;
    removeBtn.addEventListener('click', () => {
      removeShipType(this.fleetId, this.shipType.id);
      this.dispatchEvent(new Event('ship-removed', { bubbles: true }));
      this.remove();
    });

    const nameSpan = this.querySelector('.ship-type-name') as HTMLSpanElement;
    nameSpan.textContent =
      SHIP_NAMES[matchShipPreset(this.shipType.type, this.shipType.config)];

    this.bindSelectors();
  }

  private bindSelectors() {
    const statsEditable = isPlayerShipType(this.shipType.type);
    const qtyInput = this.querySelector('calc-selector') as SelectorElement;
    if (qtyInput) {
      qtyInput.min = 1;
      qtyInput.max = SHIP_QUANTITY_LIMITS[this.shipType.type];
      qtyInput.value = this.shipType.quantity;
      qtyInput.addEventListener('change', () => {
        updateShipType(this.fleetId, this.shipType.id, {
          quantity: qtyInput.value,
        });
      });
    }

    const statConfigs: Array<{
      stat: string;
      label: string;
      sign?: string;
      getValue: () => number;
      setValue: (config: Partial<ShipConfig>, value: number) => void;
    }> = [
      {
        stat: 'initiative',
        label: 'Init',
        getValue: () => this.shipType.config.initiative || 0,
        setValue: (config, value) => {
          config.initiative = value;
        },
      },
      {
        stat: 'hull',
        label: 'Hull',
        getValue: () => this.shipType.config.hull || 0,
        setValue: (config, value) => {
          config.hull = value;
        },
      },
      {
        stat: 'computer',
        label: 'Comp',
        sign: '+',
        getValue: () => this.shipType.config.computers || 0,
        setValue: (config, value) => {
          config.computers = value;
        },
      },
      {
        stat: 'shield',
        label: 'Shield',
        sign: '−',
        getValue: () => this.shipType.config.shields || 0,
        setValue: (config, value) => {
          config.shields = value;
        },
      },
      {
        stat: 'heal',
        label: 'Heal',
        getValue: () => this.shipType.config.heal || 0,
        setValue: (config, value) => {
          config.heal = value;
        },
      },
      {
        stat: 'rift-cannon',
        label: 'Rift',
        getValue: () => this.shipType.config.rift || 0,
        setValue: (config, value) => {
          config.rift = value;
        },
      },
    ];

    const cannonTypes: Array<{ type: WeaponType; label: string }> = [
      { type: 'ion', label: 'Ion' },
      { type: 'plasma', label: 'Pls' },
      { type: 'soliton', label: 'Sol' },
      { type: 'antimatter', label: 'Ant' },
    ];

    const missileTypes: Array<{ type: WeaponType; label: string }> = [
      { type: 'ion', label: 'Flux' },
      { type: 'plasma', label: 'Pls' },
      { type: 'soliton', label: 'Sol' },
      { type: 'antimatter', label: 'Ant' },
    ];

    cannonTypes.forEach(({ type, label }) => {
      statConfigs.push({
        stat: `${type}-cannon`,
        label: label,
        getValue: () => this.shipType.config.cannons?.[type] || 0,
        setValue: (config, value) => {
          const cannons = (config.cannons ??= {
            ion: 0,
            plasma: 0,
            soliton: 0,
            antimatter: 0,
          });
          cannons[type] = value;
        },
      });
    });

    // Add missiles
    missileTypes.forEach(({ type, label }) => {
      statConfigs.push({
        stat: `${type}-missile`,
        label: label,
        getValue: () => this.shipType.config.missiles?.[type] || 0,
        setValue: (config, value) => {
          const missiles = (config.missiles ??= {
            ion: 0,
            plasma: 0,
            soliton: 0,
            antimatter: 0,
          });
          missiles[type] = value;
        },
      });
    });

    // Bind all stat cubes
    statConfigs.forEach(({ stat, label, sign, getValue, setValue }) => {
      const cube = this.querySelector(
        `[data-stat="${stat}"]`
      ) as StatCubeElement;
      if (cube) {
        cube.label = label;
        if (sign) cube.sign = sign;
        if (stat === 'plasma-missile') cube.step = 2;
        if (stat === 'soliton-missile' || stat === 'antimatter-missile') {
          cube.max = 1;
        }
        const initialValue = getValue();
        cube.value = initialValue;
        if (cube.value !== initialValue) {
          const config = cloneShipConfig(this.shipType.config);
          setValue(config, cube.value);
          updateShipType(this.fleetId, this.shipType.id, { config });
        }
        cube.disabled = !statsEditable;
        cube.addEventListener('change', () => {
          if (cube.disabled) return;
          const config = cloneShipConfig(this.shipType.config);
          setValue(config, cube.value);
          updateShipType(this.fleetId, this.shipType.id, { config });
        });
      }
    });
  }
}

customElements.define('calc-ship-type', ShipTypeElement);
