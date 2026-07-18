import { DamageType } from 'src/constants';
import { Fleet } from './fleet';
import { ShipType } from './ship';
import { BattleModel, Role } from './battle-state';
import {
  DEFAULT_CAPS,
  SolverCaps,
  SolverMode,
  WinProbabilitySolver,
} from './win-probability-solver';

// Interactive budget for the app: bail out (to Monte Carlo) rather than stall
// on a fleet whose state graph is too large to solve quickly.
export const EXACT_INTERACTIVE_CAPS: SolverCaps = {
  ...DEFAULT_CAPS,
  maxMillis: 2_000,
  maxStates: 250_000,
};

// Same shape as CombatSimulator.simulate's result, plus ok/reason so callers
// can fall back to Monte Carlo when the battle is not exactly solvable.
export type ExactBattleResult = {
  ok: boolean;
  reason?: string;
  lastFleetStanding: Record<string, number>;
  drawPercentage: number;
  expectedSurvivors: Record<string, Partial<Record<ShipType, number>>>;
  timeTaken: number;
};

/**
 * Computes a two-fleet battle's outcome distribution exactly: instead of
 * sampling dice, every dice outcome's probability is propagated through the
 * state graph, so each state — and each terminal — carries its true
 * likelihood. Win rates, draw rate, and expected survivors are exact numbers
 * with zero Monte Carlo noise, and identical on every run.
 */
export function computeExactBattle(
  defender: Fleet,
  attacker: Fleet,
  caps: SolverCaps = DEFAULT_CAPS
): ExactBattleResult {
  const start = Date.now();
  const fail = (reason: string): ExactBattleResult => ({
    ok: false,
    reason,
    lastFleetStanding: {},
    drawPercentage: 0,
    expectedSurvivors: {},
    timeTaken: Date.now() - start,
  });

  const attackerType = attacker.getDamageType();
  const defenderType = defender.getDamageType();

  let mode: SolverMode = 'policy';
  let role: Role = 'A';
  if (attackerType === DamageType.OPTIMAL) {
    mode = 'optimal';
    role = 'A';
  } else if (defenderType === DamageType.OPTIMAL) {
    mode = 'optimal';
    role = 'D';
  }

  const model = new BattleModel(
    attacker.getRoster(),
    defender.getRoster(),
    attacker.antimatterSplitter,
    defender.antimatterSplitter
  );
  const outcome = new WinProbabilitySolver(
    model,
    role,
    mode,
    caps
  ).solveOutcome();
  if (!outcome.ok) {
    return fail(outcome.reason ?? 'solve failed');
  }

  // Defender first, matching the app's fleet order.
  return {
    ok: true,
    lastFleetStanding: {
      [defender.name]: outcome.pDefender,
      [attacker.name]: outcome.pAttacker,
    },
    drawPercentage: outcome.pDraw,
    expectedSurvivors: {
      [defender.name]: outcome.defenderSurvivors as Partial<
        Record<ShipType, number>
      >,
      [attacker.name]: outcome.attackerSurvivors as Partial<
        Record<ShipType, number>
      >,
    },
    timeTaken: Date.now() - start,
  };
}
