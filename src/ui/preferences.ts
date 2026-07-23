const STEPPERS_COOKIE = 'luminary:steppers';
const CONTROLS_COOKIE = 'luminary:controls';
const THEME_COOKIE = 'luminary:theme';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type ThemePreference = 'system' | 'light' | 'dark';
export type ControlMode = 'steppers' | 'compact' | 'ships';

function cookieValue(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.split('=')[1];
}

export function loadSteppersPreference(): boolean {
  const value = cookieValue(STEPPERS_COOKIE);
  return value !== 'off';
}

export function saveSteppersPreference(enabled: boolean) {
  document.cookie = `${STEPPERS_COOKIE}=${enabled ? 'on' : 'off'}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}

// The stepper-free layout is pure CSS keyed off this class: the +/− buttons
// disappear and the stat cubes compress into single rows.
export function applySteppersPreference(enabled: boolean) {
  document.body.classList.toggle('no-steppers', !enabled);
}

export function loadControlMode(): ControlMode {
  const value = cookieValue(CONTROLS_COOKIE);
  if (value === 'steppers' || value === 'compact' || value === 'ships') {
    return value;
  }
  return loadSteppersPreference() ? 'steppers' : 'compact';
}

export function saveControlMode(mode: ControlMode) {
  document.cookie = `${CONTROLS_COOKIE}=${mode}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
  saveSteppersPreference(mode === 'steppers');
}

export function applyControlMode(mode: ControlMode) {
  document.body.dataset.controls = mode;
  document.body.classList.toggle('no-steppers', mode !== 'steppers');
  document.body.classList.toggle('ship-tiles', mode === 'ships');
}

export function loadThemePreference(): ThemePreference {
  const value = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith(`${THEME_COOKIE}=`))
    ?.split('=')[1];
  return value === 'system' || value === 'light' || value === 'dark'
    ? value
    : 'dark';
}

export function saveThemePreference(theme: ThemePreference) {
  document.cookie = `${THEME_COOKIE}=${theme}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}

// A missing data attribute lets the CSS media query follow the operating
// system without needing a matchMedia listener in the application layer.
export function applyThemePreference(theme: ThemePreference) {
  if (theme === 'system') {
    delete document.documentElement.dataset.theme;
    return;
  }
  document.documentElement.dataset.theme = theme;
}
