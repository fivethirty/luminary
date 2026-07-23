import { describe, test, expect } from 'bun:test';
import { ShipType } from '@calc/ship';
import type { FleetState } from '@ui/state';
import {
  encodeBattleQuery,
  parseBattleQuery,
  battleUrl,
  battleLabel,
  formatChatReport,
} from './share';
import { exactResults } from './test-helpers';
import { calculateBlueprint, createStartingBlueprint } from './ship-parts';
import { getStartingShipConfig } from './ship-presets';

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
      'v=2&d.guardian=1&a.cruiser=2&a.cruiser.rift=1&a.cruiser.plasma=1' +
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
    fleets[1].shipTypes[0].config = getStartingShipConfig('cruiser').config;
    fleets[1].antimatterSplitter = false;
    fleets[1].plannerType = 'optimal';
    expect(encodeBattleQuery(fleets)).toBe('v=2&d.guardian=1&a.cruiser=2');
  });

  test('compares player stats with faction-aware defaults', () => {
    const fleets = battle();
    fleets[1].factionId = 'orion';
    fleets[1].shipTypes[0].config = getStartingShipConfig(
      'cruiser',
      'orion'
    ).config;
    fleets[1].antimatterSplitter = false;
    fleets[1].plannerType = 'optimal';

    const query = encodeBattleQuery(fleets);
    expect(query).toBe('v=2&d.guardian=1&a.cruiser=2&a.faction=orion');
    expect(parseBattleQuery(query)?.[1].shipTypes[0].config).toEqual(
      fleets[1].shipTypes[0].config
    );
  });

  test('uses faction defaults after a blueprint is converted to stats', () => {
    const fleets = battle();
    const blueprint = createStartingBlueprint(ShipType.Cruiser, 'rho-indi');
    fleets[1].factionId = 'rho-indi';
    fleets[1].shipTypes[0] = {
      id: 'flattened-cruiser',
      type: ShipType.Cruiser,
      quantity: 1,
      config: calculateBlueprint(ShipType.Cruiser, blueprint, 'rho-indi')
        .config,
    };
    fleets[1].antimatterSplitter = false;
    fleets[1].plannerType = 'optimal';

    const query = encodeBattleQuery(fleets);
    expect(query).toBe('v=2&d.guardian=1&a.cruiser=1&a.faction=rho-indi');
    expect(query).not.toContain('a.cruiser.');
  });

  test('round-trips NPC targeting for player fleets', () => {
    const fleets = battle();
    fleets[1].plannerType = 'npc';

    const query = encodeBattleQuery(fleets);
    expect(query).toContain('a.planner=npc');
    expect(parseBattleQuery(query)?.[1].plannerType).toBe('npc');
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

  test('encodes faction and non-default board colors', () => {
    const fleets = battle();
    fleets[0].factionId = 'terran';
    fleets[1].factionId = 'rho-indi';
    fleets[1].colorId = 'red';

    const query = encodeBattleQuery(fleets);
    expect(query).toContain('d.faction=terran');
    expect(query).toContain('a.faction=rho-indi');
    expect(query).toContain('a.color=red');
  });

  test('persists a manually selected color even when it matches the positional default', () => {
    const fleets = battle();
    fleets[1].colorId = 'blue';
    fleets[1].colorIsManual = true;

    const query = encodeBattleQuery(fleets);
    expect(query).toContain('a.color=blue');
    expect(parseBattleQuery(query)?.[1].colorIsManual).toBe(true);
  });

  test('supports six player attackers plus neutrals', () => {
    const fleets = battle();
    for (let index = 2; index < 7; index++) {
      fleets.push(
        fleet({
          id: `fleet-${index}`,
          name: `Attacker ${index}`,
          shipTypes: [
            {
              id: `ship-${index}`,
              type: ShipType.Interceptor,
              quantity: 1,
              config: { initiative: 3 },
            },
          ],
        })
      );
    }

    const query = encodeBattleQuery(fleets);
    expect(query).toContain('a6.interceptor=1');
    expect(parseBattleQuery(query)).toHaveLength(7);
  });

  test('round-trips ordered slots and the external Muon Source', () => {
    const fleets = battle();
    const blueprint = createStartingBlueprint(ShipType.Cruiser);
    blueprint.muonSource = true;
    fleets[1].shipTypes[0] = {
      id: 'tile-cruiser',
      type: ShipType.Cruiser,
      quantity: 1,
      blueprint,
      config: calculateBlueprint(ShipType.Cruiser, blueprint).config,
    };

    const query = encodeBattleQuery(fleets);
    expect(query).toContain(
      'a.cruiser.parts=elc-ioc-_-nus-hul-nud&a.cruiser.muon=1'
    );
    const decoded = parseBattleQuery(query)![1].shipTypes[0];
    expect(decoded.blueprint).toEqual(blueprint);
    expect(decoded.config).toEqual(
      calculateBlueprint(ShipType.Cruiser, blueprint).config
    );
  });

  test('omits stale blueprint metadata while preserving aggregate stats', () => {
    const fleets = battle();
    fleets[1].shipTypes[0].blueprint = createStartingBlueprint(
      ShipType.Cruiser
    );
    fleets[1].shipTypes[0].config = { hull: 9 };

    const query = encodeBattleQuery(fleets);
    expect(query).not.toContain('.parts=');
    expect(query).toContain('a.cruiser.hull=9');
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
    expect(decoded[0].colorId).toBe('neutral');
    expect(decoded[1].colorId).toBe('blue');
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
    expect(parseBattleQuery('v=3&d.guardian=1')).toBeNull();
  });

  test('decodes v2 faction defaults independent of parameter order', () => {
    const factionFirst = parseBattleQuery('v=2&a.faction=orion&a.cruiser=1')!;
    const factionLast = parseBattleQuery('v=2&a.cruiser=1&a.faction=orion')!;
    const expected = getStartingShipConfig('cruiser', 'orion').config;

    expect(factionFirst[1].shipTypes[0].config).toEqual(expected);
    expect(factionLast[1].shipTypes[0].config).toEqual(expected);
  });

  test('preserves zero overrides against nonzero faction defaults in v2', () => {
    const decoded = parseBattleQuery(
      'v=2&a.cruiser=1&a.cruiser.shield=0&a.faction=orion'
    )!;

    expect(decoded[1].shipTypes[0].config.shields).toBe(0);
    expect(decoded[1].shipTypes[0].config.initiative).toBe(3);
  });

  test('keeps v1 omissions on the legacy preset baseline', () => {
    const decoded = parseBattleQuery('v=1&a.cruiser=1&a.faction=orion')!;

    expect(decoded[1].shipTypes[0].config.shields).toBe(0);
    expect(decoded[1].shipTypes[0].config.initiative).toBe(2);
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

  test('round-trips faction and board color metadata', () => {
    const decoded = parseBattleQuery(
      'v=1&d.faction=terran&d.color=green&a.faction=rho-indi&a.color=blue'
    )!;

    expect(decoded[0].factionId).toBe('terran');
    expect(decoded[0].colorId).toBe('green');
    expect(decoded[1].factionId).toBe('rho-indi');
    expect(decoded[1].colorId).toBe('blue');
  });

  test('drops dreadnoughts from Rho Indi fleets while decoding', () => {
    const decoded = parseBattleQuery(
      'v=1&a.dreadnought=2&a.cruiser=1&a.faction=rho-indi'
    )!;

    expect(decoded[1].shipTypes.map((ship) => ship.type)).toEqual([
      ShipType.Cruiser,
    ]);
  });

  test('reconciles faction-invalid structures while decoding', () => {
    const exiles = parseBattleQuery('v=1&d.starbase=3&d.faction=exiles')!;
    expect(exiles[0].shipTypes).toEqual([
      expect.objectContaining({
        type: ShipType.Orbital,
        quantity: 1,
        config: expect.objectContaining({ initiative: 0 }),
      }),
    ]);

    const terran = parseBattleQuery('v=1&d.orbital=1&d.faction=terran')!;
    expect(terran[0].shipTypes).toEqual([
      expect.objectContaining({
        type: ShipType.Starbase,
        quantity: 1,
        config: expect.objectContaining({ initiative: 4 }),
      }),
    ]);
  });

  test('keeps the legacy orbital initiative without a faction', () => {
    const decoded = parseBattleQuery('v=1&d.orbital=1')!;
    expect(decoded[0].shipTypes[0].config.initiative).toBe(4);
  });

  test('lets valid parts override legacy stats independent of parameter order', () => {
    const first = parseBattleQuery(
      'v=1&a.interceptor.hull=9&a.interceptor.parts=nus-ioc-_-nud'
    )!;
    const second = parseBattleQuery(
      'v=1&a.interceptor.parts=nus-ioc-_-nud&a.interceptor.hull=9'
    )!;
    expect(first[1].shipTypes[0].config.hull).toBe(0);
    expect(second[1].shipTypes[0].config.hull).toBe(0);
    expect(second[1].shipTypes[0].blueprint?.slots).toEqual([
      'nus',
      'ioc',
      null,
      'nud',
    ]);
  });

  test('drops malformed tile metadata while retaining legacy combat stats', () => {
    const unknown = parseBattleQuery(
      'v=1&a.interceptor.hull=9&a.interceptor.parts=nus-community-_-nud'
    )!;
    expect(unknown[1].shipTypes[0].blueprint).toBeUndefined();
    expect(unknown[1].shipTypes[0].config.hull).toBe(9);

    const driveOnStructure = parseBattleQuery(
      'v=1&d.starbase.hull=7&d.starbase.parts=elc-_-ioc-hul-nud'
    )!;
    expect(driveOnStructure[0].shipTypes[0].blueprint).toBeUndefined();
    expect(driveOnStructure[0].shipTypes[0].config.hull).toBe(7);
  });
});

describe('battleLabel', () => {
  test('uses full ship names by default', () => {
    expect(battleLabel(battle())).toBe('Guardian vs 2× Cruiser');
  });

  test('short uses single-letter player hulls and named NPCs', () => {
    // battle()'s Guardian is a stock preset; its Cruiser has custom stats.
    expect(battleLabel(battle(), true)).toBe('Guard vs 2C');
  });

  test('short uses the surviving-fleet composition format', () => {
    const fleets = battle();
    fleets[1].shipTypes.push(
      {
        id: 'ship-3',
        type: ShipType.Interceptor,
        quantity: 2,
        config: { initiative: 3 },
      },
      {
        id: 'ship-4',
        type: ShipType.Dreadnought,
        quantity: 1,
        config: { initiative: 1 },
      }
    );

    expect(battleLabel(fleets, true)).toBe('Guard vs D,2C,2I');
  });

  test('tags NPC variants by their preset in both forms', () => {
    const fleets = battle();
    // A stock Guardian (WA): matches the guardian-wa preset exactly.
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
    expect(battleLabel(fleets)).toBe('Guardian (WA) vs 2× Cruiser');
    expect(battleLabel(fleets, true)).toBe('Guard (WA) vs 2C');
  });

  test('abbreviates every fleet in a multi-fleet matchup', () => {
    const fleets = battle();
    fleets.push(
      fleet({
        id: 'fleet-2',
        name: 'Attacker 2',
        shipTypes: [
          {
            id: 'ship-3',
            type: ShipType.Dreadnought,
            quantity: 2,
            config: {},
          },
        ],
      })
    );
    expect(battleLabel(fleets, true)).toBe('Guard vs 2C vs 2D');
  });
});

describe('battleUrl', () => {
  test('builds a full URL from the current location', () => {
    const url = battleUrl(battle());
    expect(url.startsWith(window.location.origin)).toBe(true);
    expect(url).toContain('?v=2&d.guardian=1&a.cruiser=2');
  });
});

describe('formatChatReport', () => {
  const results = exactResults({
    victoryProbability: { 'fleet-0': 0.218, 'fleet-1': 0.734 },
    drawProbability: 0.048,
    expectedSurvivors: {
      'fleet-0': {},
      'fleet-1': { Cruiser: 1.4 },
    },
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
