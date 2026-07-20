import { describe, expect, test } from 'bun:test';
import { Ship, ShipType } from './ship';
import { enumerateSlotOutcomes, SlotOutcome } from './dice-distribution';

const CAP = 100_000;

function probSum(outcomes: SlotOutcome[]): number {
  return outcomes.reduce((sum, o) => sum + o.prob, 0);
}

// Total probability that at least one shot lands (any assignable shot).
function probAnyShot(outcomes: SlotOutcome[]): number {
  return outcomes
    .filter((o) => o.shots.length > 0)
    .reduce((sum, o) => sum + o.prob, 0);
}

describe('enumerateSlotOutcomes', () => {
  test('single ion die, no computers, one 0-shield enemy: hit 1/6', () => {
    const ship = new Ship(ShipType.Interceptor, { cannons: { ion: 1 } });
    const outcomes = enumerateSlotOutcomes([ship], false, [0], false, CAP)!;
    expect(probSum(outcomes)).toBeCloseTo(1, 12);
    // Only a natural 6 reaches the hit threshold (roll+0-0>=6).
    expect(probAnyShot(outcomes)).toBeCloseTo(1 / 6, 12);
  });

  test('single ion die, 1 computer, 0-shield enemy: hit 2/6', () => {
    const ship = new Ship(ShipType.Interceptor, {
      computers: 1,
      cannons: { ion: 1 },
    });
    const outcomes = enumerateSlotOutcomes([ship], false, [0], false, CAP)!;
    // rolls 5 and 6 now land.
    expect(probAnyShot(outcomes)).toBeCloseTo(2 / 6, 12);
  });

  test('shield split [0,2] with 2 computers: three hit classes', () => {
    const ship = new Ship(ShipType.Cruiser, {
      computers: 2,
      cannons: { ion: 1 },
    });
    const outcomes = enumerateSlotOutcomes([ship], false, [0, 2], false, CAP)!;
    expect(probSum(outcomes)).toBeCloseTo(1, 12);

    // Miss class {rolls 1,2,3} = 3/6; hits-0-only {4,5} = 2/6; hits-both {6} = 1/6.
    const miss = outcomes.find((o) => o.shots.length === 0)!;
    expect(miss.prob).toBeCloseTo(3 / 6, 12);

    const landing = outcomes.filter((o) => o.shots.length > 0);
    expect(landing).toHaveLength(2);

    // The middle class's representative shot must hit the 0-shield ship and
    // miss the 2-shield ship.
    const zeroShield = new Ship(ShipType.Interceptor, { shields: 0 });
    const twoShield = new Ship(ShipType.Interceptor, { shields: 2 });
    const middle = landing.find((o) => o.prob === 2 / 6)!;
    expect(zeroShield.shotHits(middle.shots[0])).toBe(true);
    expect(twoShield.shotHits(middle.shots[0])).toBe(false);

    const both = landing.find((o) => o.prob === 1 / 6)!;
    expect(zeroShield.shotHits(both.shots[0])).toBe(true);
    expect(twoShield.shotHits(both.shots[0])).toBe(true);
  });

  test('two identical dice: three multiset outcomes summing to 1', () => {
    const ship = new Ship(ShipType.Interceptor, { cannons: { ion: 2 } });
    const outcomes = enumerateSlotOutcomes([ship], false, [0], false, CAP)!;
    // Classes per die: miss 5/6, hit 1/6. Joint: 0/1/2 hits.
    expect(probSum(outcomes)).toBeCloseTo(1, 12);
    const zeroHits = outcomes
      .filter((o) => o.shots.length === 0)
      .reduce((s, o) => s + o.prob, 0);
    const oneHit = outcomes
      .filter((o) => o.shots.length === 1)
      .reduce((s, o) => s + o.prob, 0);
    const twoHits = outcomes
      .filter((o) => o.shots.length === 2)
      .reduce((s, o) => s + o.prob, 0);
    expect(zeroHits).toBeCloseTo((5 / 6) * (5 / 6), 12);
    expect(oneHit).toBeCloseTo(2 * (5 / 6) * (1 / 6), 12);
    expect(twoHits).toBeCloseTo((1 / 6) * (1 / 6), 12);
  });

  test('groups ordinary weapon dice by saturated damage behavior', () => {
    const ship = new Ship(ShipType.Interceptor, {
      cannons: { ion: 1, plasma: 1, soliton: 1, antimatter: 1 },
    });

    const nominal = enumerateSlotOutcomes([ship], false, [0], false, CAP)!;
    const saturated = enumerateSlotOutcomes(
      [ship],
      false,
      [0],
      false,
      CAP,
      undefined,
      1
    )!;

    expect(nominal).toHaveLength(16);
    expect(saturated).toHaveLength(5);
    expect(probSum(saturated)).toBeCloseTo(1, 12);
    expect(
      saturated.every((outcome) =>
        outcome.shots.every((shot) => shot.damage === 1)
      )
    ).toBe(true);
  });

  test('rift die: five fixed classes', () => {
    const ship = new Ship(ShipType.Cruiser, { rift: 1 });
    const outcomes = enumerateSlotOutcomes([ship], false, [0], false, CAP)!;
    expect(probSum(outcomes)).toBeCloseTo(1, 12);

    // nothing 2/6; self-only 1/6; target-1 1/6; target-2 1/6; target-3+self 1/6.
    const nothing = outcomes.find(
      (o) => o.shots.length === 0 && o.selfDamage === 0
    )!;
    expect(nothing.prob).toBeCloseTo(2 / 6, 12);

    const selfOnly = outcomes.find(
      (o) => o.shots.length === 0 && o.selfDamage === 1
    )!;
    expect(selfOnly.prob).toBeCloseTo(1 / 6, 12);

    const targetDamages = outcomes
      .filter((o) => o.shots.length > 0)
      .map((o) => o.shots[0].damage)
      .sort();
    expect(targetDamages).toEqual([1, 2, 3]);

    const target3 = outcomes.find(
      (o) => o.shots.length > 0 && o.shots[0].damage === 3
    )!;
    expect(target3.selfDamage).toBe(1); // roll 6 also self-damages
  });

  test('antimatter splitter: a landed antimatter die yields four 1-damage shots', () => {
    const ship = new Ship(ShipType.Interceptor, {
      cannons: { antimatter: 1 },
    });
    const outcomes = enumerateSlotOutcomes([ship], false, [0], true, CAP)!;
    const landed = outcomes.find((o) => o.shots.length > 0)!;
    expect(landed.shots).toHaveLength(4);
    expect(landed.shots.every((s) => s.damage === 1)).toBe(true);
    expect(landed.prob).toBeCloseTo(1 / 6, 12);
  });

  test('does not flatten a split antimatter die into one saturated shot', () => {
    const ship = new Ship(ShipType.Interceptor, {
      cannons: { antimatter: 1 },
    });
    const outcomes = enumerateSlotOutcomes(
      [ship],
      false,
      [0],
      true,
      CAP,
      undefined,
      1
    )!;

    const landed = outcomes.find((outcome) => outcome.shots.length > 0)!;
    expect(landed.shots).toHaveLength(4);
    expect(landed.shots.every((shot) => shot.damage === 1)).toBe(true);
  });

  test('combines groups from multiple ships and respects the cap', () => {
    const a = new Ship(ShipType.Interceptor, { cannons: { ion: 2 } });
    const b = new Ship(ShipType.Cruiser, {
      computers: 1,
      cannons: { plasma: 2 },
    });
    const outcomes = enumerateSlotOutcomes([a, b], false, [0], false, CAP)!;
    expect(probSum(outcomes)).toBeCloseTo(1, 12);

    // A tiny cap forces a bail-out.
    expect(enumerateSlotOutcomes([a, b], false, [0], false, 2)).toBeNull();
  });

  test('accepts a single-group outcome count at the cap', () => {
    const ship = new Ship(ShipType.Cruiser, { rift: 3 });
    const outcomes = enumerateSlotOutcomes([ship], false, [0], false, 35);

    // Three identical dice over five classes have C(7, 4) compositions.
    expect(outcomes).toHaveLength(35);
    expect(probSum(outcomes!)).toBeCloseTo(1, 12);
    expect(enumerateSlotOutcomes([ship], false, [0], false, 34)).toBeNull();
  });

  test('rejects an extreme single group before materializing its outcomes', () => {
    const ship = new Ship(ShipType.Cruiser, { rift: 1_000_000 });

    // This valid numeric input has far more than ten multiset outcomes. The
    // cap must be checked before factorials or million-shot arrays are built.
    expect(enumerateSlotOutcomes([ship], false, [0], false, 10)).toBeNull();
  });

  test('cooperatively aborts during a bounded group expansion', () => {
    const ship = new Ship(ShipType.Cruiser, { rift: 20 });
    let abortChecks = 0;

    const outcomes = enumerateSlotOutcomes(
      [ship],
      false,
      [0],
      false,
      CAP,
      () => ++abortChecks >= 2
    );

    expect(outcomes).toBeNull();
    expect(abortChecks).toBe(2);
  });

  test('no dice at all: single empty outcome', () => {
    const ship = new Ship(ShipType.Interceptor, {});
    const outcomes = enumerateSlotOutcomes([ship], false, [0], false, CAP)!;
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].prob).toBe(1);
    expect(outcomes[0].shots).toHaveLength(0);
  });
});
