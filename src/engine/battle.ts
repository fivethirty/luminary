import { Fleet } from './fleet';
import { RiftShot, Ship } from './ship';

const MAX_ROUNDS: number = 100;
export type BattleOutcome = 'attacker' | 'defender' | 'draw' | 'stalemate';

export interface BattleResult {
  outcome: BattleOutcome;
  victors: Ship[]; // Empty for draw/stalemate
}

export class Battle {
  constructor(
    private attacker: Fleet,
    private defender: Fleet
  ) { }

  fight(): BattleResult {
    let rounds = 0;

    while (rounds < MAX_ROUNDS) {
      rounds++;

      const sortedInitiatives = this.getAllInitiativesSorted();

      // Missile phase
      const missileResult = this.resolveMissilePhase(sortedInitiatives);
      if (missileResult) return missileResult;

      // Cannon and rift phase
      const cannonResult = this.resolveCannonPhase(sortedInitiatives);
      if (cannonResult) return cannonResult;
    }

    // If we've reached max rounds, it's a stalemate
    return { outcome: 'stalemate', victors: [] };
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
      // Defender fires missiles first
      const defenderMissiles =
        this.defender.shootMissilesForInitiative(initiative);
      this.attacker.assignDamage(defenderMissiles);

      if (!this.attacker.isAlive()) {
        return { outcome: 'defender', victors: this.defender.getLivingShips() };
      }

      // Attacker fires missiles
      const attackerMissiles =
        this.attacker.shootMissilesForInitiative(initiative);
      this.defender.assignDamage(attackerMissiles);

      if (!this.defender.isAlive()) {
        return { outcome: 'attacker', victors: this.attacker.getLivingShips() };
      }
    }
    return null;
  }

  private resolveCannonPhase(initiatives: number[]): BattleResult | null {
    for (const initiative of initiatives) {
      // Defender fires cannons and rift cannons
      const defenderResult = this.resolveFleetCannonFire(
        this.defender,
        this.attacker,
        initiative
      );
      if (defenderResult) return defenderResult;

      // Attacker fires cannons and rift cannons
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

    // Apply cannon damage to target
    targetFleet.assignDamage(cannons);

    // Apply rift damage
    this.applyRiftDamage(rifts, firingFleet, targetFleet);

    // Check battle outcome
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
            roll: 6, // Always hits self
            computers: 0,
            damage: rift.selfDamage,
          },
        ]);
      }
      if (rift.targetDamage > 0) {
        targetFleet.assignDamage([
          {
            roll: 6, // Rift always hits if it does damage
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
      return { outcome: 'draw', victors: [] };
    }
    if (!attackerAlive) {
      return { outcome: 'defender', victors: this.defender.getLivingShips() };
    }
    if (!defenderAlive) {
      return { outcome: 'attacker', victors: this.attacker.getLivingShips() };
    }

    return null;
  }
}
