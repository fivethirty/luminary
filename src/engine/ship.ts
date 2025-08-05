type ValueOf<T> = T[keyof T];

export const ShipType = {
  Interceptor: 'Interceptor',
  Cruiser: 'Cruiser',
  Dreadnaught: 'Dreadnaught',
  Starbase: 'Starbase',
  Orbital: 'Orbital',
  Ancient: 'Ancient',
  Guardian: 'Guardian',
  GCDS: 'GCDS',
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

  private damage = 0;
  private rollD6: () => number;

  constructor(
    type: ShipType,
    config: ShipConfig = {},
    rollD6: () => number = rollRandomD6
  ) {
    this.type = type;
    this.rollD6 = rollD6;

    const { cannons, missiles, ...topLevel } = config;
    Object.assign(this, topLevel);

    if (cannons) {
      Object.assign(this.cannons, cannons);
    }
    if (missiles) {
      Object.assign(this.missiles, missiles);
    }
  }

  isPlayerShip(): boolean {
    return !npcTypes.includes(this.type);
  }

  shootMissles(): Shot[] {
    return this.rollWeapons(this.missiles);
  }

  shootCannons(antimatterSplitter: boolean = false): Shot[] {
    return this.rollWeapons(this.cannons, antimatterSplitter);
  }

  private rollWeapons(
    weapons: Record<WeaponType, number>,
    antimatterSplitter: boolean = false
  ): Shot[] {
    return Object.entries(weapons).flatMap(([weaponType, count]) => {
      const shots: Shot[] = [];
      const type = weaponType as WeaponType;

      for (let i = 0; i < count; i++) {
        const roll = this.rollD6();
        const weaponDamage = WeaponDamage[type];

        if (type === WeaponType.Antimatter && antimatterSplitter) {
          for (let j = 0; j < weaponDamage; j++) {
            shots.push({
              roll: roll,
              computers: this.computers,
              damage: 1,
            });
          }
        } else {
          shots.push({
            roll: roll,
            computers: this.computers,
            damage: weaponDamage,
          });
        }
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

  hasCannons(): boolean {
    const hasRegularCannons = Object.values(this.cannons).some(
      (count) => count > 0
    );
    const hasRift = this.rift > 0;
    return hasRegularCannons || hasRift;
  }
}
