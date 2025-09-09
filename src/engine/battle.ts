import { DICE_VALUES } from 'src/constants';
import { Fleet } from './fleet';
import { RiftShot, Ship, Shot } from './ship';

const MAX_ROUNDS: number = 100;
export const BattleOutcome = {
  Attacker: 'attacker',
  Defender: 'defender',
  Draw: 'draw',
} as const;

export type Phase = {
  ships: Ship[];
  initiative: number;
  shootingFleet: Fleet;
  targetFleet: Fleet;
  missilePhase?: boolean;
};

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
    const phases = this.getAllPhases();

    while (phases[0]?.missilePhase) {
      this.resolveMissilePhase(phases.shift()!, phases);
    }

    let rounds = 0;
    while (rounds < MAX_ROUNDS) {
      rounds++;

      for (let i = 0; i < phases.length; i++) {
        const phase = phases.shift()!;
        if (phase.ships.filter((ship) => ship.isAlive()).length > 0) {
          phases.push(phase);
        }
        const cannonResult = this.resolveCannonPhase(phase, phases);
        if (cannonResult) return cannonResult;
      }

      this.attacker.heal();
      this.defender.heal();

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

  private getPhasesForFleet({
    shootingFleet,
    targetFleet,
  }: {
    shootingFleet: Fleet;
    targetFleet: Fleet;
  }): Phase[] {
    const initiatives = [...shootingFleet.getInitiatives()];
    const cannonInitiatives = initiatives.map((initiative) => {
      return {
        ships: shootingFleet.getLivingShipsAtInitiative(initiative),
        initiative,
        shootingFleet,
        targetFleet,
        missilePhase: false,
      };
    });
    if (!shootingFleet.hasMissiles()) {
      return cannonInitiatives;
    }
    const missileInitiatives = initiatives
      .map((initiative) => {
        const missileShips = shootingFleet
          .getLivingShipsAtInitiative(initiative)
          .filter((ship) => ship.hasMissiles());
        if (missileShips.length === 0) return null;
        return {
          ships: missileShips,
          initiative,
          shootingFleet,
          targetFleet,
          missilePhase: true,
        };
      })
      .filter((phase) => phase !== null);
    return [...missileInitiatives, ...cannonInitiatives];
  }

  private getAllPhases(): Phase[] {
    const attackerPhases = this.getPhasesForFleet({
      shootingFleet: this.attacker,
      targetFleet: this.defender,
    });
    const defenderPhases = this.getPhasesForFleet({
      shootingFleet: this.defender,
      targetFleet: this.attacker,
    });
    // If attacker and defender have the same initiative, defender phases should come first
    return [...defenderPhases, ...attackerPhases].sort((a, b) => {
      if (a.missilePhase !== b.missilePhase) {
        return a.missilePhase ? -1 : 1; // Missile phase come first
      }
      return b.initiative - a.initiative;
    });
  }

  private resolveMissilePhase(
    { shootingFleet, initiative, targetFleet }: Phase,
    upcomingPhases: Phase[]
  ): BattleResult | null {
    const shooterMissiles = shootingFleet.shootMissilesForInitiative(
      initiative,
      targetFleet.getMinShield()
    );
    shootingFleet.assignDamage(
      shooterMissiles,
      targetFleet.getLivingShips(),
      upcomingPhases
    );
    if (!targetFleet.isAlive()) {
      return {
        outcome:
          shootingFleet === this.attacker
            ? BattleOutcome.Attacker
            : BattleOutcome.Defender,
        victors: shootingFleet.getLivingShips(),
      };
    }

    return null;
  }

  private resolveCannonPhase(
    { shootingFleet, targetFleet, initiative }: Phase,
    upcomingPhases: Phase[]
  ): BattleResult | null {
    const battleResult = this.resolveFleetCannonFire(
      shootingFleet,
      targetFleet,
      initiative,
      upcomingPhases
    );
    if (battleResult) return battleResult;
    return null;
  }

  private resolveFleetCannonFire(
    firingFleet: Fleet,
    targetFleet: Fleet,
    initiative: number,
    upcomingPhases: Phase[]
  ): BattleResult | null {
    const cannons = firingFleet.shootCannonsForInitiative(
      initiative,
      targetFleet.getMinShield()
    );
    const rifts = firingFleet.shootRiftCannonsForInitiative(initiative);
    const riftTargetShots = this.convertRiftShotsToShots(rifts, 'targetDamage');
    const riftSelfShots = this.convertRiftShotsToShots(rifts, 'selfDamage');
    // Assigning self damage to the firing fleet's rift ships in case it shifts the damage assignment logic
    firingFleet.assignRiftSelfDamage(riftSelfShots);
    firingFleet.assignDamage(
      [...cannons, ...riftTargetShots],
      targetFleet.getLivingShips(),
      upcomingPhases
    );
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
