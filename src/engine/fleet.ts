import { Ship } from './ship';

export class Fleet {
  constructor(
    public name: string,
    private readonly ships: Ship[]
  ) {}

  getInitiatives(): Set<number> {
    return new Set(this.ships.map((ship) => ship.initiative));
  }

  /*shootMissilesForInitiative(initiative: number) {}
  shootCannonsForInitiative(initiative: number) {}
  shootRiftCannonsForInitiative(initiative: number) {}
	assignDamage(shots[], riftShots[]) {}
	assignSelfDamage(riftShots[]) {}*/
  isAlive(): boolean {
    return this.ships.every((ship) => ship.isAlive());
  }
  reset() {
    this.ships.forEach((ship) => ship.resetDamage());
  }
}
