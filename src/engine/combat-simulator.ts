import { BattleOutcome } from './battle';
import { Fleet } from './fleet';
import { ShipType } from './ship';
import { MultiBattle } from './multi-battle';
import { CombatOutcomeSummary } from './combat-result';

export interface SimulationStatistics {
  totalBattles: number;
  outcomeDistribution: Record<BattleOutcome, number>;
  averageSurvivors: number;
  winRateByFleetName: Record<string, number>;
}

export type CombatSimulationResult = CombatOutcomeSummary & {
  iterations: number;
};

export type CombatSimulationOptions = {
  // Absolute timestamp in the same clock domain as `now`. The simulator checks
  // periodically and returns the samples completed so far, allowing an exact
  // attempt and its Monte Carlo fallback to share one interactive deadline.
  deadline?: number;
  now?: () => number;
  deadlineCheckInterval?: number;
};

export class CombatSimulator {
  simulate(
    fleets: Fleet[],
    iterations: number,
    options: CombatSimulationOptions = {}
  ): CombatSimulationResult {
    const now = options.now ?? Date.now;
    const checkInterval = Math.max(1, options.deadlineCheckInterval ?? 1);
    const startTime = now();
    const wins: Record<string, number> = {};
    const survivors: Record<string, Partial<Record<ShipType, number>>> = {};
    const compositionCounts = new Map<
      string,
      {
        count: number;
        survivors: Record<string, Partial<Record<ShipType, number>>>;
      }
    >();
    let draws = 0;

    for (const fleet of fleets) {
      wins[fleet.name] = 0;
      survivors[fleet.name] = {};
    }

    let completedIterations = 0;
    for (let i = 0; i < iterations; i++) {
      if (
        i > 0 &&
        i % checkInterval === 0 &&
        options.deadline !== undefined &&
        now() >= options.deadline
      ) {
        break;
      }
      fleets.forEach((fleet) => fleet.reset());

      const multiBattle = new MultiBattle(fleets);
      multiBattle.run();
      const remaining = multiBattle.getRemainingFleets();

      if (remaining.length === 0) {
        draws++;
      } else if (remaining.length === 1) {
        const winner = remaining[0];
        wins[winner.name]++;

        for (const ship of winner.getLivingShips()) {
          survivors[winner.name][ship.type] =
            (survivors[winner.name][ship.type] || 0) + 1;
        }
      }

      const finalSurvivors = this.survivorsByFleet(fleets);
      const key = this.compositionKey(fleets, finalSurvivors);
      const existing = compositionCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        compositionCounts.set(key, {
          count: 1,
          survivors: finalSurvivors,
        });
      }
      completedIterations++;
    }

    const endTime = now();
    // A zero-iteration request is not useful to callers and would make every
    // percentage NaN. `iterations` is controlled by the runner/UI and is
    // expected to be positive, but keep the result numerically safe regardless.
    const denominator = Math.max(1, completedIterations);

    const result: CombatSimulationResult = {
      lastFleetStanding: {},
      drawPercentage: draws / denominator,
      expectedSurvivors: {},
      survivorDistribution: Array.from(compositionCounts.values())
        .map((entry) => ({
          probability: entry.count / denominator,
          survivors: entry.survivors,
        }))
        .sort((a, b) => b.probability - a.probability),
      timeTaken: endTime - startTime,
      iterations: completedIterations,
    };

    for (const fleet of fleets) {
      result.lastFleetStanding[fleet.name] = wins[fleet.name] / denominator;

      result.expectedSurvivors[fleet.name] = {};
      if (wins[fleet.name] > 0) {
        for (const [shipType, count] of Object.entries(survivors[fleet.name])) {
          result.expectedSurvivors[fleet.name][shipType as ShipType] =
            count / wins[fleet.name];
        }
      }
    }

    return result;
  }

  private survivorsByFleet(
    fleets: Fleet[]
  ): Record<string, Partial<Record<ShipType, number>>> {
    const survivors: Record<string, Partial<Record<ShipType, number>>> = {};
    for (const fleet of fleets) {
      const counts: Partial<Record<ShipType, number>> = {};
      for (const ship of fleet.getLivingShips()) {
        counts[ship.type] = (counts[ship.type] ?? 0) + 1;
      }
      survivors[fleet.name] = counts;
    }
    return survivors;
  }

  private compositionKey(
    fleets: Fleet[],
    survivors: Record<string, Partial<Record<ShipType, number>>>
  ): string {
    return fleets
      .map((fleet) => {
        const counts = survivors[fleet.name] ?? {};
        const shipCounts = Object.entries(counts)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([type, count]) => `${type}:${count}`)
          .join(',');
        return `${fleet.name}=${shipCounts}`;
      })
      .join('|');
  }
}
