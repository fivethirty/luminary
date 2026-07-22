import { describe, expect, test } from 'bun:test';
import { ShipType } from '@calc/ship';
import {
  BLUEPRINT_LAYOUTS,
  calculateBlueprint,
  createStartingBlueprint,
  externalBonusLabels,
  isBlueprintSlotBlocked,
  partBuckets,
  SHIP_PARTS,
} from './ship-parts';
import { getStartingShipConfig } from './ship-presets';

describe('ship parts', () => {
  test('exposes the official inventory without community variants', () => {
    expect(SHIP_PARTS.filter((part) => part.tier === 'standard')).toHaveLength(
      5
    );
    expect(
      SHIP_PARTS.filter((part) => part.tier === 'technology')
    ).toHaveLength(20);
    expect(SHIP_PARTS.filter((part) => part.tier === 'discovery')).toHaveLength(
      18
    );
    expect(SHIP_PARTS.some((part) => part.id === 'imhmod')).toBe(false);
    expect(SHIP_PARTS.some((part) => part.id === 'phsmod')).toBe(false);
  });

  test('uses the requested slot order for all standard blueprints', () => {
    expect(createStartingBlueprint(ShipType.Interceptor).slots).toEqual([
      'nus',
      'ioc',
      null,
      'nud',
    ]);
    expect(createStartingBlueprint(ShipType.Cruiser).slots).toEqual([
      'elc',
      'ioc',
      null,
      'nus',
      'hul',
      'nud',
    ]);
    expect(createStartingBlueprint(ShipType.Dreadnought).slots).toEqual([
      'elc',
      'ioc',
      'ioc',
      null,
      'nus',
      'hul',
      'hul',
      'nud',
    ]);
    expect(createStartingBlueprint(ShipType.Starbase).slots).toEqual([
      'elc',
      null,
      'ioc',
      'hul',
      'hul',
    ]);
    expect(createStartingBlueprint(ShipType.Orbital).slots).toEqual([
      'hul',
      'iotexile',
      'elc',
    ]);
  });

  test('maps the numbered slots to the four requested stagger rows', () => {
    expect(
      BLUEPRINT_LAYOUTS[ShipType.Interceptor].positions.map((slot) => slot.row)
    ).toEqual([2, 1, 2, 3]);
    expect(
      BLUEPRINT_LAYOUTS[ShipType.Cruiser].positions.map((slot) => slot.row)
    ).toEqual([2, 1, 2, 4, 3, 4]);
    expect(
      BLUEPRINT_LAYOUTS[ShipType.Dreadnought].positions.map((slot) => slot.row)
    ).toEqual([2, 1, 1, 2, 4, 3, 3, 4]);
    expect(
      BLUEPRINT_LAYOUTS[ShipType.Starbase].positions.map((slot) => slot.row)
    ).toEqual([1, 2, 1, 3, 3]);
    expect(
      BLUEPRINT_LAYOUTS[ShipType.Orbital].positions.map((slot) => slot.row)
    ).toEqual([3, 2, 1]);
  });

  test('blocks the printed unavailable slots on Planta blueprints', () => {
    expect(
      createStartingBlueprint(ShipType.Interceptor, 'planta').slots
    ).toEqual(['nus', 'ioc', 'nud', null]);
    expect(createStartingBlueprint(ShipType.Cruiser, 'planta').slots).toEqual([
      'nus',
      'ioc',
      null,
      null,
      'hul',
      'nud',
    ]);
    expect(
      createStartingBlueprint(ShipType.Dreadnought, 'planta').slots
    ).toEqual(['nus', 'ioc', 'ioc', null, null, 'hul', 'hul', 'nud']);
    expect(createStartingBlueprint(ShipType.Starbase, 'planta').slots).toEqual([
      'elc',
      'hul',
      'ioc',
      null,
      'hul',
    ]);
    expect(
      [
        ShipType.Interceptor,
        ShipType.Cruiser,
        ShipType.Dreadnought,
        ShipType.Starbase,
      ].map((type) =>
        BLUEPRINT_LAYOUTS[type].positions.findIndex((_, slot) =>
          isBlueprintSlotBlocked(type, slot, 'planta')
        )
      )
    ).toEqual([3, 3, 4, 3]);
  });

  test('derives combat, energy, and drive readouts without enforcing warnings', () => {
    const interceptor = calculateBlueprint(
      ShipType.Interceptor,
      createStartingBlueprint(ShipType.Interceptor)
    );
    expect(interceptor.config.initiative).toBe(3);
    expect(interceptor.config.cannons.ion).toBe(1);
    expect(interceptor.energyBalance).toBe(1);
    expect(interceptor.hasDrive).toBe(true);

    const invalid = calculateBlueprint(ShipType.Interceptor, {
      slots: ['anc', null, null, null],
      muonSource: false,
    });
    expect(invalid.energyBalance).toBe(-4);
    expect(invalid.hasDrive).toBe(false);
    expect(invalid.config.cannons.antimatter).toBe(1);

    const plantaBlockedPart = calculateBlueprint(
      ShipType.Interceptor,
      { slots: ['nus', 'ioc', 'nud', 'hul'], muonSource: false },
      'planta'
    );
    expect(plantaBlockedPart.config.hull).toBe(0);
  });

  test('derives the orbital chassis and replaceable starting tiles', () => {
    const orbital = calculateBlueprint(
      ShipType.Orbital,
      createStartingBlueprint(ShipType.Orbital),
      'exiles'
    );
    expect(orbital.config).toMatchObject({
      hull: 3,
      computers: 1,
      initiative: 0,
      cannons: { ion: 2 },
    });
    expect(orbital.energySource).toBe(4);
    expect(orbital.energyUse).toBe(1);
  });

  test('derives Rho Indi starting blueprints using faction defaults', () => {
    const cruiser = calculateBlueprint(
      ShipType.Cruiser,
      createStartingBlueprint(ShipType.Cruiser, 'rho-indi'),
      'rho-indi'
    );

    expect(cruiser.config).toEqual(
      getStartingShipConfig('cruiser', 'rho-indi').config
    );
  });

  test('duplicates multi-effect parts into every improving bucket', () => {
    const buckets = new Map(
      partBuckets(ShipType.Cruiser).map((bucket) => [
        bucket.id,
        bucket.parts.map((part) => part.id),
      ])
    );
    expect(buckets.get('computer')).toContain('seh');
    expect(buckets.get('hull')).toContain('seh');
    expect(buckets.get('hull')).toContain('ricon');
    expect(buckets.get('cannon')).toContain('ricon');
  });

  test('omits drives from stationary structures', () => {
    expect(
      partBuckets(ShipType.Starbase).some((bucket) => bucket.id === 'movement')
    ).toBe(false);
    expect(
      partBuckets(ShipType.Orbital)
        .flatMap((bucket) => bucket.parts)
        .some((part) => part.drive)
    ).toBe(false);
  });

  test('lists printed faction and chassis bonuses in EXT', () => {
    expect(externalBonusLabels(ShipType.Interceptor, 'orion')).toEqual([
      '+3 Init',
      '+1 Energy',
    ]);
    expect(externalBonusLabels(ShipType.Orbital, 'exiles')).toEqual([
      '+4 Energy',
      '+2 Hull',
    ]);
    expect(externalBonusLabels(ShipType.Dreadnought)).toEqual([]);
  });
});
