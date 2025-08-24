import { Ship, ShipType, WeaponDamage } from './ship';
import { AbstractDamagePlanner, Plan } from './abstract-damage-planner';
import { TOTAL_RIFT_DIE_DAMAGE } from 'src/constants';
import { Phase } from './battle';

const DAMAGE_PRIORTY: Record<ShipType, number> = {
  Dreadnaught: 0,
  GCDS: 1,
  Cruiser: 2,
  Guardian: 3,
  Starbase: 4,
  Interceptor: 5,
  Orbital: 6,
  Ancient: 7,
};

const KILL_WEIGHT = 10_000;

const MIN_PRIORITY = 0.1;

export class DpsRemovalDamagePlanner extends AbstractDamagePlanner {
  private shipPriority: Partial<
    Record<ShipType, { total: number; cannons: number }>
  > = {};

  private getShipPriority(ship: Ship, upcomingPhases: Phase[]): number {
    let priority = this.shipPriority[ship.type];
    if (!priority) {
      const riftDamage = ship.rift * TOTAL_RIFT_DIE_DAMAGE;
      const compMult = ship.computers + 1;
      const cannonDamage =
        compMult *
        (ship.cannons.antimatter * WeaponDamage.antimatter +
          ship.cannons.soliton * WeaponDamage.soliton +
          ship.cannons.plasma * WeaponDamage.plasma +
          ship.cannons.ion * WeaponDamage.ion);
      const missileDamage =
        compMult *
        (ship.missiles.antimatter * WeaponDamage.antimatter +
          ship.missiles.soliton * WeaponDamage.soliton +
          ship.missiles.plasma * WeaponDamage.plasma +
          ship.missiles.ion * WeaponDamage.ion);
      priority = {
        total: riftDamage + cannonDamage + missileDamage,
        cannons: riftDamage + cannonDamage,
      };
      this.shipPriority[ship.type] = priority;
    }
    for (const phase of upcomingPhases) {
      if (!phase.missilePhase) {
        return priority.cannons;
      }
      if (phase.ships.includes(ship)) {
        return priority.total;
      }
    }
    return priority.cannons;
  }

  evaluate(
    ships: Ship[],
    remainingHp: number[],
    damageAssignments: number[],
    upcomingPhases: Phase[]
  ): Plan {
    let allDestroyed = true;
    let score = 0;
    for (let i = 0; i < ships.length; i++) {
      const ship = ships[i];
      const remainingShipHp = remainingHp[i];
      const priorityWeight = Math.max(
        MIN_PRIORITY,
        this.getShipPriority(ship, upcomingPhases)
      );
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

  optimallySortShips(ships: Ship[], upcomingPhases: Phase[]): Ship[] {
    const sortedArr = ships.slice().sort((a, b) => {
      const priorityDiff =
        this.getShipPriority(b, upcomingPhases) -
        this.getShipPriority(a, upcomingPhases);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      const hpDiff = a.remainingHP() - b.remainingHP();
      if (hpDiff !== 0) {
        return hpDiff;
      }
      const compDiff = b.computers - a.computers;
      if (compDiff !== 0) {
        return compDiff;
      }
      const initDiff = a.initiative - b.initiative;
      if (initDiff !== 0) {
        return initDiff;
      }
      // Reputation
      return DAMAGE_PRIORTY[a.type] - DAMAGE_PRIORTY[b.type];
    });
    return sortedArr;
  }
}
