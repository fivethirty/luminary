import { Ship, Shot } from './ship';
import { NpcDamagePlanner } from './npc-damage-planner';
import { AbstractDamagePlanner, Plan } from './abstract-damage-planner';
import { DamageType } from 'src/constants';
import { DpsRemovalDamagePlanner } from './dps-removal-damage-planner';
import { Phase } from './battle';
import { OptimalDamagePlanner } from './optimal-damage-planner';

// Ships sharing one configKey, by ascending sorted-ship index. `hpWeights`
// encodes the group's effective-HP histogram as a mixed-radix number (base =
// group size + 1, one digit per HP value 0..maxHp); it is null only when that
// number would not be a safe integer.
type CanonicalGroup = {
  indices: number[];
  maxHp: number;
  hpWeights: number[] | null;
};
// A memoized plan plus the damage it adds below its node, listed per group in
// (effective HP, index) order so it can be replayed onto any branch with the
// same HP multisets. Null when the plan adds nothing to the entry assignments.
type MemoEntry = { plan: Plan; delta: number[] | null };
type MemoKey = number | string;

type SolveContext = {
  ships: Ship[];
  canDamage: number[][];
  damageAssignments: number[];
  damagePlanner: AbstractDamagePlanner;
  upcomingPhases: Phase[];
  remainingHp: number[];
  maxScore: number;
  canonicalGroups: CanonicalGroup[];
  memo: Map<MemoKey, MemoEntry>;
  targetShield: number | undefined;
  // Numeric key space: shipWeights[shipIdx][effectiveHp] already carries the
  // group and shot strides, so a key is shotIdx plus the sum of weights. Null
  // when the whole key would not fit a safe integer (string keys are used).
  shipWeights: number[][] | null;
};

const EMPTY_PLAN: Plan = {
  score: 0,
  allDestroyed: false,
  damageAssignments: [],
};

export class BinnedDamageAssignmentHelper {
  private readonly npcDamagePlanner: AbstractDamagePlanner =
    new NpcDamagePlanner();
  private readonly dpsDamagePlanner: AbstractDamagePlanner =
    new DpsRemovalDamagePlanner();
  // Injected by the owning fleet when it opts into optimal planning. Unlike the
  // others it applies damage itself rather than scoring an assignment.
  private optimalDamagePlanner!: OptimalDamagePlanner;

  setOptimalPlanner(planner: OptimalDamagePlanner): void {
    this.optimalDamagePlanner = planner;
  }

  assignDamage(
    shots: Shot[],
    targetShips: Ship[],
    damageType: DamageType,
    upcomingPhases: Phase[] = [],
    targetShield?: number
  ) {
    if (damageType === DamageType.OPTIMAL) {
      // Always set by the fleet before this type is selected (see Fleet).
      return this.optimalDamagePlanner.assignDamage(
        shots,
        targetShips,
        upcomingPhases
      );
    }
    return this.assignBinnedDamage(
      shots,
      targetShips,
      damageType,
      upcomingPhases,
      targetShield
    );
  }

  // Memo-equivalence is (shot index, effective-HP multiset of every
  // configuration group). Identical configurations are interchangeable, while
  // heterogeneous ships remain in separate groups.
  private memoKey(ctx: SolveContext, shotIdx: number): MemoKey {
    const { damageAssignments, remainingHp, shipWeights } = ctx;
    if (shipWeights !== null) {
      let key = shotIdx;
      for (let i = 0; i < remainingHp.length; i++) {
        const effectiveHp = remainingHp[i] - damageAssignments[i];
        key += shipWeights[i][effectiveHp > 0 ? effectiveHp : 0];
      }
      return key;
    }
    let key = `${shotIdx}:`;
    for (const { indices, hpWeights } of ctx.canonicalGroups) {
      if (hpWeights !== null) {
        let code = 0;
        for (let k = 0; k < indices.length; k++) {
          const index = indices[k];
          const effectiveHp = remainingHp[index] - damageAssignments[index];
          code += hpWeights[effectiveHp > 0 ? effectiveHp : 0];
        }
        key += `${code};`;
      } else {
        const hps = indices.map((index) =>
          Math.max(0, remainingHp[index] - damageAssignments[index])
        );
        hps.sort((a, b) => a - b);
        key += `${hps.join('.')};`;
      }
    }
    return key;
  }

  private buildCanonicalGroups(
    ships: Ship[],
    remainingHp: number[]
  ): CanonicalGroup[] {
    const byKey = new Map<string, number[]>();
    ships.forEach((ship, index) => {
      const key = ship.configKey();
      const indices = byKey.get(key);
      if (indices) indices.push(index);
      else byKey.set(key, [index]);
    });
    return Array.from(byKey.values(), (indices) => {
      const base = indices.length + 1;
      let maxHp = 0;
      for (const index of indices) {
        if (remainingHp[index] > maxHp) maxHp = remainingHp[index];
      }
      const hpWeights = [1];
      for (let hp = 1; hp <= maxHp; hp++) {
        hpWeights.push(hpWeights[hp - 1] * base);
      }
      const radix = hpWeights[maxHp] * base;
      return {
        indices,
        maxHp,
        hpWeights: radix <= Number.MAX_SAFE_INTEGER ? hpWeights : null,
      };
    });
  }

  private buildShipWeights(
    canonicalGroups: CanonicalGroup[],
    shipCount: number,
    shotCount: number
  ): number[][] | null {
    // shotIdx ranges over 0..shotCount inclusive.
    let stride = shotCount + 1;
    const shipWeights: number[][] = new Array(shipCount);
    for (const { indices, maxHp, hpWeights } of canonicalGroups) {
      if (hpWeights === null) return null;
      const radix = hpWeights[maxHp] * (indices.length + 1);
      if (stride * radix > Number.MAX_SAFE_INTEGER) return null;
      const weights = hpWeights.map((weight) => weight * stride);
      for (const index of indices) shipWeights[index] = weights;
      stride *= radix;
    }
    return shipWeights;
  }

  // Damage the plan adds beyond the entry assignments, per group in
  // (effective HP, index) order; null when nothing is added (leaf plans).
  private planDelta(plan: Plan, ctx: SolveContext): number[] | null {
    if (plan.damageAssignments.length === 0) return null;
    const { damageAssignments, remainingHp } = ctx;
    const delta: number[] = new Array(remainingHp.length);
    let next = 0;
    let anyDelta = false;
    for (const { indices, maxHp } of ctx.canonicalGroups) {
      for (let hp = 0; hp <= maxHp; hp++) {
        for (let k = 0; k < indices.length; k++) {
          const index = indices[k];
          const effectiveHp = remainingHp[index] - damageAssignments[index];
          if ((effectiveHp > 0 ? effectiveHp : 0) !== hp) continue;
          const shipDelta =
            plan.damageAssignments[index] - damageAssignments[index];
          if (shipDelta !== 0) anyDelta = true;
          delta[next++] = shipDelta;
        }
      }
    }
    return anyDelta ? delta : null;
  }

  private remapMemoPlan(entry: MemoEntry, ctx: SolveContext): Plan {
    if (entry.plan.damageAssignments.length === 0) return entry.plan;

    const { damageAssignments, remainingHp } = ctx;
    const mappedAssignments = damageAssignments.slice();
    const delta = entry.delta;
    if (delta !== null) {
      // Equal memo keys guarantee equal HP multisets within every group, so
      // the cached suffix pairs with this branch's ships by (HP, index) rank.
      let next = 0;
      for (const { indices, maxHp } of ctx.canonicalGroups) {
        for (let hp = 0; hp <= maxHp; hp++) {
          for (let k = 0; k < indices.length; k++) {
            const index = indices[k];
            const effectiveHp = remainingHp[index] - damageAssignments[index];
            if ((effectiveHp > 0 ? effectiveHp : 0) !== hp) continue;
            mappedAssignments[index] += delta[next++];
          }
        }
      }
    }
    return {
      score: entry.plan.score,
      allDestroyed: entry.plan.allDestroyed,
      damageAssignments: mappedAssignments,
    };
  }

  // Plans returned from here are never mutated afterwards, so callers and
  // memo entries share them instead of copying.
  private assignBinnedDamageSolve(ctx: SolveContext, shotIdx: number): Plan {
    const key = this.memoKey(ctx, shotIdx);
    const cached = ctx.memo.get(key);
    if (cached !== undefined) {
      return this.remapMemoPlan(cached, ctx);
    }

    const { canDamage, damageAssignments } = ctx;
    if (shotIdx === canDamage.length) {
      const evaluated = ctx.damagePlanner.evaluate(
        ctx.ships,
        ctx.remainingHp,
        damageAssignments,
        ctx.upcomingPhases,
        ctx.targetShield
      );
      const plan: Plan = {
        score: evaluated.score,
        allDestroyed: evaluated.allDestroyed,
        damageAssignments: evaluated.damageAssignments.slice(),
      };
      ctx.memo.set(key, {
        plan,
        delta:
          evaluated.damageAssignments === damageAssignments
            ? null
            : this.planDelta(plan, ctx),
      });
      return plan;
    }

    let bestPlan: Plan = EMPTY_PLAN;

    let anyTarget = false;
    const row = canDamage[shotIdx];
    for (let shipIdx = 0; shipIdx < row.length; shipIdx++) {
      const shotDmg = row[shipIdx];
      if (shotDmg === 0) continue; // Skip if this shot can't damage this ship
      anyTarget = true;
      damageAssignments[shipIdx] += shotDmg;
      const newPlan = this.assignBinnedDamageSolve(ctx, shotIdx + 1);
      damageAssignments[shipIdx] -= shotDmg; // backtrack
      if (newPlan.allDestroyed || newPlan.score >= ctx.maxScore) {
        return newPlan; // early exit if all ships are destroyed
      }
      if (newPlan.score > bestPlan.score) {
        bestPlan = newPlan;
      }
    }
    // Keep processing later shots if this one cannot hit a surviving target.
    // Normal weapon generation filters these out, but the helper's public API
    // and exact-planner callers are safer when the recursion is total.
    if (!anyTarget) {
      bestPlan = this.assignBinnedDamageSolve(ctx, shotIdx + 1);
    }
    ctx.memo.set(key, { plan: bestPlan, delta: this.planDelta(bestPlan, ctx) });
    return bestPlan;
  }

  private getDamagePlanner(damageType: DamageType): AbstractDamagePlanner {
    switch (damageType) {
      case DamageType.DPS:
        return this.dpsDamagePlanner;
      case DamageType.NPC:
      default:
        return this.npcDamagePlanner;
    }
  }

  private assignBinnedDamage(
    shots: Shot[],
    ships: Ship[],
    damageType: DamageType,
    upcomingPhases: Phase[],
    targetShield?: number
  ) {
    if (ships.length === 0 || shots.length === 0) return;

    const damagePlanner = this.getDamagePlanner(damageType);

    const sortedShips = damagePlanner.optimallySortShips(
      ships,
      upcomingPhases,
      targetShield
    );
    const sortedShots = damagePlanner.optimallySortShots(shots);

    // Precompute: can this shot hit that ship?
    const canDamage: number[][] = sortedShots.map((shot) =>
      sortedShips.map((ship) => (ship.shotHits(shot) ? shot.damage : 0))
    );

    const remainingHp = sortedShips.map((ship) => ship.remainingHP());

    const maxScore = damagePlanner.calculateMaxScore(
      sortedShips,
      sortedShots,
      remainingHp,
      upcomingPhases,
      targetShield
    );
    if (maxScore === 0) {
      return;
    }

    const canonicalGroups = this.buildCanonicalGroups(sortedShips, remainingHp);
    const ctx: SolveContext = {
      ships: sortedShips,
      canDamage,
      damageAssignments: Array(sortedShips.length).fill(0),
      damagePlanner,
      upcomingPhases,
      remainingHp,
      maxScore,
      canonicalGroups,
      memo: new Map<MemoKey, MemoEntry>(),
      targetShield,
      shipWeights: this.buildShipWeights(
        canonicalGroups,
        sortedShips.length,
        sortedShots.length
      ),
    };

    const plan = this.assignBinnedDamageSolve(ctx, 0);

    // Apply the chosen assignment
    for (let i = 0; i < plan.damageAssignments.length; i++) {
      const ship = sortedShips[i];
      const planDmg = Math.min(plan.damageAssignments[i], ship.remainingHP());
      ship.takeDamage(planDmg);
    }
  }
}
