import { RiftShot, Ship, ShipType, Shot } from './ship';

const DAMAGE_PRIORTY: Record<ShipType, number> = {
  Dreadnaught: 0,
  Orbital: 1,
  Cruiser: 2,
  Starbase: 3,
  Interceptor: 4,
  GCDS: 5,
  Guardian: 6,
  Ancient: 7,
};

export class Fleet {
  private readonly ships: Ship[];

  constructor(
    public name: string,
    ships: Ship[],
    public antimatterSplitter: boolean = false
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
      ship.shootCannons(this.antimatterSplitter)
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
    return this.getLivingShips().length > 0;
  }

  getLivingShips(): Ship[] {
    return this.ships.filter((ship) => ship.isAlive());
  }

  reset() {
    this.ships.forEach((ship) => ship.resetDamage());
  }

  hasCannons(): boolean {
    return this.getLivingShips().some((ship) => ship.hasCannons());
  }

  private getLivingShipsAtInitiative(initiative: number): Ship[] {
    return this.ships.filter(
      (ship) => ship.isAlive() && ship.initiative === initiative
    );
  }

  heal(): void {
    this.ships.forEach((ship) => ship.applyHealing());
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
