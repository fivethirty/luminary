import { describe, test, expect } from 'bun:test';
import type { FleetState } from '@ui/state';
import { computeVerdict } from './verdict';
import { exactResults } from './test-helpers';

const FLEETS: FleetState[] = [
  {
    id: 'fleet-0',
    name: 'Defender',
    shipTypes: [],
    antimatterSplitter: false,
    plannerType: 'optimal',
  },
  {
    id: 'fleet-1',
    name: 'Attacker',
    shipTypes: [],
    antimatterSplitter: false,
    plannerType: 'optimal',
  },
];

describe('computeVerdict', () => {
  test('names the leading fleet and its probability', () => {
    const verdict = computeVerdict(
      exactResults({
        victoryProbability: { Defender: 0.266, Attacker: 0.734 },
      }),
      FLEETS
    );
    expect(verdict.headline).toBe('Attacker favored');
    expect(verdict.leaderLabel).toBe('Attacker');
    expect(verdict.leaderProbability).toBeCloseTo(0.734);
    expect(verdict.className).toBe('attacker-result');
  });

  test('tags scale with the leader margin', () => {
    const tagFor = (p: number) =>
      computeVerdict(
        exactResults({ victoryProbability: { Defender: 1 - p, Attacker: p } }),
        FLEETS
      ).tag;

    expect(tagFor(0.52)).toBe('Coin flip');
    expect(tagFor(0.6)).toBe('Slight edge');
    expect(tagFor(0.75)).toBe('Clear edge');
    expect(tagFor(0.95)).toBe('Decisive');
  });

  test('a near-even battle reads as too close to call', () => {
    const verdict = computeVerdict(
      exactResults({ victoryProbability: { Defender: 0.49, Attacker: 0.51 } }),
      FLEETS
    );
    expect(verdict.headline).toBe('Too close to call');
    expect(verdict.tag).toBe('Coin flip');
    // Still points at who is nominally ahead.
    expect(verdict.leaderLabel).toBe('Attacker');
  });

  test('flags a likely win the victor barely survives as pyrrhic', () => {
    const verdict = computeVerdict(
      exactResults({
        victoryProbability: { Defender: 0.2, Attacker: 0.8 },
        expectedSurvivors: { Attacker: { Interceptor: 0.4 } },
      }),
      FLEETS
    );
    expect(verdict.tag).toBe('Pyrrhic win');
    expect(verdict.headline).toBe('Attacker favored');
  });

  test('a healthy win is not pyrrhic', () => {
    const verdict = computeVerdict(
      exactResults({
        victoryProbability: { Defender: 0.1, Attacker: 0.9 },
        expectedSurvivors: { Attacker: { Cruiser: 1.6 } },
      }),
      FLEETS
    );
    expect(verdict.tag).toBe('Decisive');
  });

  test('a dominant draw reads as a stalemate', () => {
    const verdict = computeVerdict(
      exactResults({
        victoryProbability: { Defender: 0.15, Attacker: 0.15 },
        drawProbability: 0.7,
      }),
      FLEETS
    );
    expect(verdict.headline).toBe('Likely a draw');
    expect(verdict.tag).toBe('Stalemate');
    expect(verdict.leaderLabel).toBe('Draw');
    expect(verdict.className).toBe('draw-result');
  });

  test('colors extra attackers by their fleet slot', () => {
    const fleets: FleetState[] = [
      ...FLEETS,
      {
        id: 'fleet-2',
        name: 'Attacker 2',
        shipTypes: [],
        antimatterSplitter: false,
        plannerType: 'optimal',
      },
    ];
    const verdict = computeVerdict(
      exactResults({
        victoryProbability: {
          Defender: 0.2,
          Attacker: 0.3,
          'Attacker 2': 0.5,
        },
      }),
      fleets
    );
    expect(verdict.leaderLabel).toBe('Attacker 2');
    expect(verdict.className).toBe('attacker-result attacker-result-2');
  });
});
