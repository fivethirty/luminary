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
    lastFleetStanding: Record<string, number>; // Fleet name -> percentage
    drawPercentage: number;
    expectedSurvivors: Record<string, Partial<Record<ShipType, number>>>; // Fleet -> ship type -> count
  } {
    const wins: Record<string, number> = {};
    const survivors: Record<string, Partial<Record<ShipType, number>>> = {};
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

        // Count survivors by type
        for (const ship of winner.getLivingShips()) {
          survivors[winner.name][ship.type] =
            (survivors[winner.name][ship.type] || 0) + 1;
        }
      }
    }

    const result: {
      lastFleetStanding: Record<string, number>;
      drawPercentage: number;
      expectedSurvivors: Record<string, Partial<Record<ShipType, number>>>;
    } = {
      lastFleetStanding: {},
      drawPercentage: draws / iterations,
      expectedSurvivors: {},
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
}
