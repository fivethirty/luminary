import { describe, expect, test } from 'bun:test';
import { Ship, ShipType, Shot } from './ship';
import { enumerateCandidates } from './candidate-enumerator';
import { DICE_VALUES } from 'src/constants';

const hit = (damage: number, computers = 0): Shot => ({
  roll: DICE_VALUES.HIT,
  computers,
  damage,
});

describe('enumerateCandidates', () => {
  test('deduplicates permutations of identical shots on identical ships', () => {
    // Two identical 1-damage hits vs two identical 1-HP ships. The distinct
    // outcomes are "both on one ship" and "one each" — not four.
    const ships = [
      new Ship(ShipType.Interceptor),
      new Ship(ShipType.Interceptor),
    ];
    const shots = [hit(1), hit(1)];

    const candidates = enumerateCandidates(shots, ships);
    expect(candidates).not.toBeNull();

    const keys = new Set(candidates!.map((c) => c.stateKey));
    expect(keys.size).toBe(2);
    expect(candidates!.length).toBe(2);
  });

  test('only assigns shots to ships they can hit', () => {
    // roll 2 + 4 computers = 6, which clears a 0-shield ship (6 >= 6) but not a
    // 1-shield ship (2 + 4 - 1 = 5 < 6), and it is not a natural 6.
    const shielded = new Ship(ShipType.Interceptor, { shields: 1 });
    const unshielded = new Ship(ShipType.Interceptor, { shields: 0 });
    const shot: Shot = { roll: 2, computers: 4, damage: 1 };

    const candidates = enumerateCandidates([shot], [shielded, unshielded]);
    expect(candidates).not.toBeNull();
    // Exactly one outcome: the shot lands on the unshielded ship.
    expect(candidates!.length).toBe(1);
    expect(candidates![0].damageAssignments).toEqual([0, 1]);
  });

  test('collapses overkill onto a low-HP ship to a single state', () => {
    // A 4-damage shot and a 1-damage shot vs one 1-HP ship: assigning either
    // (or both) leaves the ship dead, one state.
    const ship = new Ship(ShipType.Interceptor); // 1 HP
    const candidates = enumerateCandidates([hit(4), hit(1)], [ship]);
    expect(candidates).not.toBeNull();
    expect(candidates!.length).toBe(1);
    expect(candidates![0].stateKey).toContain('#0');
  });

  test('returns [] when no shot can damage any ship', () => {
    const shielded = new Ship(ShipType.Interceptor, { shields: 2 });
    const shot: Shot = { roll: 2, computers: 0, damage: 1 };
    const candidates = enumerateCandidates([shot], [shielded]);
    expect(candidates).toEqual([]);
  });

  test('returns [] for empty shots or empty ships', () => {
    const ship = new Ship(ShipType.Interceptor);
    expect(enumerateCandidates([], [ship])).toEqual([]);
    expect(enumerateCandidates([hit(1)], [])).toEqual([]);
  });

  test('returns null when the candidate limit is exceeded', () => {
    // Many distinct-config ships × several shots blows past a tiny cap.
    const ships = Array.from(
      { length: 6 },
      (_, i) => new Ship(ShipType.Interceptor, { hull: i })
    );
    const shots = [hit(1), hit(1), hit(1), hit(1)];
    const candidates = enumerateCandidates(shots, ships, { maxCandidates: 3 });
    expect(candidates).toBeNull();
  });

  test('interrupts a large assignment search when its shared deadline expires', () => {
    const ships = Array.from(
      { length: 8 },
      (_, i) => new Ship(ShipType.Interceptor, { hull: i })
    );
    const shots = Array.from({ length: 6 }, () => hit(1));
    let deadlineChecks = 0;

    const candidates = enumerateCandidates(shots, ships, {
      shouldAbort: () => {
        deadlineChecks++;
        return deadlineChecks >= 2;
      },
    });

    expect(candidates).toBeNull();
    expect(deadlineChecks).toBe(2);
  });

  test('distinct-config ships produce distinct targeted states', () => {
    const cruiser = new Ship(ShipType.Cruiser, { hull: 1 }); // 2 HP
    const interceptor = new Ship(ShipType.Interceptor); // 1 HP
    const candidates = enumerateCandidates([hit(1)], [cruiser, interceptor]);
    expect(candidates).not.toBeNull();
    // One shot, two different targets it can hit → two outcomes.
    expect(candidates!.length).toBe(2);
  });
});
