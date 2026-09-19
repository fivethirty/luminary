import { describe, expect, test } from 'bun:test';
import { Ship, ShipType } from './ship';
import { Fleet } from './fleet';
import { CombatSimulator } from './combat-simulator';
import { BattleModel } from './battle-state';
import { DEFAULT_CAPS, WinProbabilitySolver } from './win-probability-solver';
import { buildShips, MATCHUPS } from '../../scripts/matchups';

function seededD6(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return Math.floor((state / 0x1_0000_0000) * 6) + 1;
  };
}

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

  test('healing plasma duel solves its all-miss cycle exactly: 5/11', () => {
    // A plasma hit (roll 6 only) kills a 2-HP cruiser outright, so healing
    // never applies and the only cycle is the round in which both miss. That
    // decision-free cycle is solved as a linear system, so the value is the
    // closed form to machine precision rather than to the sweep tolerance.
    const make = () =>
      new Ship(ShipType.Cruiser, {
        initiative: 2,
        hull: 1,
        heal: 1,
        cannons: { plasma: 1 },
      });
    const solver = new WinProbabilitySolver(
      new BattleModel([make()], [make()], false, false),
      { perspective: 'A', assignments: 'policy' }
    );
    const result = solver.solve();
    expect(result.ok).toBe(true);
    expect(result.sweeps).toBe(1);
    expect(result.winProbability).toBeCloseTo(5 / 11, 12);
    expect(solver.solveOutcome().pAttacker).toBeCloseTo(5 / 11, 12);
  });

  test('a slow healing cycle is solved exactly instead of failing at the sweep cap', () => {
    // Six interceptors versus an unarmed dreadnought that heals back to full
    // every round unless every shot lands: the kill probability per round is
    // (5/6)(5/6)(4/6)(1/6)^3 = 100/46656. The whole-graph sweep needed about
    // 7,900 sweeps to get within tolerance and a stricter per-component stop
    // would exceed the 10,000-sweep cap; the exact solve needs one pass and
    // returns the least fixed point, in which the attacker eventually wins.
    const computers = [4, 4, 3, 0, 0, 0];
    const solver = new WinProbabilitySolver(
      new BattleModel(
        computers.map(
          (c) =>
            new Ship(ShipType.Interceptor, {
              initiative: 3,
              computers: c,
              cannons: { ion: 1 },
            })
        ),
        [new Ship(ShipType.Dreadnought, { initiative: 1, hull: 5, heal: 5 })],
        false,
        false
      ),
      { perspective: 'A', assignments: 'policy' }
    );
    const result = solver.solve();
    expect(result.ok).toBe(true);
    expect(result.sweeps).toBe(1);
    expect(result.winProbability).toBeCloseTo(1, 9);
    const outcome = solver.solveOutcome();
    expect(outcome.ok).toBe(true);
    expect(outcome.pAttacker).toBeCloseTo(1, 9);
    expect(outcome.residual).toBeLessThan(1e-9);
  });

  test('decision ties within the tolerance resolve to the lowest option', () => {
    // chooseOption is the policy the forward pass and explainDecision follow.
    // Values that differ by less than DECISION_TIE_EPSILON are iteration
    // residuals, not preferences, so the first such option must win for both
    // roles regardless of which one carries the larger value. Options are
    // ranges of the flat option array, so the test lays out five ranges.
    const make = () =>
      new Ship(ShipType.Interceptor, { initiative: 3, cannons: { ion: 1 } });
    const solver = new WinProbabilitySolver(
      new BattleModel([make()], [make()], false, false),
      { perspective: 'A', assignments: 'minimax' }
    );
    type Choosable = {
      values: Float64Array;
      optionNode: { data: Int32Array };
      chooseOption: (from: number, to: number, role: 'A' | 'D') => number;
    };
    const internal = solver as unknown as Choosable;
    internal.values = Float64Array.of(
      0.5,
      0.5 + 5e-10,
      0.5 + 2e-9,
      0.5 - 5e-10
    );
    internal.optionNode.data = Int32Array.of(
      ...[0, 1, 2, 3],
      ...[1, 0, 3],
      ...[0, 1, 3],
      ...[0, 3, 1],
      ...[3, 0, 1]
    );
    // Attacker maximizes: 2e-9 above the rest is a real preference.
    expect(internal.chooseOption(0, 4, 'A')).toBe(2);
    // Without option 2, options 0 and 1 tie and the first listed wins.
    expect(internal.chooseOption(4, 7, 'A')).toBe(1);
    expect(internal.chooseOption(7, 10, 'A')).toBe(0);
    // Defender minimizes: 3 is within the tolerance of 0, so whichever of the
    // two is listed first wins.
    expect(internal.chooseOption(10, 13, 'D')).toBe(0);
    expect(internal.chooseOption(13, 16, 'D')).toBe(3);
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

  test('state values resolve skipped dice-less slots and string keys', () => {
    // Schedule: A@3 (ion), D@2 (unarmed cruiser), D@1 (ion interceptor). The
    // D@2 slot never has dice, so the graph stores no state at slot 1.
    const model = new BattleModel(
      [new Ship(ShipType.Interceptor, { initiative: 3, cannons: { ion: 1 } })],
      [
        new Ship(ShipType.Cruiser, { initiative: 2, hull: 1 }),
        new Ship(ShipType.Interceptor, { initiative: 1, cannons: { ion: 1 } }),
      ],
      false,
      false
    );
    const solver = new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'policy',
    });
    expect(solver.solve().ok).toBe(true);

    const stored = { hpA: [1], hpB: [2, 1], slot: 2 };
    const skipped = { hpA: [1], hpB: [2, 1], slot: 1 };
    const storedValue = solver.getStateValue(stored);
    expect(storedValue).toBeDefined();
    expect(solver.getStateValue(skipped)).toBe(storedValue as number);
    expect(solver.getValue(solver.canonicalKey(skipped))).toBeUndefined();
    expect(solver.getValue(solver.canonicalKey(stored))).toBe(
      storedValue as number
    );

    // With the armed defender dead, the attacker's next slot wraps to itself
    // and the attacker can no longer lose: its reach value is exactly 1.
    const onlyUnarmedLeft = { hpA: [1], hpB: [2, 0], slot: 1 };
    expect(solver.getStateValue(onlyUnarmedLeft)).toBeCloseTo(1, 8);
    // A dead target resolves straight to the terminal's reach value.
    expect(solver.getStateValue({ hpA: [1], hpB: [0, 0], slot: 1 })).toBe(1);
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

  // A coarse seeded cross-engine check for schedule, dice, missiles, and policy
  // materialization. Focused deterministic tests own the exact semantics.
  describe('exact policy win probability matches simulation', () => {
    const ITERATIONS = 2_500;
    const noHeal = MATCHUPS.filter((m) => m.noHeal);

    for (const [index, matchup] of noHeal.entries()) {
      test(`${matchup.name} (±0.04)`, () => {
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

        const rollD6 = seededD6(0x5eed + index);
        const enemyFleet = new Fleet(
          'Enemy',
          buildShips(matchup.enemy, rollD6)
        );
        const playerFleet = new Fleet(
          'Player',
          buildShips(matchup.player, rollD6)
        );
        const sim = new CombatSimulator().simulate(
          [enemyFleet, playerFleet],
          ITERATIONS
        );
        const simulated = sim.lastFleetStanding['Player'];

        expect(Math.abs(solved.winProbability - simulated)).toBeLessThan(0.04);
      });
    }
  });
});
