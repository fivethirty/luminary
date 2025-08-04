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
    // Set up simulation results
    setSimulationResults({
      victoryProbability: {
        Defender: 0.6,
        'Attacker 1': 0.4,
      },
      drawProbability: 0,
      expectedSurvivors: {},
    });

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    // Should be visible
    expect(element.style.display).not.toBe('none');

    // Should render victory probabilities
    const resultItems = element.querySelectorAll('.result-item');
    expect(resultItems.length).toBe(2);
  });

  test('displays fleets sorted by win percentage', () => {
    setSimulationResults({
      victoryProbability: {
        'Fleet A': 0.3,
        'Fleet B': 0.6,
        'Fleet C': 0.1,
      },
      drawProbability: 0,
      expectedSurvivors: {},
    });

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const resultItems = element.querySelectorAll('.result-item');
    const names = Array.from(resultItems).map(
      (item) => item.querySelector('.result-name')?.textContent
    );

    // Should be sorted by percentage descending
    expect(names).toEqual(['Fleet B:', 'Fleet A:', 'Fleet C:']);
  });

  test('displays percentages correctly', () => {
    setSimulationResults({
      victoryProbability: {
        Defender: 0.753,
        Attacker: 0.247,
      },
      drawProbability: 0,
      expectedSurvivors: {},
    });

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const percentages = Array.from(
      element.querySelectorAll('.result-percentage')
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
    });

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const resultItems = element.querySelectorAll('.result-item');
    expect(resultItems.length).toBe(3); // 2 fleets + draw

    const drawItem = element.querySelector('.result-item.draw');
    expect(drawItem).not.toBeNull();

    const drawName = drawItem!.querySelector('.result-name')?.textContent;
    expect(drawName).toBe('Draw:');

    const drawPercent =
      drawItem!.querySelector('.result-percentage')?.textContent;
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
    });

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const drawItem = element.querySelector('.result-item.draw');
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
    });

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const survivorsSection = element.querySelector(
      '#survivors-section'
    ) as HTMLElement;
    expect(survivorsSection.style.display).toBe('block');

    const fleetSurvivors = element.querySelectorAll('.fleet-survivors');
    expect(fleetSurvivors.length).toBe(1);

    const shipItems = element.querySelectorAll('.ship-survivor-item');
    expect(shipItems.length).toBe(3);

    // Check ship counts are formatted correctly
    const shipCounts = Array.from(element.querySelectorAll('.ship-count')).map(
      (el) => el.textContent
    );
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
          Cruiser: 0, // Should not be displayed
          Dreadnaught: 1.0,
        },
      },
    });

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const shipItems = element.querySelectorAll('.ship-survivor-item');
    expect(shipItems.length).toBe(2); // Only 2 ships with non-zero survivors

    const shipTypes = Array.from(element.querySelectorAll('.ship-type')).map(
      (el) => el.textContent
    );
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
    });

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const bars = element.querySelectorAll(
      '.result-bar-fill'
    ) as NodeListOf<HTMLElement>;
    expect(bars[0].style.width).toBe('75%');
    expect(bars[1].style.width).toBe('25%');
  });
});
