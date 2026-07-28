import type { CombatRunResult } from '@calc/combat-runner';
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
} from '@ui/state';
import type { SurvivorDistributionEntry } from '@ui/state';
import { battleLabel, encodeBattleQuery, parseBattleQuery } from '@ui/share';
import {
  deriveFleetNames,
  deriveShortFleetNames,
  fleetColor,
  MAX_FLEETS,
} from '@ui/fleet-metadata';
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
import {
  BrowserCombatClient,
  isCombatCancelledError,
  type CombatClient,
} from '@ui/combat-client';
import {
  buildEngineFleets,
  snapshotCombatFleets,
  type CombatFleetInput,
} from '@ui/combat-fleets';

// Results recompute automatically shortly after the last edit; the pause keeps
// hold-to-repeat steppers from re-solving on every tick.
const AUTO_SIMULATE_DELAY_MS = 200;
let activeControlMode: ControlMode = 'steppers';
let combatClient: CombatClient | undefined;
let combatRequestVersion = 0;
let combatStatus: 'idle' | 'updating' | 'error' = 'idle';
let combatClientFactory: () => CombatClient = () => new BrowserCombatClient();

function setCombatClientFactoryForTests(factory?: () => CombatClient) {
  combatClientFactory = factory ?? (() => new BrowserCombatClient());
}

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

function refreshFleetMetadata() {
  updateFleetNames();
  document
    .querySelectorAll<FleetElement>('#fleets > calc-fleet')
    .forEach((fleetElement) => fleetElement.refreshMetadata());
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
function setCombatStatus(status: typeof combatStatus) {
  combatStatus = status;
  const section = document.querySelector('.results-section');
  const statusElement = document.getElementById('results-status');
  section?.setAttribute('aria-busy', String(status === 'updating'));

  if (statusElement) {
    statusElement.hidden = status === 'idle';
    statusElement.classList.toggle('results-status--error', status === 'error');
    statusElement.textContent =
      status === 'updating'
        ? 'Updating odds…'
        : status === 'error'
          ? 'Unable to calculate odds. Change the setup to try again.'
          : '';
  }

  renderLiveBar();
}

function scheduleAutoSimulate() {
  clearTimeout(autoSimulateTimer);
  combatClient?.cancel();
  const requestVersion = ++combatRequestVersion;
  updateFleetNames();
  const ready = state.fleets.filter(fleetHasShips).length >= 2;

  if (!ready) {
    setSimulationResults(null);
    renderResults();
    setCombatStatus('idle');
    return;
  }

  setCombatStatus('updating');
  autoSimulateTimer = setTimeout(() => {
    void simulate(requestVersion);
  }, AUTO_SIMULATE_DELAY_MS);
}

async function simulate(requestVersion: number) {
  updateFleetNames();
  const fleetInputs = snapshotCombatFleets(state.fleets);

  try {
    const result = await combatClient!.run(fleetInputs);
    if (requestVersion !== combatRequestVersion) return;
    applySimulationResult(result, fleetInputs);
    afterSimulate();
    setCombatStatus('idle');
  } catch (error) {
    if (
      requestVersion !== combatRequestVersion ||
      isCombatCancelledError(error)
    ) {
      return;
    }
    console.error('Unable to calculate combat odds', error);
    setCombatStatus('error');
  }
}

function applySimulationResult(
  result: CombatRunResult,
  fleetInputs: readonly CombatFleetInput[]
) {
  const engineFleets = buildEngineFleets(fleetInputs);
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

  const shortFleetNames = deriveShortFleetNames(state.fleets);
  const outcomes: Array<{
    label: string;
    probability: number;
    className: string;
    color?: string;
    lightColor?: string;
  }> = state.fleets.map((fleet, index) => {
    const color = fleetColor(fleet.colorId, index);
    return {
      label: shortFleetNames[index],
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
  const resultSummary = `${leader.label} ${(leader.probability * 100).toFixed(1)} percent`;
  const liveLabel = bar.querySelector('.live-label')!;
  if (combatStatus === 'updating') {
    bar.dataset.status = 'updating';
    liveLabel.textContent = 'Updating odds';
    bar.setAttribute(
      'aria-label',
      `Updating odds. Showing previous result: ${resultSummary}`
    );
  } else if (combatStatus === 'error') {
    bar.dataset.status = 'error';
    liveLabel.textContent = 'Previous odds';
    bar.setAttribute(
      'aria-label',
      `Calculation failed. View previous result: ${resultSummary}`
    );
  } else {
    delete bar.dataset.status;
    liveLabel.textContent = 'Live odds';
    bar.setAttribute('aria-label', `View full results. ${resultSummary}`);
  }

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
      homeContent.hidden = false;
      aboutContent.hidden = true;
      break;
    case '/about':
      homeContent.hidden = true;
      aboutContent.hidden = false;
      break;
    default:
      // Preserve the query string: shared battle links carry their state there.
      window.history.replaceState(null, '', '/' + window.location.search);
      homeContent.hidden = false;
      aboutContent.hidden = true;
      break;
  }

  navLinks.forEach((link) => {
    const active = link.getAttribute('href') === path;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  renderLiveBar();
}

let disposeInit: (() => void) | undefined;

function init(): () => void {
  disposeInit?.();
  combatClient = combatClientFactory();
  combatRequestVersion++;
  setCombatStatus('idle');
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
  const changeControlMode = (nextMode: ControlMode) => {
    activeControlMode = nextMode;
    saveControlMode(activeControlMode);
    applyActiveControlMode();
    renderFleets();
  };
  applyActiveControlMode();
  controlsToggleButtons.forEach((button) => {
    listen(button, 'click', () => {
      const nextMode = button.dataset.controls as ControlMode;
      if (nextMode === activeControlMode) return;
      changeControlMode(nextMode);
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
  listen(document, 'fleet-metadata-changed', refreshFleetMetadata);

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
    combatRequestVersion++;
    combatClient?.dispose();
    combatClient = undefined;
    cleanups.splice(0).forEach((cleanup) => cleanup());
    disposeInit = undefined;
  };
  disposeInit = dispose;
  return dispose;
}

export { init, setCombatClientFactoryForTests };
