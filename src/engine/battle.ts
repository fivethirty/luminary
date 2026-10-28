import { DICE_VALUES } from 'src/constants';
import { Fleet } from './fleet';
import { RiftShot, Ship, ShipType, Shot } from './ship';
import { terminalFromSurvival } from './battle-rules';

const MAX_ROUNDS: number = 100;
export const BattleOutcome = {
  Attacker: 'attacker',
  Defender: 'defender',
  Draw: 'draw',
} as const;

export type Phase = {
  ships: Ship[];
  initiative: number;
  // The ship type activating in this phase. Battles build one phase per
  // (initiative, ship type); undefined (planner probes) means every type.
  shipType?: ShipType;
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
    const ctx = { attacker: this.attacker, defender: this.defender };
    this.attacker.prepareForBattle(ctx);
    this.defender.prepareForBattle(ctx);
    return this.resumeFight(this.getAllPhases());
  }

  // Runs a battle forward from an arbitrary point in its phase queue. `fight`
  // starts from a freshly built queue. Because missile phases live only in the
  // queue (a ship never records that it has fired), resuming from a queue that
  // omits the already-fired missile phases is what prevents missiles firing
  // twice.
  resumeFight(phases: Phase[]): BattleResult {
    const ctx = { attacker: this.attacker, defender: this.defender };
    this.attacker.prepareForBattle(ctx);
    this.defender.prepareForBattle(ctx);

    while (phases[0]?.missilePhase) {
      const result = this.resolveMissilePhase(phases.shift()!, phases);
      if (result) return result;
    }

    let rounds = 0;
    while (rounds < MAX_ROUNDS) {
      rounds++;

      // An Engagement Round activates every queued phase once before the
      // end-of-round heal and stalemate check, so iterate over the queue
      // length at the start of the round: a phase dropped mid-round (its ship
      // type destroyed) must not push the last phases into the next round.
      const phaseCount = phases.length;
      for (let i = 0; i < phaseCount; i++) {
        const phase = phases.shift()!;
        if (phase.ships.filter((ship) => ship.isAlive()).length > 0) {
          phases.push(phase);
        }
        const cannonResult = this.resolveCannonPhase(phase, phases);
        if (cannonResult) {
          this.attacker.heal();
          this.defender.heal();
          return cannonResult;
        }
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

  // One phase per (initiative, ship type), so tied ship types of one fleet
  // roll and assign their dice on separate activations (see shipActivations
  // for the order of tied types).
  private getPhasesForFleet({
    shootingFleet,
    targetFleet,
  }: {
    shootingFleet: Fleet;
    targetFleet: Fleet;
  }): Phase[] {
    const activations = shootingFleet.getActivations();
    const cannonPhases: Phase[] = activations.map(
      ({ initiative, shipType }) => ({
        ships: shootingFleet.getLivingShipsAtInitiative(initiative, shipType),
        initiative,
        shipType,
        shootingFleet,
        targetFleet,
        missilePhase: false,
      })
    );
    if (!shootingFleet.hasMissiles()) {
      return cannonPhases;
    }
    const missilePhases: Phase[] = [];
    for (const { initiative, shipType } of activations) {
      const missileShips = shootingFleet
        .getLivingShipsAtInitiative(initiative, shipType)
        .filter((ship) => ship.hasMissiles());
      if (missileShips.length === 0) continue;
      missilePhases.push({
        ships: missileShips,
        initiative,
        shipType,
        shootingFleet,
        targetFleet,
        missilePhase: true,
      });
    }
    return [...missilePhases, ...cannonPhases];
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
    // If attacker and defender have the same initiative, defender phases should
    // come first; the stable sort also keeps each fleet's tied types in
    // activation order.
    return [...defenderPhases, ...attackerPhases].sort((a, b) => {
      if (a.missilePhase !== b.missilePhase) {
        return a.missilePhase ? -1 : 1; // Missile phase come first
      }
      return b.initiative - a.initiative;
    });
  }

  private resolveMissilePhase(
    { shootingFleet, initiative, shipType, targetFleet }: Phase,
    upcomingPhases: Phase[]
  ): BattleResult | null {
    const shooterMissiles = shootingFleet.shootMissilesForInitiative(
      initiative,
      targetFleet.getMinShield(),
      shipType
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
    { shootingFleet, targetFleet, initiative, shipType }: Phase,
    upcomingPhases: Phase[]
  ): BattleResult | null {
    const battleResult = this.resolveFleetCannonFire(
      shootingFleet,
      targetFleet,
      initiative,
      shipType,
      upcomingPhases
    );
    if (battleResult) return battleResult;
    return null;
  }

  private resolveFleetCannonFire(
    firingFleet: Fleet,
    targetFleet: Fleet,
    initiative: number,
    shipType: ShipType | undefined,
    upcomingPhases: Phase[]
  ): BattleResult | null {
    const cannons = firingFleet.shootCannonsForInitiative(
      initiative,
      targetFleet.getMinShield(),
      shipType
    );
    const rifts = firingFleet.shootRiftCannonsForInitiative(
      initiative,
      shipType
    );
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
    const terminal = terminalFromSurvival(
      this.attacker.isAlive(),
      this.defender.isAlive()
    );
    if (terminal === 'Draw')
      return { outcome: BattleOutcome.Draw, victors: [] };
    if (terminal === 'DefenderWins') {
      return {
        outcome: BattleOutcome.Defender,
        victors: this.defender.getLivingShips(),
      };
    }
    if (terminal === 'AttackerWins') {
      return {
        outcome: BattleOutcome.Attacker,
        victors: this.attacker.getLivingShips(),
      };
    }
    return null;
  }
}
