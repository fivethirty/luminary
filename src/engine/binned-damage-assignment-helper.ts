import { DICE_VALUES } from 'src/constants';
import { Ship, ShipType, Shot } from './ship';

const DAMAGE_PRIORTY: Record<ShipType, number> = {
  Dreadnaught: 0,
  Orbital: 1,
  Cruiser: 3,
  Starbase: 5,
  Interceptor: 8,
  GCDS: 9,
  Guardian: 10,
  Ancient: 11,
};

const MAX_PRI = DAMAGE_PRIORTY.Ancient;

const damageKeys = Object.keys(DAMAGE_PRIORTY) as ShipType[];
const DAMAGE_PRIORITY_WEIGHT: Record<ShipType, number> = {} as Record<
  ShipType,
  number
>;
for (let i = 0; i < damageKeys.length; i++) {
  const key = damageKeys[i];
  DAMAGE_PRIORITY_WEIGHT[key] = 1 << (MAX_PRI - DAMAGE_PRIORTY[key]);
}
const KILL_WEIGHT = 1 << 20;

type Plan = {
  score: number;
  allDestroyed: boolean;
  damageAssignments: number[];
};

export class BinnedDamageAssignmentHelper {
  assignDamage(shots: Shot[], ships: Ship[]) {
    return this.assignBinnedDamage(shots, ships);
  }

  private buildNpcPlan(
    ships: Ship[],
    remainingHp: number[],
    damageAssignments: number[]
  ): Plan {
    let allDestroyed = true;
    let score = 0;
    for (let i = 0; i < ships.length; i++) {
      const ship = ships[i];
      const remainingShipHp = remainingHp[i];
      const priorityWeight = DAMAGE_PRIORITY_WEIGHT[ship.type];
      const damage = damageAssignments[i];
      if (damage === 0) {
        allDestroyed = false;
        continue;
      }
      if (remainingShipHp > damage) {
        allDestroyed = false;
        score +=
          priorityWeight +
          Math.pow(2, ship.maxHP() - (remainingShipHp - damage)); // Prioritize damage to ships that are closer to being destroyed
      } else {
        score += priorityWeight * KILL_WEIGHT;
      }
    }
    return { score, allDestroyed, damageAssignments };
  }

  private optimallySortShips(ships: Ship[]): Ship[] {
    const sortedArr = ships.slice().sort((a, b) => {
      const priorityDiff = DAMAGE_PRIORTY[a.type] - DAMAGE_PRIORTY[b.type];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return a.remainingHP() - b.remainingHP();
    });
    return sortedArr;
  }

  private optimallySortShots(shots: Shot[]): Shot[] {
    const sortedArr = shots.slice().sort((a, b) => {
      if (a.roll !== b.roll) {
        if (a.roll === DICE_VALUES.HIT) {
          return 1; // HITs should come last
        } else if (b.roll === DICE_VALUES.HIT) {
          return -1; // HITs should come last
        }
        return a.roll - b.roll; // Sort by rolls ascending
      }
      return a.damage - b.damage; // If rolls are equal, sort by damage ascending
    });
    return sortedArr;
  }

  private calculateMaxNpcScore(
    sortedShips: Ship[],
    shots: Shot[],
    remainingHp: number[]
  ): number {
    let maxDamage = shots.reduce((sum, shot) => sum + shot.damage, 0);
    const damageAssignments = Array(sortedShips.length).fill(0);
    let shipsLeft = false;
    for (let i = 0; i < sortedShips.length; i++) {
      const ship = sortedShips[i];
      if (maxDamage >= ship.remainingHP()) {
        const damage = Math.min(maxDamage, ship.remainingHP());
        damageAssignments[i] = damage;
        maxDamage -= damage;
        if (maxDamage <= 0) break;
      } else {
        shipsLeft = true;
      }
    }
    if (maxDamage > 0 && shipsLeft) {
      for (let i = 0; i < sortedShips.length; i++) {
        const ship = sortedShips[i];
        if (damageAssignments[i] === 0) {
          const damage = Math.min(maxDamage, ship.remainingHP());
          damageAssignments[i] = damage;
          maxDamage -= damage;
          if (maxDamage <= 0) break;
        }
      }
    }
    return this.buildNpcPlan(sortedShips, remainingHp, damageAssignments).score;
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
    remainingHp: number[],
    maxScore: number,
    memo: Map<string, Plan>,
    shotIdx: number
  ): Plan {
    if (shotIdx === canDamage.length) {
      return this.buildNpcPlan(ships, remainingHp, damageAssignments);
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

  private assignBinnedDamage(shots: Shot[], ships: Ship[]) {
    if (ships.length === 0 || shots.length === 0) return;

    const sortedShips = this.optimallySortShips(ships);
    const sortedShots = this.optimallySortShots(shots);

    // Precompute: can this shot hit that ship?
    const canDamage: number[][] = sortedShots.map((shot) =>
      sortedShips.map((ship) => (ship.shotHits(shot) ? shot.damage : 0))
    );

    const remainingHp = sortedShips.map((ship) => ship.remainingHP());

    const maxScore = this.calculateMaxNpcScore(
      sortedShips,
      sortedShots,
      remainingHp
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
