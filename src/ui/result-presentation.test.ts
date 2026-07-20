import { describe, expect, test } from 'bun:test';
import {
  resultClassesForFleet,
  resultClassNameForFleet,
} from './result-presentation';

describe('result presentation', () => {
  test('maps fleet position and draw outcomes to shared semantic classes', () => {
    expect(resultClassesForFleet(0)).toEqual(['defender-result']);
    expect(resultClassesForFleet(1)).toEqual(['attacker-result']);
    expect(resultClassesForFleet(2)).toEqual([
      'attacker-result',
      'attacker-result-2',
    ]);
    expect(resultClassesForFleet(10)).toEqual([
      'attacker-result',
      'attacker-result-4',
    ]);
    expect(resultClassNameForFleet(null, true)).toBe('draw-result');
  });
});
