import { RiftShot, Ship, Shot } from './ship';
import { BinnedDamageAssignmentHelper } from './binned-damage-assignment-helper';
import { DamageType } from 'src/constants';
import { Phase } from './battle';
import { BattleContext, OptimalDamagePlanner } from './optimal-damage-planner';

export class Fleet {
  private readonly ships: Ship[];
  private readonly startsWithMissiles: boolean;
  private readonly startsWithMixedShields: boolean;
  private readonly minShields: number;
  private readonly initiatives: Set<number>;
  private readonly binnedDamageAssignment = new BinnedDamageAssignmentHelper();
  // Built lazily the first time this fleet fights and reused across battles, so
  // its solved value tables survive the many iterations of a CombatSimulator run.
  private optimalPlanner: OptimalDamagePlanner | null = null;

  constructor(
    public name: string,
    ships: Ship[],
    public antimatterSplitter: boolean = false,
    private readonly playerPlanner: DamageType = DamageType.DPS
  ) {
    this.ships = Array.from(ships);
    this.startsWithMissiles = this.ships.some((ship) => ship.hasMissiles());
    const shields = new Set(this.ships.map((ship) => ship.shields));
    this.startsWithMixedShields = shields.size > 1;
    this.minShields = Math.min(...this.ships.map((ship) => ship.shields));
    this.initiatives = new Set(this.ships.flatMap((ship) => ship.initiative));
  }

  // Called by Battle at the start of every fight. When this fleet plans
  // optimally, wire up its (persistent) planner with the current opponents and
  // its role in the fight. No-op for every other planner type.
  prepareForBattle(ctx: BattleContext): void {
    if (this.getDamageType() !== DamageType.OPTIMAL) {
      return;
    }
    if (!this.optimalPlanner) {
      this.optimalPlanner = new OptimalDamagePlanner((shots, ships, phases) =>
        this.binnedDamageAssignment.assignDamage(
          shots,
          ships,
          DamageType.DPS,
          phases
        )
      );
      this.binnedDamageAssignment.setOptimalPlanner(this.optimalPlanner);
    }
    this.optimalPlanner.setBattleContext(ctx, this);
  }

  getInitiatives(): Set<number> {
    return this.initiatives;
  }

  shootMissilesForInitiative(initiative: number, minShields: number): Shot[] {
    return this.getLivingShipsAtInitiative(initiative).flatMap((ship) =>
      ship.shootMissles(minShields)
    );
  }
  shootCannonsForInitiative(initiative: number, minShields: number): Shot[] {
    return this.getLivingShipsAtInitiative(initiative).flatMap((ship) =>
      ship.shootCannons(minShields, this.antimatterSplitter)
    );
  }
  shootRiftCannonsForInitiative(initiative: number): RiftShot[] {
    return this.getLivingShipsAtInitiative(initiative).flatMap((ship) =>
      ship.shootRiftCannon()
    );
  }

  assignDamage(shots: Shot[], targetShips: Ship[], upcomingPhases: Phase[]) {
    return this.binnedDamageAssignment.assignDamage(
      shots,
      targetShips,
      this.getDamageType(),
      upcomingPhases
    );
  }

  assignRiftSelfDamage(shots: Shot[]) {
    return this.binnedDamageAssignment.assignDamage(
      shots,
      this.getLivingRiftShips(),
      DamageType.NPC
    );
  }

  isAlive(): boolean {
    return this.getLivingShips().length > 0;
  }

  getLivingShips(): Ship[] {
    return this.ships.filter((ship) => ship.isAlive());
  }

  // Full roster in construction order (living and dead), used by planners that
  // need a stable per-ship index across the battle.
  getRoster(): Ship[] {
    return [...this.ships];
  }

  getLivingRiftShips(): Ship[] {
    return this.ships.filter((ship) => ship.isAlive() && ship.hasRiftCannons());
  }

  isPlayerFleet(): boolean {
    return this.ships.some((ship) => ship.isPlayerShip());
  }

  getDamageType(): DamageType {
    if (this.isPlayerFleet()) {
      return this.playerPlanner;
    }
    return DamageType.NPC;
  }

  reset() {
    this.ships.forEach((ship) => ship.resetDamage());
  }

  hasCannons(): boolean {
    return this.getLivingShips().some((ship) => ship.hasCannons());
  }

  hasMissiles(): boolean {
    if (!this.startsWithMissiles) {
      return false;
    }
    return this.getLivingShips().some((ship) => ship.hasMissiles());
  }

  getMinShield(): number {
    if (!this.startsWithMixedShields) {
      return this.minShields;
    }
    return Math.min(...this.getLivingShips().map((ship) => ship.shields));
  }

  getLivingShipsAtInitiative(initiative: number): Ship[] {
    return this.ships.filter(
      (ship) => ship.isAlive() && ship.initiative === initiative
    );
  }

  heal(): void {
    this.ships.forEach((ship) => ship.applyHealing());
  }
}
