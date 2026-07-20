import { ShipType } from './ship';

/** Outcome maps shared by exact, sampled, and interactively orchestrated runs. */
export type CombatOutcomeSummary = {
  lastFleetStanding: Record<string, number>;
  drawPercentage: number;
  expectedSurvivors: Record<string, Partial<Record<ShipType, number>>>;
  survivorDistribution: {
    probability: number;
    survivors: Record<string, Partial<Record<ShipType, number>>>;
  }[];
  timeTaken: number;
};
