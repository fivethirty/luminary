import { describe, expect, test } from 'bun:test';
import { terminalFromSurvival } from './battle-rules';

describe('terminalFromSurvival', () => {
  test.each([
    [true, true, null],
    [true, false, 'AttackerWins'],
    [false, true, 'DefenderWins'],
    [false, false, 'Draw'],
  ] as const)(
    'attacker alive=%s, defender alive=%s -> %s',
    (attackerAlive, defenderAlive, expected) => {
      expect(terminalFromSurvival(attackerAlive, defenderAlive)).toBe(expected);
    }
  );
});
