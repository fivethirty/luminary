import { CombatSimulator } from '@calc/combat-simulator';
import { computeExactBattle, EXACT_INTERACTIVE_CAPS } from '@calc/exact-combat';
import { Fleet } from '@calc/fleet';
import { Ship } from '@calc/ship';
import '@ui/components/fleet';
import type { FleetElement } from '@ui/components/fleet';
import '@ui/components/results';
import { state, addFleet, resetFleets, setSimulationResults } from '@ui/state';
import type { PlannerType } from '@ui/state';
import { DamageType } from 'src/constants';

const PLANNER_TYPE_TO_DAMAGE_TYPE: Record<PlannerType, DamageType> = {
  dps: DamageType.DPS,
  optimal: DamageType.OPTIMAL,
};

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

function simulate() {
  const activeElement = document.activeElement as HTMLElement;
  if (activeElement && activeElement.blur) {
    activeElement.blur();
  }

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
  // noise-free and identical on every run. Battles the solver can't handle
  // (3+ fleets, two optimal fleets, or a state graph over budget) fall back to
  // Monte Carlo.
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
        timeTaken: exact.timeTaken,
        method: 'exact',
      });
      renderResults();
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
    timeTaken: results.timeTaken,
    method: 'monte-carlo',
    iterations: MC_ITERATIONS,
  });

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
      window.history.replaceState(null, '', '/');
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
  document
    .getElementById('run-simulation-btn')!
    .addEventListener('click', simulate);
  document.getElementById('clear-all-btn')!.addEventListener('click', clearAll);

  document.addEventListener('fleet-removed', () => {
    renderFleets();
  });

  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const href = (e.currentTarget as HTMLAnchorElement).getAttribute('href');
      if (href && href !== window.location.pathname) {
        window.history.pushState(null, '', href);
        handleRouteChange();
      }
    });
  });

  renderFleets();

  handleRouteChange();
  window.addEventListener('popstate', handleRouteChange);
}

export { init };
