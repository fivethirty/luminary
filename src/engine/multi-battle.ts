import { Battle, BattleResult, BattleOutcome } from './battle';
import { Fleet } from './fleet';

export class MultiBattle {
  private fleets: Fleet[];

  constructor(fleets: Fleet[]) {
    if (fleets.length < 2) {
      throw new Error('MultiBattle requires at least 2 fleets');
    }
    this.fleets = [...fleets];
  }

  run(): BattleResult[] {
    const results: BattleResult[] = [];

    while (this.fleets.length > 1) {
      const attacker = this.fleets[0];
      const defender = this.fleets[1];

      const battle = new Battle(attacker, defender);
      const result = battle.fight();
      results.push(result);

      switch (result.outcome) {
        case BattleOutcome.Attacker:
          this.fleets.splice(1, 1);
          break;
        case BattleOutcome.Defender:
          this.fleets.splice(0, 1);
          break;
        case BattleOutcome.Draw:
          this.fleets.splice(0, 2);
          break;
      }
    }

    return results;
  }

  getRemainingFleets(): Fleet[] {
    return [...this.fleets];
  }
}
