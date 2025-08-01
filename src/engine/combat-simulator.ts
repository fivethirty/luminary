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
  /**
   * Run multiple gauntlets and collect statistics
   * Returns percentage of time each fleet is last standing and expected survivors
   */
  simulateGauntlet(
    fleets: Fleet[],
    iterations: number
  ): {
    lastFleetStanding: Record<string, number>; // Fleet name -> percentage
    drawPercentage: number;
    expectedSurvivors: Record<string, Partial<Record<ShipType, number>>>; // Fleet -> ship type -> count
  } {
    // Initialize tracking
    const wins: Record<string, number> = {};
    const survivors: Record<string, Partial<Record<ShipType, number>>> = {};
    let draws = 0;

    for (const fleet of fleets) {
      wins[fleet.name] = 0;
      survivors[fleet.name] = {};
    }

    // Run simulations
    for (let i = 0; i < iterations; i++) {
      // Reset all fleets
      fleets.forEach((fleet) => fleet.reset());

      // Run gauntlet to completion
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

    // Calculate final statistics
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
      for (const [shipType, count] of Object.entries(survivors[fleet.name])) {
        result.expectedSurvivors[fleet.name][shipType as ShipType] =
          count / iterations;
      }
    }

    return result;
  }
}
