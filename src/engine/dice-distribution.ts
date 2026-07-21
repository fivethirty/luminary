import { DICE_VALUES, HIT_AFTER_MODIFIERS } from 'src/constants';
import { Ship, Shot, WeaponDamage, WeaponType } from './ship';

// One joint outcome of every die fired in a slot: the exact multiset of Shots
// that land on the enemy (roll chosen so `Ship.shotHits` reproduces the hit
// class), plus how many rift self-damage hits struck the firing fleet.
export type SlotOutcome = {
  prob: number;
  shots: Shot[];
  selfDamage: number;
};

// Whether a die roll hits a ship of the given shields, mirroring Ship.shotHits.
function rollHitsShield(
  roll: number,
  computers: number,
  shields: number
): boolean {
  if (roll === DICE_VALUES.MISS) return false; // natural 1 always misses
  if (roll === DICE_VALUES.HIT) return true; // natural 6 always hits
  return roll + computers - shields >= HIT_AFTER_MODIFIERS;
}

// One equivalence class of a single die: the rolls that share a hit-set (or
// self/target behaviour for rift) collapse into one weighted outcome.
type DieClass = { prob: number; shots: Shot[]; selfDamage: number };

// A group of identical dice, expanded to its per-die classes.
type DieGroup = { count: number; classes: DieClass[] };

type AbortCheck = (force?: boolean) => boolean;

const ABORT_CHECK_INTERVAL = 128;

function makeAbortCheck(shouldAbort?: () => boolean): AbortCheck {
  let workSinceCheck = 0;
  return (force = false): boolean => {
    if (!shouldAbort) return false;
    workSinceCheck++;
    if (!force && workSinceCheck < ABORT_CHECK_INTERVAL) return false;
    workSinceCheck = 0;
    return shouldAbort();
  };
}

const WEAPON_TYPES: WeaponType[] = ['ion', 'plasma', 'soliton', 'antimatter'];

// Classes for one ordinary (cannon or missile) die against the distinct living
// enemy shield values. Rolls with identical hit-sets merge; the empty hit-set
// rolls (always including a natural 1) become a single no-shot "miss" class.
function weaponDieClasses(
  computers: number,
  damage: number,
  splitter: boolean,
  shieldSet: number[]
): DieClass[] {
  // Group rolls 1..6 by their hit-set signature over shieldSet.
  const bySignature = new Map<string, number[]>();
  for (let roll = 1; roll <= DICE_VALUES.NUM_SIDES; roll++) {
    const signature = shieldSet
      .map((s) => (rollHitsShield(roll, computers, s) ? '1' : '0'))
      .join('');
    const rolls = bySignature.get(signature);
    if (rolls) {
      rolls.push(roll);
    } else {
      bySignature.set(signature, [roll]);
    }
  }

  const classes: DieClass[] = [];
  for (const [signature, rolls] of bySignature) {
    const prob = rolls.length / DICE_VALUES.NUM_SIDES;
    if (!signature.includes('1')) {
      // Hits nothing: a landed-but-unassignable / missed die. No shot.
      classes.push({ prob, shots: [], selfDamage: 0 });
      continue;
    }
    // Representative roll reproduces this exact hit-set (all rolls in the class
    // share it, so the smallest works).
    const roll = Math.min(...rolls);
    const shots: Shot[] =
      splitter && damage > 1
        ? Array.from({ length: damage }, () => ({ roll, computers, damage: 1 }))
        : [{ roll, computers, damage }];
    classes.push({ prob, shots, selfDamage: 0 });
  }
  return classes;
}

// The five fixed classes of a rift die (independent of shields/computers).
// Target damage lands as a guaranteed-hit shot (roll 6); self damage is counted.
function riftDieClasses(): DieClass[] {
  return [
    { prob: 2 / 6, shots: [], selfDamage: 0 }, // rolls 2,3: nothing
    { prob: 1 / 6, shots: [], selfDamage: 1 }, // roll 1: self only
    {
      prob: 1 / 6,
      shots: [{ roll: 6, computers: 0, damage: 1 }],
      selfDamage: 0,
    }, // roll 4
    {
      prob: 1 / 6,
      shots: [{ roll: 6, computers: 0, damage: 2 }],
      selfDamage: 0,
    }, // roll 5
    {
      prob: 1 / 6,
      shots: [{ roll: 6, computers: 0, damage: 3 }],
      selfDamage: 1,
    }, // roll 6
  ];
}

// Multiset outcomes of `count` identical dice with the given classes: every
// composition (n_1..n_k) summing to count, weighted multinomially.
function multisetOutcomeCount(
  dieCount: number,
  classCount: number,
  limit: number
): number | null {
  if (classCount <= 1 || dieCount === 0) return 1;

  // The number of weak compositions of dieCount into classCount buckets is
  // C(dieCount + classCount - 1, classCount - 1). Die classes are few (at
  // most the six die faces), so evaluate the small side of the binomial and
  // stop as soon as the caller's useful range is exceeded.
  const choose = Math.min(classCount - 1, dieCount);
  const total = dieCount + classCount - 1;
  let result = 1;
  for (let i = 1; i <= choose; i++) {
    result = (result * (total - choose + i)) / i;
    if (!Number.isFinite(result) || result > limit) return null;
  }
  return result;
}

function expandGroup(
  group: DieGroup,
  maxOutcomes: number,
  abortCheck: AbortCheck
): DieClass[] | null {
  const { count, classes } = group;
  if (multisetOutcomeCount(count, classes.length, maxOutcomes) === null) {
    return null;
  }
  if (classes.length === 0) {
    return [{ prob: 1, shots: [], selfDamage: 0 }];
  }
  if (classes.length === 1) {
    const cls = classes[0];
    const shots = repeatShots(cls.shots, count, abortCheck);
    if (shots === null) return null;
    return [
      {
        prob: Math.pow(cls.prob, count),
        shots,
        selfDamage: cls.selfDamage * count,
      },
    ];
  }
  const results: DieClass[] = [];
  let aborted = false;

  const recurse = (
    classIdx: number,
    remaining: number,
    prob: number,
    multinomial: number,
    shots: Shot[],
    self: number
  ) => {
    if (aborted) return;
    if (abortCheck()) {
      aborted = true;
      return;
    }
    if (classIdx === classes.length - 1) {
      // Last class takes all remaining dice.
      if (results.length >= maxOutcomes) {
        aborted = true;
        return;
      }
      const n = remaining;
      const cls = classes[classIdx];
      const p = prob * Math.pow(cls.prob, n);
      const coeff = multinomial / factorial(n);
      const repeatedShots = repeatShots(cls.shots, n, abortCheck);
      if (repeatedShots === null) {
        aborted = true;
        return;
      }
      const allShots = shots.concat(repeatedShots);
      results.push({
        prob: p * coeff,
        shots: allShots,
        selfDamage: self + cls.selfDamage * n,
      });
      return;
    }
    const cls = classes[classIdx];
    for (let n = 0; n <= remaining; n++) {
      const repeatedShots = repeatShots(cls.shots, n, abortCheck);
      if (repeatedShots === null) {
        aborted = true;
        return;
      }
      recurse(
        classIdx + 1,
        remaining - n,
        prob * Math.pow(cls.prob, n),
        multinomial / factorial(n),
        shots.concat(repeatedShots),
        self + cls.selfDamage * n
      );
      if (aborted) return;
    }
  };

  recurse(0, count, 1, factorial(count), [], 0);
  return aborted ? null : results;
}

function repeatShots(
  shots: Shot[],
  n: number,
  abortCheck: AbortCheck
): Shot[] | null {
  if (n === 0 || shots.length === 0) return [];
  const out: Shot[] = [];
  for (let i = 0; i < n; i++) {
    if (abortCheck()) return null;
    for (const shot of shots) out.push({ ...shot });
  }
  return out;
}

const FACTORIALS = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];
function factorial(n: number): number {
  if (n < FACTORIALS.length) return FACTORIALS[n];
  let f = FACTORIALS[FACTORIALS.length - 1];
  for (let i = FACTORIALS.length; i <= n; i++) f *= i;
  return f;
}

/**
 * Enumerates every joint dice outcome for one slot: the ships firing (living
 * ships at the slot's initiative), their weapon/rift dice against the distinct
 * living enemy shields. Returns null if the outcome count exceeds `maxOutcomes`
 * or the optional cooperative cancellation predicate requests an abort.
 */
export function enumerateSlotOutcomes(
  shooters: Ship[],
  missilePhase: boolean,
  enemyShields: number[],
  antimatterSplitter: boolean,
  maxOutcomes: number,
  shouldAbort?: () => boolean,
  ordinaryDamageCeiling: number = Infinity
): SlotOutcome[] | null {
  const abortCheck = makeAbortCheck(shouldAbort);
  if (abortCheck(true)) return null;
  const shieldSet = Array.from(new Set(enemyShields)).sort((a, b) => a - b);
  const effectiveDamageCeiling = Math.max(1, ordinaryDamageCeiling);

  // Merge identical dice across ships into groups keyed by their behaviour.
  const groupCounts = new Map<string, DieGroup>();
  const addDice = (
    key: string,
    count: number,
    makeClasses: () => DieClass[]
  ) => {
    if (count <= 0) return;
    const existing = groupCounts.get(key);
    if (existing) {
      existing.count += count;
    } else {
      groupCounts.set(key, { count, classes: makeClasses() });
    }
  };

  for (const ship of shooters) {
    if (abortCheck()) return null;
    if (missilePhase) {
      for (const wt of WEAPON_TYPES) {
        const count = ship.missiles[wt];
        const damage = Math.min(WeaponDamage[wt], effectiveDamageCeiling);
        addDice(`m|${ship.computers}|d${damage}`, count, () =>
          weaponDieClasses(ship.computers, damage, false, shieldSet)
        );
      }
    } else {
      for (const wt of WEAPON_TYPES) {
        const count = ship.cannons[wt];
        const splitter = wt === 'antimatter' && antimatterSplitter;
        // Split antimatter remains one correlated die yielding four separate
        // 1-damage shots. Every other ordinary die can be capped at the most
        // damage any current target can retain; equal effective dice then
        // share one multinomial group.
        const damage = splitter
          ? WeaponDamage[wt]
          : Math.min(WeaponDamage[wt], effectiveDamageCeiling);
        const behavior = splitter ? `split${damage}` : `d${damage}`;
        addDice(`c|${ship.computers}|${behavior}`, count, () =>
          weaponDieClasses(ship.computers, damage, splitter, shieldSet)
        );
      }
      addDice('rift', ship.rift, riftDieClasses);
    }
  }

  const groups = Array.from(groupCounts.values());
  if (groups.length === 0) {
    return [{ prob: 1, shots: [], selfDamage: 0 }];
  }

  // Cartesian product of each group's multiset outcomes.
  let outcomes: SlotOutcome[] = [{ prob: 1, shots: [], selfDamage: 0 }];
  for (const group of groups) {
    // A group's full multiset does not need to be materialized when its
    // Cartesian product with the accumulated groups already exceeds the cap.
    // This is particularly important for a single extreme group (for example,
    // many rift dice), where the old post-expansion check came too late.
    const groupLimit = Math.floor(maxOutcomes / outcomes.length);
    if (groupLimit < 1) return null;
    const expanded = expandGroup(group, groupLimit, abortCheck);
    if (expanded === null) return null;
    const next: SlotOutcome[] = [];
    for (const base of outcomes) {
      for (const add of expanded) {
        if (abortCheck()) return null;
        next.push({
          prob: base.prob * add.prob,
          shots: base.shots.concat(add.shots),
          selfDamage: base.selfDamage + add.selfDamage,
        });
      }
      if (next.length > maxOutcomes) return null;
    }
    outcomes = next;
  }
  return outcomes;
}
