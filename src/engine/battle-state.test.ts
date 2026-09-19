import { describe, expect, test } from 'bun:test';
import { Ship, ShipType } from './ship';
import { DamageType } from 'src/constants';
import {
  BattleModel,
  ExpandContext,
  Successor,
  WorkingState,
} from './battle-state';

const CTX: ExpandContext = {
  decisionRoles: [],
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
    test('checks the shared deadline around expensive dice enumeration', () => {
      const make = () =>
        new Ship(ShipType.Interceptor, {
          initiative: 3,
          cannons: { ion: 4 },
        });
      const model = new BattleModel([make()], [make()], false, false);
      let deadlineChecks = 0;

      const exp = model.expand(model.initialState(), {
        decisionRoles: [],
        maxOutcomes: 100_000,
        deadlineExceeded: () => ++deadlineChecks >= 2,
      });

      expect(exp).toEqual({
        kind: 'fail',
        reason: 'time budget exceeded',
      });
      expect(deadlineChecks).toBe(2);
    });

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
      const make = () => [
        new Ship(ShipType.Interceptor, {
          initiative: 3,
          cannons: { ion: 1 },
        }),
        new Ship(ShipType.Cruiser, {
          initiative: 3,
          hull: 1,
          cannons: { ion: 1 },
        }),
      ];
      const model = new BattleModel(make(), make(), false, false);
      const ctx: ExpandContext = {
        decisionRoles: ['A', 'D'],
        maxOutcomes: 100_000,
      };

      const defenderMove = model.expand(model.initialState(), ctx);
      expect(defenderMove.kind).toBe('move');
      if (defenderMove.kind !== 'move') return;
      expect(defenderMove.decisionRole).toBe('D');

      const attackerMove = model.expand(
        { hpA: [1, 2], hpB: [1, 2], slot: 1 },
        ctx
      );
      expect(attackerMove.kind).toBe('move');
      if (attackerMove.kind !== 'move') return;
      expect(attackerMove.decisionRole).toBe('A');
    });

    test('decision roles leave unselected player fleets on DPS policy', () => {
      const make = () => [
        new Ship(ShipType.Interceptor, {
          initiative: 3,
          cannons: { ion: 1 },
        }),
        new Ship(ShipType.Cruiser, {
          initiative: 3,
          hull: 1,
          cannons: { ion: 1 },
        }),
      ];
      const model = new BattleModel(make(), make(), false, false);
      const ctx: ExpandContext = {
        decisionRoles: ['A'],
        maxOutcomes: 100_000,
      };

      const defenderMove = model.expand(model.initialState(), ctx);
      expect(defenderMove.kind).toBe('move');
      if (defenderMove.kind !== 'move') return;
      expect(defenderMove.decisionRole).toBeNull();

      const attackerMove = model.expand(
        { hpA: [1, 2], hpB: [1, 2], slot: 1 },
        ctx
      );
      expect(attackerMove.kind).toBe('move');
      if (attackerMove.kind !== 'move') return;
      expect(attackerMove.decisionRole).toBe('A');
    });

    test('player fleets can use deterministic NPC targeting', () => {
      const attacker = () => [
        new Ship(ShipType.Interceptor, {
          initiative: 3,
          cannons: { ion: 1 },
        }),
      ];
      const defender = () => [
        new Ship(ShipType.Dreadnought, { initiative: 1, hull: 3 }),
        new Ship(ShipType.Interceptor, {
          initiative: 1,
          hull: 3,
          cannons: { antimatter: 1 },
        }),
      ];
      const damagedHp = (damageType: DamageType) => {
        const model = new BattleModel(
          attacker(),
          defender(),
          false,
          false,
          damageType,
          DamageType.DPS
        );
        const expansion = model.expand(model.initialState(), CTX);
        expect(expansion.kind).toBe('move');
        if (expansion.kind !== 'move') return [];
        const hit = expansion.edges
          .flatMap((edge) => edge.options)
          .find(
            (option) =>
              'state' in option &&
              option.state.hpB.reduce((sum, hp) => sum + hp, 0) === 7
          );
        return hit && 'state' in hit ? hit.state.hpB : [];
      };

      expect(damagedHp(DamageType.NPC)).toEqual([3, 4]);
      expect(damagedHp(DamageType.DPS)).toEqual([4, 3]);
    });

    test('optimal mode uses deterministic DPS concentration against one living configuration', () => {
      const target = () =>
        new Ship(ShipType.Interceptor, {
          initiative: 2,
          hull: 1,
          cannons: { ion: 1 },
        });
      const model = new BattleModel(
        [target(), target()],
        [
          new Ship(ShipType.Cruiser, {
            initiative: 3,
            cannons: { ion: 2 },
          }),
        ],
        false,
        false
      );

      const exp = model.expand(model.initialState(), {
        decisionRoles: ['D'],
        maxOutcomes: 100_000,
      });

      expect(exp.kind).toBe('move');
      if (exp.kind !== 'move') return;
      expect(exp.decisionRole).toBeNull();
      expect(exp.edges.every((edge) => edge.options.length === 1)).toBe(true);
    });

    test('minimax mode keeps NPC assignments deterministic', () => {
      const model = new BattleModel(
        [
          new Ship(ShipType.Interceptor, {
            initiative: 2,
            cannons: { ion: 1 },
          }),
        ],
        [
          new Ship(ShipType.Ancient, {
            initiative: 3,
            cannons: { ion: 1 },
          }),
        ],
        false,
        false
      );
      const exp = model.expand(model.initialState(), {
        decisionRoles: ['A', 'D'],
        maxOutcomes: 100_000,
      });
      expect(exp.kind).toBe('move');
      if (exp.kind !== 'move') return;
      expect(exp.decisionRole).toBeNull();
      expect(exp.edges.every((edge) => edge.options.length === 1)).toBe(true);
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

      // The miss branch (5/6) wraps the cannon cycle. The defender's slot 0
      // has no dice (its ship is unarmed), so that pass-through is skipped and
      // the successor is the attacker's slot again.
      const missEdge = exp.edges.find((e) => e.prob > 0.5)!;
      expect(missEdge.prob).toBeCloseTo(5 / 6, 12);
      const loop = missEdge.options[0] as { state: WorkingState };
      expect(loop.state.slot).toBe(1);
    });

    test('dice-less slots are skipped exactly, including across the wrap', () => {
      // Schedule: A@3 (ion), D@2 (unarmed cruiser), D@1 (ion interceptor).
      const model = new BattleModel(
        [
          new Ship(ShipType.Interceptor, {
            initiative: 3,
            cannons: { ion: 1 },
          }),
        ],
        [
          new Ship(ShipType.Cruiser, { initiative: 2, hull: 1 }),
          new Ship(ShipType.Interceptor, {
            initiative: 1,
            cannons: { ion: 1 },
          }),
        ],
        false,
        false
      );
      expect(model.schedule.map((s) => `${s.role}${s.initiative}`)).toEqual([
        'A3',
        'D2',
        'D1',
      ]);

      // Attacker misses: D2 has no dice, so the successor is D1 directly.
      const exp = model.expand({ hpA: [1], hpB: [2, 1], slot: 0 }, CTX);
      expect(exp.kind).toBe('move');
      if (exp.kind !== 'move') return;
      const miss = exp.edges.find((e) => e.prob > 0.5)!;
      expect(miss.options[0]).toEqual({
        state: { hpA: [1], hpB: [2, 1], slot: 2 },
      });

      // With the armed defender dead, D2 and D1 are both dice-less: the walk
      // wraps (stalemate does not fire, the attacker still has a cannon) and
      // returns to A3.
      const late = model.expand({ hpA: [1], hpB: [2, 0], slot: 0 }, CTX);
      expect(late.kind).toBe('move');
      if (late.kind !== 'move') return;
      const lateMiss = late.edges.find((e) => e.prob > 0.5)!;
      expect(lateMiss.options[0]).toEqual({
        state: { hpA: [1], hpB: [2, 0], slot: 0 },
      });

      // A dice-less state resolves to the same stored successor.
      expect(
        model.resolvePassThrough({ hpA: [1], hpB: [2, 0], slot: 1 })
      ).toEqual({
        state: { hpA: [1], hpB: [2, 0], slot: 0 },
      });
      expect(
        model.resolvePassThrough({ hpA: [1], hpB: [2, 1], slot: 2 })
      ).toEqual({
        state: { hpA: [1], hpB: [2, 1], slot: 2 },
      });
    });

    test('a walk with no living cannons on either side ends in stalemate', () => {
      const model = new BattleModel(
        [new Ship(ShipType.Interceptor, { initiative: 3, hull: 1 })],
        [new Ship(ShipType.Interceptor, { initiative: 2, hull: 1 })],
        false,
        false
      );
      expect(model.resolvePassThrough({ hpA: [2], hpB: [2], slot: 0 })).toEqual(
        {
          terminal: 'DefenderWins',
          hpA: [2],
          hpB: [2],
        }
      );
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
  describe('damage type selection', () => {
    test('inherent NPC rosters use NPC targeting whatever the caller selects', () => {
      // Two ancients (NPC hulls) face a mixed player fleet. Optimal or DPS
      // selected for the ancients must not create defender decisions or
      // change their targeting; the player side keeps its selection.
      const ancients = () => [
        new Ship(ShipType.Ancient, {
          initiative: 2,
          hull: 1,
          computers: 1,
          cannons: { ion: 2 },
        }),
        new Ship(ShipType.Ancient, {
          initiative: 2,
          hull: 1,
          computers: 1,
          cannons: { ion: 2 },
        }),
      ];
      const players = () => [
        new Ship(ShipType.Interceptor, { initiative: 3, cannons: { ion: 1 } }),
        new Ship(ShipType.Cruiser, {
          initiative: 2,
          hull: 1,
          computers: 1,
          cannons: { ion: 1 },
        }),
      ];
      const expandAll = (model: BattleModel): string => {
        const ctx: ExpandContext = {
          decisionRoles: ['A', 'D'],
          maxOutcomes: 100_000,
        };
        const initial = model.initialState();
        return JSON.stringify(
          model.schedule.map((_, slot) =>
            model.expand({ hpA: initial.hpA, hpB: initial.hpB, slot }, ctx)
          )
        );
      };
      const inferred = new BattleModel(players(), ancients(), false, false);
      for (const selected of [DamageType.OPTIMAL, DamageType.DPS]) {
        const overridden = new BattleModel(
          players(),
          ancients(),
          false,
          false,
          DamageType.OPTIMAL,
          selected
        );
        expect(expandAll(overridden)).toBe(expandAll(inferred));
        // The ancients' targets are heterogeneous, so a DPS or optimal
        // selection that took effect would make their slot a decision node.
        const defenderSlot = overridden.findSlot('D', 2, false);
        expect(defenderSlot).toBeGreaterThanOrEqual(0);
        const defenderExp = overridden.expand(
          { ...overridden.initialState(), slot: defenderSlot },
          { decisionRoles: ['A', 'D'], maxOutcomes: 100_000 }
        );
        expect(defenderExp.kind).toBe('move');
        if (defenderExp.kind !== 'move') return;
        expect(defenderExp.decisionRole).toBeNull();
      }
    });
  });

  describe('heuristic assignment memo', () => {
    // A warmed model must reproduce what a fresh model computes for a raw
    // roster layout it has never seen. On the canonical-code path the
    // transition template hands out representative HP vectors, so successors
    // are compared canonically; on the raw-key path (a planner ordering that
    // can tie ships of different configurations) templates are disabled and
    // the raw vectors must match exactly.
    type MemoContexts = Map<string, { groupOrderFree: boolean }>;
    const memoContexts = (model: BattleModel): MemoContexts =>
      (model as unknown as { heuristicContexts: MemoContexts })
        .heuristicContexts;
    const expandJson = (model: BattleModel, state: WorkingState): string =>
      JSON.stringify(model.expand(state, CTX));
    const canonicalExpansion = (
      model: BattleModel,
      state: WorkingState
    ): string => {
      const exp = model.expand(state, CTX);
      if (exp.kind !== 'move') return JSON.stringify(exp);
      return JSON.stringify({
        decisionRole: exp.decisionRole,
        edges: exp.edges.map((edge) => ({
          prob: edge.prob,
          options: edge.options.map((option) =>
            'terminal' in option
              ? `${option.terminal}:${model.canonicalKey({ hpA: option.hpA, hpB: option.hpB, slot: 0 })}`
              : model.canonicalKey(option.state)
          ),
        })),
      });
    };

    function checkPermutedLayouts(
      make: () => Ship[],
      layouts: number[][],
      expectGroupOrderFree: boolean
    ): void {
      const warmed = new BattleModel(make(), make(), false, false);
      const slot = warmed.findSlot('A', 3, false);
      expect(slot).toBeGreaterThanOrEqual(0);
      const hpA = warmed.initialState().hpA;
      // Warm the memo with the first layout, then replay every other layout
      // of the same per-group HP multisets against a fresh model.
      expandJson(warmed, { hpA, hpB: layouts[0], slot });
      const contexts = Array.from(memoContexts(warmed).values());
      expect(contexts.length).toBeGreaterThan(0);
      for (const context of contexts) {
        expect(context.groupOrderFree).toBe(expectGroupOrderFree);
      }
      for (const hpB of layouts.slice(1)) {
        const fresh = new BattleModel(make(), make(), false, false);
        const state: WorkingState = { hpA, hpB, slot };
        if (expectGroupOrderFree) {
          expect(canonicalExpansion(warmed, state)).toBe(
            canonicalExpansion(fresh, state)
          );
        } else {
          expect(expandJson(warmed, state)).toBe(expandJson(fresh, state));
        }
      }
    }

    test('canonical-code path: interceptors and cruisers', () => {
      const make = (): Ship[] => [
        ...Array.from(
          { length: 3 },
          () =>
            new Ship(ShipType.Interceptor, {
              initiative: 3,
              cannons: { ion: 1 },
            })
        ),
        ...Array.from(
          { length: 2 },
          () =>
            new Ship(ShipType.Cruiser, {
              initiative: 2,
              hull: 1,
              cannons: { ion: 1 },
            })
        ),
      ];
      checkPermutedLayouts(
        make,
        [
          [1, 0, 1, 2, 1],
          [0, 1, 1, 1, 2],
          [1, 1, 0, 2, 1],
        ],
        true
      );
    });

    // Transition templates are keyed by the shooter's living dice ships, its
    // minimum living shield when shields are mixed, and its whole canonical HP
    // for missile or rift slots. Permuting the shooter's raw layout, or moving
    // between shooter states that share a factor, must give a fresh model's
    // canonical expansion.
    function checkShooterLayouts(
      make: () => Ship[],
      shooterLayouts: number[][],
      hpB: number[]
    ): void {
      const warmed = new BattleModel(make(), make(), false, false);
      const slot = warmed.findSlot('A', 3, false);
      expect(slot).toBeGreaterThanOrEqual(0);
      expandJson(warmed, { hpA: shooterLayouts[0], hpB, slot });
      for (const hpA of shooterLayouts.slice(1)) {
        const fresh = new BattleModel(make(), make(), false, false);
        const state: WorkingState = { hpA, hpB, slot };
        expect(canonicalExpansion(warmed, state)).toBe(
          canonicalExpansion(fresh, state)
        );
      }
    }

    test('transition templates: shooter layouts and factors', () => {
      const plain = (): Ship[] => [
        ...Array.from(
          { length: 3 },
          () =>
            new Ship(ShipType.Interceptor, {
              initiative: 3,
              cannons: { ion: 1 },
            })
        ),
        ...Array.from(
          { length: 2 },
          () =>
            new Ship(ShipType.Cruiser, {
              initiative: 2,
              hull: 1,
              cannons: { ion: 1 },
            })
        ),
      ];
      // Same dice (two living interceptors) from different shooter states.
      checkShooterLayouts(
        plain,
        [
          [1, 1, 0, 2, 2],
          [0, 1, 1, 1, 2],
          [1, 0, 1, 0, 1],
        ],
        [1, 1, 0, 2, 1]
      );

      const rift = (): Ship[] => [
        ...Array.from(
          { length: 3 },
          () => new Ship(ShipType.Cruiser, { initiative: 3, hull: 1, rift: 1 })
        ),
        new Ship(ShipType.Interceptor, { initiative: 2, cannons: { ion: 1 } }),
      ];
      // Rift self-damage lands on the shooter's own ships, so the factor holds
      // the shooter's canonical HP and permuted layouts share a template.
      checkShooterLayouts(
        rift,
        [
          [2, 1, 1, 1],
          [1, 2, 1, 1],
          [1, 1, 2, 1],
        ],
        [2, 2, 1, 1]
      );

      const mixedShields = (): Ship[] => [
        ...Array.from(
          { length: 2 },
          () =>
            new Ship(ShipType.Interceptor, {
              initiative: 3,
              shields: 1,
              cannons: { ion: 1 },
            })
        ),
        ...Array.from(
          { length: 2 },
          () =>
            new Ship(ShipType.Cruiser, {
              initiative: 2,
              hull: 1,
              cannons: { ion: 1 },
            })
        ),
      ];
      // The shooter's minimum living shield changes DPS priorities: states
      // with a living unshielded cruiser and states without one must not share.
      checkShooterLayouts(
        mixedShields,
        [
          [1, 1, 2, 1],
          [1, 1, 0, 0],
          [1, 1, 1, 0],
        ],
        [1, 0, 2, 2]
      );

      const missiles = (): Ship[] => [
        ...Array.from(
          { length: 2 },
          () =>
            new Ship(ShipType.Interceptor, {
              initiative: 3,
              cannons: { ion: 1 },
              missiles: { ion: 1 },
            })
        ),
        new Ship(ShipType.Cruiser, {
          initiative: 2,
          hull: 1,
          computers: 1,
          missiles: { plasma: 1 },
          cannons: { ion: 1 },
        }),
      ];
      // Missile slots read the shooter's other living missile ships through
      // the phase tail, so the factor holds the shooter's canonical HP.
      const warmed = new BattleModel(missiles(), missiles(), false, false);
      const missileSlot = warmed.findSlot('A', 3, true);
      expect(missileSlot).toBeGreaterThanOrEqual(0);
      expandJson(warmed, { hpA: [1, 1, 2], hpB: [1, 1, 2], slot: missileSlot });
      for (const hpA of [
        [1, 1, 0],
        [1, 0, 2],
        [0, 1, 2],
      ]) {
        const fresh = new BattleModel(missiles(), missiles(), false, false);
        const state: WorkingState = { hpA, hpB: [1, 1, 2], slot: missileSlot };
        expect(canonicalExpansion(warmed, state)).toBe(
          canonicalExpansion(fresh, state)
        );
      }
    });

    test('raw-key path: groups that differ only in hull can tie', () => {
      // Same weapons, computers, initiative and type: the DPS ordering ties
      // whenever a hull-1 and a hull-2 cruiser share remaining HP, so the
      // memo must key on the raw roster HP vector.
      const make = (): Ship[] => [
        new Ship(ShipType.Interceptor, { initiative: 3, cannons: { ion: 1 } }),
        ...Array.from(
          { length: 2 },
          () =>
            new Ship(ShipType.Cruiser, {
              initiative: 2,
              hull: 1,
              cannons: { ion: 1 },
            })
        ),
        ...Array.from(
          { length: 2 },
          () =>
            new Ship(ShipType.Cruiser, {
              initiative: 2,
              hull: 2,
              cannons: { ion: 1 },
            })
        ),
      ];
      checkPermutedLayouts(
        make,
        [
          [1, 2, 1, 2, 3],
          [1, 1, 2, 3, 2],
          [1, 2, 2, 2, 2],
        ],
        false
      );
    });
  });
});
