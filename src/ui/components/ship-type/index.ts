import html from './ship-type.html' with { type: 'text' };
import './ship-type.css';
import '../selector';
import '../stat-cube';

import ancientTileImage from '../../../assets/ship-tiles/ai-anc.png';
import advancedAncientTileImage from '../../../assets/ship-tiles/ai-ancadv.png';
import worldsAfarAncientTileImage from '../../../assets/ship-tiles/ai-ancwa.png';
import guardianTileImage from '../../../assets/ship-tiles/ai-grd.png';
import advancedGuardianTileImage from '../../../assets/ship-tiles/ai-grdadv.png';
import worldsAfarGuardianTileImage from '../../../assets/ship-tiles/ai-grdwa.png';
import gcdsTileImage from '../../../assets/ship-tiles/ai-gcds.png';
import advancedGcdsTileImage from '../../../assets/ship-tiles/ai-gcdsadv.png';
import worldsAfarGcdsTileImage from '../../../assets/ship-tiles/ai-gcdswa.png';

import type { SelectorElement } from '../selector';
import type { StatCubeElement } from '../stat-cube';
import type { ShipTypeConfig } from '@ui/state';
import type { FactionId } from '@ui/fleet-metadata';
import { ensureShipBlueprint, removeShipType, updateShipType } from '@ui/state';
import { isPlayerShipType, type ShipConfig, type WeaponType } from '@calc/ship';
import { cloneShipConfig } from '@ui/ship-config';
import { isBlueprintShipType } from '@ui/ship-parts';
import {
  getStartingShipConfig,
  matchShipPreset,
  SHIP_NAMES,
  SHIP_QUANTITY_LIMITS,
  type ShipDropdownOption,
} from '@ui/ship-presets';

const SHIP_TILE_IMAGES: Partial<Record<ShipDropdownOption, string>> = {
  ancient: ancientTileImage,
  'ancient-adv': advancedAncientTileImage,
  'ancient-wa': worldsAfarAncientTileImage,
  guardian: guardianTileImage,
  'guardian-adv': advancedGuardianTileImage,
  'guardian-wa': worldsAfarGuardianTileImage,
  gcds: gcdsTileImage,
  'gcds-adv': advancedGcdsTileImage,
  'gcds-wa': worldsAfarGcdsTileImage,
};

export class ShipTypeElement extends HTMLElement {
  shipType!: ShipTypeConfig;
  fleetId!: string;
  factionId?: FactionId;
  readOnly = false;
  summaryOnly = false;
  tileMode = false;
  offerBlueprintReplacement = false;

  connectedCallback() {
    this.innerHTML = html;
    this.classList.toggle('summary-only', this.summaryOnly);

    const removeBtn = this.querySelector('.remove-btn') as HTMLButtonElement;
    removeBtn.addEventListener('click', () => {
      removeShipType(this.fleetId, this.shipType.id);
      this.dispatchEvent(new Event('ship-removed', { bubbles: true }));
      this.remove();
    });

    const nameSpan = this.querySelector('.ship-type-name') as HTMLSpanElement;
    const preset = matchShipPreset(this.shipType.type, this.shipType.config);
    const shipName = SHIP_NAMES[preset];
    nameSpan.textContent = shipName;
    removeBtn.setAttribute('aria-label', `Remove ${shipName}`);

    this.renderShipTile(preset, shipName);
    this.bindSelectors(shipName);
    this.bindBlueprintReplacement();
    this.renderRepresentationNotices();
  }

  private bindBlueprintReplacement() {
    if (!this.offerBlueprintReplacement) return;
    this.querySelector('.start-blueprint-btn')?.addEventListener(
      'click',
      () => {
        if (!ensureShipBlueprint(this.fleetId, this.shipType.id, true)) return;
        this.dispatchEvent(
          new CustomEvent('ship-blueprint-created', { bubbles: true })
        );
      }
    );
  }

  private renderRepresentationNotices() {
    const backed = this.querySelector(
      '.blueprint-backed-notice'
    ) as HTMLElement;
    backed.hidden = !this.shipType.blueprint;

    const offer = this.querySelector('.stats-blueprint-offer') as HTMLElement;
    offer.hidden = !(
      this.offerBlueprintReplacement &&
      !this.shipType.blueprint &&
      isBlueprintShipType(this.shipType.type)
    );
  }

  private renderShipTile(preset: ShipDropdownOption, shipName: string) {
    const imageUrl = this.tileMode ? SHIP_TILE_IMAGES[preset] : undefined;
    const tile = this.querySelector('.ship-tile') as HTMLElement;
    const stats = this.querySelector('.stats') as HTMLElement;
    tile.hidden = !imageUrl;
    stats.hidden = Boolean(imageUrl);
    if (!imageUrl) return;

    const image = tile.querySelector('img') as HTMLImageElement;
    image.src = imageUrl;
    image.alt = `${shipName} ship tile`;
  }

  private bindSelectors(shipName: string) {
    const statsEditable =
      isPlayerShipType(this.shipType.type) && !this.readOnly;
    const defaultConfig = getStartingShipConfig(
      matchShipPreset(this.shipType.type, this.shipType.config),
      this.factionId
    ).config;
    const qtyInput = this.querySelector('calc-selector') as SelectorElement;
    if (qtyInput) {
      qtyInput.label = `${shipName} quantity`;
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
      accessibleLabel?: string;
      sign?: string;
      getValue: (config: Partial<ShipConfig>) => number;
      setValue: (config: Partial<ShipConfig>, value: number) => void;
    }> = [
      {
        stat: 'initiative',
        label: 'Init',
        accessibleLabel: 'initiative',
        getValue: (config) => config.initiative || 0,
        setValue: (config, value) => {
          config.initiative = value;
        },
      },
      {
        stat: 'hull',
        label: 'Hull',
        getValue: (config) => config.hull || 0,
        setValue: (config, value) => {
          config.hull = value;
        },
      },
      {
        stat: 'computer',
        label: 'Comp',
        accessibleLabel: 'computer',
        sign: '+',
        getValue: (config) => config.computers || 0,
        setValue: (config, value) => {
          config.computers = value;
        },
      },
      {
        stat: 'shield',
        label: 'Shield',
        sign: '−',
        getValue: (config) => config.shields || 0,
        setValue: (config, value) => {
          config.shields = value;
        },
      },
      {
        stat: 'heal',
        label: 'Heal',
        getValue: (config) => config.heal || 0,
        setValue: (config, value) => {
          config.heal = value;
        },
      },
      {
        stat: 'rift-cannon',
        label: 'Rift',
        accessibleLabel: 'rift cannon',
        getValue: (config) => config.rift || 0,
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
        accessibleLabel: `${type} cannon`,
        getValue: (config) => config.cannons?.[type] || 0,
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
        accessibleLabel: `${type === 'ion' ? 'flux' : type} missile`,
        getValue: (config) => config.missiles?.[type] || 0,
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
    statConfigs.forEach(
      ({ stat, label, accessibleLabel, sign, getValue, setValue }) => {
        const cube = this.querySelector(
          `[data-stat="${stat}"]`
        ) as StatCubeElement;
        if (cube) {
          cube.label = label;
          cube.accessibleLabel = `${shipName} ${accessibleLabel ?? label.toLowerCase()}`;
          if (sign) cube.sign = sign;
          if (stat === 'plasma-missile') cube.step = 2;
          if (stat === 'soliton-missile' || stat === 'antimatter-missile') {
            cube.max = 1;
          }
          cube.defaultValue = getValue(defaultConfig);
          const initialValue = getValue(this.shipType.config);
          cube.value = initialValue;
          if (cube.value !== initialValue) {
            const config = cloneShipConfig(this.shipType.config);
            setValue(config, cube.value);
            updateShipType(this.fleetId, this.shipType.id, { config });
            this.renderRepresentationNotices();
          }
          cube.disabled = !statsEditable;
          cube.addEventListener('change', () => {
            if (cube.disabled) return;
            const config = cloneShipConfig(this.shipType.config);
            setValue(config, cube.value);
            updateShipType(this.fleetId, this.shipType.id, { config });
            this.renderRepresentationNotices();
          });
        }
      }
    );

    this.querySelector('.stat-group-core')?.setAttribute(
      'aria-label',
      `${shipName} systems`
    );
    this.querySelector('.stat-group-weapons')?.setAttribute(
      'aria-label',
      `${shipName} cannons`
    );
    this.querySelector('.stat-group-missiles')?.setAttribute(
      'aria-label',
      `${shipName} missiles`
    );
  }
}

customElements.define('calc-ship-type', ShipTypeElement);
