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

  test('omits the combat outlook summary', () => {
    setSimulationResults(
      exactResults({
        victoryProbability: { Defender: 0.266, Attacker: 0.734 },
        timeTaken: 5,
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    expect(element.querySelector('.results-header')).toBeNull();
    expect(element.querySelector('.results-kicker')).toBeNull();
    expect(element.querySelector('.verdict-headline')).toBeNull();
    expect(element.textContent).not.toContain('Combat Outlook');
    expect(element.querySelector('.verdict-number')).toBeNull();
    expect(element.querySelector('.verdict-caption')).toBeNull();
  });

  test('uses stable IDs and distinct colors when display names collide', () => {
    addFleet();
    state.fleets[1].name = 'Terran Directorate';
    state.fleets[2].name = 'Terran Directorate';
    const [defenderId, firstAttackerId, secondAttackerId] = state.fleets.map(
      (fleet) => fleet.id
    );
    setSimulationResults(
      monteCarloResults({
        victoryProbability: {
          [defenderId]: 0.25,
          [firstAttackerId]: 0.35,
          [secondAttackerId]: 0.4,
        },
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const segments = element.querySelectorAll('.odds-segment');
    expect(segments[1].classList.contains('attacker-result')).toBe(true);
    expect(segments[1].classList.contains('attacker-result-2')).toBe(false);
    expect(segments[2].classList.contains('attacker-result-2')).toBe(true);
    expect(segments[1].querySelector('span')?.textContent).toBe(
      'Terran Directorate'
    );
    expect(segments[2].querySelector('span')?.textContent).toBe(
      'Terran Directorate'
    );
  });

  test('applies selected board colors to result segments', () => {
    state.fleets[1].colorId = 'blue';
    setSimulationResults(
      monteCarloResults({
        victoryProbability: {
          'fleet-0': 0.25,
          'fleet-1': 0.75,
        },
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const attackerSegment = element.querySelectorAll(
      '.odds-segment'
    )[1] as HTMLElement;
    expect(
      attackerSegment.style.getPropertyValue('--fleet-result-source')
    ).toBe('#2f6fb7');
    expect(
      attackerSegment.style.getPropertyValue('--fleet-result-light-source')
    ).toBe('#155fa0');
    expect(
      attackerSegment.style.getPropertyValue('--fleet-result-light-soft-source')
    ).toBe('#dceafb');
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
    expect(rows[0].querySelector('td:nth-child(1)')?.textContent).toBe(
      'Attacker'
    );
    expect(rows[0].querySelector('td:nth-child(2)')?.textContent).toBe(
      'D, C, 2I, O, S'
    );
    expect(rows[0].querySelector('td:nth-child(3)')?.textContent).toBe('42.0%');
    expect(
      Array.from(
        element.querySelectorAll('.composition-table thead th'),
        (heading) => heading.textContent
      )
    ).toEqual(['Faction', 'Ship', 'Odds']);
    expect(rows[0].textContent).not.toContain('Interceptor');
    expect(rows[0].textContent).not.toContain('Cruiser');
    expect(rows[0].textContent).toContain('42.0%');
    expect(rows[1].textContent).toContain('Anc');
    expect(rows[1].textContent).toContain('24.0%');
  });

  test('colors survivor composition attackers by fleet', () => {
    addFleet();
    state.fleets[2].name = 'Attacker 2';
    const [defenderId, firstAttackerId, secondAttackerId] = state.fleets.map(
      (fleet) => fleet.id
    );
    setSimulationResults(
      exactResults({
        victoryProbability: {
          [defenderId]: 0.2,
          [firstAttackerId]: 0.3,
          [secondAttackerId]: 0.5,
        },
        survivorDistribution: [
          {
            probability: 0.5,
            survivors: {
              [defenderId]: {},
              [firstAttackerId]: {},
              [secondAttackerId]: { Cruiser: 1 },
            },
          },
        ],
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const row = element.querySelector('#survivor-distribution-tbody tr')!;
    const attackerLabel = row.querySelector('.composition-fleet-label')!;
    expect(row.classList.contains('attacker-result-2')).toBe(true);
    expect(attackerLabel.classList.contains('attacker-result-2')).toBe(true);
    expect(
      attackerLabel.querySelector('.composition-fleet-name')?.textContent
    ).toBe('Attacker');
    expect(
      attackerLabel.querySelector('.composition-fleet-suffix')?.textContent
    ).toBe(' 2');
  });

  test('uses shortened faction names in survivor compositions', () => {
    const attacker = state.fleets[1];
    attacker.factionId = 'terran';
    attacker.name = 'Terran Directorate';
    setSimulationResults(
      exactResults({
        survivorDistribution: [
          {
            probability: 1,
            survivors: {
              [state.fleets[0].id]: {},
              [attacker.id]: { Cruiser: 1 },
            },
          },
        ],
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    expect(element.querySelector('.composition-fleet-label')?.textContent).toBe(
      'Terran'
    );
  });

  test('merges reputation-credit variants into one survivor composition row', () => {
    const [defenderId, attackerId] = state.fleets.map((fleet) => fleet.id);
    setSimulationResults(
      exactResults({
        survivorDistribution: [
          {
            probability: 0.3,
            survivors: {
              [defenderId]: {},
              [attackerId]: { Cruiser: 1 },
            },
            destroyedShipsCreditedToFleet: {
              [defenderId]: { Interceptor: 1 },
              [attackerId]: { Cruiser: 1 },
            },
          },
          {
            probability: 0.2,
            survivors: {
              [defenderId]: {},
              [attackerId]: { Cruiser: 1 },
            },
            destroyedShipsCreditedToFleet: {
              [defenderId]: {},
              [attackerId]: { Cruiser: 2 },
            },
          },
        ],
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const rows = element.querySelectorAll('#survivor-distribution-tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('50.0%');
  });

  test('summarizes material, population, and reputation impact compactly', () => {
    const [defenderId, attackerId] = state.fleets.map((fleet) => fleet.id);
    setSimulationResults(
      exactResults({
        materialLosses: {
          [defenderId]: {
            totalCost: 13,
            expectedRemainingCost: 4.75,
            expectedLostCost: 8.25,
            lossDistribution: [],
          },
          [attackerId]: {
            totalCost: 10,
            expectedRemainingCost: 6,
            expectedLostCost: 4,
            lossDistribution: [],
          },
        },
        populationBombardment: {
          byAttacker: {
            [attackerId]: Array.from({ length: 8 }, (_, damage) => ({
              damage,
              exactProbability: damage === 0 ? 0.5 : 0,
              atLeastProbability:
                damage === 0 ? 1 : Math.max(0, 0.6 - damage / 10),
            })),
          },
        },
        reputationDraws: {
          available: true,
          byFleet: {
            [defenderId]: {
              probabilityByDrawCount: {
                1: 0,
                2: 0.5,
                3: 0.5,
                4: 0,
                5: 0,
              },
              expectedDraws: 2.5,
            },
            [attackerId]: {
              probabilityByDrawCount: {
                1: 0.25,
                2: 0,
                3: 0,
                4: 0,
                5: 0.75,
              },
              expectedDraws: 4,
            },
          },
        },
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const materialRows = element.querySelectorAll('#material-impact-rows tr');
    expect(materialRows).toHaveLength(2);
    expect(materialRows[0].textContent).toBe('Defender138.3');
    expect(materialRows[1].textContent).toBe('Attacker104');

    const populationSelect = element.querySelector(
      '#sector-population'
    ) as HTMLSelectElement;
    expect(populationSelect.value).toBe('2');
    expect(
      element.querySelector('.population-attacker-label')?.textContent
    ).toBe('Attacker');
    expect(
      element.querySelector('.population-destroyed-value')?.textContent
    ).toBe('40.0%');
    expect(element.querySelector('#population-impact-note')).toBeNull();

    populationSelect.value = '4';
    populationSelect.dispatchEvent(new Event('change'));
    expect(
      element.querySelector('.population-destroyed-value')?.textContent
    ).toBe('20.0%');

    element.remove();
    const refreshedElement = document.createElement(
      'calc-results'
    ) as ResultsElement;
    document.body.appendChild(refreshedElement);
    expect(
      (
        refreshedElement.querySelector(
          '#sector-population'
        ) as HTMLSelectElement
      ).value
    ).toBe('4');
    expect(
      refreshedElement.querySelector('.population-destroyed-value')?.textContent
    ).toBe('20.0%');

    const reputation = refreshedElement.querySelectorAll(
      '.reputation-impact-row'
    );
    expect(reputation).toHaveLength(2);
    expect(reputation[0].textContent).toBe('Defender2.5');
    expect(reputation[1].textContent).toBe('Attacker4');
  });

  test('keeps lower-priority outcomes collapsed by default', () => {
    setSimulationResults(
      exactResults({
        survivorDistribution: [
          {
            probability: 1,
            survivors: { Attacker: { Interceptor: 1 } },
          },
        ],
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const details = element.querySelector('.detailed-outcomes')!;
    expect(details.hasAttribute('open')).toBe(false);
    expect(details.querySelector('summary')?.textContent).toBe(
      'Detailed outcomes'
    );
    expect(details.contains(element.querySelector('#material-impact'))).toBe(
      true
    );
    expect(details.contains(element.querySelector('#population-impact'))).toBe(
      true
    );
    expect(details.contains(element.querySelector('#survivors-section'))).toBe(
      false
    );
    expect(details.contains(element.querySelector('#reputation-impact'))).toBe(
      true
    );
    const compositionSection = element.querySelector(
      '#survivor-distribution-section'
    )!;
    const summaryColumn = details.querySelector('.impact-summary-column')!;
    expect(
      details.querySelector('.impact-grid')?.contains(compositionSection)
    ).toBe(true);
    expect(
      summaryColumn.contains(element.querySelector('#material-impact'))
    ).toBe(true);
    expect(
      summaryColumn.contains(element.querySelector('#population-impact'))
    ).toBe(true);
    expect(
      summaryColumn.contains(element.querySelector('#reputation-impact'))
    ).toBe(true);
    expect(summaryColumn.contains(compositionSection)).toBe(false);
    expect(compositionSection.classList.contains('impact-card')).toBe(true);
    expect(compositionSection.querySelector('h4')?.textContent).toBe(
      'Surviving fleet'
    );
    expect(element.querySelector('.battle-impact-section')).toBeNull();
    expect(element.textContent).not.toContain('Battle impact');
  });

  test('remembers whether detailed outcomes is expanded across results', () => {
    setSimulationResults(exactResults());
    const firstElement = document.createElement(
      'calc-results'
    ) as ResultsElement;
    document.body.appendChild(firstElement);

    const firstDetails = firstElement.querySelector(
      '.detailed-outcomes'
    ) as HTMLDetailsElement;
    firstDetails.open = true;
    firstDetails.dispatchEvent(new Event('toggle'));

    setSimulationResults(exactResults({ drawProbability: 0.1 }));
    firstElement.remove();
    const nextElement = document.createElement(
      'calc-results'
    ) as ResultsElement;
    document.body.appendChild(nextElement);

    const nextDetails = nextElement.querySelector(
      '.detailed-outcomes'
    ) as HTMLDetailsElement;
    expect(nextDetails.open).toBe(true);

    nextDetails.open = false;
    nextDetails.dispatchEvent(new Event('toggle'));
    nextElement.remove();
    const finalElement = document.createElement(
      'calc-results'
    ) as ResultsElement;
    document.body.appendChild(finalElement);

    expect(
      (finalElement.querySelector('.detailed-outcomes') as HTMLDetailsElement)
        .open
    ).toBe(false);
  });

  test('shows one selected population-destruction chance per attacker', () => {
    addFleet();
    state.fleets[2].name = 'Attacker 2';
    const [, firstAttackerId, secondAttackerId] = state.fleets.map(
      (fleet) => fleet.id
    );
    const buckets = (chance: number) =>
      Array.from({ length: 8 }, (_, damage) => ({
        damage,
        exactProbability: damage === 0 ? 1 - chance : 0,
        atLeastProbability: damage === 0 ? 1 : chance,
      }));

    setSimulationResults(
      exactResults({
        populationBombardment: {
          byAttacker: {
            [firstAttackerId]: buckets(0.2),
            [secondAttackerId]: buckets(0.35),
          },
        },
      })
    );

    const element = document.createElement('calc-results') as ResultsElement;
    document.body.appendChild(element);

    const rows = element.querySelectorAll('.population-attacker-row');
    expect(rows).toHaveLength(2);
    expect(
      rows[0].querySelector('.population-attacker-label')?.textContent
    ).toBe('Attacker');
    expect(
      rows[0].querySelector('.population-destroyed-value')?.textContent
    ).toBe('20.0%');
    expect(rows[0].getAttribute('aria-label')).toBe(
      'Attacker: 20.0% chance to destroy all 2 population'
    );
    expect(
      rows[1].querySelector('.population-attacker-label')?.textContent
    ).toBe('Attacker 2');
    expect(
      rows[1].querySelector('.population-destroyed-value')?.textContent
    ).toBe('35.0%');
    expect(rows[1].getAttribute('aria-label')).toBe(
      'Attacker 2: 35.0% chance to destroy all 2 population'
    );
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
