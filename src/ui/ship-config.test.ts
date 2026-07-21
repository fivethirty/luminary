import { describe, expect, test } from 'bun:test';
import {
  cloneShipConfig,
  normalizeShipConfig,
  shipConfigsEqual,
} from './ship-config';

describe('ship config helpers', () => {
  test('normalizes omitted stats and weapon counts to zero', () => {
    expect(normalizeShipConfig({ hull: 2, cannons: { plasma: 1 } })).toEqual({
      hull: 2,
      computers: 0,
      shields: 0,
      initiative: 0,
      heal: 0,
      rift: 0,
      cannons: { ion: 0, plasma: 1, soliton: 0, antimatter: 0 },
      missiles: { ion: 0, plasma: 0, soliton: 0, antimatter: 0 },
    });
  });

  test('deep-clones weapons while preserving omitted fields', () => {
    const source = { hull: 1, cannons: { ion: 2 } };
    const clone = cloneShipConfig(source);

    expect(clone).toEqual(source);
    expect(clone).not.toBe(source);
    expect(clone.cannons).not.toBe(source.cannons);
    expect('missiles' in clone).toBe(false);

    clone.cannons!.ion = 3;
    expect(source.cannons.ion).toBe(2);
  });

  test('compares combat behavior with missing values treated as zero', () => {
    expect(
      shipConfigsEqual(
        { hull: 1, cannons: { ion: 2 } },
        {
          hull: 1,
          computers: 0,
          cannons: { ion: 2, plasma: 0 },
          missiles: {},
        }
      )
    ).toBe(true);
    expect(
      shipConfigsEqual(
        { hull: 1, cannons: { ion: 2 } },
        { hull: 1, cannons: { ion: 1 } }
      )
    ).toBe(false);
  });
});
