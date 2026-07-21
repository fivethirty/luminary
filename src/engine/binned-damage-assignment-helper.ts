import { Ship, Shot } from './ship';
import { NpcDamagePlanner } from './npc-damage-planner';
import { AbstractDamagePlanner, Plan } from './abstract-damage-planner';
import { DamageType } from 'src/constants';
import { DpsRemovalDamagePlanner } from './dps-removal-damage-planner';
import { Phase } from './battle';
import { OptimalDamagePlanner } from './optimal-damage-planner';

type CanonicalGroup = { key: string; indices: number[] };
type MemoEntry = { assignmentsAtEntry: number[]; plan: Plan };

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
    upcomingPhases: Phase[] = []
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
      upcomingPhases
    );
  }

  private memoKey(
    shotIdx: number,
    damageAssignments: number[],
    remainingHp: number[],
    canonicalGroups: CanonicalGroup[]
  ): string {
    // Groups are fixed and config-key sorted for one solve, so only their HP
    // multisets need to be repeated in hot-path keys. Identical configurations
    // are interchangeable, while heterogeneous ships remain in separate groups.
    let key = `${shotIdx}:`;
    for (let groupIdx = 0; groupIdx < canonicalGroups.length; groupIdx++) {
      if (groupIdx > 0) key += ';';
      const hps = canonicalGroups[groupIdx].indices.map((index) =>
        Math.max(0, remainingHp[index] - damageAssignments[index])
      );
      hps.sort((a, b) => a - b);
      key += hps.join('.');
    }
    return key;
  }

  private buildCanonicalGroups(ships: Ship[]): CanonicalGroup[] {
    const byKey = new Map<string, number[]>();
    ships.forEach((ship, index) => {
      const key = ship.configKey();
      const indices = byKey.get(key);
      if (indices) indices.push(index);
      else byKey.set(key, [index]);
    });
    return Array.from(byKey, ([key, indices]) => ({ key, indices })).sort(
      (a, b) => a.key.localeCompare(b.key)
    );
  }

  private remapMemoPlan(
    entry: MemoEntry,
    damageAssignments: number[],
    remainingHp: number[],
    canonicalGroups: CanonicalGroup[]
  ): Plan {
    if (entry.plan.damageAssignments.length === 0) return entry.plan;

    const mappedAssignments = damageAssignments.slice();
    const effectiveHp = (assignments: number[], index: number) =>
      Math.max(0, remainingHp[index] - assignments[index]);

    for (const { indices } of canonicalGroups) {
      // Equal memo keys guarantee equal HP multisets within every group. Match
      // the concrete indices by current HP, then replay only the cached suffix
      // of assignments onto the equivalent ships in this branch.
      const cachedOrder = indices.slice().sort((a, b) => {
        const hpDiff =
          effectiveHp(entry.assignmentsAtEntry, a) -
          effectiveHp(entry.assignmentsAtEntry, b);
        return hpDiff || a - b;
      });
      const currentOrder = indices.slice().sort((a, b) => {
        const hpDiff =
          effectiveHp(damageAssignments, a) - effectiveHp(damageAssignments, b);
        return hpDiff || a - b;
      });

      for (let i = 0; i < indices.length; i++) {
        const cachedIndex = cachedOrder[i];
        const currentIndex = currentOrder[i];
        mappedAssignments[currentIndex] +=
          entry.plan.damageAssignments[cachedIndex] -
          entry.assignmentsAtEntry[cachedIndex];
      }
    }

    return { ...entry.plan, damageAssignments: mappedAssignments };
  }

  private assignBinnedDamageSolve(
    ships: Ship[],
    canDamage: number[][],
    damageAssignments: number[],
    damagePlanner: AbstractDamagePlanner,
    upcomingPhases: Phase[],
    remainingHp: number[],
    maxScore: number,
    canonicalGroups: CanonicalGroup[],
    memo: Map<string, MemoEntry>,
    shotIdx: number
  ): Plan {
    const key = this.memoKey(
      shotIdx,
      damageAssignments,
      remainingHp,
      canonicalGroups
    );
    const cached = memo.get(key);
    if (cached) {
      return this.remapMemoPlan(
        cached,
        damageAssignments,
        remainingHp,
        canonicalGroups
      );
    }

    if (shotIdx === canDamage.length) {
      const evaluated = damagePlanner.evaluate(
        ships,
        remainingHp,
        damageAssignments,
        upcomingPhases
      );
      const plan = {
        ...evaluated,
        damageAssignments: evaluated.damageAssignments.slice(),
      };
      memo.set(key, {
        assignmentsAtEntry: damageAssignments.slice(),
        plan,
      });
      return plan;
    }

    let bestPlan: Plan = {
      score: 0,
      allDestroyed: false,
      damageAssignments: [],
    };

    let anyTarget = false;
    for (let shipIdx = 0; shipIdx < canDamage[shotIdx].length; shipIdx++) {
      const shotDmg = canDamage[shotIdx][shipIdx];
      if (shotDmg === 0) continue; // Skip if this shot can't damage this ship
      anyTarget = true;
      damageAssignments[shipIdx] += shotDmg;
      const newPlan = this.assignBinnedDamageSolve(
        ships,
        canDamage,
        damageAssignments,
        damagePlanner,
        upcomingPhases,
        remainingHp,
        maxScore,
        canonicalGroups,
        memo,
        shotIdx + 1
      );
      if (newPlan.allDestroyed || newPlan.score >= maxScore) {
        damageAssignments[shipIdx] -= shotDmg;
        return newPlan; // early exit if all ships are destroyed
      }
      if (newPlan.score > bestPlan.score) {
        bestPlan = {
          ...newPlan,
          damageAssignments: [...newPlan.damageAssignments],
        };
      }
      damageAssignments[shipIdx] -= shotDmg; // backtrack
    }
    // Keep processing later shots if this one cannot hit a surviving target.
    // Normal weapon generation filters these out, but the helper's public API
    // and exact-planner callers are safer when the recursion is total.
    if (!anyTarget) {
      bestPlan = this.assignBinnedDamageSolve(
        ships,
        canDamage,
        damageAssignments,
        damagePlanner,
        upcomingPhases,
        remainingHp,
        maxScore,
        canonicalGroups,
        memo,
        shotIdx + 1
      );
    }
    memo.set(key, {
      assignmentsAtEntry: damageAssignments.slice(),
      plan: {
        ...bestPlan,
        damageAssignments: bestPlan.damageAssignments.slice(),
      },
    });
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
    upcomingPhases: Phase[]
  ) {
    if (ships.length === 0 || shots.length === 0) return;

    const damagePlanner = this.getDamagePlanner(damageType);

    const sortedShips = damagePlanner.optimallySortShips(ships, upcomingPhases);
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
      upcomingPhases
    );
    if (maxScore === 0) {
      return;
    }

    const damageAssignements = Array(sortedShips.length).fill(0);

    const canonicalGroups = this.buildCanonicalGroups(sortedShips);
    const memo = new Map<string, MemoEntry>();

    const plan = this.assignBinnedDamageSolve(
      sortedShips,
      canDamage,
      damageAssignements,
      damagePlanner,
      upcomingPhases,
      remainingHp,
      maxScore,
      canonicalGroups,
      memo,
      0
    );

    // Apply the chosen assignment
    for (let i = 0; i < plan.damageAssignments.length; i++) {
      const ship = sortedShips[i];
      const planDmg = Math.min(plan.damageAssignments[i], ship.remainingHP());
      ship.takeDamage(planDmg);
    }
  }
}
