import { describe, expect, test } from 'bun:test';
import { Ship, ShipType, type ShipConfig } from './ship';
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

  test('spreading damage among identical ships is a real decision', () => {
    // Reported from the app: 8 ion missiles (+6 computers) then two soliton
    // cruisers against four identical hull-3 cruisers. A soliton hit deals 3,
    // so the best missile volley kills one cruiser and puts one point on each
    // survivor; DPS concentration leaves the survivors needing two hits each.
    const ships = (type: ShipType, config: ShipConfig, count: number) =>
      Array.from({ length: count }, () => new Ship(type, config));
    const attackerCruiser: ShipConfig = {
      initiative: 2,
      hull: 3,
      shields: 2,
      cannons: { antimatter: 1 },
    };
    const defenderCruiser: ShipConfig = {
      initiative: 3,
      hull: 2,
      computers: 2,
      shields: 3,
      cannons: { soliton: 1 },
    };
    const missileDreadnought: ShipConfig = {
      initiative: 1,
      hull: 0,
      computers: 6,
      missiles: { ion: 8 },
    };
    const attacker = (count = 4) =>
      ships(ShipType.Cruiser, attackerCruiser, count);
    const defender = () => [
      ...ships(ShipType.Cruiser, defenderCruiser, 2),
      new Ship(ShipType.Dreadnought, missileDreadnought),
    ];
    const model = new BattleModel(attacker(), defender(), false, false);
    const policy = new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'policy',
    }).solve();
    const defenderOptimal = new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'minimax',
      decisionRoles: ['D'],
    });
    const bothOptimal = new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'minimax',
    }).solve();

    expect(policy.winProbability).toBeCloseTo(0.890623, 6);
    expect(defenderOptimal.solve().winProbability).toBeCloseTo(0.786493, 6);
    expect(
      defenderOptimal.getGraphStats().defenderDecisionStates
    ).toBeGreaterThan(0);
    // The attacker has nothing to gain here, so the two-sided value matches.
    expect(bothOptimal.winProbability).toBeCloseTo(
      defenderOptimal.solve().winProbability,
      9
    );

    // Optimal values must not fall when the attacker brings more ships. The
    // old single-configuration reduction broke this: adding a fifth cruiser
    // kept the reduction (98.6%) while adding an interceptor removed it and
    // dropped the attacker to the true 78.7%.
    const fifthCruiser = new WinProbabilitySolver(
      new BattleModel(attacker(5), defender(), false, false),
      { perspective: 'A', assignments: 'minimax' }
    ).solve();
    const interceptor = new WinProbabilitySolver(
      new BattleModel(
        [
          ...attacker(),
          new Ship(ShipType.Interceptor, {
            initiative: 3,
            cannons: { ion: 1 },
          }),
        ],
        defender(),
        false,
        false
      ),
      { perspective: 'A', assignments: 'minimax' }
    ).solve();
    expect(fifthCruiser.winProbability).toBeCloseTo(0.947395, 6);
    expect(fifthCruiser.winProbability).toBeGreaterThan(
      bothOptimal.winProbability
    );
    expect(interceptor.winProbability).toBeGreaterThanOrEqual(
      bothOptimal.winProbability
    );
  });

  test('a lethal volley against damaged identical targets keeps the better kill', () => {
    // Three ion missiles chip the two dreadnoughts, then one antimatter hit
    // destroys either. Killing the healthy dreadnought and leaving the damaged
    // one for the ion follow-up is the better line. A removed reduction kept
    // only the roster-order kill and reported 0.1796, below the DPS policy.
    const finisher: ShipConfig = {
      initiative: 3,
      computers: 2,
      missiles: { ion: 3 },
      cannons: { antimatter: 1 },
    };
    const chipper: ShipConfig = {
      initiative: 2,
      computers: 2,
      cannons: { ion: 2 },
    };
    const dreadnought: ShipConfig = {
      initiative: 1,
      hull: 3,
      computers: 2,
      cannons: { ion: 2 },
    };
    const model = () =>
      new BattleModel(
        [
          new Ship(ShipType.Cruiser, finisher),
          new Ship(ShipType.Cruiser, chipper),
        ],
        Array.from(
          { length: 2 },
          () => new Ship(ShipType.Dreadnought, dreadnought)
        ),
        false,
        false
      );
    const policy = new WinProbabilitySolver(model(), {
      perspective: 'A',
      assignments: 'policy',
    }).solve();
    const optimal = new WinProbabilitySolver(model(), {
      perspective: 'A',
      assignments: 'minimax',
      decisionRoles: ['A'],
    }).solve();

    expect(optimal.winProbability).toBeCloseTo(0.303804, 6);
    // Optimal targeting can always play the DPS line, so it never does worse.
    expect(optimal.winProbability).toBeGreaterThanOrEqual(
      policy.winProbability - 1e-9
    );
  });

  test('identical healing cruisers keep the healing matchup value under enumeration', () => {
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
    // Fixed point of the healing cycles; 0.478558661071 is the policy value
    // (one-damage ion hits on identical two-HP healers give spreading no
    // edge). Both sides decide every assignment, so the cyclic components
    // hold decision nodes and are swept to the 1e-10 threshold instead of
    // being solved as a linear system: the solved value and the
    // forward-propagated attacker mass agree only to that tolerance.
    expect(result.winProbability).toBeCloseTo(0.478558661071, 9);
    expect(solver.solveOutcome().pAttacker).toBeCloseTo(
      result.winProbability,
      9
    );
    expect(solver.getGraphStats().attackerDecisionStates).toBeGreaterThan(0);
    expect(solver.getGraphStats().defenderDecisionStates).toBeGreaterThan(0);
  });

  test('damage saturation preserves value and reduces optimal chance outcomes', () => {
    const ships = () => [
      new Ship(ShipType.Interceptor, {
        initiative: 3,
        cannons: { ion: 1, plasma: 1, soliton: 1, antimatter: 1 },
      }),
    ];
    const model = new BattleModel(ships(), ships(), false, false);
    const policy = new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'policy',
    });
    const oneSidedOptimal = new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'minimax',
      decisionRoles: ['A'],
    });
    const fullyOptimal = new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'minimax',
    });

    // Single-option decision nodes on both sides are swept rather than solved
    // as a linear system, so the values agree to the sweep tolerance only.
    expect(fullyOptimal.solve().winProbability).toBeCloseTo(
      policy.solve().winProbability,
      10
    );
    expect(fullyOptimal.getGraphStats().chanceOutcomes).toBe(10);
    expect(policy.getGraphStats().chanceOutcomes).toBe(32);
    expect(oneSidedOptimal.getGraphStats().chanceOutcomes).toBe(32);
  });
});
