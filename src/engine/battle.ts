import { DICE_VALUES } from 'src/constants';
import { Fleet } from './fleet';
import { RiftShot, Ship, Shot } from './ship';

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

    if (this.attacker.hasMissiles() || this.defender.hasMissiles()) {
      const missileResult = this.resolveMissilePhase(sortedInitiatives);
      if (missileResult) return missileResult;
    }

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
      const defenderMissiles = this.defender.shootMissilesForInitiative(
        initiative,
        this.attacker.getMinShield()
      );
      this.attacker.assignDamage(defenderMissiles);

      if (!this.attacker.isAlive()) {
        return {
          outcome: BattleOutcome.Defender,
          victors: this.defender.getLivingShips(),
        };
      }

      const attackerMissiles = this.attacker.shootMissilesForInitiative(
        initiative,
        this.defender.getMinShield()
      );
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
    const cannons = firingFleet.shootCannonsForInitiative(
      initiative,
      targetFleet.getMinShield()
    );
    const rifts = firingFleet.shootRiftCannonsForInitiative(initiative);
    const riftTargetShots = this.convertRiftShotsToShots(rifts, 'targetDamage');
    const riftSelfShots = this.convertRiftShotsToShots(rifts, 'selfDamage');
    targetFleet.assignDamage([...cannons, ...riftTargetShots]);
    firingFleet.assignDamage(riftSelfShots, firingFleet.getLivingRiftShips());
    return this.checkBattleOutcome();
  }

  private convertRiftShotsToShots(
    rifts: RiftShot[],
    field: 'targetDamage' | 'selfDamage'
  ): Shot[] {
    return rifts
      .filter((rift) => rift[field] > 0)
      .map((rift) => ({
        damage: rift[field],
        computers: 0,
        roll: DICE_VALUES.HIT,
      }));
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
