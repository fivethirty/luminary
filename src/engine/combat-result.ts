import { ShipType } from './ship';

export type ShipCountByType = Partial<Record<ShipType, number>>;

/**
 * Enemy hulls destroyed in engagements involving each fleet. This is tracked
 * at engagement boundaries rather than per shot: every hull lost by one side
 * is credited to the opposing fleet in that engagement.
 */
export type DestroyedShipsCreditedToFleet = Record<string, ShipCountByType>;

type CombatSurvivorDistributionEntry = {
  probability: number;
  /** Fleet that retained the sector; null means no fleet remained. */
  lastFleetStanding?: string | null;
  /** Every living hull, including fleets that retreated from an engagement. */
  survivors: Record<string, ShipCountByType>;
  destroyedShipsCreditedToFleet?: DestroyedShipsCreditedToFleet;
  /**
   * Fleets removed from the sector alive (the stalemate retreat, or the sampled
   * round cap) by the only engagement they fought in this outcome. The Retreat
   * Penalty costs them the participation reputation draw; a fleet that fought
   * an earlier engagement keeps it.
   */
  retreatedFromOnlyBattle?: string[];
};

/** Outcome maps shared by exact, sampled, and interactively orchestrated runs. */
export type CombatOutcomeSummary = {
  lastFleetStanding: Record<string, number>;
  drawPercentage: number;
  expectedSurvivors: Record<string, ShipCountByType>;
  survivorDistribution: CombatSurvivorDistributionEntry[];
  timeTaken: number;
};
