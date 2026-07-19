import { describe, test, expect, beforeEach } from 'bun:test';
import { ShipType } from '@calc/ship';
import type { FleetState } from '@ui/state';
import {
  saveSetup,
  loadSetup,
  recordRecentBattle,
  loadRecentBattles,
} from './storage';

function fleets(attackerQuantity: number): FleetState[] {
  return [
    {
      id: 'fleet-0',
      name: 'Defender',
      shipTypes: [
        {
          id: 'ship-1',
          type: ShipType.Guardian,
          quantity: 1,
          config: { initiative: 3 },
        },
      ],
      antimatterSplitter: false,
      plannerType: 'optimal',
    },
    {
      id: 'fleet-1',
      name: 'Attacker',
      shipTypes: [
        {
          id: 'ship-2',
          type: ShipType.Cruiser,
          quantity: attackerQuantity,
          config: { initiative: 2 },
        },
      ],
      antimatterSplitter: false,
      plannerType: 'optimal',
    },
  ];
}

function fleetsWithAttackerHull(hull: number): FleetState[] {
  const result = fleets(2);
  result[1].shipTypes[0].config = { initiative: 2, hull };
  return result;
}

const EMPTY_FLEETS: FleetState[] = [
  {
    id: 'fleet-0',
    name: 'Defender',
    shipTypes: [],
    antimatterSplitter: false,
    plannerType: 'optimal',
  },
  {
    id: 'fleet-1',
    name: 'Attacker',
    shipTypes: [],
    antimatterSplitter: false,
    plannerType: 'optimal',
  },
];

describe('setup persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('round-trips the current setup', () => {
    saveSetup(fleets(2));
    const restored = loadSetup()!;
    expect(restored[0].shipTypes[0].type).toBe(ShipType.Guardian);
    expect(restored[1].shipTypes[0].quantity).toBe(2);
  });

  test('an empty setup restores as nothing', () => {
    saveSetup(fleets(2));
    saveSetup(EMPTY_FLEETS);
    expect(loadSetup()).toBeNull();
  });

  test('missing or corrupt storage restores as nothing', () => {
    expect(loadSetup()).toBeNull();
    localStorage.setItem('luminary:setup', '!!!');
    expect(loadSetup()).toBeNull();
  });
});

describe('recent battles', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const T0 = 1_000_000;
  const LATER = T0 + 300_000; // past the merge window

  test('records a battle with a readable label', () => {
    recordRecentBattle(fleets(2), T0);
    const recents = loadRecentBattles();
    expect(recents).toHaveLength(1);
    expect(recents[0].label).toBe('Guardian vs 2× Cruiser');
  });

  test('edits within the merge window update the newest entry', () => {
    recordRecentBattle(fleets(1), T0);
    recordRecentBattle(fleets(2), T0 + 30_000);
    recordRecentBattle(fleets(3), T0 + 60_000);

    const recents = loadRecentBattles();
    expect(recents).toHaveLength(1);
    expect(recents[0].label).toBe('Guardian vs 3× Cruiser');
  });

  test('a battle after the merge window becomes a new entry', () => {
    recordRecentBattle(fleets(1), T0);
    recordRecentBattle(fleets(2), LATER);

    const recents = loadRecentBattles();
    expect(recents).toHaveLength(2);
    expect(recents[0].label).toBe('Guardian vs 2× Cruiser');
    expect(recents[1].label).toBe('Guardian vs Cruiser');
  });

  test('stat edits to the same composition update the newest entry after the merge window', () => {
    recordRecentBattle(fleetsWithAttackerHull(1), T0);
    recordRecentBattle(fleetsWithAttackerHull(2), LATER);

    const recents = loadRecentBattles();
    expect(recents).toHaveLength(1);
    expect(recents[0].query).toContain('a.cruiser.hull=2');
  });

  test('re-simulating an identical battle never duplicates it', () => {
    recordRecentBattle(fleets(2), T0);
    recordRecentBattle(fleets(2), LATER);
    expect(loadRecentBattles()).toHaveLength(1);
  });

  test('empty battles are not recorded', () => {
    recordRecentBattle(EMPTY_FLEETS, T0);
    expect(loadRecentBattles()).toHaveLength(0);
  });

  test('keeps at most eight entries', () => {
    for (let i = 0; i < 12; i++) {
      recordRecentBattle(fleets((i % 4) + 1), T0 + i * 300_000);
    }
    expect(loadRecentBattles().length).toBeLessThanOrEqual(8);
  });

  test('corrupt recents read as empty', () => {
    localStorage.setItem('luminary:recents', 'not json');
    expect(loadRecentBattles()).toHaveLength(0);
    localStorage.setItem('luminary:recents', '{"not":"an array"}');
    expect(loadRecentBattles()).toHaveLength(0);
  });
});
