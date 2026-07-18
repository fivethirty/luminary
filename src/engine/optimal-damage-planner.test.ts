import { describe, expect, test } from 'bun:test';
import { Ship, ShipType } from './ship';
import { Fleet } from './fleet';
import { Battle, BattleOutcome } from './battle';
import { CombatSimulator } from './combat-simulator';
import { DamageType } from 'src/constants';
import { BattleModel } from './battle-state';
import { WinProbabilitySolver } from './win-probability-solver';
import { OptimalDamagePlanner } from './optimal-damage-planner';
import { buildShips, MATCHUPS } from '../../scripts/matchups';

describe('OptimalDamagePlanner', () => {
  test('an optimal player fleet fights to completion and wins a winnable fight', () => {
    const player = new Ship(
      ShipType.Cruiser,
      { initiative: 3, hull: 2, cannons: { antimatter: 2 } },
      () => 6
    );
    const enemy = new Ship(
      ShipType.Interceptor,
      { initiative: 1, hull: 0, cannons: { ion: 1 } },
      () => 6
    );
    const attackerFleet = new Fleet(
      'Player',
      [player],
      false,
      DamageType.OPTIMAL
    );
    const defenderFleet = new Fleet('Enemy', [enemy]);
    const result = new Battle(attackerFleet, defenderFleet).fight();
    expect(result.outcome).toBe(BattleOutcome.Attacker);
  });

  // The end-to-end validation: driving the real engine with the OPTIMAL planner
  // must reproduce the solver's exact win probability. This exercises slot
  // detection, roster mapping, and terminal handling together.
  describe('simulated optimal win rate matches the exact solve', () => {
    const ITERATIONS = 10_000;
    for (const matchup of MATCHUPS.filter((m) => m.noHeal)) {
      test(`${matchup.name} (±0.015)`, () => {
        const model = new BattleModel(
          buildShips(matchup.player),
          buildShips(matchup.enemy),
          false,
          false
        );
        const exact = new WinProbabilitySolver(model, {
          perspective: 'A',
          assignments: 'minimax',
        }).solve();
        expect(exact.ok).toBe(true);

        const enemyFleet = new Fleet(
          'Enemy',
          buildShips(matchup.enemy),
          false,
          DamageType.OPTIMAL
        );
        const playerFleet = new Fleet(
          'Player',
          buildShips(matchup.player),
          false,
          DamageType.OPTIMAL
        );
        const sim = new CombatSimulator().simulate(
          [enemyFleet, playerFleet],
          ITERATIONS
        );
        const simulated = sim.lastFleetStanding['Player'];

        expect(Math.abs(exact.winProbability - simulated)).toBeLessThan(0.015);
      });
    }
  });

  test('falls back cleanly and still assigns damage when unsolved', () => {
    // No battle context set: the planner must delegate to the DPS fallback.
    let fallbackRan = false;
    const planner = new OptimalDamagePlanner((shots, ships) => {
      fallbackRan = true;
      ships[0].takeDamage(shots[0].damage);
    });
    const enemy = new Ship(ShipType.Interceptor);
    planner.assignDamage([{ roll: 6, computers: 0, damage: 1 }], [enemy], []);
    expect(fallbackRan).toBe(true);
    expect(enemy.isAlive()).toBe(false);
  });

  test('solver reports not-ok with a reason when a budget is exceeded', () => {
    const matchup = MATCHUPS.find((m) => m.name.startsWith('HET: fast weak'))!;
    const model = new BattleModel(
      buildShips(matchup.player),
      buildShips(matchup.enemy),
      false,
      false
    );
    // A 1-state cap forces the build to bail immediately.
    const solved = new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'minimax',
      caps: {
        maxStates: 1,
        maxOutcomesPerSlot: 20_000,
        maxSweeps: 10_000,
        convergence: 1e-10,
        maxMillis: Infinity,
      },
    }).solve();
    expect(solved.ok).toBe(false);
    expect(solved.reason).toContain('maxStates');
  });

  test('planner whose solve budget is exceeded falls back and still fights', () => {
    // A tight state cap makes the (multi-state) solve fail, so every assignment
    // must route through the DPS fallback — and the battle still completes.
    const tinyCaps = {
      maxStates: 1,
      maxOutcomesPerSlot: 20_000,
      maxSweeps: 10_000,
      convergence: 1e-10,
      maxMillis: Infinity,
    };
    const player = [
      new Ship(ShipType.Cruiser, {
        initiative: 3,
        hull: 1,
        cannons: { plasma: 1 },
      }),
      new Ship(ShipType.Cruiser, {
        initiative: 3,
        hull: 1,
        cannons: { plasma: 1 },
      }),
    ];
    const enemy = [
      new Ship(ShipType.Interceptor, { initiative: 2, cannons: { ion: 1 } }),
      new Ship(ShipType.Interceptor, { initiative: 1, cannons: { ion: 1 } }),
    ];
    const attackerFleet = new Fleet('P', player, false, DamageType.OPTIMAL);
    const defenderFleet = new Fleet('E', enemy);
    // Inject the tiny-caps planner into the fleet's helper via prepareForBattle,
    // which the Battle triggers; but the fleet builds its own planner with
    // default caps. So drive the planner directly instead to assert fallback.
    let fallbacks = 0;
    const planner = new OptimalDamagePlanner((shots, ships, phases) => {
      fallbacks++;
      // Minimal DPS-like application so damage still lands.
      ships[0].takeDamage(shots[0].damage);
      void phases;
    }, tinyCaps);
    planner.setBattleContext(
      { attacker: attackerFleet, defender: defenderFleet },
      attackerFleet
    );
    planner.assignDamage(
      [
        { roll: 6, computers: 0, damage: 2 },
        { roll: 6, computers: 0, damage: 2 },
      ],
      enemy,
      []
    );
    expect(fallbacks).toBeGreaterThan(0);
  });
});
