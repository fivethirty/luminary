import { beforeEach, describe, expect, test } from 'bun:test';
import {
  applySteppersPreference,
  applyThemePreference,
  loadSteppersPreference,
  loadThemePreference,
  saveSteppersPreference,
  saveThemePreference,
} from './preferences';

describe('steppers preference', () => {
  beforeEach(() => {
    document.cookie = 'luminary:steppers=; Max-Age=0; Path=/';
    document.cookie = 'luminary:theme=; Max-Age=0; Path=/';
    document.body.classList.remove('no-steppers');
    delete document.documentElement.dataset.theme;
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

describe('theme preference', () => {
  beforeEach(() => {
    document.cookie = 'luminary:theme=; Max-Age=0; Path=/';
    delete document.documentElement.dataset.theme;
  });

  test('defaults to the system theme without a cookie', () => {
    expect(loadThemePreference()).toBe('system');
  });

  test('round-trips light, dark, and system preferences', () => {
    saveThemePreference('light');
    expect(loadThemePreference()).toBe('light');

    saveThemePreference('dark');
    expect(loadThemePreference()).toBe('dark');

    saveThemePreference('system');
    expect(loadThemePreference()).toBe('system');
  });

  test('applies explicit themes and removes the override for system', () => {
    applyThemePreference('light');
    expect(document.documentElement.dataset.theme).toBe('light');

    applyThemePreference('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');

    applyThemePreference('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
