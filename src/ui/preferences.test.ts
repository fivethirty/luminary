import { beforeEach, describe, expect, test } from 'bun:test';
import {
  applySteppersPreference,
  loadSteppersPreference,
  saveSteppersPreference,
} from './preferences';

describe('steppers preference', () => {
  beforeEach(() => {
    document.cookie = 'luminary:steppers=; Max-Age=0; Path=/';
    document.body.classList.remove('no-steppers');
  });

  test('defaults to enabled without a cookie', () => {
    expect(loadSteppersPreference()).toBe(true);
  });

  test('round-trips disabled and enabled preferences', () => {
    saveSteppersPreference(false);
    expect(loadSteppersPreference()).toBe(false);

    saveSteppersPreference(true);
    expect(loadSteppersPreference()).toBe(true);
  });

  test('applying the preference toggles the no-steppers body class', () => {
    applySteppersPreference(false);
    expect(document.body.classList.contains('no-steppers')).toBe(true);

    applySteppersPreference(true);
    expect(document.body.classList.contains('no-steppers')).toBe(false);
  });
});
