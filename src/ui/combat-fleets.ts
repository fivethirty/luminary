import { Fleet } from '@calc/fleet';
import { Ship, type ShipConfig, type ShipType } from '@calc/ship';
import type { FleetState, PlannerType } from '@ui/state';
import { cloneShipConfig } from '@ui/ship-config';
import { DamageType } from 'src/constants';

const PLANNER_TYPE_TO_DAMAGE_TYPE: Record<PlannerType, DamageType> = {
  npc: DamageType.NPC,
  dps: DamageType.DPS,
  optimal: DamageType.OPTIMAL,
};

export interface CombatFleetInput {
  id: string;
  antimatterSplitter: boolean;
  plannerType: PlannerType;
  shipTypes: Array<{
    type: ShipType;
    quantity: number;
    config: Partial<ShipConfig>;
  }>;
}

export function snapshotCombatFleets(
  fleets: readonly FleetState[]
): CombatFleetInput[] {
  return fleets.map((fleet) => ({
    id: fleet.id,
    antimatterSplitter: fleet.antimatterSplitter,
    plannerType: fleet.plannerType,
    shipTypes: fleet.shipTypes.map((shipType) => ({
      type: shipType.type,
      quantity: shipType.quantity,
      config: cloneShipConfig(shipType.config),
    })),
  }));
}

export function buildEngineFleets(
  fleetInputs: readonly CombatFleetInput[]
): Fleet[] {
  return fleetInputs.flatMap((fleet) => {
    const ships = fleet.shipTypes.flatMap((shipType) =>
      Array.from(
        { length: shipType.quantity },
        () => new Ship(shipType.type, shipType.config)
      )
    );

    if (ships.length === 0) return [];

    return [
      new Fleet(
        fleet.id,
        ships,
        fleet.antimatterSplitter,
        PLANNER_TYPE_TO_DAMAGE_TYPE[fleet.plannerType]
      ),
    ];
  });
}
