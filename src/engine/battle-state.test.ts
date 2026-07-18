import { describe, expect, test } from 'bun:test';
import { Ship, ShipType } from './ship';
import {
  BattleModel,
  ExpandContext,
  Successor,
  WorkingState,
} from './battle-state';

const CTX: ExpandContext = {
  optimal: false,
  maxOutcomes: 100_000,
};

function edgeProbSum(model: BattleModel, state: WorkingState): number {
  const exp = model.expand(state, CTX);
  if (exp.kind !== 'move') throw new Error('not a move');
  return exp.edges.reduce((s, e) => s + e.prob, 0);
}

describe('BattleModel', () => {
  describe('schedule', () => {
    test('defender before attacker on an initiative tie', () => {
      const model = new BattleModel(
        [
          new Ship(ShipType.Interceptor, {
            initiative: 3,
            cannons: { ion: 1 },
          }),
        ],
        [
          new Ship(ShipType.Interceptor, {
            initiative: 3,
            cannons: { ion: 1 },
          }),
        ],
        false,
        false
      );
      expect(model.schedule).toEqual([
        { role: 'D', initiative: 3, missile: false },
        { role: 'A', initiative: 3, missile: false },
      ]);
    });

    test('missiles first, then cannons, initiative descending', () => {
      const model = new BattleModel(
        [
          new Ship(ShipType.Interceptor, {
            initiative: 3,
            missiles: { plasma: 1 },
            cannons: { ion: 1 },
          }),
        ],
        [
          new Ship(ShipType.Cruiser, {
            initiative: 2,
            missiles: { plasma: 1 },
            cannons: { ion: 1 },
          }),
        ],
        false,
        false
      );
      expect(model.schedule).toEqual([
        { role: 'A', initiative: 3, missile: true },
        { role: 'D', initiative: 2, missile: true },
        { role: 'A', initiative: 3, missile: false },
        { role: 'D', initiative: 2, missile: false },
      ]);
    });

    test('a fleet without missiles contributes no missile slots', () => {
      const model = new BattleModel(
        [
          new Ship(ShipType.Interceptor, {
            initiative: 3,
            cannons: { ion: 1 },
          }),
        ],
        [
          new Ship(ShipType.Cruiser, {
            initiative: 1,
            missiles: { ion: 1 },
            cannons: { ion: 1 },
          }),
        ],
        false,
        false
      );
      expect(model.schedule).toEqual([
        { role: 'D', initiative: 1, missile: true },
        { role: 'A', initiative: 3, missile: false },
        { role: 'D', initiative: 1, missile: false },
      ]);
    });
  });

  describe('canonicalKey', () => {
    test('identical ships collapse regardless of HP ordering', () => {
      const model = new BattleModel(
        [
          new Ship(ShipType.Interceptor, { hull: 1, cannons: { ion: 1 } }),
          new Ship(ShipType.Interceptor, { hull: 1, cannons: { ion: 1 } }),
        ],
        [new Ship(ShipType.Interceptor)],
        false,
        false
      );
      const a = model.canonicalKey({ hpA: [2, 1], hpB: [1], slot: 0 });
      const b = model.canonicalKey({ hpA: [1, 2], hpB: [1], slot: 0 });
      expect(a).toBe(b);
    });

    test('differs on HP, slot, or roster', () => {
      const model = new BattleModel(
        [new Ship(ShipType.Interceptor, { hull: 1 })],
        [new Ship(ShipType.Interceptor, { hull: 1 })],
        false,
        false
      );
      const base = model.canonicalKey({ hpA: [2], hpB: [2], slot: 0 });
      expect(model.canonicalKey({ hpA: [1], hpB: [2], slot: 0 })).not.toBe(
        base
      );
      expect(model.canonicalKey({ hpA: [2], hpB: [2], slot: 1 })).not.toBe(
        base
      );
    });
  });

  describe('expand', () => {
    test('a fleet with no living shooters advances deterministically', () => {
      // Defender has no cannons; its slot fires nothing.
      const model = new BattleModel(
        [
          new Ship(ShipType.Interceptor, {
            initiative: 3,
            cannons: { ion: 1 },
          }),
        ],
        [new Ship(ShipType.Interceptor, { initiative: 3 })],
        false,
        false
      );
      const exp = model.expand(model.initialState(), CTX);
      expect(exp.kind).toBe('move');
      if (exp.kind !== 'move') return;
      expect(exp.decisionRole).toBeNull();
      expect(exp.edges).toHaveLength(1);
      expect(exp.edges[0].prob).toBe(1);
      const opt = exp.edges[0].options[0];
      expect('state' in opt && opt.state.slot).toBe(1); // advanced to attacker's slot
    });

    test('optimal mode exposes decisions for both player fleets', () => {
      const make = () =>
        new Ship(ShipType.Interceptor, {
          initiative: 3,
          cannons: { ion: 1 },
        });
      const model = new BattleModel([make()], [make()], false, false);
      const ctx: ExpandContext = {
        optimal: true,
        maxOutcomes: 100_000,
      };

      const defenderMove = model.expand(model.initialState(), ctx);
      expect(defenderMove.kind).toBe('move');
      if (defenderMove.kind !== 'move') return;
      expect(defenderMove.decisionRole).toBe('D');

      const attackerMove = model.expand({ hpA: [1], hpB: [1], slot: 1 }, ctx);
      expect(attackerMove.kind).toBe('move');
      if (attackerMove.kind !== 'move') return;
      expect(attackerMove.decisionRole).toBe('A');
    });

    test('a single ion die vs a 1-HP enemy: 1/6 kill, 5/6 continue', () => {
      const model = new BattleModel(
        [
          new Ship(ShipType.Interceptor, {
            initiative: 3,
            cannons: { ion: 1 },
          }),
        ],
        [new Ship(ShipType.Interceptor, { initiative: 3 })],
        false,
        false
      );
      // Advance to the attacker's slot (slot 1).
      const atAttacker: WorkingState = { hpA: [1], hpB: [1], slot: 1 };
      const exp = model.expand(atAttacker, CTX);
      expect(exp.kind).toBe('move');
      if (exp.kind !== 'move') return;
      expect(exp.edges.reduce((s, e) => s + e.prob, 0)).toBeCloseTo(1, 12);

      const terminalEdge = exp.edges.find((e) =>
        e.options.some((o) => 'terminal' in o)
      )!;
      expect(terminalEdge.prob).toBeCloseTo(1 / 6, 12);
      const terminalOpt = terminalEdge.options[0] as { terminal: string };
      expect(terminalOpt.terminal).toBe('AttackerWins');

      // The miss branch (5/6) loops back to the top of the cannon cycle.
      const missEdge = exp.edges.find((e) => e.prob > 0.5)!;
      expect(missEdge.prob).toBeCloseTo(5 / 6, 12);
      const loop = missEdge.options[0] as { state: WorkingState };
      expect(loop.state.slot).toBe(0);
    });

    test('edges always sum to probability 1', () => {
      const model = new BattleModel(
        [
          new Ship(ShipType.Cruiser, {
            initiative: 2,
            computers: 1,
            cannons: { plasma: 2 },
          }),
        ],
        [
          new Ship(ShipType.Interceptor, {
            initiative: 1,
            shields: 1,
            hull: 1,
          }),
        ],
        false,
        false
      );
      // Attacker slot is first (initiative 2 > 1).
      expect(edgeProbSum(model, model.initialState())).toBeCloseTo(1, 12);
    });

    test('mutual no-cannons after a full cycle is a defender win', () => {
      // Neither fleet has cannons: the round wraps into a stalemate.
      const model = new BattleModel(
        [new Ship(ShipType.Interceptor, { initiative: 3 })],
        [new Ship(ShipType.Interceptor, { initiative: 2 })],
        false,
        false
      );
      // Walk both no-op slots; the last-slot advance must terminate DefenderWins.
      let state: WorkingState | null = model.initialState();
      const seenTerminals: string[] = [];
      for (let i = 0; i < 5 && state; i++) {
        const exp = model.expand(state, CTX);
        if (exp.kind !== 'move') break;
        const opt: Successor = exp.edges[0].options[0];
        if ('terminal' in opt) {
          seenTerminals.push(opt.terminal);
          break;
        }
        state = opt.state;
      }
      expect(seenTerminals).toContain('DefenderWins');
    });
  });
});
