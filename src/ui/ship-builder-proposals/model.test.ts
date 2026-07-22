import { describe, expect, test } from 'bun:test';
import {
  calculateBlueprintStats,
  canPlacePart,
  countPartsByTier,
  createBuilderState,
  findDiscoveryUse,
  placePart,
  SHIP_DEFINITIONS,
} from './model';

describe('ship builder proposal model', () => {
  test('matches the curated inventory and blueprint slot counts', () => {
    expect(countPartsByTier('standard')).toBe(5);
    expect(countPartsByTier('technology')).toBe(20);
    expect(countPartsByTier('discovery')).toBe(18);
    expect(SHIP_DEFINITIONS.interceptor.slots).toBe(4);
    expect(SHIP_DEFINITIONS.cruiser.slots).toBe(6);
    expect(SHIP_DEFINITIONS.dreadnought.slots).toBe(8);
    expect(SHIP_DEFINITIONS.starbase.slots).toBe(5);
    expect(SHIP_DEFINITIONS.orbital.slots).toBe(3);
  });

  test('allows unlimited standard and unlocked technology parts', () => {
    const state = createBuilderState();
    expect(placePart(state, 'interceptor', 0, 'ioc').allowed).toBeTrue();
    expect(placePart(state, 'interceptor', 1, 'ioc').allowed).toBeTrue();
    expect(placePart(state, 'cruiser', 0, 'plc').allowed).toBeTrue();
    expect(placePart(state, 'cruiser', 1, 'plc').allowed).toBeTrue();
  });

  test('gates locked technology parts', () => {
    const state = createBuilderState();
    expect(canPlacePart(state, 'interceptor', 0, 'anc')).toEqual({
      allowed: false,
      reason: 'Technology not unlocked',
    });
    state.unlockedTech.add('anc');
    expect(canPlacePart(state, 'interceptor', 0, 'anc').allowed).toBeTrue();
  });

  test('lets a discovery part be installed only once', () => {
    const state = createBuilderState();
    expect(placePart(state, 'interceptor', 0, 'axc').allowed).toBeTrue();
    expect(findDiscoveryUse(state, 'axc')).toEqual({
      ship: 'interceptor',
      target: 0,
    });
    expect(placePart(state, 'cruiser', 0, 'axc')).toEqual({
      allowed: false,
      reason: 'Already installed on Interceptor',
    });
  });

  test('keeps Muon Source out of the normal slot grid', () => {
    const state = createBuilderState();
    expect(placePart(state, 'interceptor', 3, 'mus')).toEqual({
      allowed: false,
      reason: 'Muon Source uses the external socket',
    });
    expect(
      placePart(state, 'interceptor', 'external', 'mus').allowed
    ).toBeTrue();
    expect(state.blueprints.interceptor.slots[3]).toBeNull();
    expect(state.blueprints.interceptor.externalPart).toBe('mus');
    expect(calculateBlueprintStats(state, 'interceptor').energySource).toBe(5);
  });

  test('adds faction-fixed bonuses outside the installed parts', () => {
    const state = createBuilderState();
    const generic = calculateBlueprintStats(state, 'cruiser');
    state.factionId = 'rho-indi';
    const rhoIndi = calculateBlueprintStats(state, 'cruiser');
    expect(rhoIndi.shield).toBe(generic.shield + 1);
    expect(rhoIndi.initiative).toBe(generic.initiative);
  });
});
