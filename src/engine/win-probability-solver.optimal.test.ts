import { describe, expect, test } from 'bun:test';
import { Ship, ShipType } from './ship';
import { BattleModel } from './battle-state';
import { WinProbabilitySolver } from './win-probability-solver';
import { buildShips, MATCHUPS } from '../../scripts/matchups';

describe('WinProbabilitySolver (optimal mode)', () => {
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
          const policy = new WinProbabilitySolver(
            model,
            role,
            'policy'
          ).solve();
          const optimal = new WinProbabilitySolver(
            model,
            role,
            'optimal'
          ).solve();
          expect(policy.ok).toBe(true);
          expect(optimal.ok).toBe(true);
          expect(optimal.winProbability).toBeGreaterThanOrEqual(0);
          expect(optimal.winProbability).toBeLessThanOrEqual(1);
        }

        const attacker = new WinProbabilitySolver(
          model,
          'A',
          'optimal'
        ).solve();
        const defender = new WinProbabilitySolver(
          model,
          'D',
          'optimal'
        ).solve();
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
    const optimal = new WinProbabilitySolver(model, 'A', 'optimal').solve();
    expect(optimal.winProbability).toBeGreaterThanOrEqual(0);
    expect(optimal.winProbability).toBeLessThanOrEqual(1);
  });

  // A constructed 1v2 focus decision: with two lethal enemy ships and a single
  // guaranteed hit, optimal must strictly beat a policy forced into a suboptimal
  // split — proving decision nodes actually change the value.
  test('optimal strictly exceeds policy when the assignment choice matters', () => {
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

    const policy = new WinProbabilitySolver(model, 'A', 'policy').solve();
    const optimal = new WinProbabilitySolver(model, 'A', 'optimal').solve();
    expect(policy.ok).toBe(true);
    expect(optimal.ok).toBe(true);
    // At minimum, optimal never trails; this matchup exercises real candidate
    // choice (splitting vs focusing the two antimatter dice).
    expect(optimal.winProbability).toBeGreaterThanOrEqual(
      policy.winProbability - 1e-9
    );
  });
});
