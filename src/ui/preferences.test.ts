import { beforeEach, describe, expect, test } from 'bun:test';
import {
  applySteppersPreference,
  applyControlMode,
  applyThemePreference,
  loadControlMode,
  loadSteppersPreference,
  loadThemePreference,
  saveSteppersPreference,
  saveControlMode,
  saveThemePreference,
} from './preferences';

describe('steppers preference', () => {
  beforeEach(() => {
    document.cookie = 'luminary:steppers=; Max-Age=0; Path=/';
    document.cookie = 'luminary:controls=; Max-Age=0; Path=/';
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

describe('control mode preference', () => {
  beforeEach(() => {
    document.cookie = 'luminary:steppers=; Max-Age=0; Path=/';
    document.cookie = 'luminary:controls=; Max-Age=0; Path=/';
    document.body.classList.remove('no-steppers', 'ship-tiles');
    delete document.body.dataset.controls;
  });

  test('migrates the legacy compact preference', () => {
    saveSteppersPreference(false);
    expect(loadControlMode()).toBe('compact');
  });

  test('round-trips all three control modes', () => {
    for (const mode of ['steppers', 'compact', 'ships'] as const) {
      saveControlMode(mode);
      expect(loadControlMode()).toBe(mode);
    }
  });

  test('applies mode-specific body hooks', () => {
    applyControlMode('ships');
    expect(document.body.dataset.controls).toBe('ships');
    expect(document.body.classList.contains('ship-tiles')).toBe(true);
    expect(document.body.classList.contains('no-steppers')).toBe(true);

    applyControlMode('steppers');
    expect(document.body.classList.contains('ship-tiles')).toBe(false);
    expect(document.body.classList.contains('no-steppers')).toBe(false);
  });
});

describe('theme preference', () => {
  beforeEach(() => {
    document.cookie = 'luminary:theme=; Max-Age=0; Path=/';
    delete document.documentElement.dataset.theme;
  });

  test('defaults to the dark theme without a valid cookie', () => {
    expect(loadThemePreference()).toBe('dark');

    document.cookie = 'luminary:theme=unknown; Path=/';
    expect(loadThemePreference()).toBe('dark');
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
