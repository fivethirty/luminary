import { test, expect, beforeEach, describe } from 'bun:test';
import './index';
import type { ResultsElement } from './index';
import { resetFleets, setSimulationResults } from '@ui/state';

describe('Results', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetFleets();
    setSimulationResults(null);
  });

  test('component renders when simulation results exist', () => {
    setSimulationResults({
      victoryProbability: {
        Defender: 0.6,
        'Attacker 1': 0.4,
      },
      drawProbability: 0,
      expectedSurvivors: {},
      timeTaken: 1000,
    });

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    expect(element.style.display).not.toBe('none');

    const resultItems = element.querySelectorAll('.result-row');
    expect(resultItems.length).toBe(2);
  });

  test('displays fleets in their original order', () => {
    setSimulationResults({
      victoryProbability: {
        'Fleet A': 0.3,
        'Fleet B': 0.6,
        'Fleet C': 0.1,
      },
      drawProbability: 0,
      expectedSurvivors: {},
      timeTaken: 1000,
    });

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const resultItems = element.querySelectorAll('.result-row');
    const names = Array.from(resultItems).map(
      (item) => item.querySelector('.fleet-name')?.textContent
    );

    expect(names).toEqual(['Fleet A', 'Fleet B', 'Fleet C']);
  });

  test('displays percentages correctly', () => {
    setSimulationResults({
      victoryProbability: {
        Defender: 0.753,
        Attacker: 0.247,
      },
      drawProbability: 0,
      expectedSurvivors: {},
      timeTaken: 1000,
    });

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const percentages = Array.from(
      element.querySelectorAll('.win-percentage')
    ).map((el) => el.textContent);

    expect(percentages).toEqual(['75.3%', '24.7%']);
  });

  test('displays draw probability when present', () => {
    setSimulationResults({
      victoryProbability: {
        'Fleet A': 0.4,
        'Fleet B': 0.35,
      },
      drawProbability: 0.25,
      expectedSurvivors: {},
      timeTaken: 1000,
    });

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const resultItems = element.querySelectorAll('.result-row');
    expect(resultItems.length).toBe(3); // 2 fleets + draw

    const drawItem = element.querySelector('.result-row.draw');
    expect(drawItem).not.toBeNull();

    const drawName = drawItem!.querySelector('.fleet-name')?.textContent;
    expect(drawName).toBe('Draw');

    const drawPercent = drawItem!.querySelector('.win-percentage')?.textContent;
    expect(drawPercent).toBe('25.0%');
  });

  test('hides draw when probability is 0', () => {
    setSimulationResults({
      victoryProbability: {
        'Fleet A': 0.6,
        'Fleet B': 0.4,
      },
      drawProbability: 0,
      expectedSurvivors: {},
      timeTaken: 1000,
    });

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const drawItem = element.querySelector('.result-row.draw');
    expect(drawItem).toBeNull();
  });

  test('displays expected survivors', () => {
    setSimulationResults({
      victoryProbability: { Defender: 1.0 },
      drawProbability: 0,
      expectedSurvivors: {
        Defender: {
          Interceptor: 2.5,
          Cruiser: 1.2,
          Dreadnaught: 0.8,
        },
      },
      timeTaken: 1000,
    });

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const survivorsSection = element.querySelector(
      '#survivors-section'
    ) as HTMLElement;
    expect(survivorsSection.style.display).toBe('block');

    const fleetSurvivors = element.querySelectorAll('.survivor-fleet-card');
    expect(fleetSurvivors.length).toBe(1);

    const shipItems = element.querySelectorAll('.survivor-ships-tbody tr');
    expect(shipItems.length).toBe(3);

    // Check ship counts are formatted correctly
    const shipCounts = Array.from(
      element.querySelectorAll('.survivor-ships-tbody td:nth-child(2)')
    ).map((el) => el.textContent);
    expect(shipCounts).toEqual(['2.5', '1.2', '0.8']);
  });

  test('hides survivors section when no survivors', () => {
    setSimulationResults({
      victoryProbability: { 'Fleet A': 0.5, 'Fleet B': 0.5 },
      drawProbability: 0,
      expectedSurvivors: {
        'Fleet A': {},
        'Fleet B': {},
      },
      timeTaken: 1000,
    });

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const survivorsSection = element.querySelector(
      '#survivors-section'
    ) as HTMLElement;
    expect(survivorsSection.style.display).toBe('none');
  });

  test('filters out ships with 0 survivors', () => {
    setSimulationResults({
      victoryProbability: { Fleet: 1.0 },
      drawProbability: 0,
      expectedSurvivors: {
        Fleet: {
          Interceptor: 2.0,
          Cruiser: 0,
          Dreadnaught: 1.0,
        },
      },
      timeTaken: 1000,
    });

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const shipItems = element.querySelectorAll('.survivor-ships-tbody tr');
    expect(shipItems.length).toBe(2);

    const shipTypes = Array.from(
      element.querySelectorAll('.survivor-ships-tbody td:nth-child(1)')
    ).map((el) => el.textContent);
    expect(shipTypes).toEqual(['Interceptor', 'Dreadnaught']);
  });

  test('displays progress bars with correct widths', () => {
    setSimulationResults({
      victoryProbability: {
        'Fleet A': 0.75,
        'Fleet B': 0.25,
      },
      drawProbability: 0,
      expectedSurvivors: {},
      timeTaken: 1000,
    });

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const bars = element.querySelectorAll(
      '.win-bar-fill'
    ) as NodeListOf<HTMLElement>;
    expect(bars[0].style.width).toBe('75%');
    expect(bars[1].style.width).toBe('25%');
  });
});
