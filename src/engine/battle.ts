import { DICE_VALUES } from 'src/constants';
import { Fleet } from './fleet';
import { RiftShot, Ship } from './ship';

const MAX_ROUNDS: number = 100;
export const BattleOutcome = {
  Attacker: 'attacker',
  Defender: 'defender',
  Draw: 'draw',
} as const;

export type BattleOutcome = (typeof BattleOutcome)[keyof typeof BattleOutcome];

export interface BattleResult {
  outcome: BattleOutcome;
  victors: Ship[];
}

export class Battle {
  constructor(
    private attacker: Fleet,
    private defender: Fleet
  ) {}

  fight(): BattleResult {
    const sortedInitiatives = this.getAllInitiativesSorted();

    const missileResult = this.resolveMissilePhase(sortedInitiatives);
    if (missileResult) return missileResult;

    let rounds = 0;
    while (rounds < MAX_ROUNDS) {
      rounds++;

      const cannonResult = this.resolveCannonPhase(sortedInitiatives);
      if (cannonResult) return cannonResult;

      if (!this.attacker.hasCannons() && !this.defender.hasCannons()) {
        return {
          outcome: BattleOutcome.Defender,
          victors: this.defender.getLivingShips(),
        };
      }
    }

    return {
      outcome: BattleOutcome.Defender,
      victors: this.defender.getLivingShips(),
    };
  }

  private getAllInitiativesSorted(): number[] {
    const attackerInitiatives = this.attacker.getInitiatives();
    const defenderInitiatives = this.defender.getInitiatives();
    const allInitiatives = new Set([
      ...attackerInitiatives,
      ...defenderInitiatives,
    ]);
    return Array.from(allInitiatives).sort((a, b) => b - a);
  }

  private resolveMissilePhase(initiatives: number[]): BattleResult | null {
    for (const initiative of initiatives) {
      const defenderMissiles =
        this.defender.shootMissilesForInitiative(initiative);
      this.attacker.assignDamage(defenderMissiles);

      if (!this.attacker.isAlive()) {
        return {
          outcome: BattleOutcome.Defender,
          victors: this.defender.getLivingShips(),
        };
      }

      const attackerMissiles =
        this.attacker.shootMissilesForInitiative(initiative);
      this.defender.assignDamage(attackerMissiles);

      if (!this.defender.isAlive()) {
        return {
          outcome: BattleOutcome.Attacker,
          victors: this.attacker.getLivingShips(),
        };
      }
    }
    return null;
  }

  private resolveCannonPhase(initiatives: number[]): BattleResult | null {
    for (const initiative of initiatives) {
      const defenderResult = this.resolveFleetCannonFire(
        this.defender,
        this.attacker,
        initiative
      );
      if (defenderResult) return defenderResult;

      const attackerResult = this.resolveFleetCannonFire(
        this.attacker,
        this.defender,
        initiative
      );
      if (attackerResult) return attackerResult;
    }
    return null;
  }

  private resolveFleetCannonFire(
    firingFleet: Fleet,
    targetFleet: Fleet,
    initiative: number
  ): BattleResult | null {
    const cannons = firingFleet.shootCannonsForInitiative(initiative);
    const rifts = firingFleet.shootRiftCannonsForInitiative(initiative);
    targetFleet.assignDamage(cannons);
    this.applyRiftDamage(rifts, firingFleet, targetFleet);
    return this.checkBattleOutcome();
  }

  private applyRiftDamage(
    rifts: RiftShot[],
    firingFleet: Fleet,
    targetFleet: Fleet
  ): void {
    for (const rift of rifts) {
      if (rift.selfDamage > 0) {
        firingFleet.assignDamage([
          {
            roll: DICE_VALUES.HIT,
            computers: 0,
            damage: rift.selfDamage,
          },
        ]);
      }
      if (rift.targetDamage > 0) {
        targetFleet.assignDamage([
          {
            roll: DICE_VALUES.HIT,
            computers: 0,
            damage: rift.targetDamage,
          },
        ]);
      }
    }
  }

  private checkBattleOutcome(): BattleResult | null {
    const attackerAlive = this.attacker.isAlive();
    const defenderAlive = this.defender.isAlive();

    if (!attackerAlive && !defenderAlive) {
      return { outcome: BattleOutcome.Draw, victors: [] };
    }
    if (!attackerAlive) {
      return {
        outcome: BattleOutcome.Defender,
        victors: this.defender.getLivingShips(),
      };
    }
    if (!defenderAlive) {
      return {
        outcome: BattleOutcome.Attacker,
        victors: this.attacker.getLivingShips(),
      };
    }

    return null;
  }
}
