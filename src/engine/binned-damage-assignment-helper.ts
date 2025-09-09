import { Ship, Shot } from './ship';
import { NpcDamagePlanner } from './npc-damage-planner';
import { AbstractDamagePlanner, Plan } from './abstract-damage-planner';
import { DamageType } from 'src/constants';
import { DpsRemovalDamagePlanner } from './dps-removal-damage-planner';
import { Phase } from './battle';

export class BinnedDamageAssignmentHelper {
  private readonly npcDamagePlanner: AbstractDamagePlanner =
    new NpcDamagePlanner();
  private readonly dpsDamagePlanner: AbstractDamagePlanner =
    new DpsRemovalDamagePlanner();

  assignDamage(
    shots: Shot[],
    targetShips: Ship[],
    damageType: DamageType,
    upcomingPhases: Phase[] = []
  ) {
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
    ships: Ship[]
  ): string {
    const shipsStr = ships
      .map(
        (ship, i) =>
          ship.type.substring(0, 2) +
          (ship.remainingHP() - damageAssignments[i])
      )
      .sort()
      .join(',');
    return `${shotIdx}:${shipsStr}`;
  }

  private assignBinnedDamageSolve(
    ships: Ship[],
    canDamage: number[][],
    damageAssignments: number[],
    damagePlanner: AbstractDamagePlanner,
    upcomingPhases: Phase[],
    remainingHp: number[],
    maxScore: number,
    memo: Map<string, Plan>,
    shotIdx: number
  ): Plan {
    if (shotIdx === canDamage.length) {
      return damagePlanner.evaluate(
        ships,
        remainingHp,
        damageAssignments,
        upcomingPhases
      );
    }
    const key = this.memoKey(shotIdx, damageAssignments, ships);
    if (memo.has(key)) {
      return memo.get(key)!;
    }

    let bestPlan: Plan = {
      score: 0,
      allDestroyed: false,
      damageAssignments: [],
    };

    for (let shipIdx = 0; shipIdx < canDamage[shotIdx].length; shipIdx++) {
      const shotDmg = canDamage[shotIdx][shipIdx];
      if (shotDmg === 0) continue; // Skip if this shot can't damage this ship
      damageAssignments[shipIdx] += shotDmg;
      const newPlan = this.assignBinnedDamageSolve(
        ships,
        canDamage,
        damageAssignments,
        damagePlanner,
        upcomingPhases,
        remainingHp,
        maxScore,
        memo,
        shotIdx + 1
      );
      if (newPlan.allDestroyed || newPlan.score >= maxScore) {
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
    memo.set(key, bestPlan);
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

    const memo = new Map<string, Plan>();

    const plan = this.assignBinnedDamageSolve(
      sortedShips,
      canDamage,
      damageAssignements,
      damagePlanner,
      upcomingPhases,
      remainingHp,
      maxScore,
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
