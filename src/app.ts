import { CombatRunner } from '@calc/combat-runner';
import { Fleet } from '@calc/fleet';
import { Ship } from '@calc/ship';
import { calculatePopulationBombardment } from '@calc/population-bombardment';
import '@ui/components/fleet';
import type { FleetElement } from '@ui/components/fleet';
import '@ui/components/results';
import {
  state,
  addFleet,
  onFleetsChanged,
  resetFleets,
  replaceFleets,
  setSimulationResults,
  flattenShipBlueprints,
  hasShipBlueprints,
  initializeDefaultShipBlueprints,
} from '@ui/state';
import type { PlannerType, SurvivorDistributionEntry } from '@ui/state';
import { battleLabel, encodeBattleQuery, parseBattleQuery } from '@ui/share';
import { deriveFleetNames, fleetColor, MAX_FLEETS } from '@ui/fleet-metadata';
import {
  applyControlMode,
  applyThemePreference,
  loadControlMode,
  loadThemePreference,
  saveControlMode,
  saveThemePreference,
  type ControlMode,
  type ThemePreference,
} from '@ui/preferences';
import {
  loadRecentBattles,
  loadSetup,
  recordRecentBattle,
  saveSetup,
} from '@ui/storage';
import { resultClassNameForFleet } from '@ui/result-presentation';
import {
  calculateMaterialLosses,
  calculateReputationDrawDistributions,
} from '@ui/battle-impact';
import { DamageType } from 'src/constants';

const PLANNER_TYPE_TO_DAMAGE_TYPE: Record<PlannerType, DamageType> = {
  npc: DamageType.NPC,
  dps: DamageType.DPS,
  optimal: DamageType.OPTIMAL,
};

// Results recompute automatically shortly after the last edit; the pause keeps
// hold-to-repeat steppers from re-solving on every tick.
const AUTO_SIMULATE_DELAY_MS = 200;
let activeControlMode: ControlMode = 'steppers';

function renderFleets() {
  const fleetsContainer = document.getElementById('fleets');
  if (!fleetsContainer) return;
  fleetsContainer.innerHTML = '';

  const addFleetBtn = document.getElementById(
    'add-fleet-btn'
  ) as HTMLButtonElement | null;
  if (addFleetBtn) {
    addFleetBtn.disabled = state.fleets.length >= MAX_FLEETS;
  }

  updateFleetNames();

  state.fleets.forEach((fleet, index) => {
    const fleetElement = document.createElement('calc-fleet') as FleetElement;
    fleetElement.fleet = fleet;
    fleetElement.controlMode = activeControlMode;

    if (index >= 2) {
      fleetElement.setAttribute('can-remove', 'true');
    } else {
      fleetElement.setAttribute('can-remove', 'false');
    }

    // Only the defender (fleet 0) may contain AI ships.
    fleetElement.setAttribute('is-defender', index === 0 ? 'true' : 'false');
    fleetElement.setAttribute('fleet-index', index.toString());
    fleetElement.setAttribute('fleet-count', state.fleets.length.toString());

    fleetsContainer.appendChild(fleetElement);
  });
}

function updateFleetNames() {
  const names = deriveFleetNames(state.fleets);
  state.fleets.forEach((fleet, index) => {
    fleet.name = names[index];
  });
}

function addFleetHandler() {
  if (state.fleets.length >= MAX_FLEETS) return;
  addFleet();
  renderFleets();
}

function clearAll() {
  resetFleets();
  setSimulationResults(null);
  renderFleets();
  renderResults();
}

// Mirrors the current fleets into the query string on every change, so the
// address bar is always a shareable link to the battle being set up.
function syncBattleUrl() {
  const query = encodeBattleQuery(state.fleets);
  window.history.replaceState(
    null,
    '',
    window.location.pathname + (query ? `?${query}` : '')
  );
}

// Loads a shared battle from the query string. Returns true if one was loaded.
// Rendering the answer is left to the auto-simulate pass the load triggers.
function loadSharedBattle(): boolean {
  const fleets = parseBattleQuery(window.location.search);
  if (!fleets) return false;

  replaceFleets(fleets);
  renderFleets();
  return true;
}

// Restores the last in-progress setup from local storage (table play: reopen
// the phone, tweak the previous fight). Returns true if one was restored.
function restoreSavedSetup(): boolean {
  const fleets = loadSetup();
  if (!fleets) return false;

  replaceFleets(fleets);
  renderFleets();
  return true;
}

let autoSimulateTimer: ReturnType<typeof setTimeout> | undefined;

function fleetHasShips(fleet: (typeof state.fleets)[number]): boolean {
  return fleet.shipTypes.some((shipType) => shipType.quantity > 0);
}

// There is no Simulate button: every fleet change re-solves the battle after a
// short pause. Empty fleets sit out, and at least two populated fleets are
// required so stale odds never linger next to a half-edited setup.
function scheduleAutoSimulate() {
  clearTimeout(autoSimulateTimer);
  autoSimulateTimer = setTimeout(() => {
    updateFleetNames();
    const ready = state.fleets.filter(fleetHasShips).length >= 2;
    if (ready) {
      simulate();
    } else {
      setSimulationResults(null);
      renderResults();
    }
  }, AUTO_SIMULATE_DELAY_MS);
}

function simulate() {
  updateFleetNames();
  const engineFleets = buildEngineFleets();
  const result = new CombatRunner().run(engineFleets);
  const participatingFleets = state.fleets.filter(fleetHasShips);
  const survivorDistribution =
    result.survivorDistribution as SurvivorDistributionEntry[];
  const common = {
    // Engine maps remain keyed by stable fleet IDs. Components translate those
    // IDs to the current display names only while rendering.
    victoryProbability: result.lastFleetStanding,
    drawProbability: result.drawPercentage,
    expectedSurvivors: result.expectedSurvivors as Record<
      string,
      Record<string, number>
    >,
    survivorDistribution,
    materialLosses: calculateMaterialLosses(
      participatingFleets,
      survivorDistribution
    ),
    populationBombardment: calculatePopulationBombardment(
      engineFleets,
      survivorDistribution,
      {
        defenderFleetName: state.fleets[0]?.id,
        automaticWipe: state.fleets[0]?.factionId === 'planta',
      }
    ),
    reputationDraws: calculateReputationDrawDistributions(
      participatingFleets,
      survivorDistribution
    ),
    timeTaken: result.timeTaken,
    targeting: result.targeting,
    tier: result.tier,
    methodLabel: result.methodLabel,
    diagnostics: result.diagnostics,
  };

  if (result.method === 'exact') {
    setSimulationResults({
      ...common,
      method: 'exact',
    });
  } else {
    setSimulationResults({
      ...common,
      method: 'monte-carlo',
      iterations: result.iterations ?? 0,
    });
  }

  afterSimulate();
}

function buildEngineFleets(): Fleet[] {
  return state.fleets.flatMap((fleet) => {
    const ships: Ship[] = [];

    fleet.shipTypes.forEach((shipType) => {
      for (let i = 0; i < shipType.quantity; i++) {
        const ship = new Ship(shipType.type, shipType.config);
        ships.push(ship);
      }
    });

    if (ships.length === 0) return [];

    return [
      new Fleet(
        fleet.id,
        ships,
        fleet.antimatterSplitter,
        PLANNER_TYPE_TO_DAMAGE_TYPE[fleet.plannerType]
      ),
    ];
  });
}

function afterSimulate() {
  recordRecentBattle(state.fleets);
  refreshRecentsPicker();
  renderResults();
}

function renderResults() {
  const resultsContainer = document.getElementById('results-container');
  if (!resultsContainer) return;
  resultsContainer.innerHTML = '';

  if (state.simulationResults) {
    const resultsElement = document.createElement('calc-results');
    resultsContainer.appendChild(resultsElement);
  }

  renderLiveBar();
}

// The sticky bar: leading outcome plus a mini odds strip, always in reach while
// editing. Hidden when there are no results or the About page is open.
function renderLiveBar() {
  const bar = document.getElementById('live-bar');
  if (!bar) return;

  const results = state.simulationResults;
  if (!results || window.location.pathname === '/about') {
    bar.hidden = true;
    return;
  }

  const outcomes: Array<{
    label: string;
    probability: number;
    className: string;
    color?: string;
    lightColor?: string;
  }> = state.fleets.map((fleet, index) => {
    const color = fleetColor(fleet.colorId, index);
    return {
      label: fleet.name,
      probability: results.victoryProbability[fleet.id] ?? 0,
      className: resultClassNameForFleet(index),
      color: color.color,
      lightColor: color.lightResult,
    };
  });
  if (results.drawProbability > 0) {
    outcomes.push({
      label: 'Draw',
      probability: results.drawProbability,
      className: resultClassNameForFleet(null, true),
      color: undefined,
      lightColor: undefined,
    });
  }

  const leader = outcomes.reduce((best, outcome) =>
    outcome.probability > best.probability ? outcome : best
  );
  const verdict = bar.querySelector('.live-verdict')!;
  verdict.textContent = `${leader.label} ${(leader.probability * 100).toFixed(1)}%`;
  verdict.className = `live-verdict ${leader.className}`;
  (verdict as HTMLElement).style.setProperty(
    '--fleet-result-source',
    leader.color ?? ''
  );
  (verdict as HTMLElement).style.setProperty(
    '--fleet-result-light-source',
    leader.lightColor ?? ''
  );
  bar.setAttribute(
    'aria-label',
    `View full results. ${leader.label} ${(leader.probability * 100).toFixed(1)} percent`
  );

  const odds = bar.querySelector('.live-odds')!;
  odds.innerHTML = '';
  outcomes
    .filter((outcome) => outcome.probability > 0)
    .forEach((outcome) => {
      const segment = document.createElement('i');
      segment.className = outcome.className;
      segment.style.width = `${outcome.probability * 100}%`;
      segment.style.setProperty('--fleet-result-source', outcome.color ?? '');
      segment.style.setProperty(
        '--fleet-result-light-source',
        outcome.lightColor ?? ''
      );
      odds.appendChild(segment);
    });

  bar.hidden = false;
}

// The recent-battles dropdown: settled battles from this session, most recent
// first. Hidden until there is something to pick.
function refreshRecentsPicker() {
  const select = document.getElementById(
    'recent-battles'
  ) as HTMLSelectElement | null;
  const control = document.getElementById('recent-battles-control');
  if (!select) return;

  const recents = loadRecentBattles();
  if (control) control.hidden = recents.length === 0;
  select.innerHTML = '';

  // Keep this compact summary consistent with the surviving-fleet table.
  recents.forEach((recent) => {
    const option = document.createElement('option');
    option.value = recent.query;
    const fleets = parseBattleQuery(recent.query);
    option.textContent = fleets ? battleLabel(fleets, true) : recent.label;
    select.appendChild(option);
  });
  select.selectedIndex = -1;
}

function handleRouteChange() {
  const path = window.location.pathname;
  const homeContent = document.getElementById('home-content');
  const aboutContent = document.getElementById('about-content');
  const navLinks = document.querySelectorAll('.nav-link');

  if (!homeContent || !aboutContent) return;

  switch (path) {
    case '/':
      homeContent.style.display = 'block';
      aboutContent.style.display = 'none';
      break;
    case '/about':
      homeContent.style.display = 'none';
      aboutContent.style.display = 'block';
      break;
    default:
      // Preserve the query string: shared battle links carry their state there.
      window.history.replaceState(null, '', '/' + window.location.search);
      homeContent.style.display = 'block';
      aboutContent.style.display = 'none';
      break;
  }

  navLinks.forEach((link) => {
    link.classList.toggle('active', link.getAttribute('href') === path);
  });

  renderLiveBar();
}

let disposeInit: (() => void) | undefined;

function init(): () => void {
  disposeInit?.();
  const cleanups: Array<() => void> = [];
  const listen = (
    target: EventTarget,
    event: string,
    listener: EventListener
  ) => {
    target.addEventListener(event, listener);
    cleanups.push(() => target.removeEventListener(event, listener));
  };

  listen(document.getElementById('add-fleet-btn')!, 'click', addFleetHandler);
  listen(document.getElementById('clear-all-btn')!, 'click', clearAll);

  const controlsToggle = document.getElementById('steppers-toggle');
  const controlsToggleButtons = Array.from(
    controlsToggle?.querySelectorAll<HTMLButtonElement>('[data-controls]') ?? []
  );
  activeControlMode = loadControlMode();
  const applyActiveControlMode = () => {
    applyControlMode(activeControlMode);
    controlsToggleButtons.forEach((button) => {
      const active = button.dataset.controls === activeControlMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };
  applyActiveControlMode();
  controlsToggleButtons.forEach((button) => {
    listen(button, 'click', () => {
      const nextMode = button.dataset.controls as ControlMode;
      if (nextMode === activeControlMode) return;
      if (
        activeControlMode === 'ships' &&
        hasShipBlueprints() &&
        !window.confirm(
          'Changing control views converts every ship blueprint to combat stats. Part tiles and slot layouts will be lost. Continue?'
        )
      ) {
        return;
      }
      if (activeControlMode === 'ships') flattenShipBlueprints();
      activeControlMode = nextMode;
      if (activeControlMode === 'ships') initializeDefaultShipBlueprints();
      saveControlMode(activeControlMode);
      applyActiveControlMode();
      renderFleets();
    });
  });

  const themeSelect = document.getElementById(
    'theme-select'
  ) as HTMLSelectElement | null;
  const theme = loadThemePreference();
  applyThemePreference(theme);
  if (themeSelect) {
    themeSelect.value = theme;
    listen(themeSelect, 'change', () => {
      const nextTheme = themeSelect.value as ThemePreference;
      saveThemePreference(nextTheme);
      applyThemePreference(nextTheme);
    });
  }

  const recentsSelect = document.getElementById(
    'recent-battles'
  ) as HTMLSelectElement | null;
  if (recentsSelect) {
    listen(recentsSelect, 'change', () => {
      const fleets = parseBattleQuery(recentsSelect.value);
      recentsSelect.selectedIndex = -1;
      if (!fleets) return;
      replaceFleets(fleets);
      renderFleets();
    });
  }

  // Tapping the live bar jumps to the full report.
  const liveBar = document.getElementById('live-bar');
  if (liveBar) {
    listen(liveBar, 'click', () => {
      document
        .getElementById('results-container')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  const rerenderFleets = () => renderFleets();
  listen(document, 'fleet-removed', rerenderFleets);
  listen(document, 'fleet-order-changed', rerenderFleets);
  listen(document, 'fleet-metadata-changed', rerenderFleets);

  document.querySelectorAll('.nav-link').forEach((link) => {
    listen(link, 'click', (e) => {
      e.preventDefault();
      const href = (e.currentTarget as HTMLAnchorElement).getAttribute('href');
      if (href && href !== window.location.pathname) {
        // Carry the battle query along so navigating doesn't lose the setup.
        window.history.pushState(null, '', href + window.location.search);
        handleRouteChange();
      }
    });
  });

  cleanups.push(onFleetsChanged(syncBattleUrl));
  cleanups.push(onFleetsChanged(() => saveSetup(state.fleets)));
  cleanups.push(onFleetsChanged(scheduleAutoSimulate));

  // A battle in the URL wins; otherwise pick up where the last session left
  // off. Either path triggers an auto-simulate via the change notification.
  if (!loadSharedBattle() && !restoreSavedSetup()) {
    renderFleets();
  }
  if (activeControlMode === 'ships') {
    initializeDefaultShipBlueprints();
    renderFleets();
  }

  refreshRecentsPicker();
  handleRouteChange();
  listen(window, 'popstate', handleRouteChange);

  const dispose = () => {
    // A disposer may outlive the init that created it (for example during hot
    // reload). Once superseded it must not clear the active init's shared timer
    // or listeners.
    if (disposeInit !== dispose) return;
    clearTimeout(autoSimulateTimer);
    autoSimulateTimer = undefined;
    cleanups.splice(0).forEach((cleanup) => cleanup());
    disposeInit = undefined;
  };
  disposeInit = dispose;
  return dispose;
}

export { init };
