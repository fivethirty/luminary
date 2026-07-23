import html from './fleet.html' with { type: 'text' };
import './fleet.css';
import '../ship-type';
import '../ship-blueprint';
import type { ShipTypeElement } from '../ship-type';
import type { ShipBlueprintElement } from '../ship-blueprint';
import { isPlayerShipType } from '@calc/ship';
import type { FleetState } from '@ui/state';
import type { ControlMode } from '@ui/preferences';
import {
  addOrSwapShipPreset,
  ensureShipBlueprint,
  isNpcFleet,
  moveFleet,
  removeFleet,
  setFleetColor,
  unsetFleetColor,
  setFleetFaction,
  toggleAntimatterSplitter,
  setFleetPlannerType,
} from '@ui/state';
import {
  FACTIONS,
  baseFleetName,
  factionLabel,
  factionShortLabel,
  fleetColor,
  type FactionId,
  PLAYER_FLEET_COLORS,
} from '@ui/fleet-metadata';
import { isShipTypeAllowedForFleet } from '@ui/fleet-rules';
import {
  getDefaultShipConfig,
  presetKeysForType,
  type ShipDropdownOption,
} from '@ui/ship-presets';

export class FleetElement extends HTMLElement {
  fleet!: FleetState;
  controlMode: ControlMode = 'steppers';
  private fleetIndex = 0;
  private shipSelectorOptions: Array<{
    value: ShipDropdownOption;
    label: string;
  }> = [];

  connectedCallback() {
    this.innerHTML = html;

    this.fleetIndex = Number(this.getAttribute('fleet-index') ?? '0');
    const fleetCount = Number(this.getAttribute('fleet-count') ?? '1');
    this.updateDisplayedName();
    this.applyFleetColor();
    this.querySelector('.fleet')?.classList.toggle(
      'fleet-defender',
      this.getAttribute('is-defender') !== 'false'
    );
    this.querySelector('.fleet')?.classList.toggle(
      'fleet-attacker',
      this.getAttribute('is-defender') === 'false'
    );
    if (this.fleetIndex > 1) {
      this.querySelector('.fleet')?.classList.add(
        `fleet-attacker-${Math.min(this.fleetIndex, 4)}`
      );
    }

    this.bindSettingsDialog();
    this.bindRoleControls(this.fleetIndex, fleetCount);

    const removeBtn = this.querySelector('.remove-btn') as HTMLButtonElement;
    const canRemove = this.getAttribute('can-remove') !== 'false';
    removeBtn.setAttribute('aria-label', `Remove ${this.displayName()} fleet`);
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
      this.updateDisplayedName();
      this.applyFleetColor();
      this.updateColorControls();
      this.updateShipSelector();
      this.updatePlannerControl();
    });
    this.addEventListener('ship-blueprint-created', () => {
      this.renderShips();
    });

    const shipSelector = this.querySelector(
      '.ship-selector'
    ) as HTMLSelectElement;
    this.shipSelectorOptions = Array.from(shipSelector.options).map(
      (option) => ({
        value: option.value as ShipDropdownOption,
        label: option.textContent ?? option.value,
      })
    );
    shipSelector.selectedIndex = -1;
    shipSelector.addEventListener('change', () => {
      const value = shipSelector.value;
      if (value) {
        this.addShip(value as ShipDropdownOption);
        shipSelector.selectedIndex = -1;
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
      if (plannerTypeSelect.disabled) return;
      const value = plannerTypeSelect.value;
      if (value !== 'npc' && value !== 'dps' && value !== 'optimal') return;
      setFleetPlannerType(this.fleet.id, value);
    });

    this.updateShipSelector();
    this.updatePlannerControl();
    this.renderShips();
  }

  refreshMetadata() {
    this.updateDisplayedName();
    this.updateSettingsDialogLabels();
    this.applyFleetColor();
    this.updateColorControls();

    const factionSelect = this.querySelector(
      '.faction-select'
    ) as HTMLSelectElement | null;
    if (factionSelect) {
      factionSelect.value = this.fleet.factionId ?? '';
    }

    this.renderShips();
    this.updateShipSelector();
    this.updatePlannerControl();
  }

  private applyFleetColor() {
    const fleetRoot = this.querySelector('.fleet') as HTMLElement | null;
    if (!fleetRoot) return;
    const color = fleetColor(this.fleet.colorId, this.fleetIndex);
    fleetRoot.style.setProperty('--fleet-accent-source', color.color);
    fleetRoot.style.setProperty('--fleet-accent-soft-source', color.soft);
    fleetRoot.classList.toggle(
      'fleet-neutral',
      this.fleet.colorId === 'neutral'
    );
  }

  private updateDisplayedName() {
    const nameSpan = this.querySelector('.fleet-name') as HTMLSpanElement;
    const displayName = this.displayName();
    nameSpan.textContent = displayName;

    const fullFactionName = factionLabel(this.fleet.factionId);
    const shortFactionName =
      displayName === fullFactionName
        ? factionShortLabel(this.fleet.factionId)
        : null;
    if (shortFactionName) {
      nameSpan.dataset.shortLabel = shortFactionName;
    } else {
      delete nameSpan.dataset.shortLabel;
    }

    const settingsBtn = this.querySelector(
      '.fleet-settings-btn'
    ) as HTMLButtonElement | null;
    const isDefender = this.getAttribute('is-defender') !== 'false';
    settingsBtn?.toggleAttribute(
      'hidden',
      isDefender && isNpcFleet(this.fleet)
    );
  }

  private displayName(): string {
    const fleetCount = Number(this.getAttribute('fleet-count') ?? '2');
    return baseFleetName(this.fleet, this.fleetIndex, fleetCount);
  }

  private bindSettingsDialog() {
    const dialog = this.querySelector(
      '.fleet-settings-dialog'
    ) as HTMLDialogElement;
    this.updateSettingsDialogLabels();

    const settingsBtn = this.querySelector(
      '.fleet-settings-btn'
    ) as HTMLButtonElement;
    settingsBtn.addEventListener('click', () => {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    });

    const factionSelect = this.querySelector(
      '.faction-select'
    ) as HTMLSelectElement;
    factionSelect.innerHTML = '';
    FACTIONS.forEach((faction) => {
      const option = document.createElement('option');
      option.value = faction.id;
      option.textContent = faction.label;
      factionSelect.appendChild(option);
    });
    factionSelect.value = this.fleet.factionId ?? '';
    factionSelect.addEventListener('change', () => {
      setFleetFaction(this.fleet.id, factionSelect.value as FactionId);
      this.updateDisplayedName();
      this.dispatchFleetMetadataChanged();
    });

    PLAYER_FLEET_COLORS.forEach((color) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'color-option';
      button.value = color.id;
      button.title = color.label;
      button.setAttribute('aria-label', color.label);
      button.style.setProperty('--option-color', color.color);
      button.addEventListener('click', () => {
        setFleetColor(this.fleet.id, color.id);
        this.applyFleetColor();
        this.updateColorControls();
        this.dispatchFleetMetadataChanged();
      });
      this.querySelector('.color-options')?.appendChild(button);
    });

    const unsetColorBtn = this.querySelector(
      '.color-unset-btn'
    ) as HTMLButtonElement;
    unsetColorBtn.addEventListener('click', () => {
      unsetFleetColor(this.fleet.id);
      this.applyFleetColor();
      this.updateColorControls();
      this.dispatchFleetMetadataChanged();
    });
    this.updateColorControls();
  }

  private updateSettingsDialogLabels() {
    const title = this.querySelector(
      '.fleet-settings-title'
    ) as HTMLElement | null;
    if (title) title.textContent = this.displayName();

    const settingsBtn = this.querySelector(
      '.fleet-settings-btn'
    ) as HTMLButtonElement | null;
    settingsBtn?.setAttribute(
      'aria-label',
      `Edit ${this.displayName()} faction and color`
    );
  }

  private updateColorControls() {
    this.querySelectorAll('.color-option').forEach((option) => {
      const button = option as HTMLButtonElement;
      const isSelected =
        this.fleet.colorIsManual === true &&
        button.value === this.fleet.colorId;
      button.classList.toggle('selected', isSelected);
      button.setAttribute('aria-pressed', isSelected.toString());
    });

    const unsetColorBtn = this.querySelector(
      '.color-unset-btn'
    ) as HTMLButtonElement | null;
    if (unsetColorBtn) {
      const isSelected = this.fleet.colorIsManual !== true;
      unsetColorBtn.classList.toggle('selected', isSelected);
      unsetColorBtn.setAttribute('aria-pressed', isSelected.toString());
      unsetColorBtn.disabled = isSelected;
    }
  }

  private bindRoleControls(fleetIndex: number, fleetCount: number) {
    const moveUpBtn = this.querySelector('.move-up-btn') as HTMLButtonElement;
    const moveDownBtn = this.querySelector(
      '.move-down-btn'
    ) as HTMLButtonElement;

    const fleetName = this.displayName();
    moveUpBtn.setAttribute('aria-label', `Move ${fleetName} up`);
    moveDownBtn.setAttribute('aria-label', `Move ${fleetName} down`);

    moveUpBtn.disabled = fleetIndex === 0;
    moveDownBtn.disabled = fleetIndex >= fleetCount - 1;

    moveUpBtn.addEventListener('click', () => {
      moveFleet(this.fleet.id, fleetIndex - 1);
      this.dispatchFleetOrderChanged();
    });
    moveDownBtn.addEventListener('click', () => {
      moveFleet(this.fleet.id, fleetIndex + 1);
      this.dispatchFleetOrderChanged();
    });
  }

  private dispatchFleetOrderChanged() {
    this.dispatchEvent(
      new CustomEvent('fleet-order-changed', {
        bubbles: true,
      })
    );
  }

  private dispatchFleetMetadataChanged() {
    this.dispatchEvent(
      new CustomEvent('fleet-metadata-changed', {
        bubbles: true,
      })
    );
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
      const select = picker as HTMLSelectElement;
      select.selectedIndex = -1;
      picker.addEventListener('change', () => {
        const preset = select.value as ShipDropdownOption;
        if (!preset) return;
        const ship = addOrSwapShipPreset(this.fleet.id, preset, {
          incrementMatching: true,
        });
        if (ship) this.refreshAfterShipSelection();
        select.selectedIndex = -1;
      });
    });
  }

  private renderShips() {
    const shipsContainer = this.querySelector('.fleet-ships') as HTMLDivElement;
    shipsContainer.innerHTML = '';

    this.fleet.shipTypes.forEach((shipType) => {
      const useBlueprintCard =
        this.controlMode === 'ships' && isPlayerShipType(shipType.type);
      const showBlueprint =
        useBlueprintCard &&
        (Boolean(shipType.blueprint) ||
          ensureShipBlueprint(this.fleet.id, shipType.id));
      if (showBlueprint) {
        const blueprintElement = document.createElement(
          'calc-ship-blueprint'
        ) as ShipBlueprintElement;
        blueprintElement.classList.add('ship-blueprint-card');
        blueprintElement.shipType = shipType;
        blueprintElement.fleetId = this.fleet.id;
        blueprintElement.factionId = this.fleet.factionId;
        shipsContainer.appendChild(blueprintElement);
        return;
      }
      const shipElement = document.createElement(
        'calc-ship-type'
      ) as ShipTypeElement;
      shipElement.shipType = shipType;
      shipElement.fleetId = this.fleet.id;
      shipElement.factionId = this.fleet.factionId;
      shipElement.tileMode = this.controlMode === 'ships';
      shipElement.classList.toggle('ship-blueprint-card', useBlueprintCard);
      shipElement.offerBlueprintReplacement = useBlueprintCard;
      shipsContainer.appendChild(shipElement);
    });
  }

  private updateShipSelector() {
    const shipSelector = this.querySelector(
      '.ship-selector'
    ) as HTMLSelectElement;
    const existingTypes = this.fleet.shipTypes.map((st) => st.type);
    // Starbases and orbitals may only be fielded by the defender. NPC ships
    // use the defender-only pill pickers and are intentionally absent here.
    // A missing attribute defaults to defender (permissive).
    const isAttacker = this.getAttribute('is-defender') === 'false';

    shipSelector.innerHTML = '';
    this.shipSelectorOptions.forEach(({ value, label }) => {
      const variantData = getDefaultShipConfig(value as ShipDropdownOption);
      const unavailable = !isShipTypeAllowedForFleet(
        variantData.type,
        !isAttacker,
        this.fleet.factionId
      );
      // iOS can expose hidden native options. Components are freshly rendered
      // after a role change, so omit illegal choices from this picker.
      if (unavailable) return;

      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      // Types with variants (Ancient/Guardian/GCDS) stay selectable while
      // fielded — picking a variant swaps the ship's stats. Single-variant
      // types would be duplicates, so those disable.
      const hasVariants = presetKeysForType(variantData.type).length > 1;
      option.disabled =
        existingTypes.includes(variantData.type) && !hasVariants;
      shipSelector.appendChild(option);
    });
    shipSelector.selectedIndex = -1;
  }

  private addShip(dropdownOption: ShipDropdownOption) {
    const ship = addOrSwapShipPreset(this.fleet.id, dropdownOption, {
      withBlueprint: this.controlMode === 'ships',
    });
    if (!ship) return;
    this.refreshAfterShipSelection();
  }

  private refreshAfterShipSelection() {
    this.updateDisplayedName();
    this.applyFleetColor();
    this.updateColorControls();
    this.renderShips();
    this.updateShipSelector();
    this.updatePlannerControl();
  }

  // An all-AI fleet always fights with the NPC planner (see Fleet.getDamageType),
  // so lock the control to a disabled "NPC" for those fleets. Player fleets may
  // choose NPC, DPS, or optimal assignment.
  private updatePlannerControl() {
    const select = this.querySelector(
      '.planner-type-select'
    ) as HTMLSelectElement | null;
    if (!select) return;
    const types = this.fleet.shipTypes;
    const allAi =
      types.length > 0 && types.every((st) => !isPlayerShipType(st.type));

    // Rebuild with only applicable choices. Hidden options still appear in
    // some iOS pickers, even when the select itself is disabled.
    select.innerHTML = '';
    if (allAi) {
      const npcOption = document.createElement('option');
      npcOption.value = 'npc';
      npcOption.textContent = 'NPC';
      select.appendChild(npcOption);
      select.value = 'npc';
      select.disabled = true;
    } else {
      const npcOption = document.createElement('option');
      npcOption.value = 'npc';
      npcOption.textContent = 'NPC';
      const dpsOption = document.createElement('option');
      dpsOption.value = 'dps';
      dpsOption.textContent = 'Max DPS removal';
      const optimalOption = document.createElement('option');
      optimalOption.value = 'optimal';
      optimalOption.textContent = 'Optimal';
      select.append(npcOption, dpsOption, optimalOption);
      select.disabled = false;
      select.value = this.fleet.plannerType;
    }
  }
}

customElements.define('calc-fleet', FleetElement);
