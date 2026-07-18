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
function expandGroup(group: DieGroup): DieClass[] {
  const { count, classes } = group;
  const results: DieClass[] = [];

  const recurse = (
    classIdx: number,
    remaining: number,
    prob: number,
    multinomial: number,
    shots: Shot[],
    self: number
  ) => {
    if (classIdx === classes.length - 1) {
      // Last class takes all remaining dice.
      const n = remaining;
      const cls = classes[classIdx];
      const p = prob * Math.pow(cls.prob, n);
      const coeff = multinomial / factorial(n);
      const allShots = shots.concat(repeatShots(cls.shots, n));
      results.push({
        prob: p * coeff,
        shots: allShots,
        selfDamage: self + cls.selfDamage * n,
      });
      return;
    }
    const cls = classes[classIdx];
    for (let n = 0; n <= remaining; n++) {
      recurse(
        classIdx + 1,
        remaining - n,
        prob * Math.pow(cls.prob, n),
        multinomial / factorial(n),
        shots.concat(repeatShots(cls.shots, n)),
        self + cls.selfDamage * n
      );
    }
  };

  if (classes.length === 0) {
    return [{ prob: 1, shots: [], selfDamage: 0 }];
  }
  recurse(0, count, 1, factorial(count), [], 0);
  return results;
}

function repeatShots(shots: Shot[], n: number): Shot[] {
  if (n === 0 || shots.length === 0) return [];
  const out: Shot[] = [];
  for (let i = 0; i < n; i++) {
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
 * living enemy shields. Returns null if the outcome count exceeds `maxOutcomes`.
 */
export function enumerateSlotOutcomes(
  shooters: Ship[],
  missilePhase: boolean,
  enemyShields: number[],
  antimatterSplitter: boolean,
  maxOutcomes: number
): SlotOutcome[] | null {
  const shieldSet = Array.from(new Set(enemyShields)).sort((a, b) => a - b);

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
    if (missilePhase) {
      for (const wt of WEAPON_TYPES) {
        const count = ship.missiles[wt];
        addDice(`m|${ship.computers}|${wt}`, count, () =>
          weaponDieClasses(ship.computers, WeaponDamage[wt], false, shieldSet)
        );
      }
    } else {
      for (const wt of WEAPON_TYPES) {
        const count = ship.cannons[wt];
        const splitter = wt === 'antimatter' && antimatterSplitter;
        addDice(`c|${ship.computers}|${wt}|${splitter}`, count, () =>
          weaponDieClasses(
            ship.computers,
            WeaponDamage[wt],
            splitter,
            shieldSet
          )
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
    const expanded = expandGroup(group);
    const next: SlotOutcome[] = [];
    for (const base of outcomes) {
      for (const add of expanded) {
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
