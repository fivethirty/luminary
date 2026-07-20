import { ShipType } from './ship';

export type ShipCountByType = Partial<Record<ShipType, number>>;

/**
 * Enemy hulls destroyed in engagements involving each fleet. This is tracked
 * at engagement boundaries rather than per shot: every hull lost by one side
 * is credited to the opposing fleet in that engagement.
 */
export type DestroyedShipsCreditedToFleet = Record<string, ShipCountByType>;

export type CombatSurvivorDistributionEntry = {
  probability: number;
  /** Fleet that retained the sector; null means no fleet remained. */
  lastFleetStanding?: string | null;
  /** Every living hull, including fleets that retreated from an engagement. */
  survivors: Record<string, ShipCountByType>;
  destroyedShipsCreditedToFleet?: DestroyedShipsCreditedToFleet;
};

/** Outcome maps shared by exact, sampled, and interactively orchestrated runs. */
export type CombatOutcomeSummary = {
  lastFleetStanding: Record<string, number>;
  drawPercentage: number;
  expectedSurvivors: Record<string, ShipCountByType>;
  survivorDistribution: CombatSurvivorDistributionEntry[];
  timeTaken: number;
};
