import { BattleOutcome } from './battle';
import { Fleet } from './fleet';
import { ShipType } from './ship';
import { MultiBattle } from './multi-battle';

export interface SimulationStatistics {
  totalBattles: number;
  outcomeDistribution: Record<BattleOutcome, number>;
  averageSurvivors: number;
  winRateByFleetName: Record<string, number>;
}

export class CombatSimulator {
  simulate(
    fleets: Fleet[],
    iterations: number
  ): {
    lastFleetStanding: Record<string, number>;
    drawPercentage: number;
    expectedSurvivors: Record<string, Partial<Record<ShipType, number>>>;
    survivorDistribution: {
      probability: number;
      survivors: Record<string, Partial<Record<ShipType, number>>>;
    }[];
    timeTaken: number;
  } {
    const startTime = Date.now();
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

    for (let i = 0; i < iterations; i++) {
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
    }

    const endTime = Date.now();

    const result: {
      lastFleetStanding: Record<string, number>;
      drawPercentage: number;
      expectedSurvivors: Record<string, Partial<Record<ShipType, number>>>;
      survivorDistribution: {
        probability: number;
        survivors: Record<string, Partial<Record<ShipType, number>>>;
      }[];
      timeTaken: number;
    } = {
      lastFleetStanding: {},
      drawPercentage: draws / iterations,
      expectedSurvivors: {},
      survivorDistribution: Array.from(compositionCounts.values())
        .map((entry) => ({
          probability: entry.count / iterations,
          survivors: entry.survivors,
        }))
        .sort((a, b) => b.probability - a.probability),
      timeTaken: endTime - startTime,
    };

    for (const fleet of fleets) {
      result.lastFleetStanding[fleet.name] = wins[fleet.name] / iterations;

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
