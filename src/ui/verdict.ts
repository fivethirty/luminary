import type { FleetState, SimulationResults } from '@ui/state';

export interface Verdict {
  // The plain-language sentence: "Attacker favored", "Too close to call", …
  headline: string;
  // A margin-calibrated label: Coin flip / Slight edge / Clear edge / Decisive,
  // or Pyrrhic win / Stalemate for the special cases.
  tag: string;
  // The leading outcome's name (a fleet name or "Draw") and its probability.
  leaderLabel: string;
  leaderProbability: number;
  // Side color class matching the results table / odds strip.
  className: string;
}

// Thresholds on the leader's win probability. Below COIN_FLIP the battle reads
// as a toss-up regardless of who is nominally ahead.
const COIN_FLIP = 0.55;
const CLEAR_EDGE = 0.65;
const DECISIVE = 0.85;

function sideClassName(name: string, fleets: FleetState[]): string {
  if (name === 'Draw') return 'draw-result';
  const index = fleets.findIndex((fleet) => fleet.name === name);
  if (index === 0) return 'defender-result';
  if (index > 1) return `attacker-result attacker-result-${Math.min(index, 4)}`;
  return 'attacker-result';
}

// Distills a full result into the one-line answer a player would say out loud.
// Deterministic and DOM-free so it can be unit-tested and reused.
export function computeVerdict(
  results: SimulationResults,
  fleets: FleetState[]
): Verdict {
  const outcomes = Object.entries(results.victoryProbability).map(
    ([name, prob]) => ({ name, prob })
  );
  if (results.drawProbability > 0) {
    outcomes.push({ name: 'Draw', prob: results.drawProbability });
  }

  const leader = outcomes.reduce(
    (best, outcome) => (outcome.prob > best.prob ? outcome : best),
    { name: 'Draw', prob: results.drawProbability }
  );
  const probability = leader.prob;
  const isDraw = leader.name === 'Draw';

  // A win the victor barely walks away from (under one ship left on average,
  // among the games they win) is worth flagging even when it's likely.
  const survivors = results.expectedSurvivors[leader.name] ?? {};
  const survivorTotal = Object.values(survivors).reduce(
    (sum, count) => sum + count,
    0
  );
  const pyrrhic =
    !isDraw &&
    probability >= COIN_FLIP &&
    survivorTotal > 0 &&
    survivorTotal < 1;

  let tag: string;
  if (probability < COIN_FLIP) tag = 'Coin flip';
  else if (isDraw) tag = 'Stalemate';
  else if (pyrrhic) tag = 'Pyrrhic win';
  else if (probability >= DECISIVE) tag = 'Decisive';
  else if (probability >= CLEAR_EDGE) tag = 'Clear edge';
  else tag = 'Slight edge';

  let headline: string;
  if (probability < COIN_FLIP) headline = 'Too close to call';
  else if (isDraw) headline = 'Likely a draw';
  else headline = `${leader.name} favored`;

  return {
    headline,
    tag,
    leaderLabel: leader.name,
    leaderProbability: probability,
    className: sideClassName(leader.name, fleets),
  };
}
