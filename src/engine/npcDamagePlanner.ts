import { Ship, ShipType } from './ship';
import { AbstractDamagePlanner, Plan } from './abstractDamagePlanner';

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

export class NpcDamagePlanner extends AbstractDamagePlanner {
  evaluate(
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

  optimallySortShips(ships: Ship[]): Ship[] {
    const sortedArr = ships.slice().sort((a, b) => {
      const priorityDiff = DAMAGE_PRIORTY[a.type] - DAMAGE_PRIORTY[b.type];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return a.remainingHP() - b.remainingHP();
    });
    return sortedArr;
  }
}
