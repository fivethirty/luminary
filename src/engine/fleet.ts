import { RiftShot, Ship, ShipType, Shot } from './ship';

const DAMAGE_PRIORTY: Record<ShipType, number> = {
  dreadnaught: 0,
  orbital: 1,
  carrier: 2,
  starbase: 3,
  interceptor: 4,
  gcds: 5,
  guardian: 6,
  ancient: 7,
};

export class Fleet {
  private readonly ships: Ship[];

  constructor(
    public name: string,
    ships: Ship[]
  ) {
    this.ships = Array.from(ships);
  }

  getInitiatives(): Set<number> {
    return new Set(this.ships.map((ship) => ship.initiative));
  }

  shootMissilesForInitiative(initiative: number): Shot[] {
    return this.getLivingShipsAtInitiative(initiative).flatMap((ship) =>
      ship.shootMissles()
    );
  }
  shootCannonsForInitiative(initiative: number): Shot[] {
    return this.getLivingShipsAtInitiative(initiative).flatMap((ship) =>
      ship.shootCannons()
    );
  }
  shootRiftCannonsForInitiative(initiative: number): RiftShot[] {
    return this.getLivingShipsAtInitiative(initiative).flatMap((ship) =>
      ship.shootRiftCannon()
    );
  }

  assignDamage(shots: Shot[]) {
    for (const shot of shots) {
      let destoyedShip: boolean = false;
      for (const ship of this.ships) {
        this.sortShips();
        if (
          ship.isAlive() &&
          ship.shotHits(shot) &&
          ship.remainingHP() <= shot.damage
        ) {
          destoyedShip = true;
          ship.takeDamage(shot.damage);
          break;
        }
      }
      if (destoyedShip) {
        continue;
      }
      for (const ship of this.ships) {
        this.sortShips();
        if (ship.isAlive() && ship.shotHits(shot)) {
          ship.takeDamage(shot.damage);
          break;
        }
      }
    }
  }

  isAlive(): boolean {
    return this.ships.some((ship) => ship.isAlive());
  }
  reset() {
    this.ships.forEach((ship) => ship.resetDamage());
  }

  private getLivingShipsAtInitiative(initiative: number): Ship[] {
    return this.ships.filter(
      (ship) => ship.isAlive() && ship.initiative === initiative
    );
  }

  private sortShips() {
    this.ships.sort((a, b) => {
      const priorityDiff = DAMAGE_PRIORTY[a.type] - DAMAGE_PRIORTY[b.type];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return a.remainingHP() - b.remainingHP();
    });
  }
}
