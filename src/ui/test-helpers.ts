import type {
  ExactSimulationResults,
  MonteCarloSimulationResults,
} from './state';
import type { CombatRunDiagnostics } from '@calc/combat-runner';

const DEFAULT_DIAGNOSTICS: CombatRunDiagnostics = {
  deadlineMillis: 950,
  elapsedMillis: 0,
  preflight: { reason: null, estimatedStates: 0 },
  attempts: [],
  fallbacks: [],
  deadlineExceeded: false,
};

const DEFAULT_RESULTS = {
  victoryProbability: { Defender: 0.6, Attacker: 0.4 },
  drawProbability: 0,
  expectedSurvivors: {},
  survivorDistribution: [],
  timeTaken: 1000,
};

export function exactResults(
  overrides: Partial<Omit<ExactSimulationResults, 'method' | 'iterations'>> = {}
): ExactSimulationResults {
  return {
    ...DEFAULT_RESULTS,
    targeting: 'optimal',
    tier: 'exact-optimal',
    methodLabel: 'Exact · optimal targeting',
    diagnostics: DEFAULT_DIAGNOSTICS,
    ...overrides,
    method: 'exact',
  };
}

export function monteCarloResults(
  overrides: Partial<Omit<MonteCarloSimulationResults, 'method'>> = {}
): MonteCarloSimulationResults {
  return {
    ...DEFAULT_RESULTS,
    method: 'monte-carlo',
    targeting: 'dps-policy',
    tier: 'monte-carlo-dps',
    methodLabel: 'Monte Carlo · DPS targeting',
    diagnostics: DEFAULT_DIAGNOSTICS,
    iterations: 5000,
    ...overrides,
  };
}
