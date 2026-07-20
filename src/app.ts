import { CombatSimulator } from '@calc/combat-simulator';
import {
  computeExactCombat,
  exactDpsPlannerOverrides,
  EXACT_INTERACTIVE_CAPS,
} from '@calc/exact-combat';
import { Fleet } from '@calc/fleet';
import { Ship } from '@calc/ship';
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
  isNpcFleet,
} from '@ui/state';
import type { PlannerType } from '@ui/state';
import { battleLabel, encodeBattleQuery, parseBattleQuery } from '@ui/share';
import { factionLabel, fleetColor, MAX_FLEETS } from '@ui/fleet-metadata';
import {
  applySteppersPreference,
  loadSteppersPreference,
  saveSteppersPreference,
} from '@ui/preferences';
import {
  loadRecentBattles,
  loadSetup,
  recordRecentBattle,
  saveSetup,
} from '@ui/storage';
import { DamageType } from 'src/constants';

const PLANNER_TYPE_TO_DAMAGE_TYPE: Record<PlannerType, DamageType> = {
  dps: DamageType.DPS,
  optimal: DamageType.OPTIMAL,
};

// Results recompute automatically shortly after the last edit; the pause keeps
// hold-to-repeat steppers from re-solving on every tick.
const AUTO_SIMULATE_DELAY_MS = 200;

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

function roleName(index: number): string {
  if (index === 0) return 'Defender';

  const attackerCount = state.fleets.length - 1;
  if (attackerCount === 1) return 'Attacker';
  return `Attacker ${index}`;
}

function baseFleetName(fleet: (typeof state.fleets)[number], index: number) {
  return index === 0 && isNpcFleet(fleet)
    ? 'The Ancients'
    : (factionLabel(fleet.factionId) ?? roleName(index));
}

function updateFleetNames() {
  const baseNames = state.fleets.map(baseFleetName);
  const nameCounts = new Map<string, number>();
  baseNames.forEach((name) =>
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1)
  );
  const seenNames = new Map<string, number>();

  state.fleets.forEach((fleet, index) => {
    const baseName = baseNames[index];
    const occurrence = (seenNames.get(baseName) ?? 0) + 1;
    seenNames.set(baseName, occurrence);
    fleet.name =
      (nameCounts.get(baseName) ?? 0) > 1
        ? `${baseName} ${occurrence}`
        : baseName;
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

  // Exact combat propagates every dice outcome through the same adjacent-fleet
  // battle order as MultiBattle. Battles outside the interactive budget fall
  // back to Monte Carlo.
  const exact = computeExactCombat(engineFleets, EXACT_INTERACTIVE_CAPS);
  if (exact.ok) {
    setSimulationResults({
      victoryProbability: exact.lastFleetStanding,
      drawProbability: exact.drawPercentage,
      expectedSurvivors: exact.expectedSurvivors as Record<
        string,
        Record<string, number>
      >,
      survivorDistribution: exact.survivorDistribution as {
        probability: number;
        survivors: Record<string, Record<string, number>>;
      }[],
      timeTaken: exact.timeTaken,
      method: 'exact',
    });
    afterSimulate();
    return;
  }

  const MC_ITERATIONS = 5000;
  const simulator = new CombatSimulator();
  const results = simulator.simulate(engineFleets, MC_ITERATIONS);

  setSimulationResults({
    victoryProbability: results.lastFleetStanding,
    drawProbability: results.drawPercentage,
    expectedSurvivors: results.expectedSurvivors,
    survivorDistribution: results.survivorDistribution as {
      probability: number;
      survivors: Record<string, Record<string, number>>;
    }[],
    timeTaken: results.timeTaken,
    method: 'monte-carlo',
    iterations: MC_ITERATIONS,
  });

  afterSimulate();
}

function buildEngineFleets(
  plannerOverrides: readonly (DamageType | undefined)[] = []
): Fleet[] {
  return state.fleets.flatMap((fleet, index) => {
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
        fleet.name,
        ships,
        fleet.antimatterSplitter,
        plannerOverrides[index] ??
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
// editing. Hidden when there are no results.
function renderLiveBar() {
  const bar = document.getElementById('live-bar');
  if (!bar) return;

  const results = state.simulationResults;
  if (!results) {
    bar.hidden = true;
    return;
  }

  const outcomes: Array<{
    label: string;
    probability: number;
    className: string;
    color?: string;
  }> = state.fleets.map((fleet, index) => ({
    label: fleet.name,
    probability: results.victoryProbability[fleet.name] ?? 0,
    className:
      index === 0
        ? 'defender-result'
        : `attacker-result${index > 1 ? ` attacker-result-${Math.min(index, 4)}` : ''}`,
    color: fleetColor(fleet.colorId, index).color,
  }));
  if (results.drawProbability > 0) {
    outcomes.push({
      label: 'Draw',
      probability: results.drawProbability,
      className: 'draw-result',
      color: undefined,
    });
  }

  const leader = outcomes.reduce((best, outcome) =>
    outcome.probability > best.probability ? outcome : best
  );
  const verdict = bar.querySelector('.live-verdict')!;
  verdict.textContent = `${leader.label} ${(leader.probability * 100).toFixed(1)}%`;
  verdict.className = `live-verdict ${leader.className}`;
  (verdict as HTMLElement).style.color = leader.color ?? '';

  const odds = bar.querySelector('.live-odds')!;
  odds.innerHTML = '';
  outcomes
    .filter((outcome) => outcome.probability > 0)
    .forEach((outcome) => {
      const segment = document.createElement('i');
      segment.className = outcome.className;
      segment.style.width = `${outcome.probability * 100}%`;
      segment.style.color = outcome.color ?? '';
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
  if (!select) return;

  const recents = loadRecentBattles();
  select.hidden = recents.length === 0;
  select.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Recent battles…';
  select.appendChild(placeholder);

  // A width:auto <select> grows to fit its widest option, so multi-fleet
  // matchups overflow on phones. Abbreviate ship names on narrow screens to
  // keep the picker compact.
  const short =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 42rem)').matches;
  recents.forEach((recent) => {
    const option = document.createElement('option');
    option.value = recent.query;
    const fleets = parseBattleQuery(recent.query);
    option.textContent = fleets ? battleLabel(fleets, short) : recent.label;
    select.appendChild(option);
  });
  select.value = '';
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
}

function init() {
  document
    .getElementById('add-fleet-btn')!
    .addEventListener('click', addFleetHandler);
  document.getElementById('clear-all-btn')!.addEventListener('click', clearAll);

  const steppersToggle = document.getElementById('steppers-toggle');
  const steppersToggleButtons = Array.from(
    steppersToggle?.querySelectorAll<HTMLButtonElement>('[data-steppers]') ?? []
  );
  const steppersEnabled = loadSteppersPreference();
  const setSteppersEnabled = (enabled: boolean) => {
    applySteppersPreference(enabled);
    steppersToggleButtons.forEach((button) => {
      const active = button.dataset.steppers === (enabled ? 'on' : 'off');
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };
  setSteppersEnabled(steppersEnabled);
  steppersToggleButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const enabled = button.dataset.steppers === 'on';
      saveSteppersPreference(enabled);
      setSteppersEnabled(enabled);
    });
  });

  const recentsSelect = document.getElementById(
    'recent-battles'
  ) as HTMLSelectElement | null;
  recentsSelect?.addEventListener('change', () => {
    const fleets = parseBattleQuery(recentsSelect.value);
    recentsSelect.value = '';
    if (!fleets) return;
    replaceFleets(fleets);
    renderFleets();
  });

  // Tapping the live bar jumps to the full report.
  document.getElementById('live-bar')?.addEventListener('click', () => {
    document
      .getElementById('results-container')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.addEventListener('fleet-removed', () => {
    renderFleets();
  });
  document.addEventListener('fleet-order-changed', () => {
    renderFleets();
  });
  document.addEventListener('fleet-metadata-changed', () => {
    renderFleets();
  });

  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const href = (e.currentTarget as HTMLAnchorElement).getAttribute('href');
      if (href && href !== window.location.pathname) {
        // Carry the battle query along so navigating doesn't lose the setup.
        window.history.pushState(null, '', href + window.location.search);
        handleRouteChange();
      }
    });
  });

  onFleetsChanged(syncBattleUrl);
  onFleetsChanged(() => saveSetup(state.fleets));
  onFleetsChanged(scheduleAutoSimulate);

  // A battle in the URL wins; otherwise pick up where the last session left
  // off. Either path triggers an auto-simulate via the change notification.
  if (!loadSharedBattle() && !restoreSavedSetup()) {
    renderFleets();
  }

  refreshRecentsPicker();
  handleRouteChange();
  window.addEventListener('popstate', handleRouteChange);
}

export { init, exactDpsPlannerOverrides };
