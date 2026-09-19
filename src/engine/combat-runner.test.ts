import { describe, expect, test } from 'bun:test';
import { DamageType } from 'src/constants';
import {
  CombatRunner,
  CombatRunnerDependencies,
  DEFAULT_CALIBRATION,
} from './combat-runner';
import { REFERENCE_PROBE_MILLIS } from './solver-calibration';
import { CombatSimulationResult } from './combat-simulator';
import {
  estimateExactStateSpace,
  ExactBattleResult,
  exactPlannerPreflight,
} from './exact-combat';
import { Fleet } from './fleet';
import { Ship, ShipType } from './ship';

function fleet(id: string, damageType: DamageType = DamageType.OPTIMAL): Fleet {
  return new Fleet(
    id,
    [new Ship(ShipType.Interceptor, { cannons: { ion: 1 } })],
    false,
    damageType
  );
}

function exactResult(ok: boolean, reason?: string): ExactBattleResult {
  return {
    ok,
    reason,
    lastFleetStanding: ok ? { defender: 0.6, attacker: 0.4 } : {},
    drawPercentage: 0,
    expectedSurvivors: ok ? { defender: {}, attacker: {} } : {},
    survivorDistribution: [],
    timeTaken: 0,
  };
}

function simulationResult(iterations = 5000): CombatSimulationResult {
  return {
    lastFleetStanding: { defender: 0.6, attacker: 0.4 },
    drawPercentage: 0,
    expectedSurvivors: { defender: {}, attacker: {} },
    survivorDistribution: [],
    timeTaken: 0,
    iterations,
  };
}

describe('CombatRunner', () => {
  test('runs exact DPS first, then optimal on the remaining budget, then Monte Carlo only if DPS fails', () => {
    let now = 0;
    const calls: string[] = [];
    const exactBudgets: number[] = [];
    let simulationDeadline = -1;
    const deps: Partial<CombatRunnerDependencies> = {
      now: () => now,
      probe: () => REFERENCE_PROBE_MILLIS,
      preflight: (fleets) => ({
        overrides: fleets.map(() => undefined),
        reason: null,
        estimatedStates: 12,
        estimatedOptions: 1_000,
      }),
      computeExact: (fleets, caps) => {
        const targeting = fleets.some(
          (candidate) => candidate.getDamageType() === DamageType.OPTIMAL
        )
          ? 'optimal'
          : 'dps';
        calls.push(`exact:${targeting}`);
        exactBudgets.push(caps.maxMillis);
        now += 200;
        return exactResult(false, `${targeting} failed`);
      },
      simulate: (fleets, iterations, options) => {
        calls.push('monte-carlo:dps');
        expect(
          fleets.every(
            (candidate) => candidate.getDamageType() !== DamageType.OPTIMAL
          )
        ).toBe(true);
        expect(iterations).toBe(5_000);
        simulationDeadline = options.deadline!;
        now += 50;
        return simulationResult(iterations);
      },
    };

    const result = new CombatRunner(
      { maxMillis: 1_000, monteCarloReserveMillis: 200 },
      deps
    ).run([fleet('defender'), fleet('attacker')]);

    // DPS failed, so optimal is skipped without spending budget and sampling
    // gets the rest of the deadline.
    expect(calls).toEqual(['exact:dps', 'monte-carlo:dps']);
    expect(exactBudgets).toEqual([800]);
    expect(simulationDeadline).toBe(1_000);
    expect(result.tier).toBe('monte-carlo-dps');
    expect(result.methodLabel).toBe('Monte Carlo · DPS targeting');
    expect(result.iterations).toBe(5_000);
    expect(
      result.diagnostics.attempts.map(({ tier, status }) => ({ tier, status }))
    ).toEqual([
      { tier: 'exact-dps', status: 'failed' },
      { tier: 'exact-optimal', status: 'skipped' },
      { tier: 'monte-carlo-dps', status: 'success' },
    ]);
    expect(result.diagnostics.optimalDecision).toBeNull();
    expect(result.diagnostics.elapsedMillis).toBe(250);
    expect(result.diagnostics.deadlineExceeded).toBe(false);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  test('gives a successful DPS solve the whole exact budget, then optimal the remainder', () => {
    let now = 0;
    const exactBudgets: number[] = [];
    const calls: string[] = [];
    const result = new CombatRunner(
      { maxMillis: 1_000, monteCarloReserveMillis: 200 },
      {
        now: () => now,
        probe: () => REFERENCE_PROBE_MILLIS,
        preflight: (fleets) => ({
          overrides: fleets.map(() => undefined),
          reason: null,
          estimatedStates: 12,
          estimatedOptions: 1_000_000,
        }),
        computeExact: (fleets, caps) => {
          const optimal = fleets.some(
            (candidate) => candidate.getDamageType() === DamageType.OPTIMAL
          );
          calls.push(optimal ? 'optimal' : 'dps');
          exactBudgets.push(caps.maxMillis);
          now += optimal ? 150 : 100;
          return exactResult(true);
        },
      }
    ).run([fleet('defender'), fleet('attacker')]);

    // Reference rate: 1,000,000 options x 0.2 ms per thousand = 200 ms,
    // inside the 700 ms left after the DPS solve.
    expect(calls).toEqual(['dps', 'optimal']);
    expect(exactBudgets).toEqual([800, 700]);
    expect(result.tier).toBe('exact-optimal');
    expect(result.methodLabel).toBe('Exact · optimal targeting');
    expect(result.diagnostics.fallbacks).toEqual([]);
    expect(result.diagnostics.optimalDecision).toMatchObject({
      attempted: true,
      predictedMillis: 200,
      remainingMillis: 700,
      rateSource: 'reference',
    });
    // The attempt's observed cost becomes the learned rate for next time.
    expect(result.diagnostics.calibration).toMatchObject({
      msPerEstimatedOption: 150 / 1_000_000,
      optimalSamples: 1,
    });
  });

  test('attempts optimal without a prediction when the preflight has no estimate', () => {
    // Multi-fleet combat is not estimated; it keeps the DPS result as its
    // fallback and gets the remaining exact budget.
    let now = 0;
    const calls: string[] = [];
    const exactBudgets: number[] = [];
    const result = new CombatRunner(
      { maxMillis: 1_000, monteCarloReserveMillis: 200 },
      {
        now: () => now,
        probe: () => REFERENCE_PROBE_MILLIS,
        preflight: (fleets) => ({
          overrides: fleets.map(() => undefined),
          reason: null,
          estimatedStates: 0,
          estimatedOptions: null,
        }),
        computeExact: (fleets, caps) => {
          calls.push(
            fleets.some(
              (candidate) => candidate.getDamageType() === DamageType.OPTIMAL
            )
              ? 'optimal'
              : 'dps'
          );
          exactBudgets.push(caps.maxMillis);
          now += 50;
          return exactResult(true);
        },
      }
    ).run([fleet('defender'), fleet('attacker-1'), fleet('attacker-2')]);

    expect(calls).toEqual(['dps', 'optimal']);
    expect(exactBudgets).toEqual([800, 750]);
    expect(result.tier).toBe('exact-optimal');
    expect(result.diagnostics.optimalDecision).toMatchObject({
      attempted: true,
      predictedMillis: null,
      remainingMillis: 750,
    });
    // Nothing to learn a rate from without an estimate.
    expect(result.diagnostics.calibration.msPerEstimatedOption).toBeNull();
  });

  test('skips optimal when the predicted cost exceeds the remaining budget', () => {
    let now = 0;
    const calls: string[] = [];
    const result = new CombatRunner(
      { maxMillis: 1_000, monteCarloReserveMillis: 200 },
      {
        now: () => now,
        probe: () => REFERENCE_PROBE_MILLIS,
        preflight: (fleets) => ({
          overrides: fleets.map(() => undefined),
          reason: null,
          estimatedStates: 12,
          estimatedOptions: 5_000_000,
        }),
        computeExact: (fleets) => {
          calls.push(
            fleets.some(
              (candidate) => candidate.getDamageType() === DamageType.OPTIMAL
            )
              ? 'optimal'
              : 'dps'
          );
          now += 100;
          return exactResult(true);
        },
      }
    ).run([fleet('defender'), fleet('attacker')]);

    expect(calls).toEqual(['dps']);
    expect(result.tier).toBe('exact-dps');
    expect(result.diagnostics.optimalDecision).toMatchObject({
      attempted: false,
      predictedMillis: 1_000,
      remainingMillis: 700,
    });
    expect(result.diagnostics.attempts[1]).toMatchObject({
      tier: 'exact-optimal',
      status: 'skipped',
    });
    expect(result.diagnostics.attempts[1].reason).toContain('predicted');
    expect(result.diagnostics.fallbacks).toEqual([
      {
        from: 'exact-optimal',
        to: 'exact-dps',
        reason: result.diagnostics.attempts[1].reason!,
      },
    ]);
  });

  test('a learned rate replaces the reference prediction', () => {
    let now = 0;
    const calls: string[] = [];
    const runner = new CombatRunner(
      { maxMillis: 1_000, monteCarloReserveMillis: 200 },
      {
        now: () => now,
        probe: () => REFERENCE_PROBE_MILLIS,
        preflight: (fleets) => ({
          overrides: fleets.map(() => undefined),
          reason: null,
          estimatedStates: 12,
          estimatedOptions: 5_000_000,
        }),
        computeExact: (fleets) => {
          calls.push(
            fleets.some(
              (candidate) => candidate.getDamageType() === DamageType.OPTIMAL
            )
              ? 'optimal'
              : 'dps'
          );
          now += 10;
          return exactResult(true);
        },
      }
    );
    const result = runner.run([fleet('defender'), fleet('attacker')], {
      ...DEFAULT_CALIBRATION,
      msPerEstimatedOption: 1e-5,
      optimalSamples: 1,
    });

    expect(calls).toEqual(['dps', 'optimal']);
    expect(result.tier).toBe('exact-optimal');
    expect(result.diagnostics.optimalDecision).toMatchObject({
      attempted: true,
      rateSource: 'learned',
    });
    expect(result.diagnostics.optimalDecision!.predictedMillis).toBeCloseTo(
      50,
      9
    );
  });

  test('a timed-out optimal attempt returns the DPS result and raises the learned rate', () => {
    let now = 0;
    const result = new CombatRunner(
      { maxMillis: 1_000, monteCarloReserveMillis: 200 },
      {
        now: () => now,
        probe: () => REFERENCE_PROBE_MILLIS,
        preflight: (fleets) => ({
          overrides: fleets.map(() => undefined),
          reason: null,
          estimatedStates: 12,
          estimatedOptions: 1_000_000,
        }),
        computeExact: (fleets) => {
          const optimal = fleets.some(
            (candidate) => candidate.getDamageType() === DamageType.OPTIMAL
          );
          now += optimal ? 700 : 100;
          return optimal
            ? exactResult(false, 'time budget exceeded')
            : exactResult(true);
        },
      }
    ).run([fleet('defender'), fleet('attacker')]);

    expect(result.tier).toBe('exact-dps');
    expect(result.method).toBe('exact');
    expect(
      result.diagnostics.attempts.map(({ tier, status }) => ({ tier, status }))
    ).toEqual([
      { tier: 'exact-dps', status: 'success' },
      { tier: 'exact-optimal', status: 'failed' },
    ]);
    expect(result.diagnostics.fallbacks).toEqual([
      {
        from: 'exact-optimal',
        to: 'exact-dps',
        reason: 'time budget exceeded',
      },
    ]);
    // Twice the observed lower bound of 700 ms / 1,000,000 options.
    expect(result.diagnostics.calibration.msPerEstimatedOption).toBeCloseTo(
      1.4e-3,
      12
    );
    // With that rate the same fleet is predicted at 1,400 ms and skipped.
    expect(result.diagnostics.calibration.optimalSamples).toBe(1);
  });

  test('probes the device once and scales reference predictions by it', () => {
    let now = 0;
    let probes = 0;
    const deps: Partial<CombatRunnerDependencies> = {
      now: () => now,
      probe: () => {
        probes++;
        // Three times the reference machine's probe time.
        return REFERENCE_PROBE_MILLIS * 3;
      },
      preflight: (fleets) => ({
        overrides: fleets.map(() => undefined),
        reason: null,
        estimatedStates: 12,
        estimatedOptions: 2_000_000,
      }),
      computeExact: () => {
        now += 10;
        return exactResult(true);
      },
    };
    const runner = new CombatRunner(
      { maxMillis: 1_000, monteCarloReserveMillis: 200 },
      deps
    );
    const first = runner.run([fleet('defender'), fleet('attacker')]);

    expect(probes).toBe(1);
    expect(first.diagnostics.calibration).toMatchObject({
      deviceFactor: 3,
      probeMillis: REFERENCE_PROBE_MILLIS * 3,
    });
    // 2,000,000 options x 0.2 ms per thousand x 3 = 1,200 ms > 790 left.
    expect(first.diagnostics.optimalDecision).toMatchObject({
      attempted: false,
      predictedMillis: 1_200,
      rateSource: 'reference',
    });
    expect(first.tier).toBe('exact-dps');

    // A carried calibration is not probed again.
    const second = runner.run(
      [fleet('defender'), fleet('attacker')],
      first.diagnostics.calibration
    );
    expect(probes).toBe(1);
    expect(second.diagnostics.calibration.deviceFactor).toBe(3);
  });

  test('exact work counters are reported but do not change the device factor', () => {
    let now = 0;
    const result = new CombatRunner(
      { maxMillis: 1_000, monteCarloReserveMillis: 200 },
      {
        now: () => now,
        probe: () => REFERENCE_PROBE_MILLIS,
        preflight: (fleets) => ({
          overrides: fleets.map(() => undefined),
          reason: null,
          estimatedStates: 12,
          estimatedOptions: 1_000_000,
        }),
        computeExact: (fleets) => {
          const optimal = fleets.some(
            (candidate) => candidate.getDamageType() === DamageType.OPTIMAL
          );
          now += optimal ? 10 : 240;
          return {
            ...exactResult(true),
            exactDiagnostics: {
              engagementRequests: 1,
              engagementSolves: 1,
              engagementCacheHits: 0,
              states: 20_000,
              chanceOutcomes: 100_000,
            },
          };
        },
      }
    ).run([fleet('defender'), fleet('attacker')]);

    // A slow, rift-heavy DPS solve must not make the device look slow: the
    // prediction uses the probe's factor of 1 and the attempt goes ahead.
    expect(result.diagnostics.calibration.deviceFactor).toBe(1);
    expect(result.diagnostics.attempts[0].exactDiagnostics).toMatchObject({
      states: 20_000,
      chanceOutcomes: 100_000,
    });
    expect(result.diagnostics.optimalDecision).toMatchObject({
      attempted: true,
      predictedMillis: 200,
    });
    expect(result.tier).toBe('exact-optimal');
  });

  test('routes the measured two-type mirror straight to exact DPS', () => {
    const ships = () => [
      ...Array.from(
        { length: 8 },
        () =>
          new Ship(ShipType.Interceptor, {
            initiative: 3,
            cannons: { ion: 1 },
          })
      ),
      ...Array.from(
        { length: 4 },
        () =>
          new Ship(ShipType.Cruiser, {
            initiative: 2,
            hull: 1,
            cannons: { ion: 1 },
          })
      ),
    ];
    const fleets = [
      new Fleet('defender', ships(), false, DamageType.OPTIMAL),
      new Fleet('attacker', ships(), false, DamageType.OPTIMAL),
    ];
    const calls: DamageType[][] = [];
    const runner = new CombatRunner(
      { maxMillis: 1_000, monteCarloReserveMillis: 200 },
      {
        probe: () => REFERENCE_PROBE_MILLIS,
        computeExact: (attemptFleets) => {
          calls.push(
            attemptFleets.map((candidate) => candidate.getDamageType())
          );
          return exactResult(true);
        },
      }
    );

    expect(estimateExactStateSpace(fleets)).toBe(72_900);
    const preflight = exactPlannerPreflight(fleets);
    expect(preflight.reason).toBe('complexity');
    // Under the state cutoff now, so the option probe runs: millions of
    // assignment options, seconds at the reference rate.
    expect(preflight.estimatedOptions).toBeGreaterThan(1_000_000);

    const result = runner.run(fleets);

    expect(calls).toEqual([[DamageType.DPS, DamageType.DPS]]);
    expect(result.tier).toBe('exact-dps');
    expect(result.methodLabel).toBe('Exact · DPS targeting');
    expect(
      result.diagnostics.attempts.map(({ tier, status }) => ({
        tier,
        status,
      }))
    ).toEqual([
      { tier: 'exact-dps', status: 'success' },
      { tier: 'exact-optimal', status: 'skipped' },
    ]);
    expect(result.diagnostics.optimalDecision).toMatchObject({
      attempted: false,
      rateSource: 'reference',
    });
    expect(result.diagnostics.optimalDecision!.predictedMillis).toBeGreaterThan(
      1_000
    );
  });

  test('skips optimal exact when the assignment-option estimate exceeds its cutoff', () => {
    // Two antimatter starbases and a dreadnought against four rift cruisers:
    // the state bound passes the state cutoff, but each of the attacker's 70
    // rift outcomes offers several distinct damage assignments against the
    // heterogeneous defender, so the uncapped minimax graph holds about
    // 760,000 assignment options and takes about 1.5 s.
    const starbase = () =>
      new Ship(ShipType.Starbase, {
        hull: 4,
        initiative: 2,
        cannons: { antimatter: 2 },
      });
    const defender = new Fleet(
      'defender',
      [
        starbase(),
        starbase(),
        new Ship(ShipType.Dreadnought, {
          hull: 8,
          computers: 2,
          initiative: -3,
          cannons: { antimatter: 1 },
        }),
      ],
      false,
      DamageType.OPTIMAL
    );
    const attacker = new Fleet(
      'attacker',
      Array.from(
        { length: 4 },
        () =>
          new Ship(ShipType.Cruiser, {
            hull: 3,
            shields: 3,
            initiative: 3,
            rift: 1,
          })
      ),
      false,
      DamageType.OPTIMAL
    );

    const preflight = exactPlannerPreflight([defender, attacker]);
    expect(preflight.estimatedStates).toBe(44_100);
    expect(preflight.estimatedOptions).toBeGreaterThanOrEqual(200_000);
    expect(preflight.reason).toBe('complexity');
    expect(preflight.overrides).toEqual([DamageType.DPS, DamageType.DPS]);

    const calls: DamageType[][] = [];
    const result = new CombatRunner(
      {},
      {
        probe: () => REFERENCE_PROBE_MILLIS,
        computeExact: (attemptFleets) => {
          calls.push(
            attemptFleets.map((candidate) => candidate.getDamageType())
          );
          return exactResult(true);
        },
      }
    ).run([defender, attacker]);

    expect(calls).toEqual([[DamageType.DPS, DamageType.DPS]]);
    expect(result.tier).toBe('exact-dps');
    expect(result.diagnostics.attempts[1]).toMatchObject({
      tier: 'exact-optimal',
      status: 'skipped',
    });
    // 7.8 million options at the reference rate is seconds, far over budget.
    expect(result.diagnostics.attempts[1].reason).toContain('predicted');
    expect(result.diagnostics.optimalDecision!.predictedMillis).toBeGreaterThan(
      1_000
    );
    expect(result.diagnostics.preflight.estimatedOptions).toBe(
      preflight.estimatedOptions
    );
  });

  test('keeps optimal exact for a small heterogeneous mirror', () => {
    // Four interceptors plus two cruisers per side stay well inside both
    // cutoffs (3,600 states, tens of thousands of estimated options) and
    // solve uncapped in under 100 ms.
    const ships = () => [
      ...Array.from(
        { length: 4 },
        () =>
          new Ship(ShipType.Interceptor, {
            initiative: 3,
            cannons: { ion: 1 },
          })
      ),
      ...Array.from(
        { length: 2 },
        () =>
          new Ship(ShipType.Cruiser, {
            initiative: 2,
            hull: 1,
            cannons: { ion: 1 },
          })
      ),
    ];
    const preflight = exactPlannerPreflight([
      new Fleet('defender', ships(), false, DamageType.OPTIMAL),
      new Fleet('attacker', ships(), false, DamageType.OPTIMAL),
    ]);
    expect(preflight.estimatedStates).toBe(3_600);
    expect(preflight.estimatedOptions).toBeGreaterThan(0);
    expect(preflight.estimatedOptions!).toBeLessThan(200_000);
    expect(preflight.reason).toBeNull();
    expect(preflight.overrides).toEqual([undefined, undefined]);
  });

  test('reports exact optimal when the requested solve succeeds', () => {
    const result = new CombatRunner(
      {},
      {
        probe: () => REFERENCE_PROBE_MILLIS,
        preflight: (fleets) => ({
          overrides: fleets.map(() => undefined),
          reason: null,
          estimatedStates: 4,
          estimatedOptions: 10,
        }),
        computeExact: () => exactResult(true),
      }
    ).run([fleet('defender'), fleet('attacker')]);

    expect(result.method).toBe('exact');
    expect(result.targeting).toBe('optimal');
    expect(result.tier).toBe('exact-optimal');
    expect(result.methodLabel).toBe('Exact · optimal targeting');
    expect(result.diagnostics.fallbacks).toEqual([]);
    expect('ok' in result).toBe(false);
    expect('reason' in result).toBe(false);
  });

  test('does not retry an exact DPS policy that already failed', () => {
    let exactCalls = 0;
    let monteCarloDamageTypes: DamageType[] = [];
    const result = new CombatRunner(
      {},
      {
        probe: () => REFERENCE_PROBE_MILLIS,
        preflight: () => ({
          overrides: [DamageType.DPS, DamageType.DPS],
          reason: 'complexity',
          estimatedStates: 100_000,
          estimatedOptions: null,
        }),
        computeExact: () => {
          exactCalls++;
          return exactResult(false, 'DPS exact cap exceeded');
        },
        simulate: (fleets) => {
          monteCarloDamageTypes = fleets.map((candidate) =>
            candidate.getDamageType()
          );
          return simulationResult(2_500);
        },
      }
    ).run([fleet('defender'), fleet('attacker')]);

    expect(exactCalls).toBe(1);
    expect(monteCarloDamageTypes).toEqual([DamageType.DPS, DamageType.DPS]);
    expect(result.diagnostics.attempts.map((attempt) => attempt.tier)).toEqual([
      'exact-dps',
      'exact-optimal',
      'monte-carlo-dps',
    ]);
    expect(result.iterations).toBe(2_500);
  });

  test('preserves selected NPC targeting through optimal fallback', () => {
    const exactDamageTypes: DamageType[][] = [];
    let monteCarloDamageTypes: DamageType[] = [];
    const result = new CombatRunner(
      {},
      {
        probe: () => REFERENCE_PROBE_MILLIS,
        preflight: () => ({
          overrides: [DamageType.DPS, undefined],
          reason: 'complexity',
          estimatedStates: 100_000,
          estimatedOptions: null,
        }),
        computeExact: (fleets) => {
          exactDamageTypes.push(fleets.map((fleet) => fleet.getDamageType()));
          return exactResult(false, 'policy exact cap exceeded');
        },
        simulate: (fleets) => {
          monteCarloDamageTypes = fleets.map((fleet) => fleet.getDamageType());
          return simulationResult(1_000);
        },
      }
    ).run([fleet('defender'), fleet('attacker', DamageType.NPC)]);

    expect(exactDamageTypes).toEqual([[DamageType.DPS, DamageType.NPC]]);
    expect(monteCarloDamageTypes).toEqual([DamageType.DPS, DamageType.NPC]);
    expect(result.tier).toBe('monte-carlo-dps');
    expect(result.methodLabel).toBe('Monte Carlo · DPS/NPC targeting');
  });
});
