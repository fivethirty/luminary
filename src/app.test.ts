import { test, expect, beforeEach, describe } from 'bun:test';
import '../happydom';
import { state, resetFleets, setSimulationResults } from '@ui/state';
import { init } from './app';
import indexHtml from './index.html' with { type: 'text' };

describe('App', () => {
  beforeEach(() => {
    resetFleets();
    setSimulationResults(null);
    document.documentElement.innerHTML = indexHtml;
    init();
  });

  test('initializes with default fleets', () => {
    expect(state.fleets.length).toBe(2);
    expect(state.fleets[0].name).toBe('Defender');
    expect(state.fleets[1].name).toBe('Attacker');

    const fleetElements = document.querySelectorAll('calc-fleet');
    expect(fleetElements.length).toBe(2);
  });

  test('add fleet button creates new fleet', () => {
    const addBtn = document.getElementById(
      'add-fleet-btn'
    ) as HTMLButtonElement;

    addBtn.click();

    expect(state.fleets.length).toBe(3);
    expect(state.fleets[2].name).toBe('Attacker 2');

    const fleetElements = document.querySelectorAll('calc-fleet');
    expect(fleetElements.length).toBe(3);
  });

  test('clear all button resets to default state', () => {
    const addBtn = document.getElementById(
      'add-fleet-btn'
    ) as HTMLButtonElement;
    addBtn.click();
    addBtn.click();
    expect(state.fleets.length).toBe(4);

    setSimulationResults({
      victoryProbability: { Defender: 0.5, 'Attacker 1': 0.5 },
      drawProbability: 0,
      expectedSurvivors: {},
      timeTaken: 1000,
    });

    const clearBtn = document.getElementById(
      'clear-all-btn'
    ) as HTMLButtonElement;
    clearBtn.click();

    expect(state.fleets.length).toBe(2);
    expect(state.fleets[0].name).toBe('Defender');
    expect(state.fleets[1].name).toBe('Attacker');
    expect(state.simulationResults).toBeNull();

    const fleetElements = document.querySelectorAll('calc-fleet');
    expect(fleetElements.length).toBe(2);
  });

  test('run simulation creates results', () => {
    state.fleets[0].shipTypes.push({
      id: 'ship-1',
      type: 'Interceptor',
      quantity: 3,
      config: {
        cannons: { ion: 1 },
      },
    });
    state.fleets[1].shipTypes.push({
      id: 'ship-2',
      type: 'Cruiser',
      quantity: 2,
      config: {
        cannons: { ion: 1 },
        hull: 1,
      },
    });

    const runBtn = document.getElementById(
      'run-simulation-btn'
    ) as HTMLButtonElement;
    runBtn.click();

    expect(state.simulationResults).not.toBeNull();
    expect(state.simulationResults!.victoryProbability).toBeDefined();
    expect(state.simulationResults!.drawProbability).toBeDefined();
    expect(state.simulationResults!.expectedSurvivors).toBeDefined();

    const resultsContainer = document.getElementById('results-container')!;
    const resultsElement = resultsContainer.querySelector('calc-results');
    expect(resultsElement).not.toBeNull();
  });
});
