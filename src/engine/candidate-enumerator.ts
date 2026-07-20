import { Ship, Shot } from './ship';
import { sortShotsForAssignment } from './abstract-damage-planner';

export type Candidate = {
  // Parallel to the `ships` array passed to enumerateCandidates.
  damageAssignments: number[];
  // Canonical key of the resulting fleet state; equal keys are the same state.
  stateKey: string;
};

export type EnumerationLimits = {
  maxCandidates?: number;
  maxNodes?: number;
  // Exact-combat callers use this to share the solver's wall-clock deadline
  // with a potentially large assignment search. It is intentionally optional
  // so live planner calls retain their existing node/candidate caps.
  shouldAbort?: () => boolean;
};

const DEFAULT_MAX_CANDIDATES = 200;
const DEFAULT_MAX_NODES = 50_000;

/**
 * Enumerates every distinct successor state reachable by assigning `shots` to
 * `ships`, deduplicated by the resulting multiset of (config, remaining HP).
 *
 * Mirrors the recursion in BinnedDamageAssignmentHelper's solver, but collects
 * distinct outcomes instead of maximizing a score. Like that solver it has no
 * "discard this shot" branch: every shot is assigned to some ship it can hit
 * (a shot that can hit nothing is skipped).
 *
 * Returns `null` when the search exceeds the given limits, signalling the
 * caller to fall back to a cheaper planner. Returns `[]` when no shot can
 * damage any ship.
 */
export function enumerateCandidates(
  shots: Shot[],
  ships: Ship[],
  limits: EnumerationLimits = {}
): Candidate[] | null {
  const maxCandidates = limits.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const maxNodes = limits.maxNodes ?? DEFAULT_MAX_NODES;
  const shouldAbort = limits.shouldAbort;

  if (shouldAbort?.()) return null;
  if (ships.length === 0 || shots.length === 0) {
    return [];
  }

  const sortedShots = sortShotsForAssignment(shots);

  // canDamage[shotIdx][shipIdx] = damage this shot deals to that ship, or 0.
  const canDamage: number[][] = sortedShots.map((shot) =>
    ships.map((ship) => (ship.shotHits(shot) ? shot.damage : 0))
  );

  // If no shot can reach any ship, there is no decision to make.
  if (!canDamage.some((row) => row.some((dmg) => dmg > 0))) {
    return [];
  }

  const remainingHp = ships.map((ship) => ship.remainingHP());
  const configKeys = ships.map((ship) => ship.configKey());

  const candidates = new Map<string, Candidate>();
  // Prunes permutation-equivalent branches: two partial assignments that reach
  // the same partial state from the same shot index have identical subtrees.
  const visited = new Set<string>();
  const assignments = new Array<number>(ships.length).fill(0);
  let nodes = 0;
  let aborted = false;

  const finalStateKey = (): string => {
    const parts = new Array<string>(ships.length);
    for (let i = 0; i < ships.length; i++) {
      const resultingHp = Math.max(0, remainingHp[i] - assignments[i]);
      parts[i] = `${configKeys[i]}#${resultingHp}`;
    }
    return parts.sort().join(',');
  };

  const partialStateKey = (shotIdx: number): string => {
    const parts = new Array<string>(ships.length);
    for (let i = 0; i < ships.length; i++) {
      // Cap at remaining HP so overkill collapses to the same state.
      const applied = Math.min(assignments[i], remainingHp[i]);
      parts[i] = `${configKeys[i]}#${applied}`;
    }
    return `${shotIdx}:${parts.sort().join(',')}`;
  };

  const recurse = (shotIdx: number): void => {
    if (aborted) return;
    if (++nodes > maxNodes) {
      aborted = true;
      return;
    }
    // Checking the clock on every recursive node is measurable in this hot
    // path. Sampling it every 64 nodes still bounds the uninterruptible work
    // while keeping ordinary candidate enumeration cheap.
    if ((nodes & 0x3f) === 0 && shouldAbort?.()) {
      aborted = true;
      return;
    }

    if (shotIdx === sortedShots.length) {
      const key = finalStateKey();
      if (!candidates.has(key)) {
        if (candidates.size >= maxCandidates) {
          aborted = true;
          return;
        }
        candidates.set(key, {
          damageAssignments: assignments.slice(),
          stateKey: key,
        });
      }
      return;
    }

    const visitKey = partialStateKey(shotIdx);
    if (visited.has(visitKey)) {
      return;
    }
    visited.add(visitKey);

    const row = canDamage[shotIdx];
    let anyTarget = false;
    for (let shipIdx = 0; shipIdx < row.length; shipIdx++) {
      const dmg = row[shipIdx];
      if (dmg === 0) continue;
      anyTarget = true;
      assignments[shipIdx] += dmg;
      recurse(shotIdx + 1);
      assignments[shipIdx] -= dmg;
      if (aborted) return;
    }

    // A shot that can hit nothing is simply skipped (no discard semantics).
    if (!anyTarget) {
      recurse(shotIdx + 1);
    }
  };

  recurse(0);

  if (aborted) {
    return null;
  }

  return Array.from(candidates.values());
}
