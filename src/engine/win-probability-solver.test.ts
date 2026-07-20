import { describe, expect, test } from 'bun:test';
import { Ship, ShipType } from './ship';
import { Fleet } from './fleet';
import { CombatSimulator } from './combat-simulator';
import { BattleModel } from './battle-state';
import { DEFAULT_CAPS, WinProbabilitySolver } from './win-probability-solver';
import { buildShips, MATCHUPS } from '../../scripts/matchups';

describe('WinProbabilitySolver (policy mode)', () => {
  test('closed-form 1v1 interceptor duel: attacker wins 5/11', () => {
    // Both fire at initiative 3 (defender first), 1 HP, per-shot kill 1/6.
    // W = (5/6)(1/6) + (5/6)(5/6)W ⇒ W = 5/11.
    const make = () =>
      new Ship(ShipType.Interceptor, { initiative: 3, cannons: { ion: 1 } });
    const model = new BattleModel([make()], [make()], false, false);

    const attacker = new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'policy',
    }).solve();
    expect(attacker.ok).toBe(true);
    expect(attacker.winProbability).toBeCloseTo(5 / 11, 9);

    const defender = new WinProbabilitySolver(model, {
      perspective: 'D',
      assignments: 'policy',
    }).solve();
    expect(defender.ok).toBe(true);
    expect(defender.winProbability).toBeCloseTo(6 / 11, 9);
  });

  describe('deadline enforcement', () => {
    const duelModel = () => {
      const make = () =>
        new Ship(ShipType.Interceptor, {
          initiative: 3,
          cannons: { ion: 1 },
        });
      return new BattleModel([make()], [make()], false, false);
    };

    test('a tiny budget aborts graph construction using the injected clock', () => {
      let timestamp = 0;
      const result = new WinProbabilitySolver(duelModel(), {
        perspective: 'A',
        assignments: 'policy',
        caps: { ...DEFAULT_CAPS, maxMillis: 2 },
        now: () => timestamp++,
      }).solve();

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('time budget exceeded');
      expect(result.states).toBe(1);
      expect(timestamp).toBeLessThan(10);
    });

    test('terminal propagation observes the original solve deadline', () => {
      let timestamp = 0;
      const solver = new WinProbabilitySolver(duelModel(), {
        perspective: 'A',
        assignments: 'policy',
        caps: { ...DEFAULT_CAPS, maxMillis: 1 },
        now: () => timestamp,
      });

      expect(solver.solve().ok).toBe(true);
      timestamp = 1;
      const distribution = solver.solveTerminalDistribution();

      expect(distribution.ok).toBe(false);
      expect(distribution.reason).toBe('time budget exceeded');
      expect(distribution.entries).toEqual([]);
    });

    test('outcome aggregation reports a propagation timeout', () => {
      let timestamp = 0;
      const solver = new WinProbabilitySolver(duelModel(), {
        perspective: 'A',
        assignments: 'policy',
        caps: { ...DEFAULT_CAPS, maxMillis: 1 },
        now: () => timestamp,
      });

      expect(solver.solve().ok).toBe(true);
      timestamp = 1;
      const outcome = solver.solveOutcome();

      expect(outcome.ok).toBe(false);
      expect(outcome.reason).toBe('time budget exceeded');
      expect(outcome.pAttacker).toBeNaN();
    });
  });

  test('solving twice yields identical values (determinism)', () => {
    const make = () =>
      new Ship(ShipType.Interceptor, { initiative: 3, cannons: { ion: 1 } });
    const model = new BattleModel([make()], [make()], false, false);
    const a = new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'policy',
    }).solve();
    const b = new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'policy',
    }).solve();
    expect(a.winProbability).toBe(b.winProbability);
  });

  // The single most important test: validates schedule, dice classes, min-shield
  // dynamics, rift, missiles, and heuristic materialization all at once by
  // comparing the exact policy-mode win probability to a Monte Carlo estimate.
  describe('exact policy win probability matches simulation', () => {
    const ITERATIONS = 10_000;
    const noHeal = MATCHUPS.filter((m) => m.noHeal);

    for (const matchup of noHeal) {
      test(`${matchup.name} (±0.015)`, () => {
        // Player is the attacker (last fleet in MultiBattle ordering).
        const model = new BattleModel(
          buildShips(matchup.player),
          buildShips(matchup.enemy),
          false,
          false
        );
        const solved = new WinProbabilitySolver(model, {
          perspective: 'A',
          assignments: 'policy',
        }).solve();
        expect(solved.ok).toBe(true);

        const enemyFleet = new Fleet('Enemy', buildShips(matchup.enemy));
        const playerFleet = new Fleet('Player', buildShips(matchup.player));
        const sim = new CombatSimulator().simulate(
          [enemyFleet, playerFleet],
          ITERATIONS
        );
        const simulated = sim.lastFleetStanding['Player'];

        expect(Math.abs(solved.winProbability - simulated)).toBeLessThan(0.015);
      });
    }
  });
});
