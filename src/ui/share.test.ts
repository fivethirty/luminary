import { describe, test, expect } from 'bun:test';
import { ShipType } from '@calc/ship';
import type { FleetState } from '@ui/state';
import {
  encodeBattleQuery,
  parseBattleQuery,
  battleUrl,
  formatChatReport,
} from './share';
import { exactResults } from './test-helpers';

function fleet(overrides: Partial<FleetState> = {}): FleetState {
  return {
    id: 'fleet-0',
    name: 'Defender',
    shipTypes: [],
    antimatterSplitter: false,
    plannerType: 'optimal',
    ...overrides,
  };
}

function battle(): FleetState[] {
  return [
    fleet({
      shipTypes: [
        {
          id: 'ship-1',
          type: ShipType.Guardian,
          quantity: 1,
          config: {
            hull: 2,
            computers: 2,
            shields: 0,
            initiative: 3,
            heal: 0,
            rift: 0,
            cannons: { ion: 3, plasma: 0, soliton: 0, antimatter: 0 },
            missiles: { ion: 0, plasma: 0, soliton: 0, antimatter: 0 },
          },
        },
      ],
    }),
    fleet({
      id: 'fleet-1',
      name: 'Attacker',
      antimatterSplitter: true,
      plannerType: 'dps',
      shipTypes: [
        {
          id: 'ship-2',
          type: ShipType.Cruiser,
          quantity: 2,
          config: {
            hull: 1,
            computers: 1,
            shields: 0,
            initiative: 2,
            heal: 0,
            rift: 1,
            cannons: { ion: 1, plasma: 1, soliton: 0, antimatter: 0 },
            missiles: { ion: 0, plasma: 1, soliton: 0, antimatter: 0 },
          },
        },
      ],
    }),
  ];
}

describe('encodeBattleQuery', () => {
  test('produces a human-readable query with only non-default stats', () => {
    expect(encodeBattleQuery(battle())).toBe(
      'v=1&d.guardian=1&a.cruiser=2&a.cruiser.hull=1&a.cruiser.comp=1' +
        '&a.cruiser.rift=1&a.cruiser.ion=1&a.cruiser.plasma=1' +
        '&a.cruiser.plasma-m=1&a.ams=1&a.planner=dps'
    );
  });

  test('names an NPC variant when the config matches it exactly', () => {
    const fleets = battle();
    fleets[0].shipTypes[0].config = {
      hull: 3,
      computers: 1,
      shields: 1,
      initiative: 2,
      heal: 0,
      rift: 0,
      cannons: { ion: 0, plasma: 2, soliton: 0, antimatter: 0 },
      missiles: { ion: 0, plasma: 0, soliton: 0, antimatter: 0 },
    };
    expect(encodeBattleQuery(fleets)).toContain('d.guardian-wa=1');
    expect(encodeBattleQuery(fleets)).not.toContain('d.guardian-wa.');
  });

  test('encodes a player ship with default stats as a single param', () => {
    const fleets = battle();
    fleets[1].shipTypes[0].config = { initiative: 2 };
    fleets[1].antimatterSplitter = false;
    fleets[1].plannerType = 'optimal';
    expect(encodeBattleQuery(fleets)).toBe('v=1&d.guardian=1&a.cruiser=2');
  });

  test('returns an empty string when there is nothing to share', () => {
    expect(encodeBattleQuery([fleet(), fleet({ id: 'fleet-1' })])).toBe('');
  });

  test('uses a2..a4 keys for additional attackers', () => {
    const fleets = battle();
    fleets.push(
      fleet({
        id: 'fleet-2',
        name: 'Attacker 2',
        shipTypes: [
          {
            id: 'ship-3',
            type: ShipType.Interceptor,
            quantity: 4,
            config: { initiative: 3 },
          },
        ],
      })
    );
    expect(encodeBattleQuery(fleets)).toContain('a2.interceptor=4');
  });
});

describe('parseBattleQuery', () => {
  test('round-trips a battle', () => {
    const decoded = parseBattleQuery(`?${encodeBattleQuery(battle())}`)!;

    expect(decoded).toHaveLength(2);
    expect(decoded[0].shipTypes[0].type).toBe(ShipType.Guardian);
    expect(decoded[0].shipTypes[0].quantity).toBe(1);
    expect(decoded[0].shipTypes[0].config).toEqual(
      battle()[0].shipTypes[0].config
    );
    expect(decoded[1].shipTypes[0].type).toBe(ShipType.Cruiser);
    expect(decoded[1].shipTypes[0].quantity).toBe(2);
    expect(decoded[1].shipTypes[0].config).toEqual(
      battle()[1].shipTypes[0].config
    );
    expect(decoded[1].antimatterSplitter).toBe(true);
    expect(decoded[1].plannerType).toBe('dps');
    expect(decoded.map((f) => f.id)).toEqual(['fleet-0', 'fleet-1']);
    expect(decoded.every((f) => f.name === '')).toBe(true);
  });

  test('expands a preset variant into its full config', () => {
    const decoded = parseBattleQuery('v=1&d.ancient-adv=2&a.cruiser=1')!;
    expect(decoded[0].shipTypes[0].type).toBe(ShipType.Ancient);
    expect(decoded[0].shipTypes[0].quantity).toBe(2);
    expect(decoded[0].shipTypes[0].config.hull).toBe(2);
    expect(decoded[0].shipTypes[0].config.cannons?.plasma).toBe(1);
  });

  test('creates a ship from a stat override alone', () => {
    const decoded = parseBattleQuery('v=1&a.cruiser.ion=2')!;
    expect(decoded[1].shipTypes[0].type).toBe(ShipType.Cruiser);
    expect(decoded[1].shipTypes[0].quantity).toBe(1);
    expect(decoded[1].shipTypes[0].config.cannons?.ion).toBe(2);
    expect(decoded[1].shipTypes[0].config.initiative).toBe(2);
  });

  test('clamps quantities to the UI limits', () => {
    const decoded = parseBattleQuery('v=1&a.interceptor=20&d.guardian=0')!;
    expect(decoded[1].shipTypes[0].quantity).toBe(8);
    expect(decoded[0].shipTypes[0].quantity).toBe(1);
  });

  test('requires the version param', () => {
    expect(parseBattleQuery('d.guardian=1')).toBeNull();
    expect(parseBattleQuery('v=2&d.guardian=1')).toBeNull();
  });

  test('returns null when nothing battle-related is present', () => {
    expect(parseBattleQuery('')).toBeNull();
    expect(parseBattleQuery('v=1')).toBeNull();
    expect(parseBattleQuery('v=1&utm_source=discord&d.unknown=1')).toBeNull();
  });

  test('ignores unknown params alongside valid ones', () => {
    const decoded = parseBattleQuery(
      'v=1&utm_source=discord&a.cruiser=2&a.cruiser.warp=9'
    )!;
    expect(decoded[1].shipTypes[0].quantity).toBe(2);
    expect(decoded[1].shipTypes[0].config).toEqual(
      parseBattleQuery('v=1&a.cruiser=2')![1].shipTypes[0].config
    );
  });

  test('drops NPCs, starbases, and orbitals from attacker fleets', () => {
    const decoded = parseBattleQuery(
      'v=1&a.ancient=2&a.starbase=1&a.cruiser=1'
    )!;
    expect(decoded[1].shipTypes.map((s) => s.type)).toEqual([ShipType.Cruiser]);
  });

  test('does not mix player and NPC ships in the defender fleet', () => {
    const decoded = parseBattleQuery('v=1&d.cruiser=1&d.ancient=2')!;
    expect(decoded[0].shipTypes.map((s) => s.type)).toEqual([ShipType.Cruiser]);
  });

  test('keeps only one entry per ship type', () => {
    const decoded = parseBattleQuery('v=1&d.ancient=2&d.ancient-wa=1')!;
    expect(decoded[0].shipTypes).toHaveLength(1);
    expect(decoded[0].shipTypes[0].quantity).toBe(2);
  });

  test('creates intermediate empty fleets for high attacker keys', () => {
    const decoded = parseBattleQuery('v=1&a3.cruiser=1')!;
    expect(decoded).toHaveLength(4);
    expect(decoded[3].shipTypes[0].type).toBe(ShipType.Cruiser);
    expect(decoded[1].shipTypes).toHaveLength(0);
  });
});

describe('battleUrl', () => {
  test('builds a full URL from the current location', () => {
    const url = battleUrl(battle());
    expect(url.startsWith(window.location.origin)).toBe(true);
    expect(url).toContain('?v=1&d.guardian=1&a.cruiser=2');
  });
});

describe('formatChatReport', () => {
  const results = exactResults({
    victoryProbability: { Defender: 0.218, Attacker: 0.734 },
    drawProbability: 0.048,
    expectedSurvivors: { Attacker: { Cruiser: 1.4 }, Defender: {} },
  });

  test('includes the matchup, odds rows, and share link', () => {
    const report = formatChatReport(
      battle(),
      results,
      'https://example.com/?v=1'
    );

    expect(report).toContain('⚔ Guardian  vs  2× Cruiser');
    expect(report).toContain('Defender   21.8%');
    expect(report).toContain('Attacker   73.4%');
    expect(report).toContain('Draw        4.8%');
    expect(report).toContain('Avg survivors (wins): Attacker 1.4× Cruiser');
    expect(report.endsWith('https://example.com/?v=1')).toBe(true);
  });

  test('wraps the odds table in a code fence for chat clients', () => {
    const report = formatChatReport(battle(), results);
    const lines = report.split('\n');
    expect(lines[1]).toBe('```');
    expect(lines[lines.length - 1]).toBe('```');
  });

  test('draws bars proportional to the odds', () => {
    const report = formatChatReport(battle(), results);
    const attackerLine = report
      .split('\n')
      .find((line) => line.startsWith('Attacker'))!;
    expect(attackerLine).toContain('█'.repeat(15) + '░'.repeat(5));
  });

  test('omits the draw row and survivors when empty', () => {
    const report = formatChatReport(
      battle(),
      exactResults({
        victoryProbability: { Defender: 1, Attacker: 0 },
        drawProbability: 0,
        expectedSurvivors: {},
      })
    );
    expect(report).not.toContain('Draw');
    expect(report).not.toContain('Avg survivors');
    expect(report).toContain('Attacker    0.0%');
  });
});
