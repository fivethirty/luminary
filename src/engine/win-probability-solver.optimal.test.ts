import { describe, expect, test } from 'bun:test';
import { Ship, ShipType } from './ship';
import { BattleModel } from './battle-state';
import { WinProbabilitySolver } from './win-probability-solver';
import { buildShips, MATCHUPS } from '../../scripts/matchups';

describe('WinProbabilitySolver (minimax assignments)', () => {
  describe('minimax values are consistent for both roles', () => {
    for (const matchup of MATCHUPS.filter((m) => m.noHeal)) {
      test(matchup.name, () => {
        const model = new BattleModel(
          buildShips(matchup.player),
          buildShips(matchup.enemy),
          false,
          false
        );

        for (const role of ['A', 'D'] as const) {
          const policy = new WinProbabilitySolver(model, {
            perspective: role,
            assignments: 'policy',
          }).solve();
          const optimal = new WinProbabilitySolver(model, {
            perspective: role,
            assignments: 'minimax',
          }).solve();
          expect(policy.ok).toBe(true);
          expect(optimal.ok).toBe(true);
          expect(optimal.winProbability).toBeGreaterThanOrEqual(0);
          expect(optimal.winProbability).toBeLessThanOrEqual(1);
        }

        const attacker = new WinProbabilitySolver(model, {
          perspective: 'A',
          assignments: 'minimax',
        }).solve();
        const defender = new WinProbabilitySolver(model, {
          perspective: 'D',
          assignments: 'minimax',
        }).solve();
        expect(attacker.winProbability + defender.winProbability).toBeCloseTo(
          1,
          9
        );
      });
    }
  });

  test('optimal win probability is a valid probability', () => {
    const model = new BattleModel(
      buildShips(MATCHUPS[0].player),
      buildShips(MATCHUPS[0].enemy),
      false,
      false
    );
    const optimal = new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'minimax',
    }).solve();
    expect(optimal.winProbability).toBeGreaterThanOrEqual(0);
    expect(optimal.winProbability).toBeLessThanOrEqual(1);
  });

  test('homogeneous targeting has the same value without decision nodes', () => {
    // Player: one interceptor with 2 antimatter cannons and high computers, so
    // both dice almost always land (only a natural 1 misses).
    const player = new Ship(ShipType.Interceptor, {
      initiative: 5,
      hull: 2,
      computers: 5,
      cannons: { antimatter: 2 },
    });
    // Two enemy interceptors that fire after the player (lower initiative) with
    // enough combined firepower to threaten the player over several rounds.
    const enemyA = new Ship(ShipType.Interceptor, {
      initiative: 1,
      hull: 1,
      computers: 5,
      cannons: { antimatter: 1 },
    });
    const enemyB = new Ship(ShipType.Interceptor, {
      initiative: 1,
      hull: 1,
      computers: 5,
      cannons: { antimatter: 1 },
    });
    const model = new BattleModel([player], [enemyA, enemyB], false, false);

    const policy = new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'policy',
    }).solve();
    const optimal = new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'minimax',
    }).solve();
    expect(policy.ok).toBe(true);
    expect(optimal.ok).toBe(true);
    expect(optimal.winProbability).toBeCloseTo(policy.winProbability, 9);
    const graph = new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'minimax',
    }).getGraphStats();
    expect(graph.attackerDecisionStates).toBe(0);
    expect(graph.defenderDecisionStates).toBe(0);
  });

  test('homogeneous concentration preserves the healing matchup value', () => {
    const ships = () =>
      Array.from(
        { length: 4 },
        () =>
          new Ship(ShipType.Cruiser, {
            initiative: 2,
            hull: 1,
            heal: 1,
            cannons: { ion: 1 },
          })
      );
    const solver = new WinProbabilitySolver(
      new BattleModel(ships(), ships(), false, false),
      {
        perspective: 'A',
        assignments: 'minimax',
      }
    );

    const result = solver.solve();
    expect(result.ok).toBe(true);
    expect(result.winProbability).toBeCloseTo(0.478558660068, 9);
    expect(solver.getGraphStats().attackerDecisionStates).toBe(0);
    expect(solver.getGraphStats().defenderDecisionStates).toBe(0);
  });
});
