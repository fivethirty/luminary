import { CombatSimulator } from '@calc/combat-simulator';
import { computeExactBattle, EXACT_INTERACTIVE_CAPS } from '@calc/exact-combat';
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
} from '@ui/state';
import type { PlannerType } from '@ui/state';
import { battleLabel, encodeBattleQuery, parseBattleQuery } from '@ui/share';
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

  state.fleets.forEach((fleet, index) => {
    if (index === 0) {
      fleet.name = 'Defender';
    } else {
      const attackerCount = state.fleets.length - 1;
      if (attackerCount === 1) {
        fleet.name = 'Attacker';
      } else {
        fleet.name = `Attacker ${index}`;
      }
    }
  });

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

    fleetsContainer.appendChild(fleetElement);
  });
}

function addFleetHandler() {
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

// There is no Simulate button: every fleet change re-solves the battle after a
// short pause. Battles with an empty fleet clear the results instead, so stale
// odds never linger next to a half-edited setup.
function scheduleAutoSimulate() {
  clearTimeout(autoSimulateTimer);
  autoSimulateTimer = setTimeout(() => {
    const ready =
      state.fleets.length >= 2 &&
      state.fleets.every((fleet) => fleet.shipTypes.length > 0);
    if (ready) {
      simulate();
    } else {
      setSimulationResults(null);
      renderResults();
    }
  }, AUTO_SIMULATE_DELAY_MS);
}

function simulate() {
  const engineFleets = state.fleets.map((fleet) => {
    const ships: Ship[] = [];

    fleet.shipTypes.forEach((shipType) => {
      for (let i = 0; i < shipType.quantity; i++) {
        const ship = new Ship(shipType.type, shipType.config);
        ships.push(ship);
      }
    });

    return new Fleet(
      fleet.name,
      ships,
      fleet.antimatterSplitter,
      PLANNER_TYPE_TO_DAMAGE_TYPE[fleet.plannerType]
    );
  });

  // Two-fleet battles are solved exactly: every dice outcome's probability is
  // propagated through the state graph instead of sampled, so the numbers are
  // noise-free and identical on every run. Battles outside exact combat's
  // interactive budget, plus battles with 3+ fleets, fall back to Monte Carlo.
  if (engineFleets.length === 2) {
    const exact = computeExactBattle(
      engineFleets[0],
      engineFleets[1],
      EXACT_INTERACTIVE_CAPS
    );
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

// The sticky mobile bar: leading outcome plus a mini odds strip, always in
// thumb reach while editing. Hidden (via CSS) on wide screens and (via the
// hidden attribute) when there are no results.
function renderLiveBar() {
  const bar = document.getElementById('live-bar');
  if (!bar) return;

  const results = state.simulationResults;
  if (!results) {
    bar.hidden = true;
    return;
  }

  const outcomes = state.fleets.map((fleet, index) => ({
    label: fleet.name,
    probability: results.victoryProbability[fleet.name] ?? 0,
    className:
      index === 0
        ? 'defender-result'
        : `attacker-result${index > 1 ? ` attacker-result-${Math.min(index, 4)}` : ''}`,
  }));
  if (results.drawProbability > 0) {
    outcomes.push({
      label: 'Draw',
      probability: results.drawProbability,
      className: 'draw-result',
    });
  }

  const leader = outcomes.reduce((best, outcome) =>
    outcome.probability > best.probability ? outcome : best
  );
  const verdict = bar.querySelector('.live-verdict')!;
  verdict.textContent = `${leader.label} ${(leader.probability * 100).toFixed(1)}%`;
  verdict.className = `live-verdict ${leader.className}`;

  const odds = bar.querySelector('.live-odds')!;
  odds.innerHTML = '';
  outcomes
    .filter((outcome) => outcome.probability > 0)
    .forEach((outcome) => {
      const segment = document.createElement('i');
      segment.className = outcome.className;
      segment.style.width = `${outcome.probability * 100}%`;
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

export { init };
