type ValueOf<T> = T[keyof T];

export const ShipType = {
  Interceptor: 'interceptor',
  Carrier: 'carrier',
  Dreadnaught: 'dreadnaught',
  Starbase: 'starbase',
  Orbital: 'orbital',
  Ancient: 'ancient',
  Guardian: 'guardian',
  GCDS: 'gcds',
} as const;

export type ShipType = ValueOf<typeof ShipType>;

export const WeaponType = {
  Ion: 'ion',
  Plasma: 'plasma',
  Soliton: 'soliton',
  Antimatter: 'antimatter',
} as const;

export type WeaponType = ValueOf<typeof WeaponType>;

const npcTypes: ShipType[] = [
  ShipType.Ancient,
  ShipType.Guardian,
  ShipType.GCDS,
];

export const WeaponDamage: Record<WeaponType, number> = {
  ion: 1,
  plasma: 2,
  soliton: 3,
  antimatter: 4,
};

export interface Shot {
  roll: number;
  computers: number;
  damage: number;
}

export interface RiftShot {
  selfDamage: number;
  targetDamage: number;
}

export interface ShipConfig {
  hull?: number;
  computers?: number;
  shields?: number;
  initiative?: number;
  cannons?: Partial<Record<WeaponType, number>>;
  missiles?: Partial<Record<WeaponType, number>>;
  rift?: number;
}

function rollRandomD6() {
  return Math.floor(Math.random() * 6) + 1;
}

export class Ship {
  // Public instance properties
  type: ShipType;
  hull: number = 0;
  computers: number = 0;
  shields: number = 0;
  initiative: number = 0;
  missiles: Record<WeaponType, number> = {
    ion: 0,
    plasma: 0,
    soliton: 0,
    antimatter: 0,
  };
  cannons: Record<WeaponType, number> = {
    ion: 0,
    plasma: 0,
    soliton: 0,
    antimatter: 0,
  };
  rift: number = 0;

  // Private instance properties
  private damage = 0;
  private rollD6: () => number;

  constructor(
    type: ShipType,
    config: ShipConfig = {},
    rollD6: () => number = rollRandomD6
  ) {
    this.type = type;
    this.rollD6 = rollD6;

    switch (type) {
      case 'ancient':
        this.hull = 1;
        this.computers = 1;
        this.cannons.ion = 2;
        this.initiative = 2;
        break;
      case 'guardian':
        this.hull = 2;
        this.computers = 2;
        this.cannons.ion = 3;
        this.initiative = 3;
        break;
      case 'gcds':
        this.hull = 7;
        this.computers = 2;
        this.cannons.ion = 4;
        this.initiative = 0;
        break;
    }

    const { cannons, missiles, ...topLevel } = config;
    Object.assign(this, topLevel);
    if (cannons) {
      this.cannons = { ...this.cannons, ...cannons };
    }
    if (missiles) {
      this.missiles = { ...this.missiles, ...missiles };
    }
  }

  isPlayerShip(): boolean {
    return !npcTypes.includes(this.type);
  }

  shootMissles(): Shot[] {
    return this.rollWeapons(this.missiles);
  }

  shootCannons(): Shot[] {
    return this.rollWeapons(this.cannons);
  }

  private rollWeapons(weapons: Record<WeaponType, number>): Shot[] {
    return Object.entries(weapons).flatMap(([weaponType, count]) => {
      const shots: Shot[] = [];
      for (let i = 0; i < count; i++) {
        const roll = this.rollD6();
        shots.push({
          roll: roll,
          computers: this.computers,
          damage: WeaponDamage[weaponType as WeaponType],
        });
      }
      return shots;
    });
  }

  shootRiftCannon(): RiftShot[] {
    const shots: RiftShot[] = [];

    for (let i = 0; i < this.rift; i++) {
      const roll = this.rollD6();
      let selfDamage = 0;
      let targetDamage = 0;
      switch (roll) {
        case 3:
          targetDamage = 1;
          break;
        case 4:
          targetDamage = 2;
          break;
        case 5:
          selfDamage = 1;
          break;
        case 6:
          selfDamage = 1;
          targetDamage = 3;
          break;
      }
      shots.push({ selfDamage, targetDamage });
    }
    return shots;
  }

  shotHits(shot: Shot): boolean {
    if (shot.roll === 1) {
      return false;
    }
    if (shot.roll === 6) {
      return true;
    }
    return shot.roll + shot.computers - this.shields >= 6;
  }

  shotKills(shot: Shot): boolean {
    return this.shotHits(shot) && shot.damage >= this.remainingHP();
  }

  takeDamage(amount: number) {
    this.damage += amount;
  }

  remainingHP(): number {
    return Math.max(0, this.hull + 1 - this.damage);
  }

  isAlive(): boolean {
    return this.remainingHP() > 0;
  }

  resetDamage(): void {
    this.damage = 0;
  }
}
