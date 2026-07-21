import { describe, expect, test } from 'bun:test';
import { ShipType } from '@calc/ship';
import {
  baseFleetName,
  deriveFleetNames,
  deriveShortFleetNames,
  fleetRoleName,
} from './fleet-metadata';

describe('fleet naming metadata', () => {
  test('names defender and attacker roles from fleet position', () => {
    expect(fleetRoleName(0, 2)).toBe('Defender');
    expect(fleetRoleName(1, 2)).toBe('Attacker');
    expect(fleetRoleName(1, 3)).toBe('Attacker 1');
    expect(fleetRoleName(2, 3)).toBe('Attacker 2');
  });

  test('prefers the NPC and faction display names', () => {
    expect(
      baseFleetName(
        { factionId: 'terran', shipTypes: [{ type: ShipType.Ancient }] },
        0,
        2
      )
    ).toBe('The Ancients');
    expect(baseFleetName({ factionId: 'terran', shipTypes: [] }, 1, 2)).toBe(
      'Terran'
    );
  });

  test('adds stable suffixes only to duplicate base names', () => {
    expect(
      deriveFleetNames([
        { factionId: '', shipTypes: [] },
        { factionId: 'terran', shipTypes: [] },
        { factionId: 'terran', shipTypes: [] },
      ])
    ).toEqual(['Defender', 'Terran 1', 'Terran 2']);
  });

  test('derives unique shortened faction names', () => {
    expect(
      deriveShortFleetNames([
        { factionId: '', shipTypes: [] },
        { factionId: 'terran', shipTypes: [] },
        { factionId: 'terran', shipTypes: [] },
      ])
    ).toEqual(['Defender', 'Terran 1', 'Terran 2']);
  });
});
