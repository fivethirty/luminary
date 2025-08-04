import { CombatSimulator } from '@calc/combat-simulator';
import { Fleet } from '@calc/fleet';
import { Ship } from '@calc/ship';
import '@ui/components/fleet';
import type { FleetElement } from '@ui/components/fleet';
import '@ui/components/results';
import { state, addFleet, resetFleets, setSimulationResults } from '@ui/state';

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
  const engineFleets = state.fleets
    .map((fleet) => {
      const ships: Ship[] = [];

      fleet.shipTypes.forEach((shipType) => {
        for (let i = 0; i < shipType.quantity; i++) {
          ships.push(new Ship(shipType.type, shipType.config));
        }
      });

      return new Fleet(fleet.name, ships);
    })
    .reverse();

  const simulator = new CombatSimulator();
  const results = simulator.simulate(engineFleets, 5000);

  setSimulationResults({
    victoryProbability: results.lastFleetStanding,
    drawProbability: results.drawPercentage,
    expectedSurvivors: results.expectedSurvivors,
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
  const hash = window.location.hash || '#/';
  const homeContent = document.getElementById('home-content');
  const aboutContent = document.getElementById('about-content');
  const navLinks = document.querySelectorAll('.nav-link');

  if (!homeContent || !aboutContent) return;

  navLinks.forEach((link) => {
    link.classList.toggle('active', link.getAttribute('href') === hash);
  });

  if (hash === '#/about') {
    homeContent.style.display = 'none';
    aboutContent.style.display = 'block';
  } else {
    homeContent.style.display = 'block';
    aboutContent.style.display = 'none';
  }
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

  renderFleets();

  handleRouteChange();
  window.addEventListener('hashchange', handleRouteChange);
}

export { init };
