import { describe, expect, test } from 'bun:test';
import { ShipType } from '@calc/ship';
import {
  getDefaultShipConfig,
  getStartingShipConfig,
  type ShipDropdownOption,
} from './ship-presets';

const PLAYER_PRESETS: ShipDropdownOption[] = [
  'interceptor',
  'cruiser',
  'dreadnought',
  'orbital',
  'starbase',
];

describe('starting player blueprints', () => {
  test('uses the generic operating configurations', () => {
    expect(getStartingShipConfig('interceptor').config).toMatchObject({
      hull: 0,
      computers: 0,
      initiative: 3,
      cannons: { ion: 1 },
    });
    expect(getStartingShipConfig('cruiser').config).toMatchObject({
      hull: 1,
      computers: 1,
      initiative: 2,
      cannons: { ion: 1 },
    });
    expect(getStartingShipConfig('dreadnought').config).toMatchObject({
      hull: 2,
      computers: 1,
      initiative: 1,
      cannons: { ion: 2 },
    });
    expect(getStartingShipConfig('orbital').config).toMatchObject({
      hull: 3,
      computers: 1,
      initiative: 4,
      cannons: { ion: 2 },
    });
    expect(getStartingShipConfig('starbase').config).toMatchObject({
      hull: 2,
      computers: 1,
      initiative: 4,
      cannons: { ion: 1 },
    });
  });

  test('applies Planta printed bonuses', () => {
    expect(getStartingShipConfig('interceptor', 'planta').config).toMatchObject(
      { computers: 1, initiative: 1 }
    );
    expect(getStartingShipConfig('cruiser', 'planta').config.initiative).toBe(
      1
    );
    expect(getStartingShipConfig('starbase', 'planta').config).toMatchObject({
      computers: 2,
      initiative: 2,
    });
  });

  test('applies Orion shields and initiative to every player hull', () => {
    for (const preset of PLAYER_PRESETS) {
      const generic = getStartingShipConfig(preset).config;
      const orion = getStartingShipConfig(preset, 'orion').config;
      expect(orion.shields).toBe(generic.shields + 1);
      expect(orion.initiative).toBe(generic.initiative + 1);
    }
  });

  test('applies Rho Indi shields without removing hypothetical hull choices', () => {
    for (const preset of PLAYER_PRESETS) {
      const rhoIndi = getStartingShipConfig(preset, 'rho-indi');
      expect(rhoIndi.config.shields).toBe(1);
    }
    expect(getStartingShipConfig('dreadnought', 'rho-indi').type).toBe(
      ShipType.Dreadnought
    );
  });

  test('applies the Exiles computer bonus except to their Orbital', () => {
    for (const preset of PLAYER_PRESETS) {
      const generic = getStartingShipConfig(preset).config;
      const exiles = getStartingShipConfig(preset, 'exiles').config;
      expect(exiles.computers).toBe(
        generic.computers + (preset === 'orbital' ? 0 : 1)
      );
    }
  });

  test('keeps the v1 share-link baseline unchanged', () => {
    expect(getDefaultShipConfig('cruiser').config).toMatchObject({
      hull: 0,
      computers: 0,
      initiative: 2,
      cannons: { ion: 0 },
    });
  });
});
