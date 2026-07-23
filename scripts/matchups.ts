import { Ship, ShipConfig, ShipType } from '../src/engine/ship';

export type ShipGroup = {
  type: ShipType;
  config?: ShipConfig;
  count?: number;
};

export type Matchup = {
  name: string;
  player: ShipGroup[];
  enemy: ShipGroup[];
  noHeal: boolean;
};

export function buildShips(groups: ShipGroup[], rollD6?: () => number): Ship[] {
  return groups.flatMap(({ type, config = {}, count = 1 }) =>
    Array.from({ length: count }, () => new Ship(type, config, rollD6))
  );
}

export const MATCHUPS: Matchup[] = [
  {
    name: 'Mirror: ion interceptors',
    player: [
      {
        type: ShipType.Interceptor,
        config: { initiative: 3, cannons: { ion: 1 } },
      },
    ],
    enemy: [
      {
        type: ShipType.Interceptor,
        config: { initiative: 3, cannons: { ion: 1 } },
      },
    ],
    noHeal: true,
  },
  {
    name: 'Cruiser vs Ancient',
    player: [
      {
        type: ShipType.Cruiser,
        config: {
          initiative: 3,
          hull: 1,
          computers: 1,
          cannons: { plasma: 1 },
        },
      },
    ],
    enemy: [
      {
        type: ShipType.Ancient,
        config: {
          initiative: 2,
          hull: 1,
          computers: 1,
          cannons: { ion: 2 },
        },
      },
    ],
    noHeal: true,
  },
  {
    name: 'Missiles vs interceptor swarm',
    player: [
      {
        type: ShipType.Cruiser,
        config: {
          initiative: 2,
          hull: 1,
          computers: 2,
          cannons: { ion: 1 },
          missiles: { plasma: 2 },
        },
      },
    ],
    enemy: [
      {
        type: ShipType.Interceptor,
        config: { initiative: 3, cannons: { ion: 1 } },
        count: 2,
      },
    ],
    noHeal: true,
  },
  {
    name: 'HET: fast weak assassin before slow artillery',
    player: [
      {
        type: ShipType.Interceptor,
        config: {
          initiative: 3,
          computers: 5,
          cannons: { antimatter: 1 },
          missiles: { ion: 1 },
        },
      },
    ],
    enemy: [
      {
        type: ShipType.Interceptor,
        config: {
          initiative: 4,
          computers: 5,
          cannons: { antimatter: 1 },
        },
      },
      {
        type: ShipType.Cruiser,
        config: {
          initiative: 1,
          computers: 5,
          cannons: { antimatter: 2 },
        },
      },
    ],
    noHeal: true,
  },
  {
    name: 'Rift duel',
    player: [
      {
        type: ShipType.Interceptor,
        config: { initiative: 3, rift: 1 },
      },
    ],
    enemy: [
      {
        type: ShipType.Interceptor,
        config: { initiative: 3, rift: 1 },
      },
    ],
    noHeal: false,
  },
];
