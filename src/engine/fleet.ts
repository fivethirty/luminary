import { RiftShot, Ship, Shot } from './ship';
import { BinnedDamageAssignmentHelper } from './binnedDamageAssignmentHelper';
import { ShotByShotDamageAssignmentHelper } from './shotByShotDamageAssignment';

export class Fleet {
  private readonly ships: Ship[];
  private readonly startsWithMissiles: boolean;
  private readonly startsWithMixedTypes: boolean;
  private readonly startsWithMixedShields: boolean;
  private readonly minShields: number;
  private readonly initiatives: Set<number>;
  private readonly binnedDamageAssignment = new BinnedDamageAssignmentHelper();
  private readonly shotByShotDamageAssignment =
    new ShotByShotDamageAssignmentHelper();

  constructor(
    public name: string,
    ships: Ship[],
    public antimatterSplitter: boolean = false
  ) {
    this.ships = Array.from(ships);
    this.startsWithMissiles = this.ships.some((ship) => ship.hasMissiles());
    const types = new Set(this.ships.map((ship) => ship.type));
    this.startsWithMixedTypes = types.size > 1;
    const shields = new Set(this.ships.map((ship) => ship.shields));
    this.startsWithMixedShields = shields.size > 1;
    this.minShields = Math.min(...this.ships.map((ship) => ship.shields));
    this.initiatives = new Set(this.ships.flatMap((ship) => ship.initiative));
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

  assignDamage(shots: Shot[], ships?: Ship[]) {
    const livingShips = ships || this.getLivingShips();
    return this.binnedDamageAssignment.assignDamage(shots, livingShips);
  }

  isAlive(): boolean {
    return this.getLivingShips().length > 0;
  }

  getLivingShips(): Ship[] {
    return this.ships.filter((ship) => ship.isAlive());
  }

  getLivingRiftShips(): Ship[] {
    return this.ships.filter((ship) => ship.isAlive() && ship.hasRiftCannons());
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

  hasMixedShipTypes(): boolean {
    if (!this.startsWithMixedTypes) {
      return false;
    }
    const types = new Set(this.getLivingShips().map((ship) => ship.type));
    return types.size > 1;
  }

  hasMixedShields(): boolean {
    if (!this.startsWithMixedShields) {
      return false;
    }
    const shields = new Set(this.getLivingShips().map((ship) => ship.shields));
    return shields.size > 1;
  }

  getMinShield(): number {
    if (!this.startsWithMixedShields) {
      return this.minShields;
    }
    return Math.min(...this.getLivingShips().map((ship) => ship.shields));
  }

  private getLivingShipsAtInitiative(initiative: number): Ship[] {
    return this.ships.filter(
      (ship) => ship.isAlive() && ship.initiative === initiative
    );
  }

  heal(): void {
    this.ships.forEach((ship) => ship.applyHealing());
  }
}
