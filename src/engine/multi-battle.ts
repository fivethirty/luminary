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
      const lastIndex = this.fleets.length - 1;
      const secondLastIndex = this.fleets.length - 2;

      const attacker = this.fleets[lastIndex];
      const defender = this.fleets[secondLastIndex];

      const battle = new Battle(attacker, defender);
      const result = battle.fight();
      results.push(result);

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
}
