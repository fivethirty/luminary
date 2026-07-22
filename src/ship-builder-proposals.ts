import {
  calculateBlueprintStats,
  canPlacePart,
  createBuilderState,
  FACTIONS,
  findDiscoveryUse,
  fixedBonuses,
  isShipAvailable,
  PART_BY_ID,
  PART_CATEGORIES,
  placePart,
  SHIP_DEFINITIONS,
  SHIP_KINDS,
  SHIP_PARTS,
  type BuilderState,
  type DieColor,
  type FactionId,
  type PartCategory,
  type PartTier,
  type PlacementTarget,
  type ShipKind,
  type ShipPart,
} from '@ui/ship-builder-proposals/model';

type ProposalKey = 'slot' | 'palette' | 'workbench';
type TierFilter = 'all' | PartTier;
type CategoryFilter = 'all' | PartCategory;

const CATEGORY_META: Record<
  PartCategory,
  { label: string; shortLabel: string; glyph: string }
> = {
  cannon: { label: 'Cannons', shortLabel: 'Cannon', glyph: '✦' },
  missile: { label: 'Missiles', shortLabel: 'Missile', glyph: '⇢' },
  computer: { label: 'Computers', shortLabel: 'Computer', glyph: '+' },
  shield: { label: 'Shields', shortLabel: 'Shield', glyph: '◇' },
  hull: { label: 'Hull', shortLabel: 'Hull', glyph: '⬡' },
  drive: { label: 'Drives', shortLabel: 'Drive', glyph: '»' },
  source: { label: 'Sources', shortLabel: 'Source', glyph: 'ϟ' },
};

const TIER_LABELS: Record<PartTier, string> = {
  standard: 'Standard',
  technology: 'Technology',
  discovery: 'Discovery',
};

const DIE_LABELS: Record<DieColor, string> = {
  yellow: 'Ion',
  orange: 'Plasma',
  blue: 'Soliton',
  red: 'Antimatter',
  pink: 'Rift',
};

const proposalStates: Record<ProposalKey, BuilderState> = {
  slot: createBuilderState(),
  palette: createBuilderState(),
  workbench: createBuilderState(),
};

const history: Partial<Record<ProposalKey, BuilderState>> = {};

const slotUi: {
  ship: ShipKind;
  target: PlacementTarget;
  pickerOpen: boolean;
  tier: TierFilter;
  category: CategoryFilter;
  search: string;
} = {
  ship: 'cruiser',
  target: 5,
  pickerOpen: true,
  tier: 'technology',
  category: 'all',
  search: '',
};

const paletteUi: {
  ship: ShipKind;
  selectedPart: string | null;
  tier: TierFilter;
  category: CategoryFilter;
  search: string;
} = {
  ship: 'dreadnought',
  selectedPart: 'plc',
  tier: 'all',
  category: 'cannon',
  search: '',
};

const workbenchUi: {
  selectedShip: ShipKind;
  selectedTarget: PlacementTarget;
  category: PartCategory;
  contextCategory: PartCategory | null;
  contextShip: ShipKind;
  contextTarget: PlacementTarget;
  contextX: number;
  contextY: number;
} = {
  selectedShip: 'cruiser',
  selectedTarget: 5,
  category: 'cannon',
  contextCategory: null,
  contextShip: 'cruiser',
  contextTarget: 5,
  contextX: 0,
  contextY: 0,
};

const slotContainer = requiredElement<HTMLElement>('#slot-first-prototype');
const paletteContainer = requiredElement<HTMLElement>('#part-first-prototype');
const workbenchContainer = requiredElement<HTMLElement>('#workbench-prototype');
const techDialog = requiredElement<HTMLDialogElement>('#tech-dialog');
const toast = requiredElement<HTMLElement>('#builder-toast');
const contextMenu = requiredElement<HTMLElement>('#slot-context-menu');

let techDialogScope: ProposalKey = 'slot';
let toastTimer: number | undefined;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing proposal element: ${selector}`);
  return element;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function cloneState(state: BuilderState): BuilderState {
  return {
    factionId: state.factionId,
    unlockedTech: new Set(state.unlockedTech),
    blueprints: Object.fromEntries(
      SHIP_KINDS.map((ship) => [
        ship,
        {
          slots: [...state.blueprints[ship].slots],
          externalPart: state.blueprints[ship].externalPart,
        },
      ])
    ) as BuilderState['blueprints'],
  };
}

function remember(scope: ProposalKey): void {
  history[scope] = cloneState(proposalStates[scope]);
}

function renderScope(scope: ProposalKey): void {
  if (scope === 'slot') renderSlotFirst();
  else if (scope === 'palette') renderPartFirst();
  else renderWorkbench();
}

function showToast(
  message: string,
  scope?: ProposalKey,
  allowUndo = false
): void {
  window.clearTimeout(toastTimer);
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    ${
      scope && allowUndo
        ? `<button type="button" data-toast-undo="${scope}">Undo</button>`
        : ''
    }
  `;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 4200);
}

function setFaction(
  scope: ProposalKey,
  factionId: FactionId,
  currentShip: ShipKind
): ShipKind {
  remember(scope);
  proposalStates[scope].factionId = factionId;
  if (isShipAvailable(factionId, currentShip)) return currentShip;
  const replacement = SHIP_KINDS.find((ship) =>
    isShipAvailable(factionId, ship)
  );
  showToast(
    `${SHIP_DEFINITIONS[currentShip].name} is unavailable to this faction.`,
    scope,
    true
  );
  return replacement ?? 'interceptor';
}

function factionOptions(selected: FactionId): string {
  return FACTIONS.map(
    (faction) => `
      <option value="${faction.id}" ${
        faction.id === selected ? 'selected' : ''
      }>${escapeHtml(faction.name)}</option>
    `
  ).join('');
}

function shipSwitch(
  state: BuilderState,
  selectedShip: ShipKind,
  scope: ProposalKey
): string {
  return `
    <div class="ship-switch" role="group" aria-label="Ship blueprint">
      ${SHIP_KINDS.map((ship) => {
        const definition = SHIP_DEFINITIONS[ship];
        const available = isShipAvailable(state.factionId, ship);
        return `
          <button
            type="button"
            data-action="choose-ship"
            data-scope="${scope}"
            data-ship="${ship}"
            aria-pressed="${ship === selectedShip}"
            ${available ? '' : 'disabled'}
            title="${
              available
                ? `${definition.name} · ${definition.slots} slots`
                : `${definition.name} is unavailable to this faction`
            }"
          >
            <span>${definition.shortName}</span>
            <small>${definition.slots}</small>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function builderToolbar(
  state: BuilderState,
  selectedShip: ShipKind,
  scope: ProposalKey
): string {
  const unlocked = SHIP_PARTS.filter(
    (part) => part.tier === 'technology' && state.unlockedTech.has(part.id)
  ).length;
  return `
    <div class="builder-toolbar">
      <label class="faction-field">
        <span>Faction board</span>
        <select data-action="set-faction" data-scope="${scope}">
          ${factionOptions(state.factionId)}
        </select>
      </label>
      ${shipSwitch(state, selectedShip, scope)}
      <button
        class="tech-access-button"
        type="button"
        data-action="open-tech"
        data-scope="${scope}"
      >
        <span class="tech-access-icon" aria-hidden="true">⌬</span>
        <span><small>Available tech</small><strong>${unlocked} / 20</strong></span>
      </button>
    </div>
  `;
}

function partEffects(part: ShipPart, compact = false): string {
  const effects: string[] = [];
  if (part.energySource) {
    effects.push(
      `<span class="effect energy-source">+${part.energySource}ϟ</span>`
    );
  }
  if (part.energyUse) {
    effects.push(`<span class="effect energy-use">−${part.energyUse}ϟ</span>`);
  }
  if (part.movement) {
    effects.push(`<span class="effect">${part.movement} move</span>`);
  }
  if (part.initiative) {
    effects.push(
      `<span class="effect">${part.initiative > 0 ? '+' : ''}${
        part.initiative
      } init</span>`
    );
  }
  if (part.computer) {
    effects.push(`<span class="effect">+${part.computer} aim</span>`);
  }
  if (part.shield) {
    effects.push(`<span class="effect">−${part.shield} shield</span>`);
  }
  if (part.hull) effects.push(`<span class="effect">+${part.hull} hull</span>`);
  if (part.repair) {
    effects.push(`<span class="effect">+${part.repair} repair</span>`);
  }
  if (part.cannons?.length) {
    effects.push(diceEffect(part.cannons, 'cannon'));
  }
  if (part.missiles?.length) {
    effects.push(diceEffect(part.missiles, 'missile'));
  }
  const displayed = compact ? effects.slice(0, 3) : effects;
  return displayed.join('');
}

function diceEffect(dice: DieColor[], kind: 'cannon' | 'missile'): string {
  return `<span class="effect dice-effect" title="${dice
    .map((die) => DIE_LABELS[die])
    .join(', ')} ${kind}${dice.length === 1 ? '' : 's'}">
    ${dice
      .map(
        (die) =>
          `<i class="die-dot die-${die}" aria-label="${DIE_LABELS[die]}"></i>`
      )
      .join('')}${kind === 'missile' ? ' M' : ''}
  </span>`;
}

function installedPartContent(part: ShipPart): string {
  return `
    <span class="slot-category" aria-hidden="true">${
      CATEGORY_META[part.category].glyph
    }</span>
    <span class="slot-part-name">${escapeHtml(part.name)}</span>
    <span class="slot-effects">${partEffects(part, true)}</span>
  `;
}

interface SlotGridOptions {
  action: string;
  scope: ProposalKey;
  selectedTarget?: PlacementTarget;
  selectedPart?: ShipPart;
  clearAction?: string;
  shipOverride?: ShipKind;
  compact?: boolean;
}

function slotGrid(
  state: BuilderState,
  ship: ShipKind,
  options: SlotGridOptions
): string {
  const blueprint = state.blueprints[ship];
  const shipForData = options.shipOverride ?? ship;
  const slots = blueprint.slots
    .map((partId, index) => {
      const part = partId ? PART_BY_ID.get(partId) : undefined;
      const selected = options.selectedTarget === index;
      const selectedPart = options.selectedPart;
      const eligible = selectedPart ? !selectedPart.external : false;
      const mainButton = `
        <button
          class="slot-button ${part ? 'filled' : 'empty'} ${
            selected ? 'selected' : ''
          } ${eligible ? 'eligible' : ''} ${
            selectedPart?.external ? 'ineligible' : ''
          }"
          type="button"
          data-action="${options.action}"
          data-scope="${options.scope}"
          data-ship="${shipForData}"
          data-target="${index}"
          aria-label="${SHIP_DEFINITIONS[ship].name} slot ${index + 1}: ${
            part?.name ?? 'Empty'
          }"
        >
          <span class="slot-number">${String(index + 1).padStart(2, '0')}</span>
          ${
            part
              ? installedPartContent(part)
              : '<span class="empty-slot-mark">+</span><span class="empty-slot-label">Empty</span>'
          }
        </button>
      `;
      return options.clearAction && part
        ? `<div class="slot-wrap">${mainButton}<button class="slot-clear" type="button" data-action="${options.clearAction}" data-scope="${options.scope}" data-ship="${shipForData}" data-target="${index}" aria-label="Remove ${escapeHtml(
            part.name
          )}">×</button></div>`
        : mainButton;
    })
    .join('');

  return `
    <div class="slot-grid ship-${ship} ${options.compact ? 'compact' : ''}">
      ${slots}
    </div>
  `;
}

function builtInRail(state: BuilderState, ship: ShipKind): string {
  const bonuses = fixedBonuses(state.factionId, ship);
  return `
    <div class="built-in-rail">
      <span class="rail-label"><i aria-hidden="true">◆</i> Built in</span>
      <span class="fixed-bonus-list">
        ${
          bonuses.length
            ? bonuses
                .map(
                  (bonus) =>
                    `<span class="fixed-bonus fixed-${bonus.kind}">${escapeHtml(
                      bonus.label
                    )}</span>`
                )
                .join('')
            : '<span class="no-fixed-bonus">No faction modifiers</span>'
        }
      </span>
      <span class="rail-help">locked · no slot</span>
    </div>
  `;
}

interface ExternalSocketOptions {
  action: string;
  scope: ProposalKey;
  ship: ShipKind;
  selected?: boolean;
  eligible?: boolean;
  clearAction?: string;
  compact?: boolean;
}

function externalSocket(
  state: BuilderState,
  options: ExternalSocketOptions
): string {
  const partId = state.blueprints[options.ship].externalPart;
  const part = partId ? PART_BY_ID.get(partId) : undefined;
  return `
    <div class="external-rail ${options.compact ? 'compact' : ''}">
      <span class="rail-label"><i aria-hidden="true">○</i> External</span>
      <button
        class="external-socket ${part ? 'filled' : ''} ${
          options.selected ? 'selected' : ''
        } ${options.eligible ? 'eligible' : ''}"
        type="button"
        data-action="${options.action}"
        data-scope="${options.scope}"
        data-ship="${options.ship}"
        data-target="external"
      >
        ${
          part
            ? `<span>${escapeHtml(part.name)}</span><small>${partEffects(
                part,
                true
              )}</small>`
            : '<span class="external-plus">+</span><span>Muon Source</span><small>does not fill a square</small>'
        }
      </button>
      ${
        part && options.clearAction
          ? `<button class="external-clear" type="button" data-action="${options.clearAction}" data-scope="${options.scope}" data-ship="${options.ship}" data-target="external">Remove</button>`
          : ''
      }
    </div>
  `;
}

function totalDice(dice: Record<DieColor, number>): Array<[DieColor, number]> {
  return (Object.entries(dice) as Array<[DieColor, number]>).filter(
    ([, amount]) => amount > 0
  );
}

function diceSummary(dice: Record<DieColor, number>): string {
  const active = totalDice(dice);
  if (!active.length) return '<span class="muted-stat">—</span>';
  return active
    .map(
      ([color, amount]) =>
        `<span class="summary-die"><i class="die-dot die-${color}"></i>${amount}</span>`
    )
    .join('');
}

function statsStrip(
  state: BuilderState,
  ship: ShipKind,
  compact = false
): string {
  const stats = calculateBlueprintStats(state, ship);
  return `
    <div class="stats-strip ${compact ? 'compact' : ''}">
      <div class="stat-readout energy-readout ${
        stats.energyBalance < 0 ? 'invalid' : ''
      }">
        <span>Energy</span>
        <strong>${stats.energySource}<small>−${stats.energyUse}</small></strong>
        <em>${stats.energyBalance >= 0 ? '+' : ''}${stats.energyBalance}</em>
      </div>
      <div class="stat-readout"><span>Initiative</span><strong>${stats.initiative}</strong></div>
      <div class="stat-readout"><span>Move</span><strong>${stats.movement || '—'}</strong></div>
      <div class="stat-readout"><span>Computer</span><strong>${
        stats.computer ? `+${stats.computer}` : '0'
      }</strong></div>
      <div class="stat-readout"><span>Shield</span><strong>${
        stats.shield ? `−${stats.shield}` : '0'
      }</strong></div>
      <div class="stat-readout"><span>Hull</span><strong>+${stats.hull}</strong></div>
      <div class="stat-readout weapon-readout"><span>Cannons</span><strong>${diceSummary(
        stats.cannons
      )}</strong></div>
      <div class="stat-readout weapon-readout"><span>Missiles</span><strong>${diceSummary(
        stats.missiles
      )}</strong></div>
    </div>
  `;
}

function tierFilters(
  current: TierFilter,
  action: string,
  scope: ProposalKey
): string {
  const choices: Array<[TierFilter, string]> = [
    ['all', 'All 43'],
    ['standard', 'Standard · 5'],
    ['technology', 'Technology · 20'],
    ['discovery', 'Discovery · 18'],
  ];
  return `
    <div class="filter-pills tier-filters" role="group" aria-label="Part source">
      ${choices
        .map(
          ([value, label]) => `
            <button type="button" data-action="${action}" data-scope="${scope}" data-tier="${value}" aria-pressed="${
              value === current
            }">${label}</button>
          `
        )
        .join('')}
    </div>
  `;
}

function categoryFilters(
  current: CategoryFilter,
  action: string,
  scope: ProposalKey,
  includeAll = true
): string {
  const categories: CategoryFilter[] = includeAll
    ? ['all', ...PART_CATEGORIES]
    : [...PART_CATEGORIES];
  return `
    <div class="filter-pills category-filters" role="group" aria-label="Part type">
      ${categories
        .map((category) => {
          const meta =
            category === 'all'
              ? { label: 'All types', glyph: '◎' }
              : CATEGORY_META[category];
          return `
            <button type="button" data-action="${action}" data-scope="${scope}" data-category="${category}" aria-pressed="${
              category === current
            }"><i aria-hidden="true">${meta.glyph}</i>${meta.label}</button>
          `;
        })
        .join('')}
    </div>
  `;
}

function partMatchesFilters(
  part: ShipPart,
  tier: TierFilter,
  category: CategoryFilter,
  search: string
): boolean {
  if (tier !== 'all' && part.tier !== tier) return false;
  if (category !== 'all' && part.category !== category) return false;
  const needle = search.trim().toLowerCase();
  return (
    !needle ||
    part.name.toLowerCase().includes(needle) ||
    CATEGORY_META[part.category].label.toLowerCase().includes(needle)
  );
}

function partAvailability(
  state: BuilderState,
  ship: ShipKind,
  target: PlacementTarget,
  part: ShipPart
): {
  disabled: boolean;
  status: string;
  usedElsewhere: boolean;
  selectedHere: boolean;
} {
  const check = canPlacePart(state, ship, target, part.id);
  const use =
    part.tier === 'discovery' ? findDiscoveryUse(state, part.id) : null;
  const selectedHere = Boolean(
    use && use.ship === ship && use.target === target
  );
  const usedElsewhere = Boolean(use && !selectedHere);
  if (part.tier === 'technology' && !state.unlockedTech.has(part.id)) {
    return {
      disabled: true,
      status: 'Locked · research required',
      usedElsewhere: false,
      selectedHere: false,
    };
  }
  if (usedElsewhere && use) {
    const location = `${SHIP_DEFINITIONS[use.ship].name} · ${
      use.target === 'external' ? 'external' : `slot ${use.target + 1}`
    }`;
    return {
      disabled: false,
      status: `Move from ${location}`,
      usedElsewhere: true,
      selectedHere: false,
    };
  }
  return {
    disabled: !check.allowed && !selectedHere,
    status: selectedHere
      ? 'Installed here'
      : part.tier === 'discovery'
        ? '1 available'
        : part.tier === 'technology'
          ? 'Researched · unlimited'
          : 'Always available · unlimited',
    usedElsewhere: false,
    selectedHere,
  };
}

function pickerPartCard(
  state: BuilderState,
  ship: ShipKind,
  target: PlacementTarget,
  part: ShipPart,
  scope: ProposalKey,
  action: string,
  selected = false
): string {
  const availability = partAvailability(state, ship, target, part);
  return `
    <button
      class="picker-part-card tier-${part.tier} ${
        availability.usedElsewhere ? 'used-elsewhere' : ''
      } ${availability.selectedHere || selected ? 'selected' : ''}"
      type="button"
      data-action="${action}"
      data-scope="${scope}"
      data-part="${part.id}"
      ${availability.disabled ? 'disabled' : ''}
    >
      <span class="part-card-glyph" aria-hidden="true">${
        CATEGORY_META[part.category].glyph
      }</span>
      <span class="part-card-copy">
        <span class="part-card-heading">
          <strong>${escapeHtml(part.name)}</strong>
          <small>${TIER_LABELS[part.tier]}</small>
        </span>
        <span class="part-card-effects">${partEffects(part)}</span>
        <span class="part-card-status">${escapeHtml(availability.status)}</span>
      </span>
    </button>
  `;
}

function currentPartForTarget(
  state: BuilderState,
  ship: ShipKind,
  target: PlacementTarget
): ShipPart | undefined {
  const partId =
    target === 'external'
      ? state.blueprints[ship].externalPart
      : state.blueprints[ship].slots[target];
  return partId ? PART_BY_ID.get(partId) : undefined;
}

function renderSlotFirst(restoreSearchFocus = false): void {
  const state = proposalStates.slot;
  const definition = SHIP_DEFINITIONS[slotUi.ship];
  const currentPart = currentPartForTarget(state, slotUi.ship, slotUi.target);
  const visibleParts = SHIP_PARTS.filter((part) => {
    if (slotUi.target === 'external') return Boolean(part.external);
    if (part.external) return false;
    return partMatchesFilters(
      part,
      slotUi.tier,
      slotUi.category,
      slotUi.search
    );
  });

  slotContainer.innerHTML = `
    <section class="builder-frame slot-first-frame">
      ${builderToolbar(state, slotUi.ship, 'slot')}
      <div class="slot-first-layout">
        <article class="blueprint-card large-blueprint">
          <header class="blueprint-heading">
            <div class="ship-silhouette ship-silhouette-${slotUi.ship}" aria-hidden="true"><span>${definition.shortName}</span></div>
            <div>
              <span class="blueprint-overline">${definition.slots} part squares</span>
              <h3>${definition.name}</h3>
            </div>
            <button class="text-button" type="button" data-action="reset-blueprint" data-scope="slot">Reset</button>
          </header>
          ${builtInRail(state, slotUi.ship)}
          <div class="blueprint-grid-wrap">
            ${slotGrid(state, slotUi.ship, {
              action: 'open-slot-picker',
              scope: 'slot',
              selectedTarget: slotUi.target,
            })}
          </div>
          ${externalSocket(state, {
            action: 'open-slot-picker',
            scope: 'slot',
            ship: slotUi.ship,
            selected: slotUi.target === 'external',
          })}
          ${statsStrip(state, slotUi.ship)}
        </article>

        <button
          class="sheet-backdrop"
          type="button"
          data-action="close-slot-picker"
          aria-label="Close part picker"
          ${slotUi.pickerOpen ? '' : 'hidden'}
        ></button>
        <aside class="slot-picker ${slotUi.pickerOpen ? 'open' : ''}" ${
          slotUi.pickerOpen ? '' : 'hidden'
        }>
          <div class="sheet-handle" aria-hidden="true"></div>
          <header class="slot-picker-heading">
            <div>
              <span class="picker-step">Editing ${
                slotUi.target === 'external'
                  ? 'external socket'
                  : `square ${slotUi.target + 1} of ${definition.slots}`
              }</span>
              <h3>${currentPart ? escapeHtml(currentPart.name) : 'Empty square'}</h3>
            </div>
            <div class="picker-heading-actions">
              ${
                currentPart
                  ? '<button type="button" class="danger-text-button" data-action="clear-slot" data-scope="slot">Remove</button>'
                  : ''
              }
              <button type="button" class="sheet-close" data-action="close-slot-picker" aria-label="Close picker">×</button>
            </div>
          </header>
          ${
            slotUi.target === 'external'
              ? `
                <div class="external-explainer">
                  <span class="external-explainer-icon" aria-hidden="true">○</span>
                  <p><strong>External means external.</strong> Muon Source contributes energy and initiative without occupying one of the ${definition.slots} squares.</p>
                </div>
              `
              : `
                <div class="picker-controls">
                  ${tierFilters(slotUi.tier, 'slot-tier', 'slot')}
                  ${categoryFilters(slotUi.category, 'slot-category', 'slot')}
                  <label class="part-search">
                    <span aria-hidden="true">⌕</span>
                    <input type="search" data-action="slot-search" placeholder="Find a part…" value="${escapeHtml(
                      slotUi.search
                    )}" aria-label="Find a part" />
                  </label>
                </div>
              `
          }
          <div class="picker-part-list" aria-live="polite">
            ${
              visibleParts.length
                ? visibleParts
                    .map((part) =>
                      pickerPartCard(
                        state,
                        slotUi.ship,
                        slotUi.target,
                        part,
                        'slot',
                        'install-slot-part'
                      )
                    )
                    .join('')
                : '<p class="empty-filter-result">No parts match these filters.</p>'
            }
          </div>
          <footer class="picker-footer">
            <span><i class="tier-dot tier-standard"></i> unlimited</span>
            <span><i class="tier-dot tier-technology"></i> researched</span>
            <span><i class="tier-dot tier-discovery"></i> one tile</span>
          </footer>
        </aside>
      </div>
    </section>
  `;

  if (restoreSearchFocus) {
    const search = slotContainer.querySelector<HTMLInputElement>(
      '[data-action="slot-search"]'
    );
    search?.focus();
    search?.setSelectionRange(search.value.length, search.value.length);
  }
}

function partCanBeSelected(state: BuilderState, part: ShipPart): boolean {
  return !(part.tier === 'technology' && !state.unlockedTech.has(part.id));
}

function palettePartCard(
  state: BuilderState,
  part: ShipPart,
  selected: boolean
): string {
  const use =
    part.tier === 'discovery' ? findDiscoveryUse(state, part.id) : null;
  const enabled = partCanBeSelected(state, part);
  const status = !enabled
    ? 'Research to unlock'
    : use
      ? `On ${SHIP_DEFINITIONS[use.ship].name} · ${
          use.target === 'external' ? 'external' : use.target + 1
        }`
      : part.tier === 'discovery'
        ? '1 available'
        : 'Unlimited';
  return `
    <button
      class="palette-part-card tier-${part.tier} ${selected ? 'selected' : ''} ${
        use ? 'in-use' : ''
      }"
      type="button"
      data-action="select-palette-part"
      data-scope="palette"
      data-part="${part.id}"
      draggable="${enabled}"
      ${enabled ? '' : 'disabled'}
    >
      <span class="palette-card-top">
        <i aria-hidden="true">${CATEGORY_META[part.category].glyph}</i>
        <small>${TIER_LABELS[part.tier]}</small>
      </span>
      <strong>${escapeHtml(part.name)}</strong>
      <span class="part-card-effects">${partEffects(part)}</span>
      <span class="part-card-status">${escapeHtml(status)}</span>
    </button>
  `;
}

function renderPartFirst(restoreSearchFocus = false): void {
  const state = proposalStates.palette;
  const definition = SHIP_DEFINITIONS[paletteUi.ship];
  const selectedPart = paletteUi.selectedPart
    ? PART_BY_ID.get(paletteUi.selectedPart)
    : undefined;
  const visibleParts = SHIP_PARTS.filter(
    (part) =>
      partMatchesFilters(
        part,
        paletteUi.tier,
        paletteUi.category,
        paletteUi.search
      ) && !part.external
  );

  paletteContainer.innerHTML = `
    <section class="builder-frame part-first-frame">
      ${builderToolbar(state, paletteUi.ship, 'palette')}
      <div class="palette-layout">
        <aside class="part-palette">
          <header class="palette-heading">
            <div><span class="picker-step">Step 1</span><h3>Pick up a part</h3></div>
            <span class="drag-hint">Drag on desktop</span>
          </header>
          ${tierFilters(paletteUi.tier, 'palette-tier', 'palette')}
          ${categoryFilters(paletteUi.category, 'palette-category', 'palette')}
          <label class="part-search palette-search">
            <span aria-hidden="true">⌕</span>
            <input type="search" data-action="palette-search" placeholder="Find a part…" value="${escapeHtml(
              paletteUi.search
            )}" aria-label="Find a part" />
          </label>
          <div class="palette-part-list">
            ${visibleParts
              .map((part) =>
                palettePartCard(state, part, part.id === paletteUi.selectedPart)
              )
              .join('')}
          </div>
          <button
            class="external-palette-card ${
              paletteUi.selectedPart === 'mus' ? 'selected' : ''
            }"
            type="button"
            data-action="select-palette-part"
            data-scope="palette"
            data-part="mus"
            draggable="true"
          >
            <span aria-hidden="true">○</span>
            <span><strong>Muon Source</strong><small>External discovery · no square</small></span>
            <span>+2ϟ · +1 init</span>
          </button>
        </aside>

        <article class="palette-blueprint-panel">
          <header class="palette-blueprint-heading">
            <div>
              <span class="picker-step">Step 2</span>
              <h3>Place on ${definition.name}</h3>
            </div>
            <button class="text-button" type="button" data-action="reset-blueprint" data-scope="palette">Reset</button>
          </header>
          <div class="placing-banner ${selectedPart ? 'active' : ''}">
            ${
              selectedPart
                ? `
                  <span class="placing-glyph" aria-hidden="true">${
                    CATEGORY_META[selectedPart.category].glyph
                  }</span>
                  <span><small>Placing</small><strong>${escapeHtml(
                    selectedPart.name
                  )}</strong></span>
                  <span class="placing-effects">${partEffects(
                    selectedPart,
                    true
                  )}</span>
                  <button type="button" data-action="cancel-palette-part">Cancel</button>
                `
                : '<span class="placing-empty">Choose a part from the palette, then tap a destination.</span>'
            }
          </div>
          ${builtInRail(state, paletteUi.ship)}
          <div class="palette-blueprint-stage">
            <div class="ship-silhouette ship-silhouette-${paletteUi.ship} large" aria-hidden="true"><span>${definition.shortName}</span></div>
            ${slotGrid(state, paletteUi.ship, {
              action: 'place-palette-part',
              clearAction: 'clear-palette-slot',
              scope: 'palette',
              selectedPart,
            })}
          </div>
          ${externalSocket(state, {
            action: 'place-palette-part',
            clearAction: 'clear-palette-slot',
            scope: 'palette',
            ship: paletteUi.ship,
            eligible: Boolean(selectedPart?.external),
          })}
          ${statsStrip(state, paletteUi.ship)}
          <p class="palette-footnote">
            ${
              selectedPart?.tier === 'discovery'
                ? 'Discovery placement ends the mode because there is only one physical tile.'
                : 'Standard and researched technology parts stay selected for quick duplicates.'
            }
          </p>
        </article>
      </div>
    </section>
  `;

  if (restoreSearchFocus) {
    const search = paletteContainer.querySelector<HTMLInputElement>(
      '[data-action="palette-search"]'
    );
    search?.focus();
    search?.setSelectionRange(search.value.length, search.value.length);
  }
}

function compactWorkbenchPart(state: BuilderState, part: ShipPart): string {
  const enabled = partCanBeSelected(state, part);
  const use =
    part.tier === 'discovery' ? findDiscoveryUse(state, part.id) : null;
  return `
    <button
      class="workbench-part tier-${part.tier} ${use ? 'in-use' : ''}"
      type="button"
      data-action="inspect-workbench-part"
      data-part="${part.id}"
      draggable="${enabled}"
      ${enabled ? '' : 'disabled'}
      title="${
        use
          ? `Installed on ${SHIP_DEFINITIONS[use.ship].name}`
          : enabled
            ? 'Drag to a blueprint square'
            : 'Technology not researched'
      }"
    >
      <i aria-hidden="true">${CATEGORY_META[part.category].glyph}</i>
      <span><strong>${escapeHtml(part.name)}</strong><small>${partEffects(
        part,
        true
      )}</small></span>
      <em>${
        use
          ? SHIP_DEFINITIONS[use.ship].shortName
          : part.tier === 'discovery'
            ? '×1'
            : '∞'
      }</em>
    </button>
  `;
}

function compactShipBlueprint(state: BuilderState, ship: ShipKind): string {
  const definition = SHIP_DEFINITIONS[ship];
  const available = isShipAvailable(state.factionId, ship);
  const bonuses = fixedBonuses(state.factionId, ship);
  return `
    <article class="workbench-ship ${available ? '' : 'unavailable'}">
      <header>
        <span class="mini-ship-mark">${definition.shortName}</span>
        <div><strong>${definition.name}</strong><small>${definition.slots} squares</small></div>
        <span class="mini-energy ${
          calculateBlueprintStats(state, ship).energyBalance < 0
            ? 'invalid'
            : ''
        }">ϟ ${calculateBlueprintStats(state, ship).energyBalance >= 0 ? '+' : ''}${
          calculateBlueprintStats(state, ship).energyBalance
        }</span>
      </header>
      <div class="mini-fixed-rail">
        <span>◆ Built in</span>
        ${
          bonuses.length
            ? bonuses
                .map((bonus) => `<b>${escapeHtml(bonus.label)}</b>`)
                .join('')
            : '<i>none</i>'
        }
      </div>
      ${slotGrid(state, ship, {
        action: 'select-workbench-slot',
        scope: 'workbench',
        selectedTarget:
          workbenchUi.selectedShip === ship
            ? workbenchUi.selectedTarget
            : undefined,
        shipOverride: ship,
        compact: true,
      })}
      ${externalSocket(state, {
        action: 'select-workbench-slot',
        scope: 'workbench',
        ship,
        selected:
          workbenchUi.selectedShip === ship &&
          workbenchUi.selectedTarget === 'external',
        compact: true,
      })}
      ${
        available
          ? ''
          : `<div class="unavailable-overlay"><strong>Unavailable</strong><span>${escapeHtml(
              FACTIONS.find((faction) => faction.id === state.factionId)
                ?.name ?? 'Faction'
            )}</span></div>`
      }
    </article>
  `;
}

function selectedWorkbenchInspector(state: BuilderState): string {
  const ship = workbenchUi.selectedShip;
  const target = workbenchUi.selectedTarget;
  const part = currentPartForTarget(state, ship, target);
  const useCount = SHIP_PARTS.filter(
    (candidate) =>
      candidate.tier === 'discovery' && findDiscoveryUse(state, candidate.id)
  ).length;
  return `
    <div class="inspector-selection">
      <span class="picker-step">Selection</span>
      <h3>${SHIP_DEFINITIONS[ship].name} · ${
        target === 'external' ? 'External' : `square ${target + 1}`
      }</h3>
      <div class="inspected-part ${part ? `tier-${part.tier}` : 'empty'}">
        <i aria-hidden="true">${part ? CATEGORY_META[part.category].glyph : '+'}</i>
        <div>
          <strong>${part ? escapeHtml(part.name) : 'Empty square'}</strong>
          <span>${part ? partEffects(part) : 'Right-click to choose a part'}</span>
          ${part ? `<small>${TIER_LABELS[part.tier]}</small>` : ''}
        </div>
      </div>
      <div class="inspector-actions">
        <button type="button" data-action="open-context-from-inspector">Choose part…</button>
        ${
          part
            ? '<button type="button" class="danger-text-button" data-action="clear-workbench-slot">Remove</button>'
            : ''
        }
      </div>
    </div>
    ${statsStrip(state, ship, true)}
    <div class="discovery-ledger">
      <header><span>Discovery inventory</span><strong>${useCount} / 18 used</strong></header>
      <div class="ledger-track"><i style="width:${(useCount / 18) * 100}%"></i></div>
      <p>Single physical tiles stay pinned to their current blueprint until moved.</p>
    </div>
    <div class="pointer-instructions">
      <span class="mouse-icon" aria-hidden="true"></span>
      <p><strong>Right-click</strong> any square for type → part.<br /><strong>Drag</strong> from the library for direct placement.</p>
    </div>
  `;
}

function renderWorkbench(): void {
  const state = proposalStates.workbench;
  const categoryParts = SHIP_PARTS.filter(
    (part) => part.category === workbenchUi.category
  );
  workbenchContainer.innerHTML = `
    <section class="workbench-frame">
      <header class="workbench-toolbar">
        <div class="workbench-title"><span class="status-light"></span><strong>Fleet engineering desk</strong><small>Pointer workspace</small></div>
        <label>Faction <select data-action="set-faction" data-scope="workbench">${factionOptions(
          state.factionId
        )}</select></label>
        <button type="button" data-action="open-tech" data-scope="workbench">⌬ Technology access</button>
        <span class="workbench-save-state">● Draft saved</span>
      </header>
      <div class="workbench-layout">
        <aside class="workbench-library">
          <header><span>Part library</span><small>Drag a tile</small></header>
          <div class="workbench-categories" role="tablist" aria-label="Part categories">
            ${PART_CATEGORIES.map(
              (category) => `
                <button type="button" data-action="workbench-category" data-category="${category}" aria-selected="${
                  category === workbenchUi.category
                }" title="${CATEGORY_META[category].label}">
                  <i aria-hidden="true">${CATEGORY_META[category].glyph}</i><span>${
                    CATEGORY_META[category].label
                  }</span>
                </button>
              `
            ).join('')}
          </div>
          <div class="workbench-parts">
            ${categoryParts
              .map((part) => compactWorkbenchPart(state, part))
              .join('')}
          </div>
          <div class="library-legend">
            <span><i class="tier-dot tier-standard"></i>∞ standard</span>
            <span><i class="tier-dot tier-technology"></i>∞ researched</span>
            <span><i class="tier-dot tier-discovery"></i>×1 discovery</span>
          </div>
        </aside>

        <section class="fleet-blueprint-board">
          <header><div><span class="board-overline">Faction blueprints</span><h3>${escapeHtml(
            FACTIONS.find((faction) => faction.id === state.factionId)?.name ??
              'Generic'
          )}</h3></div><span>Right-click a square to configure</span></header>
          <div class="workbench-ship-grid">
            ${SHIP_KINDS.map((ship) => compactShipBlueprint(state, ship)).join(
              ''
            )}
          </div>
        </section>

        <aside class="workbench-inspector">
          ${selectedWorkbenchInspector(state)}
        </aside>
      </div>
    </section>
  `;
}

function moveOrPlacePart(
  scope: ProposalKey,
  ship: ShipKind,
  target: PlacementTarget,
  partId: string
): boolean {
  const state = proposalStates[scope];
  const part = PART_BY_ID.get(partId);
  if (!part) return false;
  const check = canPlacePart(state, ship, target, partId);
  if (!check.allowed && part.tier !== 'discovery') {
    showToast(check.reason ?? 'That part cannot be placed there.');
    return false;
  }
  remember(scope);
  const previousUse =
    part.tier === 'discovery' ? findDiscoveryUse(state, part.id) : null;
  if (
    previousUse &&
    (previousUse.ship !== ship || previousUse.target !== target)
  ) {
    placePart(state, previousUse.ship, previousUse.target, null);
  }
  const result = placePart(state, ship, target, partId);
  if (!result.allowed) {
    if (history[scope]) proposalStates[scope] = history[scope];
    showToast(result.reason ?? 'That part cannot be placed there.');
    return false;
  }
  const location =
    target === 'external' ? 'external socket' : `square ${target + 1}`;
  showToast(
    `${previousUse ? 'Moved' : 'Placed'} ${part.name} · ${
      SHIP_DEFINITIONS[ship].name
    } ${location}`,
    scope,
    true
  );
  return true;
}

function clearTarget(
  scope: ProposalKey,
  ship: ShipKind,
  target: PlacementTarget
): void {
  const state = proposalStates[scope];
  const part = currentPartForTarget(state, ship, target);
  if (!part) return;
  remember(scope);
  placePart(state, ship, target, null);
  showToast(`Removed ${part.name}.`, scope, true);
  renderScope(scope);
}

function resetBlueprint(scope: ProposalKey, ship: ShipKind): void {
  const defaults = createBuilderState().blueprints[ship];
  remember(scope);
  proposalStates[scope].blueprints[ship] = {
    slots: [...defaults.slots],
    externalPart: null,
  };
  showToast(`${SHIP_DEFINITIONS[ship].name} reset.`, scope, true);
  renderScope(scope);
}

function parseTarget(value: string | undefined): PlacementTarget | null {
  if (value === 'external') return 'external';
  if (value === undefined) return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function handleCommonAction(element: HTMLElement): boolean {
  const action = element.dataset.action;
  const scope = element.dataset.scope as ProposalKey | undefined;
  if (action === 'open-tech' && scope) {
    openTechDialog(scope);
    return true;
  }
  if (
    action === 'set-faction' &&
    scope &&
    element instanceof HTMLSelectElement
  ) {
    const faction = element.value as FactionId;
    if (scope === 'slot') {
      slotUi.ship = setFaction(scope, faction, slotUi.ship);
    } else if (scope === 'palette') {
      paletteUi.ship = setFaction(scope, faction, paletteUi.ship);
    } else {
      workbenchUi.selectedShip = setFaction(
        scope,
        faction,
        workbenchUi.selectedShip
      );
    }
    renderScope(scope);
    return true;
  }
  if (action === 'choose-ship' && scope && element.dataset.ship) {
    const ship = element.dataset.ship as ShipKind;
    if (scope === 'slot') {
      slotUi.ship = ship;
      slotUi.target = 0;
      slotUi.pickerOpen = true;
    } else if (scope === 'palette') {
      paletteUi.ship = ship;
    }
    renderScope(scope);
    return true;
  }
  if (action === 'reset-blueprint' && scope) {
    const ship = scope === 'slot' ? slotUi.ship : paletteUi.ship;
    resetBlueprint(scope, ship);
    return true;
  }
  return false;
}

slotContainer.addEventListener('click', (event) => {
  const element = (event.target as Element).closest<HTMLElement>(
    '[data-action]'
  );
  if (!element || handleCommonAction(element)) return;
  const action = element.dataset.action;
  if (action === 'open-slot-picker') {
    const target = parseTarget(element.dataset.target);
    if (target === null) return;
    slotUi.target = target;
    slotUi.pickerOpen = true;
    if (target === 'external') {
      slotUi.tier = 'discovery';
      slotUi.category = 'source';
    }
    renderSlotFirst();
  } else if (action === 'close-slot-picker') {
    slotUi.pickerOpen = false;
    renderSlotFirst();
  } else if (action === 'slot-tier' && element.dataset.tier) {
    slotUi.tier = element.dataset.tier as TierFilter;
    renderSlotFirst();
  } else if (action === 'slot-category' && element.dataset.category) {
    slotUi.category = element.dataset.category as CategoryFilter;
    renderSlotFirst();
  } else if (action === 'install-slot-part' && element.dataset.part) {
    if (
      moveOrPlacePart('slot', slotUi.ship, slotUi.target, element.dataset.part)
    ) {
      if (window.matchMedia('(max-width: 52rem)').matches) {
        slotUi.pickerOpen = false;
      }
      renderSlotFirst();
    }
  } else if (action === 'clear-slot') {
    clearTarget('slot', slotUi.ship, slotUi.target);
  }
});

slotContainer.addEventListener('input', (event) => {
  const input = event.target;
  if (
    input instanceof HTMLInputElement &&
    input.dataset.action === 'slot-search'
  ) {
    slotUi.search = input.value;
    renderSlotFirst(true);
  }
});

paletteContainer.addEventListener('click', (event) => {
  const element = (event.target as Element).closest<HTMLElement>(
    '[data-action]'
  );
  if (!element || handleCommonAction(element)) return;
  const action = element.dataset.action;
  if (action === 'palette-tier' && element.dataset.tier) {
    paletteUi.tier = element.dataset.tier as TierFilter;
    renderPartFirst();
  } else if (action === 'palette-category' && element.dataset.category) {
    paletteUi.category = element.dataset.category as CategoryFilter;
    renderPartFirst();
  } else if (action === 'select-palette-part' && element.dataset.part) {
    paletteUi.selectedPart = element.dataset.part;
    renderPartFirst();
  } else if (action === 'cancel-palette-part') {
    paletteUi.selectedPart = null;
    renderPartFirst();
  } else if (action === 'place-palette-part') {
    const target = parseTarget(element.dataset.target);
    if (target === null || !paletteUi.selectedPart) return;
    const selected = PART_BY_ID.get(paletteUi.selectedPart);
    if (
      moveOrPlacePart('palette', paletteUi.ship, target, paletteUi.selectedPart)
    ) {
      if (selected?.tier === 'discovery') paletteUi.selectedPart = null;
      renderPartFirst();
    }
  } else if (action === 'clear-palette-slot') {
    const target = parseTarget(element.dataset.target);
    if (target !== null) clearTarget('palette', paletteUi.ship, target);
  }
});

paletteContainer.addEventListener('input', (event) => {
  const input = event.target;
  if (
    input instanceof HTMLInputElement &&
    input.dataset.action === 'palette-search'
  ) {
    paletteUi.search = input.value;
    renderPartFirst(true);
  }
});

paletteContainer.addEventListener('dragstart', (event) => {
  const element = (event.target as Element).closest<HTMLElement>('[data-part]');
  if (!element?.dataset.part || !event.dataTransfer) return;
  event.dataTransfer.setData('text/plain', element.dataset.part);
  event.dataTransfer.effectAllowed = 'copyMove';
});

paletteContainer.addEventListener('dragover', (event) => {
  const target = (event.target as Element).closest<HTMLElement>(
    '[data-action="place-palette-part"]'
  );
  if (target) event.preventDefault();
});

paletteContainer.addEventListener('drop', (event) => {
  const element = (event.target as Element).closest<HTMLElement>(
    '[data-action="place-palette-part"]'
  );
  if (!element || !event.dataTransfer) return;
  event.preventDefault();
  const partId = event.dataTransfer.getData('text/plain');
  const target = parseTarget(element.dataset.target);
  if (!partId || target === null) return;
  if (moveOrPlacePart('palette', paletteUi.ship, target, partId)) {
    renderPartFirst();
  }
});

workbenchContainer.addEventListener('click', (event) => {
  const element = (event.target as Element).closest<HTMLElement>(
    '[data-action]'
  );
  if (!element || handleCommonAction(element)) return;
  const action = element.dataset.action;
  if (action === 'workbench-category' && element.dataset.category) {
    workbenchUi.category = element.dataset.category as PartCategory;
    renderWorkbench();
  } else if (action === 'select-workbench-slot') {
    const target = parseTarget(element.dataset.target);
    if (!element.dataset.ship || target === null) return;
    workbenchUi.selectedShip = element.dataset.ship as ShipKind;
    workbenchUi.selectedTarget = target;
    hideContextMenu();
    renderWorkbench();
  } else if (action === 'open-context-from-inspector') {
    workbenchUi.contextShip = workbenchUi.selectedShip;
    workbenchUi.contextTarget = workbenchUi.selectedTarget;
    workbenchUi.contextCategory = null;
    const rect = element.getBoundingClientRect();
    workbenchUi.contextX = rect.left;
    workbenchUi.contextY = rect.bottom + 6;
    renderContextMenu();
  } else if (action === 'clear-workbench-slot') {
    clearTarget(
      'workbench',
      workbenchUi.selectedShip,
      workbenchUi.selectedTarget
    );
  }
});

workbenchContainer.addEventListener('contextmenu', (event) => {
  const element = (event.target as Element).closest<HTMLElement>(
    '[data-action="select-workbench-slot"]'
  );
  const target = parseTarget(element?.dataset.target);
  if (!element?.dataset.ship || target === null) return;
  event.preventDefault();
  workbenchUi.selectedShip = element.dataset.ship as ShipKind;
  workbenchUi.selectedTarget = target;
  workbenchUi.contextShip = workbenchUi.selectedShip;
  workbenchUi.contextTarget = target;
  workbenchUi.contextCategory = null;
  workbenchUi.contextX = event.clientX;
  workbenchUi.contextY = event.clientY;
  renderWorkbench();
  renderContextMenu();
});

workbenchContainer.addEventListener('dragstart', (event) => {
  const element = (event.target as Element).closest<HTMLElement>('[data-part]');
  if (!element?.dataset.part || !event.dataTransfer) return;
  event.dataTransfer.setData('text/plain', element.dataset.part);
  event.dataTransfer.effectAllowed = 'copyMove';
});

workbenchContainer.addEventListener('dragover', (event) => {
  const element = (event.target as Element).closest<HTMLElement>(
    '[data-action="select-workbench-slot"]'
  );
  if (element) event.preventDefault();
});

workbenchContainer.addEventListener('drop', (event) => {
  const element = (event.target as Element).closest<HTMLElement>(
    '[data-action="select-workbench-slot"]'
  );
  const target = parseTarget(element?.dataset.target);
  if (!element?.dataset.ship || target === null || !event.dataTransfer) return;
  event.preventDefault();
  const partId = event.dataTransfer.getData('text/plain');
  const ship = element.dataset.ship as ShipKind;
  if (partId && moveOrPlacePart('workbench', ship, target, partId)) {
    workbenchUi.selectedShip = ship;
    workbenchUi.selectedTarget = target;
    renderWorkbench();
  }
});

function renderContextMenu(): void {
  const state = proposalStates.workbench;
  const isExternal = workbenchUi.contextTarget === 'external';
  const categories = isExternal ? ['source' as const] : PART_CATEGORIES;
  const parts = workbenchUi.contextCategory
    ? SHIP_PARTS.filter(
        (part) =>
          part.category === workbenchUi.contextCategory &&
          Boolean(part.external) === isExternal
      )
    : [];
  contextMenu.innerHTML = `
    <header>
      <span>${SHIP_DEFINITIONS[workbenchUi.contextShip].name} · ${
        isExternal
          ? 'external'
          : `square ${Number(workbenchUi.contextTarget) + 1}`
      }</span>
      <button type="button" data-context-action="close" aria-label="Close context menu">×</button>
    </header>
    ${
      workbenchUi.contextCategory
        ? `
          <button class="context-back" type="button" data-context-action="back">← Part type</button>
          <div class="context-part-list">
            ${parts
              .map((part) => {
                const availability = partAvailability(
                  state,
                  workbenchUi.contextShip,
                  workbenchUi.contextTarget,
                  part
                );
                return `
                  <button type="button" data-context-action="place" data-part="${part.id}" ${
                    availability.disabled ? 'disabled' : ''
                  }>
                    <i aria-hidden="true">${CATEGORY_META[part.category].glyph}</i>
                    <span><strong>${escapeHtml(part.name)}</strong><small>${partEffects(
                      part,
                      true
                    )}</small></span>
                    <em>${escapeHtml(availability.status)}</em>
                  </button>
                `;
              })
              .join('')}
          </div>
        `
        : `
          <p>Choose a part type</p>
          <div class="context-category-grid">
            ${categories
              .map(
                (category) => `
                  <button type="button" data-context-action="category" data-category="${category}">
                    <i aria-hidden="true">${CATEGORY_META[category].glyph}</i>
                    <span>${CATEGORY_META[category].label}</span>
                    <small>${
                      SHIP_PARTS.filter(
                        (part) =>
                          part.category === category &&
                          Boolean(part.external) === isExternal
                      ).length
                    }</small>
                  </button>
                `
              )
              .join('')}
          </div>
          ${
            currentPartForTarget(
              state,
              workbenchUi.contextShip,
              workbenchUi.contextTarget
            )
              ? '<button class="context-remove" type="button" data-context-action="remove">Remove current part</button>'
              : ''
          }
        `
    }
  `;
  contextMenu.hidden = false;
  contextMenu.style.left = `${Math.max(
    8,
    Math.min(workbenchUi.contextX, window.innerWidth - 340)
  )}px`;
  contextMenu.style.top = `${Math.max(
    8,
    Math.min(workbenchUi.contextY, window.innerHeight - 460)
  )}px`;
}

function hideContextMenu(): void {
  contextMenu.hidden = true;
  workbenchUi.contextCategory = null;
}

contextMenu.addEventListener('click', (event) => {
  const element = (event.target as Element).closest<HTMLElement>(
    '[data-context-action]'
  );
  if (!element) return;
  const action = element.dataset.contextAction;
  if (action === 'close') hideContextMenu();
  else if (action === 'back') {
    workbenchUi.contextCategory = null;
    renderContextMenu();
  } else if (action === 'category' && element.dataset.category) {
    workbenchUi.contextCategory = element.dataset.category as PartCategory;
    renderContextMenu();
  } else if (action === 'place' && element.dataset.part) {
    if (
      moveOrPlacePart(
        'workbench',
        workbenchUi.contextShip,
        workbenchUi.contextTarget,
        element.dataset.part
      )
    ) {
      workbenchUi.selectedShip = workbenchUi.contextShip;
      workbenchUi.selectedTarget = workbenchUi.contextTarget;
      hideContextMenu();
      renderWorkbench();
    }
  } else if (action === 'remove') {
    clearTarget(
      'workbench',
      workbenchUi.contextShip,
      workbenchUi.contextTarget
    );
    hideContextMenu();
  }
});

document.addEventListener('pointerdown', (event) => {
  if (
    !contextMenu.hidden &&
    !contextMenu.contains(event.target as Node) &&
    !(event.target as Element).closest(
      '[data-action="open-context-from-inspector"]'
    )
  ) {
    hideContextMenu();
  }
});

function openTechDialog(scope: ProposalKey): void {
  techDialogScope = scope;
  renderTechDialog();
  techDialog.showModal();
}

function renderTechDialog(): void {
  const state = proposalStates[techDialogScope];
  const technologyParts = SHIP_PARTS.filter(
    (part) => part.tier === 'technology'
  );
  const unlocked = technologyParts.filter((part) =>
    state.unlockedTech.has(part.id)
  ).length;
  techDialog.innerHTML = `
    <form method="dialog" class="tech-dialog-shell">
      <header>
        <div><span class="picker-step">Fleet-level access</span><h2>Available technology</h2></div>
        <button class="sheet-close" value="close" aria-label="Close technology access">×</button>
      </header>
      <p>
        Keep all 20 upgrades visible in the part picker. Unchecked technology is
        clearly locked; researched parts can be installed without limit.
      </p>
      <div class="tech-dialog-count"><strong data-tech-count>${unlocked}</strong><span>of 20 researched</span></div>
      <div class="tech-check-grid">
        ${technologyParts
          .map(
            (part) => `
              <label class="tech-check tier-technology">
                <input type="checkbox" data-tech-id="${part.id}" ${
                  state.unlockedTech.has(part.id) ? 'checked' : ''
                } />
                <span class="tech-check-glyph" aria-hidden="true">${
                  CATEGORY_META[part.category].glyph
                }</span>
                <span><strong>${escapeHtml(part.name)}</strong><small>${
                  CATEGORY_META[part.category].shortLabel
                } · ${partEffects(part, true)}</small></span>
              </label>
            `
          )
          .join('')}
      </div>
      <footer><span>Changes apply immediately to this proposal.</span><button class="primary-button" value="close">Done</button></footer>
    </form>
  `;
}

techDialog.addEventListener('change', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.dataset.techId) return;
  remember(techDialogScope);
  const state = proposalStates[techDialogScope];
  if (input.checked) state.unlockedTech.add(input.dataset.techId);
  else state.unlockedTech.delete(input.dataset.techId);
  const count = techDialog.querySelector<HTMLElement>('[data-tech-count]');
  if (count) count.textContent = String(state.unlockedTech.size);
  renderScope(techDialogScope);
});

techDialog.addEventListener('click', (event) => {
  if (event.target === techDialog) techDialog.close();
});

toast.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>(
    '[data-toast-undo]'
  );
  const scope = button?.dataset.toastUndo as ProposalKey | undefined;
  if (!scope || !history[scope]) return;
  proposalStates[scope] = history[scope];
  delete history[scope];
  toast.hidden = true;
  renderScope(scope);
});

const tabs = Array.from(
  document.querySelectorAll<HTMLButtonElement>('[data-proposal-tab]')
);
const panels = Array.from(
  document.querySelectorAll<HTMLElement>('[data-proposal-panel]')
);

function activateProposal(number: string, focus = false): void {
  tabs.forEach((tab) => {
    const active = tab.dataset.proposalTab === number;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && focus) tab.focus();
  });
  panels.forEach((panel) => {
    panel.hidden = panel.dataset.proposalPanel !== number;
  });
  const url = new URL(window.location.href);
  url.searchParams.set('proposal', number);
  window.history.replaceState(null, '', url);
  hideContextMenu();
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => {
    activateProposal(tab.dataset.proposalTab ?? '1');
  });
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let next: number;
    if (event.key === 'ArrowLeft')
      next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else next = tabs.length - 1;
    activateProposal(tabs[next].dataset.proposalTab ?? '1', true);
  });
});

renderSlotFirst();
renderPartFirst();
renderWorkbench();

const initialProposal = new URL(window.location.href).searchParams.get(
  'proposal'
);
activateProposal(
  ['1', '2', '3'].includes(initialProposal ?? '') ? initialProposal! : '1'
);
