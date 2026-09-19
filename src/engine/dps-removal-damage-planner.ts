import { Ship, ShipType, WeaponDamage } from './ship';
import { AbstractDamagePlanner, Plan } from './abstract-damage-planner';
import {
  DICE_VALUES,
  HIT_AFTER_MODIFIERS,
  TOTAL_RIFT_DIE_DAMAGE,
} from 'src/constants';
import { Phase } from './battle';

const DAMAGE_PRIORTY: Record<ShipType, number> = {
  Dreadnought: 0,
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
    Record<string, { total: number; cannons: number }>
  > = {};

  private getShipPriority(
    ship: Ship,
    upcomingPhases: Phase[],
    targetShield?: number
  ): number {
    const priorityKey = `${ship.configKey()}|shield:${targetShield ?? 'raw'}`;
    let priority = this.shipPriority[priorityKey];
    if (!priority) {
      const riftDamage = ship.rift * TOTAL_RIFT_DIE_DAMAGE;
      const hitChance =
        targetShield === undefined
          ? 1
          : this.getHitChance(ship.computers, targetShield);
      const cannonDamage =
        hitChance *
        (ship.cannons.antimatter * WeaponDamage.antimatter +
          ship.cannons.soliton * WeaponDamage.soliton +
          ship.cannons.plasma * WeaponDamage.plasma +
          ship.cannons.ion * WeaponDamage.ion);
      const missileDamage =
        hitChance *
        (ship.missiles.antimatter * WeaponDamage.antimatter +
          ship.missiles.soliton * WeaponDamage.soliton +
          ship.missiles.plasma * WeaponDamage.plasma +
          ship.missiles.ion * WeaponDamage.ion);
      priority = {
        total: riftDamage + cannonDamage + missileDamage,
        cannons: riftDamage + cannonDamage,
      };
      this.shipPriority[priorityKey] = priority;
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

  private getHitChance(computers: number, targetShield: number): number {
    let hits = 0;
    for (let roll = DICE_VALUES.MISS; roll <= DICE_VALUES.NUM_SIDES; roll++) {
      if (
        roll === DICE_VALUES.HIT ||
        roll + computers - targetShield >= HIT_AFTER_MODIFIERS
      ) {
        hits++;
      }
    }
    return hits / DICE_VALUES.NUM_SIDES;
  }

  evaluate(
    ships: Ship[],
    remainingHp: number[],
    damageAssignments: number[],
    upcomingPhases: Phase[],
    targetShield?: number
  ): Plan {
    let allDestroyed = true;
    let score = 0;
    for (let i = 0; i < ships.length; i++) {
      const ship = ships[i];
      const remainingShipHp = remainingHp[i];
      const priorityWeight = Math.max(
        MIN_PRIORITY,
        this.getShipPriority(ship, upcomingPhases, targetShield)
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
        const overkill = damage - remainingShipHp;
        score += priorityWeight * KILL_WEIGHT - overkill;
      }
    }
    return { score, allDestroyed, damageAssignments };
  }

  optimallySortShips(
    ships: Ship[],
    upcomingPhases: Phase[],
    targetShield?: number
  ): Ship[] {
    const sortedArr = ships.slice().sort((a, b) => {
      const priorityDiff =
        this.getShipPriority(b, upcomingPhases, targetShield) -
        this.getShipPriority(a, upcomingPhases, targetShield);
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
