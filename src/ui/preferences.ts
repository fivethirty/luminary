const STEPPERS_COOKIE = 'luminary:steppers';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

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
