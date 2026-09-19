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
import {
  measureReferenceProbe,
  REFERENCE_PROBE_MILLIS,
} from './solver-calibration';

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

// Device and workload calibration carried from one interactive request to the
// next by whoever owns the runner (the browser client keeps the latest copy).
// Everything is relative to the reference development machine on which the
// constants below were measured, so a fresh session starts at the reference.
export type SolverCalibration = {
  // Speed of this device relative to the reference machine (1 = same, 3 =
  // three times slower), from the reference probe. Null probeMillis means the
  // probe has not run yet; the runner measures it before its first solve.
  deviceFactor: number;
  probeMillis: number | null;
  // Milliseconds per estimated assignment option observed on optimal attempts
  // on this device, or null until one has run. Successful attempts blend in;
  // an attempt that ran out of time raises it to twice its observed lower
  // bound so the same fleet is not retried into the same failure.
  msPerEstimatedOption: number | null;
  optimalSamples: number;
};

export const DEFAULT_CALIBRATION: SolverCalibration = {
  deviceFactor: 1,
  probeMillis: null,
  msPerEstimatedOption: null,
  optimalSamples: 0,
};

// Why the optimal tier ran or did not, with the prediction it was based on.
export type OptimalDecision = {
  attempted: boolean;
  // Predicted optimal solve time, or null when the preflight produced no
  // option estimate (the state bound alone exceeded its cutoff).
  predictedMillis: number | null;
  remainingMillis: number;
  rateSource: 'learned' | 'reference';
  reason: string;
};

export type CombatRunDiagnostics = {
  deadlineMillis: number;
  elapsedMillis: number;
  preflight: {
    reason: ExactPlannerPreflight['reason'];
    estimatedStates: number;
    estimatedOptions: number | null;
  };
  // Null when no fleet requested optimal targeting.
  optimalDecision: OptimalDecision | null;
  // Calibration after this run; pass it to the next run on the same device.
  calibration: SolverCalibration;
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
  // One wall-clock budget covers the exact tiers and the sampled fallback.
  maxMillis?: number;
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
  // Reference probe time on this device in ms (see solver-calibration.ts).
  probe: () => number;
};

const DEFAULT_MAX_MILLIS = 950;
const DEFAULT_MONTE_CARLO_RESERVE_MILLIS = 350;
const DEFAULT_MONTE_CARLO_ITERATIONS = 5_000;

// Reference machine (Apple M3 Max, bun 1.2.19, warm process): optimal solves
// cost 0.1 to 0.5 ms per thousand estimated assignment options across the
// calibration corpus. 0.2 is the median; it recovered every corpus case that
// fits its budget without a wasted attempt.
const REFERENCE_MS_PER_ESTIMATED_OPTION = 2e-4;
const DEVICE_FACTOR_MIN = 0.5;
const DEVICE_FACTOR_MAX = 8;
// Weight of a new sample against the running value.
const CALIBRATION_BLEND = 0.5;
// A timed-out optimal attempt only bounds its cost from below; the learned
// rate takes this multiple of the bound.
const TIMEOUT_RATE_MULTIPLIER = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function blend(current: number, sample: number): number {
  return current + CALIBRATION_BLEND * (sample - current);
}

// Sets the device factor from a reference probe measurement.
export function calibrateDevice(
  calibration: SolverCalibration,
  probeMillis: number
): SolverCalibration {
  return {
    ...calibration,
    probeMillis,
    deviceFactor: clamp(
      probeMillis / REFERENCE_PROBE_MILLIS,
      DEVICE_FACTOR_MIN,
      DEVICE_FACTOR_MAX
    ),
  };
}

// Folds a finished optimal attempt into the learned rate.
export function observeOptimalAttempt(
  calibration: SolverCalibration,
  attempt: CombatAttempt,
  estimatedOptions: number | null
): SolverCalibration {
  if (estimatedOptions === null || estimatedOptions <= 0) return calibration;
  const observed = attempt.elapsedMillis / estimatedOptions;
  if (attempt.status === 'success') {
    return {
      ...calibration,
      msPerEstimatedOption:
        calibration.msPerEstimatedOption === null
          ? observed
          : blend(calibration.msPerEstimatedOption, observed),
      optimalSamples: calibration.optimalSamples + 1,
    };
  }
  if (
    attempt.status === 'failed' &&
    attempt.reason === 'time budget exceeded'
  ) {
    return {
      ...calibration,
      msPerEstimatedOption: Math.max(
        calibration.msPerEstimatedOption ?? 0,
        observed * TIMEOUT_RATE_MULTIPLIER
      ),
      optimalSamples: calibration.optimalSamples + 1,
    };
  }
  // Cap failures (candidate or state limits) are not time measurements.
  return calibration;
}

// Predicts the optimal solve from the preflight estimate and decides whether
// it fits the exact budget left after the DPS solve.
export function decideOptimalAttempt(
  preflight: ExactPlannerPreflight,
  calibration: SolverCalibration,
  remainingMillis: number
): OptimalDecision {
  const learned = calibration.msPerEstimatedOption !== null;
  const rateSource = learned ? 'learned' : 'reference';
  if (preflight.estimatedOptions === null) {
    if (preflight.reason === 'complexity') {
      return {
        attempted: false,
        predictedMillis: null,
        remainingMillis,
        rateSource,
        reason: `preflight state estimate ${preflight.estimatedStates} exceeds the interactive cutoff`,
      };
    }
    // The preflight estimates two-fleet battles only. Anything else (multi-
    // fleet combat) is attempted on the remaining budget without a prediction;
    // the DPS result already in hand is the fallback if it runs out of time.
    if (remainingMillis < 1) {
      return {
        attempted: false,
        predictedMillis: null,
        remainingMillis,
        rateSource,
        reason: 'interactive exact budget exhausted',
      };
    }
    return {
      attempted: true,
      predictedMillis: null,
      remainingMillis,
      rateSource,
      reason: `no cost estimate for this battle; attempting within the remaining ${Math.round(remainingMillis)} ms exact budget`,
    };
  }
  const rate = learned
    ? calibration.msPerEstimatedOption!
    : REFERENCE_MS_PER_ESTIMATED_OPTION * calibration.deviceFactor;
  const predictedMillis = preflight.estimatedOptions * rate;
  if (remainingMillis < 1) {
    return {
      attempted: false,
      predictedMillis,
      remainingMillis,
      rateSource,
      reason: 'interactive exact budget exhausted',
    };
  }
  if (predictedMillis > remainingMillis) {
    return {
      attempted: false,
      predictedMillis,
      remainingMillis,
      rateSource,
      reason: `predicted optimal solve ${Math.round(predictedMillis)} ms exceeds the remaining ${Math.round(remainingMillis)} ms exact budget`,
    };
  }
  return {
    attempted: true,
    predictedMillis,
    remainingMillis,
    rateSource,
    reason: `predicted optimal solve ${Math.round(predictedMillis)} ms fits the remaining ${Math.round(remainingMillis)} ms exact budget`,
  };
}

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
  probe: measureReferenceProbe,
};

/**
 * Owns the interactive strategy ladder and its one request-wide deadline: the
 * exact DPS/NPC tier runs first with the whole exact budget, the optimal tier
 * then runs with whatever exact budget remains when its predicted cost fits,
 * and Monte Carlo samples only when the DPS tier itself fails. Fleets must
 * use stable internal IDs as `Fleet.name`; display names belong at the UI
 * boundary because engine result maps are keyed by this identity.
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
      monteCarloReserveMillis:
        options.monteCarloReserveMillis ?? DEFAULT_MONTE_CARLO_RESERVE_MILLIS,
      monteCarloIterations:
        options.monteCarloIterations ?? DEFAULT_MONTE_CARLO_ITERATIONS,
      exactCaps: options.exactCaps ?? EXACT_INTERACTIVE_CAPS,
    };
    this.deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  }

  run(
    fleets: Fleet[],
    calibration: SolverCalibration = DEFAULT_CALIBRATION
  ): CombatRunResult {
    // A calibration that has never been probed is measured first, outside the
    // request deadline: once per client, since the client carries it forward.
    let calibrated =
      calibration.probeMillis === null
        ? calibrateDevice(calibration, this.deps.probe())
        : calibration;
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
    let optimalDecision: OptimalDecision | null = null;

    const requestedHasOptimal = fleets.some(
      (fleet) => fleet.getDamageType() === DamageType.OPTIMAL
    );
    // Policy fleets: optimal targeting becomes DPS; explicitly selected and
    // inherent NPC targeting is retained.
    const dpsFleets = cloneFleets(
      fleets,
      fleets.map((fleet) =>
        fleet.getDamageType() === DamageType.OPTIMAL
          ? DamageType.DPS
          : undefined
      )
    );

    // 1. Exact DPS/NPC first: it is a subset of the optimal work, so it never
    // costs a feasible optimal result, and its result is the fallback for
    // everything after it.
    const dps = this.tryExact(
      dpsFleets,
      'exact-dps',
      Math.max(0, exactDeadline - this.deps.now()),
      attempts
    );
    const dpsAttempt = attempts.at(-1)!;

    // 2. Optimal with the exact budget that is left, when predicted to fit.
    if (requestedHasOptimal) {
      if (!dps) {
        attempts.push({
          tier: 'exact-optimal',
          status: 'skipped',
          budgetMillis: 0,
          elapsedMillis: 0,
          reason: 'exact DPS solve failed',
        });
        fallbacks.push({
          from: 'exact-optimal',
          to: 'exact-dps',
          reason: dpsAttempt.reason ?? 'exact DPS solve failed',
        });
      } else {
        const remaining = Math.max(0, exactDeadline - this.deps.now());
        optimalDecision = decideOptimalAttempt(
          preflight,
          calibrated,
          remaining
        );
        if (optimalDecision.attempted) {
          const optimal = this.tryExact(
            fleets,
            'exact-optimal',
            remaining,
            attempts
          );
          calibrated = observeOptimalAttempt(
            calibrated,
            attempts.at(-1)!,
            preflight.estimatedOptions
          );
          if (optimal) {
            return this.exactResult(
              optimal,
              'exact-optimal',
              fleets,
              startedAt,
              deadline,
              preflight,
              optimalDecision,
              calibrated,
              attempts,
              fallbacks
            );
          }
          fallbacks.push({
            from: 'exact-optimal',
            to: 'exact-dps',
            reason: attempts.at(-1)?.reason ?? 'optimal exact solve failed',
          });
        } else {
          attempts.push({
            tier: 'exact-optimal',
            status: 'skipped',
            budgetMillis: 0,
            elapsedMillis: 0,
            reason: optimalDecision.reason,
          });
          fallbacks.push({
            from: 'exact-optimal',
            to: 'exact-dps',
            reason: optimalDecision.reason,
          });
        }
      }
    }

    if (dps) {
      return this.exactResult(
        dps,
        'exact-dps',
        dpsFleets,
        startedAt,
        deadline,
        preflight,
        optimalDecision,
        calibrated,
        attempts,
        fallbacks
      );
    }

    // 3. Monte Carlo, only because the exact DPS tier itself failed.
    fallbacks.push({
      from: 'exact-dps',
      to: 'monte-carlo-dps',
      reason: dpsAttempt.reason ?? 'exact DPS solve failed',
    });
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
      optimalDecision,
      calibrated,
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
    optimalDecision: OptimalDecision | null,
    calibration: SolverCalibration,
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
      optimalDecision,
      calibration,
      attempts,
      fallbacks
    );
  }

  private finish(
    result: Omit<CombatRunResult, 'timeTaken' | 'diagnostics'>,
    startedAt: number,
    deadline: number,
    preflight: ExactPlannerPreflight,
    optimalDecision: OptimalDecision | null,
    calibration: SolverCalibration,
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
          estimatedOptions: preflight.estimatedOptions,
        },
        optimalDecision: optimalDecision ? { ...optimalDecision } : null,
        calibration: { ...calibration },
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
