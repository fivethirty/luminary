import { DICE_VALUES } from 'src/constants';
import { Ship, Shot } from './ship';

export type Plan = {
  score: number;
  allDestroyed: boolean;
  damageAssignments: number[];
};

export abstract class AbstractDamagePlanner {
  abstract evaluate(
    ships: Ship[],
    remainingHp: number[],
    damageAssignments: number[],
    hasMissiles: boolean
  ): Plan;

  abstract optimallySortShips(ships: Ship[], hasMissiles: boolean): Ship[];

  optimallySortShots(shots: Shot[]): Shot[] {
    const sortedArr = shots.slice().sort((a, b) => {
      if (a.roll === DICE_VALUES.HIT) {
        if (b.roll === DICE_VALUES.HIT) {
          return b.damage - a.damage;
        }
        return 1; // HITs should come last
      }
      if (b.roll === DICE_VALUES.HIT) {
        return -1; // HITs should come last
      }
      if (a.roll + a.computers !== b.roll + b.computers) {
        return a.roll + a.computers - b.roll - b.computers; // Sort by rolls ascending
      }
      return b.damage - a.damage; // If rolls are equal, sort by damage descending
    });
    return sortedArr;
  }

  calculateMaxScore(
    sortedShips: Ship[],
    shots: Shot[],
    remainingHp: number[],
    hasMissiles: boolean
  ): number {
    let maxDamage = shots.reduce((sum, shot) => sum + shot.damage, 0);
    const minDamageAmt = Math.min(...shots.map((shot) => shot.damage));
    const damageAssignments = Array(sortedShips.length).fill(0);
    let shipsLeft = false;
    for (let i = 0; i < sortedShips.length; i++) {
      const hp = remainingHp[i];
      if (maxDamage >= hp) {
        const damage = Math.min(maxDamage, hp);
        damageAssignments[i] = damage;
        const overkill = Math.max(0, minDamageAmt - hp);
        maxDamage -= damage + overkill;
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
    return this.evaluate(
      sortedShips,
      remainingHp,
      damageAssignments,
      hasMissiles
    ).score;
  }
}
