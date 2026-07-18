export type Terminal = 'AttackerWins' | 'DefenderWins' | 'Draw';

export function terminalFromSurvival(
  attackerAlive: boolean,
  defenderAlive: boolean
): Terminal | null {
  if (!attackerAlive && !defenderAlive) return 'Draw';
  if (!attackerAlive) return 'DefenderWins';
  if (!defenderAlive) return 'AttackerWins';
  return null;
}
