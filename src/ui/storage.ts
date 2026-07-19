import type { FleetState } from '@ui/state';
import { battleLabel, encodeBattleQuery, parseBattleQuery } from '@ui/share';

// Local persistence for table play: the in-progress setup survives a refresh,
// and settled battles collect into a small "recent battles" list. Both are
// stored as the same query strings used in share links, so the URL codec is
// the single format for battle state. All storage access is fail-soft:
// localStorage being unavailable (private mode, embedded webviews) simply
// disables persistence.
const SETUP_KEY = 'luminary:setup';
const RECENTS_KEY = 'luminary:recents';
const MAX_RECENTS = 8;

// Auto-simulation records a battle on every settled edit, so consecutive
// records within this window update the newest entry instead of appending —
// a burst of tweaks reads as one battle, not eight.
const RECENT_MERGE_WINDOW_MS = 120_000;

export interface RecentBattle {
  query: string;
  label: string;
  updatedAt: number;
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Persistence is best-effort.
  }
}

export function saveSetup(fleets: FleetState[]) {
  write(SETUP_KEY, encodeBattleQuery(fleets));
}

export function loadSetup(): FleetState[] | null {
  const query = read(SETUP_KEY);
  return query ? parseBattleQuery(query) : null;
}

export function loadRecentBattles(): RecentBattle[] {
  const raw = read(RECENTS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is RecentBattle =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as RecentBattle).query === 'string' &&
        typeof (entry as RecentBattle).label === 'string' &&
        typeof (entry as RecentBattle).updatedAt === 'number'
    );
  } catch {
    return [];
  }
}

export function recordRecentBattle(fleets: FleetState[], now = Date.now()) {
  const query = encodeBattleQuery(fleets);
  if (!query) return;

  const label = battleLabel(fleets);
  const compositionKey = battleCompositionKey(fleets);
  const recents = loadRecentBattles();
  const head = recents[0];

  if (head && head.query === query) {
    head.updatedAt = now;
  } else if (head && recentCompositionKey(head) === compositionKey) {
    recents[0] = { query, label, updatedAt: now };
  } else if (head && now - head.updatedAt < RECENT_MERGE_WINDOW_MS) {
    recents[0] = { query, label, updatedAt: now };
  } else {
    recents.unshift({ query, label, updatedAt: now });
  }

  write(RECENTS_KEY, JSON.stringify(recents.slice(0, MAX_RECENTS)));
}

function recentCompositionKey(recent: RecentBattle): string | null {
  const fleets = parseBattleQuery(recent.query);
  return fleets ? battleCompositionKey(fleets) : null;
}

function battleCompositionKey(fleets: FleetState[]): string {
  return fleets
    .map((fleet, index) => {
      const ships = fleet.shipTypes
        .map((ship) => `${ship.type}:${ship.quantity}`)
        .sort()
        .join(',');
      return `${index}=${ships}`;
    })
    .join('|');
}
