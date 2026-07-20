import { describe, expect, test } from 'bun:test';
import { Ship, ShipType } from './ship';
import { Fleet } from './fleet';
import { CombatSimulator } from './combat-simulator';
import { DamageType } from 'src/constants';
import { BattleModel } from './battle-state';
import { WinProbabilitySolver } from './win-probability-solver';
import { computeExactBattle, computeExactCombat } from './exact-combat';
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
    expect(outcome.survivorDistribution).toHaveLength(2);
    expect(outcome.survivorDistribution[0].probability).toBeCloseTo(6 / 11, 9);
    expect(
      outcome.survivorDistribution[0].defenderSurvivors[ShipType.Interceptor]
    ).toBe(1);
    expect(outcome.survivorDistribution[1].probability).toBeCloseTo(5 / 11, 9);
    expect(
      outcome.survivorDistribution[1].attackerSurvivors[ShipType.Interceptor]
    ).toBe(1);
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
      new Ship(ShipType.Ancient, {
        hull: 1,
        computers: 2,
        initiative: 3,
        cannons: { ion: 1 },
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

describe('computeExactCombat', () => {
  test('reuses identity-free engagement solves within one multi-fleet request', () => {
    const interceptor = () =>
      new Ship(ShipType.Interceptor, {
        initiative: 3,
        cannons: { ion: 1 },
      });
    const result = computeExactCombat(
      Array.from(
        { length: 4 },
        (_, index) =>
          new Fleet(
            `Fleet ${index + 1}`,
            [interceptor()],
            false,
            DamageType.OPTIMAL
          )
      ),
      undefined,
      { plannerPreflight: false }
    );

    expect(result.ok).toBe(true);
    expect(result.exactDiagnostics).toEqual({
      engagementRequests: 6,
      engagementSolves: 1,
      engagementCacheHits: 5,
    });
  });

  test('keeps different weapon behavior in the engagement cache key', () => {
    const interceptor = (ion: number) =>
      new Ship(ShipType.Interceptor, {
        initiative: 3,
        cannons: { ion },
      });
    const result = computeExactCombat(
      [
        new Fleet('Top', [interceptor(2)]),
        new Fleet('Middle', [interceptor(1)]),
        new Fleet('Bottom', [interceptor(1)]),
      ],
      undefined,
      { plannerPreflight: false }
    );

    expect(result.ok).toBe(true);
    expect(result.exactDiagnostics).toEqual({
      engagementRequests: 3,
      engagementSolves: 2,
      engagementCacheHits: 1,
    });
  });

  test('reuses engagements with the same resolved initiative-slot order', () => {
    const combat = (initiatives: number[]) =>
      computeExactCombat(
        initiatives.map(
          (initiative, index) =>
            new Fleet(
              `Fleet ${index + 1}`,
              [
                new Ship(ShipType.Interceptor, {
                  initiative,
                  cannons: { ion: 1 },
                }),
              ],
              false,
              DamageType.OPTIMAL
            )
        ),
        undefined,
        { plannerPreflight: false }
      );
    const tied = combat([3, 3, 3, 3]);
    const shifted = combat([5, 4, 3, 3]);

    expect(shifted.ok).toBe(true);
    expect(shifted.lastFleetStanding).toEqual(tied.lastFleetStanding);
    expect(shifted.exactDiagnostics).toEqual({
      engagementRequests: 6,
      engagementSolves: 1,
      engagementCacheHits: 5,
    });
  });

  test('does not merge defender-first and attacker-first initiative orders', () => {
    const result = computeExactCombat(
      [1, 2, 3, 3].map(
        (initiative, index) =>
          new Fleet(
            `Fleet ${index + 1}`,
            [
              new Ship(ShipType.Interceptor, {
                initiative,
                cannons: { ion: 1 },
              }),
            ],
            false,
            DamageType.OPTIMAL
          )
      ),
      undefined,
      { plannerPreflight: false }
    );

    expect(result.ok).toBe(true);
    expect(result.exactDiagnostics).toEqual({
      engagementRequests: 6,
      engagementSolves: 2,
      engagementCacheHits: 4,
    });
  });

  test('composes a three-fleet exact battle in MultiBattle order', () => {
    const interceptor = () =>
      new Ship(ShipType.Interceptor, { initiative: 3, cannons: { ion: 1 } });

    const result = computeExactCombat([
      new Fleet('Defender', [interceptor()]),
      new Fleet('Attacker 1', [interceptor()]),
      new Fleet('Attacker 2', [interceptor()]),
    ]);

    expect(result.ok).toBe(true);
    expect(result.lastFleetStanding['Defender']).toBeCloseTo(66 / 121, 9);
    expect(result.lastFleetStanding['Attacker 1']).toBeCloseTo(30 / 121, 9);
    expect(result.lastFleetStanding['Attacker 2']).toBeCloseTo(25 / 121, 9);
    expect(result.drawPercentage).toBeCloseTo(0, 12);
    expect(result.expectedSurvivors['Defender'][ShipType.Interceptor]).toBe(1);
    expect(result.expectedSurvivors['Attacker 1'][ShipType.Interceptor]).toBe(
      1
    );
    expect(result.expectedSurvivors['Attacker 2'][ShipType.Interceptor]).toBe(
      1
    );

    // The two defender-win paths have the same final survivor composition,
    // but different fleets fought (and destroyed ships) in the first battle.
    // Keep them distinct for reputation attribution without changing the
    // aggregate defender win probability above.
    expect(result.survivorDistribution).toHaveLength(4);
    const defenderWins = result.survivorDistribution.filter(
      (entry) => entry.survivors['Defender'][ShipType.Interceptor] === 1
    );
    expect(defenderWins).toHaveLength(2);

    const attacker1ThenDefender = defenderWins.find(
      (entry) =>
        entry.destroyedShipsCreditedToFleet?.['Attacker 1'][
          ShipType.Interceptor
        ] === 1
    );
    expect(attacker1ThenDefender?.probability).toBeCloseTo(36 / 121, 9);
    expect(attacker1ThenDefender?.destroyedShipsCreditedToFleet).toEqual({
      Defender: { [ShipType.Interceptor]: 1 },
      'Attacker 1': { [ShipType.Interceptor]: 1 },
      'Attacker 2': {},
    });

    const attacker2ThenDefender = defenderWins.find(
      (entry) =>
        entry.destroyedShipsCreditedToFleet?.['Attacker 2'][
          ShipType.Interceptor
        ] === 1
    );
    expect(attacker2ThenDefender?.probability).toBeCloseTo(30 / 121, 9);
    expect(attacker2ThenDefender?.destroyedShipsCreditedToFleet).toEqual({
      Defender: { [ShipType.Interceptor]: 1 },
      'Attacker 1': {},
      'Attacker 2': { [ShipType.Interceptor]: 1 },
    });

    const attacker1Wins = result.survivorDistribution.find(
      (entry) => entry.survivors['Attacker 1'][ShipType.Interceptor] === 1
    );
    expect(attacker1Wins?.probability).toBeCloseTo(30 / 121, 9);
    expect(
      attacker1Wins?.destroyedShipsCreditedToFleet?.['Attacker 1'][
        ShipType.Interceptor
      ]
    ).toBe(2);

    const attacker2Wins = result.survivorDistribution.find(
      (entry) => entry.survivors['Attacker 2'][ShipType.Interceptor] === 1
    );
    expect(attacker2Wins?.probability).toBeCloseTo(25 / 121, 9);
    expect(
      attacker2Wins?.destroyedShipsCreditedToFleet?.['Attacker 2'][
        ShipType.Interceptor
      ]
    ).toBe(2);
  });

  test('leaves the top fleet absent from credits when the lower pair draw', () => {
    const result = computeExactCombat([
      new Fleet('Top', [new Ship(ShipType.Dreadnought)]),
      new Fleet('Lower 1', [new Ship(ShipType.Interceptor)]),
      new Fleet('Lower 2', [new Ship(ShipType.Cruiser, { rift: 1 })]),
    ]);

    expect(result.ok).toBe(true);
    const lowerPairDraw = result.survivorDistribution.find(
      (entry) =>
        entry.survivors.Top[ShipType.Dreadnought] === 1 &&
        !Object.prototype.hasOwnProperty.call(
          entry.destroyedShipsCreditedToFleet,
          'Top'
        )
    );

    // Rolls two and three repeat; among terminal rift rolls, six is the
    // mutual kill, so this lower-pair draw has probability (1/6) / (4/6).
    expect(lowerPairDraw?.probability).toBeCloseTo(1 / 4, 9);
    expect(lowerPairDraw?.destroyedShipsCreditedToFleet).toEqual({
      'Lower 1': { [ShipType.Cruiser]: 1 },
      'Lower 2': { [ShipType.Interceptor]: 1 },
    });
  });

  test('retains living retreaters separately from the final sector winner', () => {
    const result = computeExactCombat([
      new Fleet('Top', [new Ship(ShipType.Dreadnought)]),
      new Fleet('Middle', [new Ship(ShipType.Cruiser)]),
      new Fleet('Bottom', [new Ship(ShipType.Interceptor)]),
    ]);

    expect(result.ok).toBe(true);
    expect(result.lastFleetStanding).toEqual({
      Top: 1,
      Middle: 0,
      Bottom: 0,
    });
    expect(result.survivorDistribution).toEqual([
      {
        probability: 1,
        lastFleetStanding: 'Top',
        survivors: {
          Top: { [ShipType.Dreadnought]: 1 },
          Middle: { [ShipType.Cruiser]: 1 },
          Bottom: { [ShipType.Interceptor]: 1 },
        },
        destroyedShipsCreditedToFleet: {
          Bottom: {},
          Middle: {},
          Top: {},
        },
      },
    ]);
  });
});
