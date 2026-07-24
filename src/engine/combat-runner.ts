import { DamageType } from 'src/constants';
import {
  CombatSimulationOptions,
  CombatSimulationResult,
  CombatSimulator,
} from './combat-simulator';
import {
  computeExactCombat,
  ExactCombatDiagnostics,
  ExactBattleResult,
  ExactCombatOptions,
  exactPlannerPreflight,
  ExactPlannerPreflight,
  EXACT_INTERACTIVE_CAPS,
} from './exact-combat';
import { Fleet } from './fleet';
import { CombatOutcomeSummary } from './combat-result';
import { SolverCaps } from './win-probability-solver';

export type CombatTier = 'exact-optimal' | 'exact-dps' | 'monte-carlo-dps';

type CombatAttempt = {
  tier: CombatTier;
  status: 'success' | 'failed' | 'skipped';
  budgetMillis: number;
  elapsedMillis: number;
  reason?: string;
  exactDiagnostics?: ExactCombatDiagnostics;
};

type CombatFallback = {
  from: CombatTier;
  to: CombatTier;
  reason: string;
};

export type CombatRunDiagnostics = {
  deadlineMillis: number;
  elapsedMillis: number;
  preflight: {
    reason: ExactPlannerPreflight['reason'];
    estimatedStates: number;
  };
  attempts: CombatAttempt[];
  fallbacks: CombatFallback[];
  deadlineExceeded: boolean;
};

export type CombatRunResult = CombatOutcomeSummary & {
  method: 'exact' | 'monte-carlo';
  targeting: 'optimal' | 'dps-policy';
  tier: CombatTier;
  methodLabel: string;
  iterations?: number;
  diagnostics: CombatRunDiagnostics;
};

type CombatRunnerOptions = {
  // One wall-clock budget covers failed exact attempts and sampled fallback.
  maxMillis?: number;
  // An un-preflighted minimax attempt gets only a bounded slice, leaving time
  // for the exact policy tier and Monte Carlo rather than monopolizing the UI.
  optimalAttemptMillis?: number;
  monteCarloReserveMillis?: number;
  monteCarloIterations?: number;
  exactCaps?: SolverCaps;
};

type ExactCombat = (
  fleets: Fleet[],
  caps: SolverCaps,
  options: ExactCombatOptions
) => ExactBattleResult;

type SimulateCombat = (
  fleets: Fleet[],
  iterations: number,
  options: CombatSimulationOptions
) => CombatSimulationResult;

export type CombatRunnerDependencies = {
  now: () => number;
  computeExact: ExactCombat;
  simulate: SimulateCombat;
  preflight: (fleets: readonly Fleet[]) => ExactPlannerPreflight;
};

const DEFAULT_MAX_MILLIS = 950;
const DEFAULT_OPTIMAL_ATTEMPT_MILLIS = 300;
const DEFAULT_MONTE_CARLO_RESERVE_MILLIS = 350;
const DEFAULT_MONTE_CARLO_ITERATIONS = 5_000;

function methodLabel(tier: CombatTier, fleets: readonly Fleet[]): string {
  if (tier === 'exact-optimal') return 'Exact · optimal targeting';

  const policies = new Set(fleets.map((fleet) => fleet.getDamageType()));
  const policy =
    policies.size === 1 && policies.has(DamageType.NPC)
      ? 'NPC'
      : policies.has(DamageType.NPC)
        ? 'DPS/NPC'
        : 'DPS';
  const method = tier === 'exact-dps' ? 'Exact' : 'Monte Carlo';
  return `${method} · ${policy} targeting`;
}

const DEFAULT_DEPENDENCIES: CombatRunnerDependencies = {
  now: Date.now,
  computeExact: computeExactCombat,
  simulate: (fleets, iterations, options) =>
    new CombatSimulator().simulate(fleets, iterations, options),
  preflight: exactPlannerPreflight,
};

/**
 * Owns the interactive strategy ladder and its one request-wide deadline.
 * Fleets must use stable internal IDs as `Fleet.name`; display names belong at
 * the UI boundary because engine result maps are keyed by this identity.
 */
export class CombatRunner {
  private readonly options: Required<CombatRunnerOptions>;
  private readonly deps: CombatRunnerDependencies;

  constructor(
    options: CombatRunnerOptions = {},
    dependencies: Partial<CombatRunnerDependencies> = {}
  ) {
    this.options = {
      maxMillis: options.maxMillis ?? DEFAULT_MAX_MILLIS,
      optimalAttemptMillis:
        options.optimalAttemptMillis ?? DEFAULT_OPTIMAL_ATTEMPT_MILLIS,
      monteCarloReserveMillis:
        options.monteCarloReserveMillis ?? DEFAULT_MONTE_CARLO_RESERVE_MILLIS,
      monteCarloIterations:
        options.monteCarloIterations ?? DEFAULT_MONTE_CARLO_ITERATIONS,
      exactCaps: options.exactCaps ?? EXACT_INTERACTIVE_CAPS,
    };
    this.deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  }

  run(fleets: Fleet[]): CombatRunResult {
    const startedAt = this.deps.now();
    const deadline = startedAt + this.options.maxMillis;
    const exactDeadline =
      deadline -
      Math.min(
        this.options.monteCarloReserveMillis,
        Math.max(0, this.options.maxMillis)
      );
    const preflight = this.deps.preflight(fleets);
    const attempts: CombatAttempt[] = [];
    const fallbacks: CombatFallback[] = [];

    const preflightFleets = cloneFleets(fleets, preflight.overrides);
    const preflightHasOptimal = preflightFleets.some(
      (fleet) => fleet.getDamageType() === DamageType.OPTIMAL
    );
    const requestedHasOptimal = fleets.some(
      (fleet) => fleet.getDamageType() === DamageType.OPTIMAL
    );

    if (preflight.reason === 'complexity' && requestedHasOptimal) {
      attempts.push({
        tier: 'exact-optimal',
        status: 'skipped',
        budgetMillis: 0,
        elapsedMillis: 0,
        reason: `preflight state estimate ${preflight.estimatedStates} exceeds the interactive cutoff`,
      });
      fallbacks.push({
        from: 'exact-optimal',
        to: 'exact-dps',
        reason: 'complexity preflight',
      });
    } else {
      const tier: CombatTier = preflightHasOptimal
        ? 'exact-optimal'
        : 'exact-dps';
      const remaining = Math.max(0, exactDeadline - this.deps.now());
      const budget = preflightHasOptimal
        ? Math.min(remaining, this.options.optimalAttemptMillis)
        : remaining;
      const exact = this.tryExact(preflightFleets, tier, budget, attempts);
      if (exact) {
        return this.exactResult(
          exact,
          tier,
          preflightFleets,
          startedAt,
          deadline,
          preflight,
          attempts,
          fallbacks
        );
      }
      const failure = attempts.at(-1)?.reason ?? 'exact solve failed';
      if (tier === 'exact-optimal') {
        fallbacks.push({ from: tier, to: 'exact-dps', reason: failure });
      } else {
        fallbacks.push({
          from: tier,
          to: 'monte-carlo-dps',
          reason: failure,
        });
      }
    }

    const alreadyTriedDps = attempts.some(
      (attempt) => attempt.tier === 'exact-dps' && attempt.status !== 'skipped'
    );
    const dpsFleets = cloneFleets(
      fleets,
      fleets.map((fleet) =>
        fleet.getDamageType() === DamageType.OPTIMAL
          ? DamageType.DPS
          : undefined
      )
    );

    if (!alreadyTriedDps) {
      const budget = Math.max(0, exactDeadline - this.deps.now());
      const exactDps = this.tryExact(dpsFleets, 'exact-dps', budget, attempts);
      if (exactDps) {
        return this.exactResult(
          exactDps,
          'exact-dps',
          dpsFleets,
          startedAt,
          deadline,
          preflight,
          attempts,
          fallbacks
        );
      }
      const failure = attempts.at(-1)?.reason ?? 'exact DPS solve failed';
      fallbacks.push({
        from: 'exact-dps',
        to: 'monte-carlo-dps',
        reason: failure,
      });
    }

    const attemptStartedAt = this.deps.now();
    const simulation = this.deps.simulate(
      dpsFleets,
      this.options.monteCarloIterations,
      { deadline, now: this.deps.now }
    );
    attempts.push({
      tier: 'monte-carlo-dps',
      status: 'success',
      budgetMillis: Math.max(0, deadline - attemptStartedAt),
      elapsedMillis: Math.max(0, this.deps.now() - attemptStartedAt),
    });
    return this.finish(
      {
        ...simulation,
        method: 'monte-carlo',
        targeting: 'dps-policy',
        tier: 'monte-carlo-dps',
        methodLabel: methodLabel('monte-carlo-dps', dpsFleets),
        iterations: simulation.iterations,
      },
      startedAt,
      deadline,
      preflight,
      attempts,
      fallbacks
    );
  }

  private tryExact(
    fleets: Fleet[],
    tier: 'exact-optimal' | 'exact-dps',
    budgetMillis: number,
    attempts: CombatAttempt[]
  ): ExactBattleResult | null {
    if (budgetMillis < 1) {
      attempts.push({
        tier,
        status: 'skipped',
        budgetMillis: 0,
        elapsedMillis: 0,
        reason: 'interactive exact budget exhausted',
      });
      return null;
    }

    const startedAt = this.deps.now();
    const result = this.deps.computeExact(
      fleets,
      {
        ...this.options.exactCaps,
        maxMillis: Math.max(1, Math.floor(budgetMillis)),
      },
      { plannerPreflight: false }
    );
    attempts.push({
      tier,
      status: result.ok ? 'success' : 'failed',
      budgetMillis,
      elapsedMillis: Math.max(0, this.deps.now() - startedAt),
      reason: result.ok ? undefined : (result.reason ?? 'exact solve failed'),
      exactDiagnostics: result.exactDiagnostics,
    });
    return result.ok ? result : null;
  }

  private exactResult(
    exact: ExactBattleResult,
    tier: 'exact-optimal' | 'exact-dps',
    fleets: readonly Fleet[],
    startedAt: number,
    deadline: number,
    preflight: ExactPlannerPreflight,
    attempts: CombatAttempt[],
    fallbacks: CombatFallback[]
  ): CombatRunResult {
    const summary: CombatOutcomeSummary = {
      lastFleetStanding: exact.lastFleetStanding,
      drawPercentage: exact.drawPercentage,
      expectedSurvivors: exact.expectedSurvivors,
      survivorDistribution: exact.survivorDistribution,
      timeTaken: exact.timeTaken,
    };
    return this.finish(
      {
        ...summary,
        method: 'exact',
        targeting: tier === 'exact-optimal' ? 'optimal' : 'dps-policy',
        tier,
        methodLabel: methodLabel(tier, fleets),
      },
      startedAt,
      deadline,
      preflight,
      attempts,
      fallbacks
    );
  }

  private finish(
    result: Omit<CombatRunResult, 'timeTaken' | 'diagnostics'>,
    startedAt: number,
    deadline: number,
    preflight: ExactPlannerPreflight,
    attempts: CombatAttempt[],
    fallbacks: CombatFallback[]
  ): CombatRunResult {
    const finishedAt = this.deps.now();
    const elapsedMillis = Math.max(0, finishedAt - startedAt);
    return {
      ...result,
      timeTaken: elapsedMillis,
      diagnostics: {
        deadlineMillis: this.options.maxMillis,
        elapsedMillis,
        preflight: {
          reason: preflight.reason,
          estimatedStates: preflight.estimatedStates,
        },
        attempts: attempts.map((attempt) => ({ ...attempt })),
        fallbacks: fallbacks.map((fallback) => ({ ...fallback })),
        deadlineExceeded: finishedAt > deadline,
      },
    };
  }
}

function cloneFleets(
  fleets: readonly Fleet[],
  overrides: readonly (DamageType | undefined)[] = []
): Fleet[] {
  return fleets.map(
    (fleet, index) =>
      new Fleet(
        fleet.name,
        fleet.getRoster().map((ship) => ship.clone()),
        fleet.antimatterSplitter,
        overrides[index] ?? fleet.getDamageType()
      )
  );
}
