import { describe, expect, test } from 'bun:test';
import { BattleModel } from './battle-state';
import { Ship, ShipType } from './ship';
import { WinProbabilitySolver } from './win-probability-solver';

describe('WinProbabilitySolver (minimax mode)', () => {
  test('optimal defender choices lower the attacker value versus DPS policy', () => {
    const attacker = [
      new Ship(ShipType.Cruiser, {
        initiative: 3,
        hull: 1,
        computers: 2,
        cannons: { plasma: 1 },
      }),
      new Ship(ShipType.Interceptor, {
        initiative: 1,
        computers: 1,
        cannons: { ion: 2 },
      }),
    ];
    const defender = [
      new Ship(ShipType.Cruiser, {
        initiative: 2,
        hull: 1,
        computers: 2,
        cannons: { plasma: 1 },
      }),
      new Ship(ShipType.Interceptor, {
        initiative: 1,
        computers: 1,
        cannons: { ion: 2 },
      }),
    ];
    const model = new BattleModel(attacker, defender, false, false);

    const policy = new WinProbabilitySolver(model, 'A', 'policy').solve();
    const optimalAttacker = new WinProbabilitySolver(
      model,
      'A',
      'optimal'
    ).solve();
    const optimalDefender = new WinProbabilitySolver(
      model,
      'D',
      'optimal'
    ).solve();

    expect(policy.ok).toBe(true);
    expect(optimalAttacker.ok).toBe(true);
    expect(optimalDefender.ok).toBe(true);
    expect(optimalAttacker.winProbability).toBeLessThan(
      policy.winProbability - 0.001
    );
    expect(
      optimalAttacker.winProbability + optimalDefender.winProbability
    ).toBeCloseTo(1, 9);
  });
});
