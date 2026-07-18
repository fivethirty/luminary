import { describe, expect, test } from 'bun:test';
import { Ship, ShipType } from './ship';
import { Fleet } from './fleet';
import { CombatSimulator } from './combat-simulator';
import { DamageType } from 'src/constants';
import { BattleModel } from './battle-state';
import { WinProbabilitySolver } from './win-probability-solver';
import { computeExactBattle } from './exact-combat';
import { buildShips, MATCHUPS } from '../../scripts/matchups';

describe('solveOutcome', () => {
  test('closed-form 1v1 duel: exact outcome split and survivors', () => {
    // Both fire at initiative 3 (defender first), 1 HP, per-shot kill 1/6.
    // P(attacker) = 5/11, P(defender) = 6/11, draws impossible, and the winner
    // always survives with exactly its one interceptor.
    const make = () => [
      new Ship(ShipType.Interceptor, { initiative: 3, cannons: { ion: 1 } }),
    ];
    const model = new BattleModel(make(), make(), false, false);
    const outcome = new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'policy',
    }).solveOutcome();

    expect(outcome.ok).toBe(true);
    expect(outcome.pAttacker).toBeCloseTo(5 / 11, 9);
    expect(outcome.pDefender).toBeCloseTo(6 / 11, 9);
    expect(outcome.pDraw).toBeCloseTo(0, 12);
    expect(outcome.attackerSurvivors[ShipType.Interceptor]).toBeCloseTo(1, 9);
    expect(outcome.defenderSurvivors[ShipType.Interceptor]).toBeCloseTo(1, 9);
  });

  test('outcome probabilities always sum to 1', () => {
    for (const matchup of MATCHUPS) {
      const model = new BattleModel(
        buildShips(matchup.player),
        buildShips(matchup.enemy),
        false,
        false
      );
      const outcome = new WinProbabilitySolver(model, {
        perspective: 'A',
        assignments: 'policy',
      }).solveOutcome();
      expect(outcome.ok).toBe(true);
      expect(outcome.pAttacker + outcome.pDefender + outcome.pDraw).toBeCloseTo(
        1,
        9
      );
    }
  });

  test('forward pass agrees with the backward win probability, both roles', () => {
    const matchup = MATCHUPS.find((m) => m.name.startsWith('HET: fast weak'))!;
    const model = new BattleModel(
      buildShips(matchup.player),
      buildShips(matchup.enemy),
      false,
      false
    );
    for (const role of ['A', 'D'] as const) {
      const solver = new WinProbabilitySolver(model, {
        perspective: role,
        assignments: 'minimax',
      });
      const w = solver.solve().winProbability;
      const outcome = solver.solveOutcome();
      const forward = role === 'A' ? outcome.pAttacker : outcome.pDefender;
      expect(Math.abs(forward - w)).toBeLessThan(1e-8);
    }
  });

  test('rift battles produce a nonzero exact draw probability', () => {
    const matchup = MATCHUPS.find((m) => m.name.startsWith('Rift'))!;
    const model = new BattleModel(
      buildShips(matchup.player),
      buildShips(matchup.enemy),
      false,
      false
    );
    const outcome = new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'policy',
    }).solveOutcome();
    expect(outcome.pDraw).toBeGreaterThan(0);
  });
});

describe('computeExactBattle', () => {
  // The end-to-end validation: exact numbers must agree with a Monte Carlo run
  // of the same battle on every axis the app reports.
  describe('matches Monte Carlo within noise', () => {
    const ITERATIONS = 10_000;
    for (const matchup of MATCHUPS.filter((m) => m.noHeal).slice(0, 4)) {
      test(matchup.name, () => {
        const exact = computeExactBattle(
          new Fleet('Enemy', buildShips(matchup.enemy)),
          new Fleet('Player', buildShips(matchup.player))
        );
        expect(exact.ok).toBe(true);

        const enemyFleet = new Fleet('Enemy', buildShips(matchup.enemy));
        const playerFleet = new Fleet('Player', buildShips(matchup.player));
        const mc = new CombatSimulator().simulate(
          [enemyFleet, playerFleet],
          ITERATIONS
        );

        expect(
          Math.abs(
            exact.lastFleetStanding['Player'] - mc.lastFleetStanding['Player']
          )
        ).toBeLessThan(0.015);
        expect(
          Math.abs(
            exact.lastFleetStanding['Enemy'] - mc.lastFleetStanding['Enemy']
          )
        ).toBeLessThan(0.015);
        expect(Math.abs(exact.drawPercentage - mc.drawPercentage)).toBeLessThan(
          0.01
        );

        // Expected survivors, winner-conditioned, per ship type.
        for (const name of ['Player', 'Enemy']) {
          const mcSurv = mc.expectedSurvivors[name] ?? {};
          const exSurv = exact.expectedSurvivors[name] ?? {};
          for (const type of new Set([
            ...Object.keys(mcSurv),
            ...Object.keys(exSurv),
          ])) {
            const a = (mcSurv as Record<string, number>)[type] ?? 0;
            const b = (exSurv as Record<string, number>)[type] ?? 0;
            expect(Math.abs(a - b)).toBeLessThan(0.15);
          }
        }
      });
    }
  });

  test('an optimal-planner fleet is solved in optimal mode', () => {
    const matchup = MATCHUPS.find((m) => m.name.startsWith('HET: fast weak'))!;
    const dps = computeExactBattle(
      new Fleet('Enemy', buildShips(matchup.enemy)),
      new Fleet('Player', buildShips(matchup.player))
    );
    const optimal = computeExactBattle(
      new Fleet('Enemy', buildShips(matchup.enemy)),
      new Fleet('Player', buildShips(matchup.player), false, DamageType.OPTIMAL)
    );
    expect(dps.ok).toBe(true);
    expect(optimal.ok).toBe(true);
    // This initiative trap has a +57.86pp targeting gap between the two modes.
    expect(
      optimal.lastFleetStanding['Player'] - dps.lastFleetStanding['Player']
    ).toBeGreaterThan(0.2);
  });

  test('mixed optimal and DPS fleets optimize only the selected fleet', () => {
    const attacker = () => [
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
    const defender = () => [
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
    const model = new BattleModel(attacker(), defender(), false, false);
    const attackerOnly = new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'minimax',
      decisionRoles: ['A'],
    }).solveOutcome();
    const bothOptimal = new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'minimax',
    }).solveOutcome();

    const exact = computeExactBattle(
      new Fleet('D', defender()),
      new Fleet('A', attacker(), false, DamageType.OPTIMAL)
    );

    expect(attackerOnly.ok).toBe(true);
    expect(bothOptimal.ok).toBe(true);
    expect(exact.ok).toBe(true);
    expect(
      Math.abs(attackerOnly.pAttacker - bothOptimal.pAttacker)
    ).toBeGreaterThan(0.001);
    expect(exact.lastFleetStanding['A']).toBeCloseTo(attackerOnly.pAttacker, 9);
  });

  test('optimal versus AI assumes NPC targeting for the AI fleet', () => {
    const attacker = () => [
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
    const aiFleet = () => [
      new Ship(ShipType.Guardian, {
        hull: 2,
        computers: 2,
        initiative: 3,
        cannons: { ion: 3 },
      }),
      new Ship(ShipType.Ancient, {
        hull: 1,
        computers: 2,
        initiative: 3,
        cannons: { ion: 1 },
      }),
    ];
    const model = new BattleModel(attacker(), aiFleet(), false, false);
    const attackerOnly = new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'minimax',
      decisionRoles: ['A'],
    }).solveOutcome();
    const npcStillHeuristic = new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'minimax',
      decisionRoles: ['A', 'D'],
    }).solveOutcome();

    const exact = computeExactBattle(
      new Fleet('AI', aiFleet(), false, DamageType.OPTIMAL),
      new Fleet('Player', attacker(), false, DamageType.OPTIMAL)
    );

    expect(attackerOnly.ok).toBe(true);
    expect(npcStillHeuristic.ok).toBe(true);
    expect(exact.ok).toBe(true);
    expect(npcStillHeuristic.pAttacker).toBeCloseTo(attackerOnly.pAttacker, 9);
    expect(exact.lastFleetStanding['Player']).toBeCloseTo(
      attackerOnly.pAttacker,
      9
    );
  });

  describe('two mutually-optimal fleets', () => {
    const interceptor = () =>
      new Ship(ShipType.Interceptor, { initiative: 3, cannons: { ion: 1 } });
    const mixed = () => [
      new Ship(ShipType.Cruiser, {
        initiative: 2,
        hull: 1,
        cannons: { plasma: 1 },
      }),
      new Ship(ShipType.Interceptor, { initiative: 3, cannons: { ion: 1 } }),
    ];

    test('1v1 (no assignment choices at all) solves exactly', () => {
      const result = computeExactBattle(
        new Fleet('D', [interceptor()], false, DamageType.OPTIMAL),
        new Fleet('A', [interceptor()], false, DamageType.OPTIMAL)
      );
      expect(result.ok).toBe(true);
      expect(result.lastFleetStanding['A']).toBeCloseTo(5 / 11, 9);
    });

    test('homogeneous fleets solve exactly and match the DPS-vs-DPS solve', () => {
      const make = () => [interceptor(), interceptor(), interceptor()];
      const bothOptimal = computeExactBattle(
        new Fleet('D', make(), false, DamageType.OPTIMAL),
        new Fleet('A', make(), false, DamageType.OPTIMAL)
      );
      const bothDps = computeExactBattle(
        new Fleet('D', make()),
        new Fleet('A', make())
      );
      // Certify the substitution: one-sided optimization gains nothing against
      // a homogeneous enemy, so all three formulations agree.
      const oneSided = computeExactBattle(
        new Fleet('D', make()),
        new Fleet('A', make(), false, DamageType.OPTIMAL)
      );
      expect(bothOptimal.ok).toBe(true);
      expect(bothOptimal.lastFleetStanding['A']).toBeCloseTo(
        bothDps.lastFleetStanding['A'],
        9
      );
      expect(bothOptimal.lastFleetStanding['A']).toBeCloseTo(
        oneSided.lastFleetStanding['A'],
        9
      );
    });

    test('one mixed side keeps the non-trivial optimizer and solves exactly', () => {
      // Attacker is homogeneous → the defender's targeting is trivial; the
      // attacker (facing a mixed defender) keeps its optimal mode.
      const bothOptimal = computeExactBattle(
        new Fleet('D', mixed(), false, DamageType.OPTIMAL),
        new Fleet(
          'A',
          [interceptor(), interceptor()],
          false,
          DamageType.OPTIMAL
        )
      );
      const attackerOptimalOnly = computeExactBattle(
        new Fleet('D', mixed()),
        new Fleet(
          'A',
          [interceptor(), interceptor()],
          false,
          DamageType.OPTIMAL
        )
      );
      expect(bothOptimal.ok).toBe(true);
      expect(bothOptimal.lastFleetStanding['A']).toBeCloseTo(
        attackerOptimalOnly.lastFleetStanding['A'],
        9
      );
    });

    test('mixed fleets with choices on both sides solve exactly', () => {
      const result = computeExactBattle(
        new Fleet('D', mixed(), false, DamageType.OPTIMAL),
        new Fleet('A', mixed(), false, DamageType.OPTIMAL)
      );
      expect(result.ok).toBe(true);
      expect(result.lastFleetStanding['A']).toBeGreaterThanOrEqual(0);
      expect(result.lastFleetStanding['A']).toBeLessThanOrEqual(1);
    });
  });

  test('reports failure (not garbage) when caps are exceeded', () => {
    const matchup = MATCHUPS.find((m) => m.name.startsWith('HET: fast weak'))!;
    const result = computeExactBattle(
      new Fleet('Enemy', buildShips(matchup.enemy)),
      new Fleet('Player', buildShips(matchup.player)),
      {
        maxStates: 1,
        maxOutcomesPerSlot: 20_000,
        maxSweeps: 10_000,
        convergence: 1e-10,
        maxMillis: Infinity,
      }
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBeDefined();
  });
});
