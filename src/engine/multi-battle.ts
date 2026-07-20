import { Battle, BattleResult, BattleOutcome } from './battle';
import type {
  DestroyedShipsCreditedToFleet,
  ShipCountByType,
} from './combat-result';
import { Fleet } from './fleet';
import { ShipType } from './ship';

export class MultiBattle {
  private fleets: Fleet[];
  private readonly destroyedShipsCreditedToFleet: DestroyedShipsCreditedToFleet;

  constructor(fleets: Fleet[]) {
    if (fleets.length < 2) {
      throw new Error('MultiBattle requires at least 2 fleets');
    }
    this.fleets = [...fleets];
    this.destroyedShipsCreditedToFleet = {};
  }

  run(): BattleResult[] {
    const results: BattleResult[] = [];

    while (this.fleets.length > 1) {
      const lastIndex = this.fleets.length - 1;
      const secondLastIndex = this.fleets.length - 2;

      const attacker = this.fleets[lastIndex];
      const defender = this.fleets[secondLastIndex];
      const attackerBefore = livingShipCounts(attacker);
      const defenderBefore = livingShipCounts(defender);

      const battle = new Battle(attacker, defender);
      const result = battle.fight();
      results.push(result);

      addDestroyedShips(
        (this.destroyedShipsCreditedToFleet[attacker.name] ??= {}),
        defenderBefore,
        livingShipCounts(defender)
      );
      addDestroyedShips(
        (this.destroyedShipsCreditedToFleet[defender.name] ??= {}),
        attackerBefore,
        livingShipCounts(attacker)
      );

      switch (result.outcome) {
        case BattleOutcome.Attacker:
          this.fleets.splice(secondLastIndex, 1);
          break;
        case BattleOutcome.Defender:
          this.fleets.splice(lastIndex, 1);
          break;
        case BattleOutcome.Draw:
          this.fleets.splice(secondLastIndex, 2);
          break;
      }
    }

    return results;
  }

  getRemainingFleets(): Fleet[] {
    return [...this.fleets];
  }

  getDestroyedShipsCreditedToFleet(): DestroyedShipsCreditedToFleet {
    return Object.fromEntries(
      Object.entries(this.destroyedShipsCreditedToFleet).map(
        ([fleetName, counts]) => [fleetName, { ...counts }]
      )
    );
  }
}

function livingShipCounts(fleet: Fleet): ShipCountByType {
  const counts: ShipCountByType = {};
  for (const ship of fleet.getLivingShips()) {
    counts[ship.type] = (counts[ship.type] ?? 0) + 1;
  }
  return counts;
}

function addDestroyedShips(
  credited: ShipCountByType,
  before: ShipCountByType,
  after: ShipCountByType
): void {
  for (const shipType of Object.values(ShipType)) {
    const destroyed = (before[shipType] ?? 0) - (after[shipType] ?? 0);
    if (destroyed > 0) {
      credited[shipType] = (credited[shipType] ?? 0) + destroyed;
    }
  }
}
