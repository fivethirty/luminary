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

type Scenario = {
  name: string;
  groups: ShipGroup[];
  probeExactOptimal?: boolean;
};

type SolverProbe = {
  elapsedMillis: number;
  solve: SolveResult;
  graph: SolverGraphStats;
};

const scenarios: Scenario[] = [
  {
    name: 'interceptor + cruiser exact-optimal mirror',
    probeExactOptimal: true,
    groups: [
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
    ],
  },
  {
    name: '8 interceptors + 4 cruisers optimal mirror',
    groups: [
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
    ],
  },
  {
    name: '8 interceptors + 4 cruisers + 2 dreadnoughts optimal mirror',
    groups: [
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
      {
        type: ShipType.Dreadnought,
        count: 2,
        config: { initiative: 1, hull: 2, cannons: { plasma: 1 } },
      },
    ],
  },
];

const runs = Math.max(1, Number.parseInt(process.argv[2] ?? '3', 10) || 3);

for (const scenario of scenarios) {
  const samples: {
    elapsedMillis: number;
    result: CombatRunResult;
    solverProbe?: SolverProbe;
  }[] = [];
  for (let run = 0; run < runs; run++) {
    const roller = seededD6(0x5eed + run);
    const fleets = [
      new Fleet(
        'defender',
        buildShips(scenario.groups, roller),
        false,
        DamageType.OPTIMAL
      ),
      new Fleet(
        'attacker',
        buildShips(scenario.groups, roller),
        false,
        DamageType.OPTIMAL
      ),
    ];
    const startedAt = performance.now();
    const result = new CombatRunner().run(fleets);
    const elapsedMillis = performance.now() - startedAt;
    samples.push({
      elapsedMillis,
      result,
      solverProbe: scenario.probeExactOptimal
        ? runExactOptimalProbe(scenario.groups)
        : undefined,
    });
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
        defenderWin: summarize(
          results.map(
            ({ lastFleetStanding }) => lastFleetStanding.defender ?? 0
          ),
          4
        ),
        attackerWin: summarize(
          results.map(
            ({ lastFleetStanding }) => lastFleetStanding.attacker ?? 0
          ),
          4
        ),
        draw: summarize(
          results.map(({ drawPercentage }) => drawPercentage),
          4
        ),
      },
      scenarioInput: {
        shipTypesPerFleet: scenario.groups.length,
        shipsPerFleet: scenario.groups.reduce(
          (total, group) => total + group.count,
          0
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

function runExactOptimalProbe(groups: ShipGroup[]): SolverProbe {
  const startedAt = performance.now();
  const model = new BattleModel(
    buildShips(groups),
    buildShips(groups),
    false,
    false
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
          },
        ],
      ];
    })
  );
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
