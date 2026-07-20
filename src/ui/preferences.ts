const STEPPERS_COOKIE = 'luminary:steppers';
const THEME_COOKIE = 'luminary:theme';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type ThemePreference = 'system' | 'light' | 'dark';

export function loadSteppersPreference(): boolean {
  const value = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith(`${STEPPERS_COOKIE}=`))
    ?.split('=')[1];
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

export function loadThemePreference(): ThemePreference {
  const value = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith(`${THEME_COOKIE}=`))
    ?.split('=')[1];
  return value === 'light' || value === 'dark' ? value : 'system';
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
