import { describe, expect, test } from 'bun:test';
import { BattleModel } from './battle-state';
import { Ship, ShipType } from './ship';
import { WinProbabilitySolver } from './win-probability-solver';

describe('WinProbabilitySolver (minimax mode)', () => {
  test('optimal defender choices lower the attacker value versus DPS policy', () => {
    const attacker = [
      new Ship(ShipType.Cruiser, {
        initiative: 3,
        hull: 1,
        computers: 2,
        cannons: { plasma: 1 },
      }),
      new Ship(ShipType.Interceptor, {
        initiative: 1,
        computers: 1,
        cannons: { ion: 2 },
      }),
    ];
    const defender = [
      new Ship(ShipType.Cruiser, {
        initiative: 2,
        hull: 1,
        computers: 2,
        cannons: { plasma: 1 },
      }),
      new Ship(ShipType.Interceptor, {
        initiative: 1,
        computers: 1,
        cannons: { ion: 2 },
      }),
    ];
    const model = new BattleModel(attacker, defender, false, false);

    const policy = new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'policy',
    }).solve();
    const optimalAttackerSolver = new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'minimax',
    });
    const optimalAttacker = optimalAttackerSolver.solve();
    const optimalDefender = new WinProbabilitySolver(model, {
      perspective: 'D',
      assignments: 'minimax',
    }).solve();

    expect(policy.ok).toBe(true);
    expect(optimalAttacker.ok).toBe(true);
    expect(optimalDefender.ok).toBe(true);
    expect(optimalAttacker.winProbability).toBeLessThan(
      policy.winProbability - 0.001
    );
    expect(
      optimalAttacker.winProbability + optimalDefender.winProbability
    ).toBeCloseTo(1, 9);

    const stats = optimalAttackerSolver.getGraphStats();
    expect(stats.attackerDecisionStates).toBeGreaterThan(0);
    expect(stats.defenderDecisionStates).toBeGreaterThan(0);

    const initialKey = optimalAttackerSolver.canonicalKey(model.initialState());
    const decision = optimalAttackerSolver.explainDecision(initialKey);
    expect(decision?.role).toBe('A');
    expect(decision?.outcomes.length).toBeGreaterThan(0);
    expect(
      decision?.outcomes.every(
        (outcome) =>
          outcome.options.filter((option) => option.selected).length === 1
      )
    ).toBe(true);
  });
});
