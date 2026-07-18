import type {
  ExactSimulationResults,
  MonteCarloSimulationResults,
} from './state';

const DEFAULT_RESULTS = {
  victoryProbability: { Defender: 0.6, Attacker: 0.4 },
  drawProbability: 0,
  expectedSurvivors: {},
  timeTaken: 1000,
};

export function exactResults(
  overrides: Partial<Omit<ExactSimulationResults, 'method' | 'iterations'>> = {}
): ExactSimulationResults {
  return {
    ...DEFAULT_RESULTS,
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
    iterations: 5000,
    ...overrides,
  };
}