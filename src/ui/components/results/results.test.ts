import { test, expect, beforeEach, describe } from 'bun:test';
import './index';
import type { ResultsElement } from './index';
import { addFleet, resetFleets, setSimulationResults, state } from '@ui/state';
import { exactResults, monteCarloResults } from '@ui/test-helpers';

describe('Results', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetFleets();
    setSimulationResults(null);
  });

  test('component renders when simulation results exist', () => {
    setSimulationResults(
      monteCarloResults({
        victoryProbability: {
          Defender: 0.6,
          'Attacker 1': 0.4,
        },
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    expect(element.style.display).not.toBe('none');

    const oddsSegments = element.querySelectorAll('.odds-segment');
    expect(oddsSegments.length).toBe(2);
  });

  test('displays fleets in their original order', () => {
    setSimulationResults(
      monteCarloResults({
        victoryProbability: {
          'Fleet A': 0.3,
          'Fleet B': 0.6,
          'Fleet C': 0.1,
        },
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const oddsSegments = element.querySelectorAll('.odds-segment');
    const names = Array.from(oddsSegments).map(
      (segment) => segment.querySelector('span')?.textContent
    );

    expect(names).toEqual(['Fleet A', 'Fleet B', 'Fleet C']);
  });

  test('displays percentages correctly', () => {
    setSimulationResults(
      monteCarloResults({
        victoryProbability: {
          Defender: 0.753,
          Attacker: 0.247,
        },
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const percentages = Array.from(
      element.querySelectorAll('.odds-segment')
    ).map((segment) => segment.getAttribute('aria-label'));

    expect(percentages).toEqual(['Defender: 75.3%', 'Attacker: 24.7%']);
  });

  test('omits zero-probability fleets from victory odds', () => {
    setSimulationResults(
      monteCarloResults({
        victoryProbability: {
          Defender: 0.7,
          Attacker: 0.3,
          'Attacker 2': 0,
        },
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const names = Array.from(element.querySelectorAll('.odds-segment')).map(
      (segment) => segment.querySelector('span')?.textContent
    );
    const oddsLabels = Array.from(
      element.querySelectorAll('.odds-segment')
    ).map((segment) => segment.querySelector('span')?.textContent);

    expect(names).toEqual(['Defender', 'Attacker']);
    expect(oddsLabels).toEqual(['Defender', 'Attacker']);
  });

  test('compacts low-probability odds strip labels', () => {
    addFleet();
    state.fleets[2].name = 'Attacker 2';
    setSimulationResults(
      monteCarloResults({
        victoryProbability: {
          Defender: 0.92,
          Attacker: 0.06,
          'Attacker 2': 0.02,
        },
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const segments = element.querySelectorAll('.odds-segment');
    const tightSegment = segments[1];
    const sliverSegment = segments[2];

    expect(tightSegment.classList.contains('odds-segment--percent-only')).toBe(
      true
    );
    expect(tightSegment.querySelector('strong')?.hidden).toBe(false);
    expect(tightSegment.querySelector('span')?.hidden).toBe(true);

    expect(sliverSegment.classList.contains('odds-segment--sliver')).toBe(true);
    expect(sliverSegment.querySelector('strong')?.hidden).toBe(true);
    expect(sliverSegment.querySelector('span')?.hidden).toBe(true);
    expect(sliverSegment.getAttribute('aria-label')).toBe('Attacker 2: 2.0%');
  });

  test('leads with a verdict headline and tag', () => {
    setSimulationResults(
      exactResults({
        victoryProbability: { Defender: 0.266, Attacker: 0.734 },
        timeTaken: 5,
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const headline = element.querySelector('.verdict-headline')!;
    expect(headline.textContent).toBe('Attacker favored');
    expect(headline.classList.contains('attacker-result')).toBe(true);

    const tag = element.querySelector('.verdict-tag') as HTMLElement;
    expect(tag.textContent).toBe('Clear edge');
    expect(tag.hidden).toBe(false);

    expect(element.querySelector('.verdict-number')).toBeNull();
    expect(element.querySelector('.verdict-caption')).toBeNull();
  });

  test('uses distinct color classes for multiple attackers', () => {
    addFleet();
    state.fleets[2].name = 'Attacker 2';
    setSimulationResults(
      monteCarloResults({
        victoryProbability: {
          Defender: 0.25,
          Attacker: 0.35,
          'Attacker 2': 0.4,
        },
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const segments = element.querySelectorAll('.odds-segment');
    expect(segments[1].classList.contains('attacker-result')).toBe(true);
    expect(segments[1].classList.contains('attacker-result-2')).toBe(false);
    expect(segments[2].classList.contains('attacker-result-2')).toBe(true);
  });

  test('displays draw probability when present', () => {
    setSimulationResults(
      monteCarloResults({
        victoryProbability: {
          'Fleet A': 0.4,
          'Fleet B': 0.35,
        },
        drawProbability: 0.25,
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const oddsSegments = element.querySelectorAll('.odds-segment');
    expect(oddsSegments.length).toBe(3); // 2 fleets + draw

    const drawItem = element.querySelector('.odds-segment.draw-result');
    expect(drawItem).not.toBeNull();

    const drawName = drawItem!.querySelector('span')?.textContent;
    expect(drawName).toBe('Draw');

    expect(drawItem!.getAttribute('aria-label')).toBe('Draw: 25.0%');
  });

  test('lists the defender first even when results arrive attacker-first', () => {
    // Default fleets are Defender (fleet 0) and Attacker; the producer here
    // inserts Attacker first, as the exact path historically did.
    setSimulationResults(
      exactResults({
        victoryProbability: {
          Attacker: 0.55,
          Defender: 0.45,
        },
        timeTaken: 10,
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const names = Array.from(element.querySelectorAll('.odds-segment')).map(
      (segment) => segment.querySelector('span')?.textContent
    );
    expect(names).toEqual(['Defender', 'Attacker']);
  });

  test('keeps unknown fleet names in insertion order after known fleets', () => {
    setSimulationResults(
      exactResults({
        victoryProbability: {
          'Detached Fleet B': 0.1,
          Attacker: 0.3,
          'Detached Fleet A': 0.2,
          Defender: 0.4,
        },
        timeTaken: 10,
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const names = Array.from(element.querySelectorAll('.odds-segment')).map(
      (segment) => segment.querySelector('span')?.textContent
    );
    expect(names).toEqual([
      'Defender',
      'Attacker',
      'Detached Fleet B',
      'Detached Fleet A',
    ]);
  });

  test('labels exact results as deterministic', () => {
    setSimulationResults(
      exactResults({
        victoryProbability: { 'Fleet A': 0.6, 'Fleet B': 0.4 },
        timeTaken: 42,
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const label = element.querySelector('.results-time')?.textContent;
    expect(label).toContain('Exact');
    expect(label).toContain('deterministic');
    expect(label).not.toContain('Monte Carlo');
  });

  test('labels Monte Carlo results with the iteration count', () => {
    setSimulationResults(
      monteCarloResults({
        victoryProbability: { 'Fleet A': 0.6, 'Fleet B': 0.4 },
        timeTaken: 42,
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const label = element.querySelector('.results-time')?.textContent;
    expect(label).toContain('Monte Carlo');
    expect(label).toContain('5,000 iterations');
    expect(label).not.toContain('Exact');
  });

  test('hides draw when probability is 0', () => {
    setSimulationResults(
      monteCarloResults({
        victoryProbability: {
          'Fleet A': 0.6,
          'Fleet B': 0.4,
        },
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const drawItem = element.querySelector('.odds-segment.draw-result');
    expect(drawItem).toBeNull();
  });

  test('displays expected survivors', () => {
    setSimulationResults(
      monteCarloResults({
        victoryProbability: { Defender: 1.0 },
        expectedSurvivors: {
          Defender: {
            Interceptor: 2.5,
            Cruiser: 1.2,
            Dreadnought: 0.8,
          },
        },
      })
    );

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

  test('displays survivor composition distribution', () => {
    setSimulationResults(
      exactResults({
        victoryProbability: { Defender: 0.35, Attacker: 0.65 },
        survivorDistribution: [
          {
            probability: 0.42,
            survivors: {
              Defender: {},
              Attacker: {
                Interceptor: 2,
                Starbase: 1,
                Cruiser: 1,
                Orbital: 1,
                Dreadnought: 1,
              },
            },
          },
          {
            probability: 0.24,
            survivors: {
              Defender: { Ancient: 1 },
              Attacker: {},
            },
          },
        ],
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const rows = element.querySelectorAll('#survivor-distribution-tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].querySelector('td:last-child')?.textContent).toBe(
      'D, C, 2 I, O, S'
    );
    expect(rows[0].textContent).not.toContain('Interceptor');
    expect(rows[0].textContent).not.toContain('Cruiser');
    expect(rows[0].textContent).toContain('42.0%');
    expect(rows[1].textContent).toContain('Anc');
    expect(rows[1].textContent).toContain('24.0%');
  });

  test('colors survivor composition attackers by fleet', () => {
    addFleet();
    state.fleets[2].name = 'Attacker 2';
    setSimulationResults(
      exactResults({
        victoryProbability: { Defender: 0.2, Attacker: 0.3, 'Attacker 2': 0.5 },
        survivorDistribution: [
          {
            probability: 0.5,
            survivors: {
              Defender: {},
              Attacker: {},
              'Attacker 2': { Cruiser: 1 },
            },
          },
        ],
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const row = element.querySelector('#survivor-distribution-tbody tr')!;
    const attackerLabel = row.querySelector('td:last-child span')!;
    expect(row.classList.contains('attacker-result-2')).toBe(true);
    expect(attackerLabel.classList.contains('attacker-result-2')).toBe(true);
  });

  test('hides survivors section when no survivors', () => {
    setSimulationResults(
      monteCarloResults({
        victoryProbability: { 'Fleet A': 0.5, 'Fleet B': 0.5 },
        expectedSurvivors: {
          'Fleet A': {},
          'Fleet B': {},
        },
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const survivorsSection = element.querySelector(
      '#survivors-section'
    ) as HTMLElement;
    expect(survivorsSection.style.display).toBe('none');
  });

  test('filters out ships with 0 survivors', () => {
    setSimulationResults(
      monteCarloResults({
        victoryProbability: { Fleet: 1.0 },
        expectedSurvivors: {
          Fleet: {
            Interceptor: 2.0,
            Cruiser: 0,
            Dreadnought: 1.0,
          },
        },
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const shipItems = element.querySelectorAll('.survivor-ships-tbody tr');
    expect(shipItems.length).toBe(2);

    const shipTypes = Array.from(
      element.querySelectorAll('.survivor-ships-tbody td:nth-child(1)')
    ).map((el) => el.textContent);
    expect(shipTypes).toEqual(['Interceptor', 'Dreadnought']);
  });

  test('displays odds segments with correct widths', () => {
    setSimulationResults(
      monteCarloResults({
        victoryProbability: {
          'Fleet A': 0.75,
          'Fleet B': 0.25,
        },
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const segments = element.querySelectorAll(
      '.odds-segment'
    ) as NodeListOf<HTMLElement>;
    expect(segments[0].style.flexBasis).toBe('75%');
    expect(segments[1].style.flexBasis).toBe('25%');
  });

  test('renders mobile-friendly result bars', () => {
    setSimulationResults(
      monteCarloResults({
        victoryProbability: {
          'Fleet A': 0.75,
          'Fleet B': 0.25,
        },
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const rows = element.querySelectorAll('.result-bar-row');
    expect(rows.length).toBe(2);
    expect(rows[0].querySelector('.result-bar-label')?.textContent).toBe(
      'Fleet A75.0%'
    );
    expect(
      (rows[0].querySelector('.result-bar-fill') as HTMLElement).style.width
    ).toBe('75%');
  });
});
