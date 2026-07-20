/**
 * Opt-in interactive combat benchmark. This is intentionally not a unit test:
 * wall-clock assertions are machine-dependent. Run with:
 *
 *   bun run benchmark:combat -- [runs]
 */
import {
  CombatRunner,
  type CombatRunResult,
  type CombatTier,
} from '../src/engine/combat-runner';
import { Fleet } from '../src/engine/fleet';
import { Ship, ShipConfig, ShipType } from '../src/engine/ship';
import { BattleModel } from '../src/engine/battle-state';
import {
  WinProbabilitySolver,
  type SolveResult,
  type SolverGraphStats,
} from '../src/engine/win-probability-solver';
import { DamageType } from '../src/constants';

type ShipGroup = {
  type: ShipType;
  count: number;
  config: ShipConfig;
};

type FleetSpec = {
  id: string;
  groups: ShipGroup[];
  damageType?: DamageType;
  antimatterSplitter?: boolean;
};

type Scenario = {
  name: string;
  fleets: FleetSpec[];
  probeExactOptimal?: { defender: number; attacker: number };
};

type SolverProbe = {
  elapsedMillis: number;
  solve: SolveResult;
  graph: SolverGraphStats;
};

type BenchmarkSample = {
  elapsedMillis: number;
  result: CombatRunResult;
  solverProbe?: SolverProbe;
};

const interceptor = (initiative = 3): ShipGroup => ({
  type: ShipType.Interceptor,
  count: 1,
  config: { initiative, cannons: { ion: 1 } },
});

const smallMixedGroups: ShipGroup[] = [
  {
    type: ShipType.Interceptor,
    count: 1,
    config: { initiative: 3, cannons: { ion: 1 } },
  },
  {
    type: ShipType.Cruiser,
    count: 1,
    config: { initiative: 2, hull: 1, cannons: { ion: 1 } },
  },
];

const mediumMixedGroups: ShipGroup[] = [
  {
    type: ShipType.Interceptor,
    count: 8,
    config: { initiative: 3, cannons: { ion: 1 } },
  },
  {
    type: ShipType.Cruiser,
    count: 4,
    config: { initiative: 2, hull: 1, cannons: { ion: 1 } },
  },
];

const largeMixedGroups: ShipGroup[] = [
  ...mediumMixedGroups,
  {
    type: ShipType.Dreadnought,
    count: 2,
    config: { initiative: 1, hull: 2, cannons: { plasma: 1 } },
  },
];

const scenarios: Scenario[] = [
  mirrorScenario(
    'interceptor + cruiser exact-optimal mirror',
    smallMixedGroups,
    true
  ),
  mirrorScenario(
    '10 homogeneous interceptors exact-optimal mirror',
    [
      {
        type: ShipType.Interceptor,
        count: 10,
        config: { initiative: 3, cannons: { ion: 1 } },
      },
    ],
    true
  ),
  mirrorScenario(
    '3 interceptors + 1 cruiser state-local shortcut control',
    [
      {
        type: ShipType.Interceptor,
        count: 3,
        config: { initiative: 3, cannons: { ion: 1 } },
      },
      {
        type: ShipType.Cruiser,
        count: 1,
        config: { initiative: 2, hull: 1, cannons: { ion: 1 } },
      },
    ],
    true
  ),
  {
    name: '4 identical interceptor fleets engagement reuse',
    fleets: Array.from({ length: 4 }, (_, index) => ({
      id: `fleet-${index + 1}`,
      groups: [interceptor()],
    })),
  },
  {
    name: '3 identical mixed fleets engagement reuse',
    fleets: Array.from({ length: 3 }, (_, index) => ({
      id: `fleet-${index + 1}`,
      groups: [
        {
          type: ShipType.Interceptor,
          count: 2,
          config: { initiative: 3, cannons: { ion: 1 } },
        },
        {
          type: ShipType.Cruiser,
          count: 1,
          config: { initiative: 2, hull: 1, cannons: { ion: 1 } },
        },
      ],
    })),
  },
  {
    name: '4 interceptor fleets with equivalent resolved initiative order',
    fleets: [5, 4, 3, 3].map((initiative, index) => ({
      id: `fleet-${index + 1}`,
      groups: [interceptor(initiative)],
    })),
  },
  {
    name: '4 interceptor fleets with two resolved initiative orders',
    fleets: [1, 2, 3, 3].map((initiative, index) => ({
      id: `fleet-${index + 1}`,
      groups: [interceptor(initiative)],
    })),
  },
  {
    name: 'missile cruiser vs interceptor swarm',
    probeExactOptimal: { defender: 0, attacker: 1 },
    fleets: [
      {
        id: 'defender',
        groups: [
          {
            type: ShipType.Interceptor,
            count: 3,
            config: { initiative: 3, cannons: { ion: 1 } },
          },
        ],
      },
      {
        id: 'attacker',
        groups: [
          {
            type: ShipType.Cruiser,
            count: 1,
            config: {
              initiative: 2,
              hull: 1,
              computers: 2,
              cannons: { ion: 1 },
              missiles: { plasma: 2 },
            },
          },
        ],
      },
    ],
  },
  {
    name: 'healing plasma cruiser duel',
    probeExactOptimal: { defender: 0, attacker: 1 },
    fleets: ['defender', 'attacker'].map((id) => ({
      id,
      groups: [
        {
          type: ShipType.Cruiser,
          count: 1,
          config: {
            initiative: 2,
            hull: 1,
            heal: 1,
            cannons: { plasma: 1 },
          },
        },
      ],
    })),
  },
  mirrorScenario(
    '8 interceptors + 4 cruisers optimal mirror',
    mediumMixedGroups
  ),
  mirrorScenario(
    '8 interceptors + 4 cruisers + 2 dreadnoughts optimal mirror',
    largeMixedGroups
  ),
];

function mirrorScenario(
  name: string,
  groups: ShipGroup[],
  probeExactOptimal = false
): Scenario {
  return {
    name,
    fleets: [
      {
        id: 'defender',
        groups,
      },
      {
        id: 'attacker',
        groups,
      },
    ],
    probeExactOptimal: probeExactOptimal
      ? { defender: 0, attacker: 1 }
      : undefined,
  };
}

const runs = Math.max(1, Number.parseInt(process.argv[2] ?? '3', 10) || 3);

for (const scenario of scenarios) {
  // Warm the scenario without including it in the reported samples.
  runScenario(scenario, 0x5eed - 1);
  const samples: BenchmarkSample[] = [];
  for (let run = 0; run < runs; run++) {
    samples.push(runScenario(scenario, 0x5eed + run));
  }

  const results = samples.map(({ result }) => result);
  const preflight = results[0].diagnostics.preflight;
  console.log(
    JSON.stringify({
      scenario: scenario.name,
      runs,
      timingMillis: summarize(
        samples.map(({ elapsedMillis }) => elapsedMillis),
        1
      ),
      runTiers: results.map(({ tier }) => tier),
      tierCounts: countValues(results.map(({ tier }) => tier)),
      iterations: summarize(
        results.flatMap(({ iterations }) =>
          iterations === undefined ? [] : [iterations]
        ),
        0
      ),
      outcome: {
        fleetWin: Object.fromEntries(
          scenario.fleets.map(({ id }) => [
            id,
            summarize(
              results.map(
                ({ lastFleetStanding }) => lastFleetStanding[id] ?? 0
              ),
              4
            ),
          ])
        ),
        draw: summarize(
          results.map(({ drawPercentage }) => drawPercentage),
          4
        ),
      },
      scenarioInput: {
        shipTypesPerFleet: scenario.fleets.map(({ groups }) => groups.length),
        shipsPerFleet: scenario.fleets.map(({ groups }) =>
          groups.reduce((total, group) => total + group.count, 0)
        ),
        preflightStateEstimate: preflight.estimatedStates,
        preflightReason: preflight.reason,
      },
      solverProbe: summarizeSolverProbes(
        samples.flatMap(({ solverProbe }) =>
          solverProbe === undefined ? [] : [solverProbe]
        )
      ),
      deadlineExceededRuns: results.filter(
        ({ diagnostics }) => diagnostics.deadlineExceeded
      ).length,
      attempts: aggregateAttempts(results),
    })
  );
}

function runScenario(scenario: Scenario, seed: number): BenchmarkSample {
  const roller = seededD6(seed);
  const fleets = scenario.fleets.map(
    ({ id, groups, antimatterSplitter = false, damageType }) =>
      new Fleet(
        id,
        buildShips(groups, roller),
        antimatterSplitter,
        damageType ?? DamageType.OPTIMAL
      )
  );
  const startedAt = performance.now();
  const result = new CombatRunner().run(fleets);
  const elapsedMillis = performance.now() - startedAt;
  return {
    elapsedMillis,
    result,
    solverProbe: scenario.probeExactOptimal
      ? runExactOptimalProbe(
          scenario.fleets[scenario.probeExactOptimal.defender],
          scenario.fleets[scenario.probeExactOptimal.attacker]
        )
      : undefined,
  };
}

function seededD6(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return (state % 6) + 1;
  };
}

function buildShips(groups: ShipGroup[], roller?: () => number): Ship[] {
  return groups.flatMap(({ type, count, config }) =>
    Array.from({ length: count }, () => new Ship(type, config, roller))
  );
}

function runExactOptimalProbe(
  defender: FleetSpec,
  attacker: FleetSpec
): SolverProbe {
  const startedAt = performance.now();
  const model = new BattleModel(
    buildShips(attacker.groups),
    buildShips(defender.groups),
    attacker.antimatterSplitter ?? false,
    defender.antimatterSplitter ?? false
  );
  const solver = new WinProbabilitySolver(model, {
    perspective: 'A',
    assignments: 'minimax',
  });
  const solve = solver.solve();
  return {
    elapsedMillis: performance.now() - startedAt,
    solve,
    graph: solver.getGraphStats(),
  };
}

function summarizeSolverProbes(probes: SolverProbe[]) {
  if (probes.length === 0) return undefined;
  const first = probes[0];
  const workSignature = ({ solve, graph }: SolverProbe) =>
    JSON.stringify({
      ok: solve.ok,
      states: solve.states,
      sweeps: solve.sweeps,
      reason: solve.reason,
      graph,
    });
  return {
    timingMillis: summarize(
      probes.map(({ elapsedMillis }) => elapsedMillis),
      1
    ),
    solve: {
      ok: first.solve.ok,
      attackerWinProbability: round(first.solve.winProbability, 6),
      states: first.solve.states,
      sweeps: first.solve.sweeps,
      reason: first.solve.reason,
    },
    graph: first.graph,
    workCountersConsistent: probes.every(
      (probe) => workSignature(probe) === workSignature(first)
    ),
  };
}

function summarize(values: number[], digits: number) {
  if (values.length === 0) return undefined;
  const sorted = values.slice().sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
      : sorted[midpoint];
  return {
    median: round(median, digits),
    min: round(sorted[0], digits),
    max: round(sorted.at(-1)!, digits),
  };
}

function countValues(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function aggregateAttempts(results: CombatRunResult[]) {
  const tiers: CombatTier[] = ['exact-optimal', 'exact-dps', 'monte-carlo-dps'];
  return Object.fromEntries(
    tiers.flatMap((tier) => {
      const attempts = results.flatMap(({ diagnostics }) =>
        diagnostics.attempts.filter((attempt) => attempt.tier === tier)
      );
      if (attempts.length === 0) return [];
      return [
        [
          tier,
          {
            statuses: countValues(attempts.map(({ status }) => status)),
            elapsedMillis: summarize(
              attempts.map(({ elapsedMillis }) => elapsedMillis),
              1
            ),
            reasons: countValues(
              attempts.flatMap(({ reason }) => (reason ? [reason] : []))
            ),
            exactEngagements: summarizeExactEngagements(
              attempts.flatMap(({ exactDiagnostics }) =>
                exactDiagnostics === undefined ? [] : [exactDiagnostics]
              )
            ),
          },
        ],
      ];
    })
  );
}

function summarizeExactEngagements(
  diagnostics: Array<{
    engagementRequests: number;
    engagementSolves: number;
    engagementCacheHits: number;
  }>
) {
  if (diagnostics.length === 0) return undefined;
  return {
    requests: summarize(
      diagnostics.map(({ engagementRequests }) => engagementRequests),
      0
    ),
    solves: summarize(
      diagnostics.map(({ engagementSolves }) => engagementSolves),
      0
    ),
    cacheHits: summarize(
      diagnostics.map(({ engagementCacheHits }) => engagementCacheHits),
      0
    ),
  };
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
