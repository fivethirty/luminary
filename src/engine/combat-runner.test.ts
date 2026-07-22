import { describe, expect, test } from 'bun:test';
import { DamageType } from 'src/constants';
import { CombatRunner, CombatRunnerDependencies } from './combat-runner';
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
  test('uses one deadline for optimal exact, DPS exact, then DPS Monte Carlo', () => {
    let now = 0;
    const calls: string[] = [];
    const exactBudgets: number[] = [];
    let simulationDeadline = -1;
    const deps: Partial<CombatRunnerDependencies> = {
      now: () => now,
      preflight: (fleets) => ({
        overrides: fleets.map(() => undefined),
        reason: null,
        estimatedStates: 12,
      }),
      computeExact: (fleets, caps) => {
        const targeting = fleets.some(
          (candidate) => candidate.getDamageType() === DamageType.OPTIMAL
        )
          ? 'optimal'
          : 'dps';
        calls.push(`exact:${targeting}`);
        exactBudgets.push(caps.maxMillis);
        now += targeting === 'optimal' ? 100 : 200;
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
      {
        maxMillis: 1_000,
        optimalAttemptMillis: 300,
        monteCarloReserveMillis: 200,
      },
      deps
    ).run([fleet('defender'), fleet('attacker')]);

    expect(calls).toEqual(['exact:optimal', 'exact:dps', 'monte-carlo:dps']);
    expect(exactBudgets).toEqual([300, 700]);
    expect(simulationDeadline).toBe(1_000);
    expect(result.tier).toBe('monte-carlo-dps');
    expect(result.methodLabel).toBe('Monte Carlo · DPS targeting');
    expect(result.iterations).toBe(5_000);
    expect(result.diagnostics.elapsedMillis).toBe(350);
    expect(result.diagnostics.deadlineExceeded).toBe(false);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
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
        computeExact: (attemptFleets) => {
          calls.push(
            attemptFleets.map((candidate) => candidate.getDamageType())
          );
          return exactResult(true);
        },
      }
    );

    expect(estimateExactStateSpace(fleets)).toBe(72_900);
    expect(exactPlannerPreflight(fleets).reason).toBe('complexity');

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
      { tier: 'exact-optimal', status: 'skipped' },
      { tier: 'exact-dps', status: 'success' },
    ]);
  });

  test('reports exact optimal when the requested solve succeeds', () => {
    const result = new CombatRunner(
      {},
      {
        preflight: (fleets) => ({
          overrides: fleets.map(() => undefined),
          reason: null,
          estimatedStates: 4,
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
        preflight: () => ({
          overrides: [DamageType.DPS, DamageType.DPS],
          reason: 'complexity',
          estimatedStates: 100_000,
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
      'exact-optimal',
      'exact-dps',
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
        preflight: () => ({
          overrides: [DamageType.DPS, undefined],
          reason: 'complexity',
          estimatedStates: 100_000,
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
