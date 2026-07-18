# Plan: Exact win-probability solver + OptimalDamagePlanner

> Historical implementation plan. See [Architecture](../architecture.md) for current module
> ownership, solver configuration, intentional divergences, and validation commands. References
> below to removed rollout and benchmark scripts describe development artifacts, not current
> repository entry points.

## Objective and context

Build a solver that computes the **exact** probability of the player winning a battle from any
state, and a damage planner that uses it to make provably optimal assignments. This replaces
the rollout planner's Monte Carlo estimates with noise-free numbers.

Context from the rollout work (see `docs/plans/rollout-damage-planner.md`, fully implemented):
benchmarks showed the rollout planner statistically **ties** the DPS planner on every matchup
at 5000 iterations (±0.7pp noise). The open question is whether DPS is truly near-optimal or
whether a real gap is hiding under the noise floor. This solver answers that definitively: the
headline deliverable is `scripts/measure-planner-gap.ts`, which prints the **exact** win
probability under the DPS policy vs. under optimal play — a noise-free measurement of the gap,
however small it is.

Deliverables, in priority order:
1. `WinProbabilitySolver` — exact `P(player wins)` for a battle, in two modes:
   `'policy'` (player uses the DPS heuristic; validates the model against Monte Carlo) and
  `'optimal'` (both non-NPC sides play minimax-optimally at every decision).
2. `scripts/measure-planner-gap.ts` — exact `W_dps`, `W_optimal`, and the gap per matchup.
3. `OptimalDamagePlanner` (`DamageType.OPTIMAL`) selectable in the UI, with fallback to DPS
   when the state space exceeds caps.

## Verification gates (run after every stage)

```
bun test
bun run typecheck
bun run lint
```

## Read these files before starting

- [battle.ts](../../src/engine/battle.ts) — phase queue construction and resolution order.
- [ship.ts](../../src/engine/ship.ts) — `rollWeapons` (min-shield pre-filter, splitter),
  `shootRiftCannon`, `shotHits`, `clone`, `configKey`.
- [fleet.ts](../../src/engine/fleet.ts) — `getMinShield` (living ships!), `prepareForBattle`,
  `clonePlayout` pattern.
- [candidate-enumerator.ts](../../src/engine/candidate-enumerator.ts) — reused as-is for
  decision-node actions.
- [rollout-damage-planner.ts](../../src/engine/rollout-damage-planner.ts) — the planner
  surface (`setBattleContext`, `assignDamage`, fallback callback, cache-on-Fleet pattern) that
  `OptimalDamagePlanner` mirrors.
- [binned-damage-assignment-helper.ts](../../src/engine/binned-damage-assignment-helper.ts),
  [npc-damage-planner.ts](../../src/engine/npc-damage-planner.ts),
  [dps-removal-damage-planner.ts](../../src/engine/dps-removal-damage-planner.ts) — the
  opponent/policy models the solver must reproduce exactly.

## Critical modeling facts

Read all of this before writing code. Items 1–8 are engine semantics the model must mirror;
items 9–12 are the math. Getting any wrong produces a solver that disagrees with the engine,
which the Stage C validation test will catch — but debugging is far cheaper if you never
introduce the bug.

1. **Phase schedule.** `getAllPhases()` produces: all missile phases (initiative descending,
   defender before attacker on ties), then all cannon phases (same order). A fleet gets a
   cannon phase for every initiative value in its roster whether or not ships there have
   cannons. Missile phases exist only for initiatives that have missile ships. Missile phases
   are consumed once, in order; cannon phases repeat cyclically forever. Initiatives within a
   fleet are unique (built from a `Set`), so a schedule slot is uniquely identified by
   (fleet role, missile?, initiative).

2. **Who shoots in a slot.** Resolution re-queries the fleet: living ships at that initiative
   (`shootCannonsForInitiative` / `shootMissilesForInitiative`). Membership is derivable from
   state — a slot whose ships all died fires nothing. In a missile slot, living ships at that
   initiative fire their missile dice (ships without missiles contribute zero).

3. **Min-shield pre-filter is state-dependent.** `rollWeapons` drops a die whose roll cannot
   pierce `targetFleet.getMinShield()` — the minimum shield among **currently living** enemy
   ships — unless it is a natural 6. As enemy ships die the min shield can rise. The dice model
   must recompute this per state. (Equivalently: a die outcome that hits no living ship
   produces no Shot; the "hits nothing" class folds into the no-op outcome.)

4. **Resolution order within a cannon slot** (`resolveFleetCannonFire`): roll cannons + rift →
   apply rift **self**-damage to the firing fleet's living rift ships via the NPC planner →
   apply cannon + rift **target** damage to the enemy (each rift die's target damage becomes
   one Shot with `roll: 6`, i.e. hits anything) → `checkBattleOutcome` (both dead → Draw;
   one dead → other wins). Draws can only arise here (rift self-kill simultaneous with target
   kill). Missile slots check only the target fleet's death.

5. **Round boundary.** After each full pass over the phase queue: both fleets heal
   (`damage -= heal`, floor 0, living ships only), then if **neither** fleet has any living
   ship with cannons (rift counts as a cannon), the defender wins. The engine also caps at
   `MAX_ROUNDS = 100` with the defender winning — the solver models unbounded rounds instead
   and credits non-termination to the defender (see fact 10); the measure-zero divergence is
   documented, not fixed.

6. **Opponent model = minimax for player fleets.** With minimax assignments every non-NPC assignment
  is a decision node. Attacker nodes maximize and defender nodes minimize the queried reach
  objective, so the solved value is the selected role's guaranteed win probability against
  optimal opposition. NPC assignments remain deterministic `NpcDamagePlanner` decisions.
  Policy mode still evaluates deterministic DPS/NPC assignments for comparison and engine
  validation.

7. **Heuristic assignment must be computed by the real code.** Do not re-implement NPC/DPS
   assignment inside the solver. Materialize the abstract state into real `Ship` clones (via
   templates + `Ship.clone()` + `takeDamage` to set HP), build a fresh
   `BinnedDamageAssignmentHelper`, call `assignDamage(shots, ships, damageType, phases)`, and
   read the resulting HP. This inherits every quirk of the real planners. One such quirk to
   know about: `DpsRemovalDamagePlanner` caches priority by `ShipType` alone, so two
   same-type-different-config groups in one fleet share the first-computed priority; a fresh
   helper per call reproduces first-seen ordering as long as materialization preserves roster
   order (see fact 9). DPS's `evaluate` also reads `upcomingPhases` for missile-awareness, so
   materialization must include a phase list (built like `RolloutDamagePlanner.playOut` builds
   `clonedPhases`, but from the schedule position).

8. **What a decision node looks like.** After the dice land, the assigning player chooses among
   the distinct successor states from `enumerateCandidates(shots, livingEnemyShips)` — reuse it
   verbatim (it already dedups by `configKey#hp` multiset and enforces "every shot must be
   assigned to a ship it can hit"). Rift self-damage is **not** part of the decision (NPC-
   assigned, fact 4).

9. **State representation.** Per fleet, an HP vector aligned to the original roster order
   (0 = dead), plus the schedule position. Two representations serve different purposes:
   - **Working state**: `{ hpA: number[], hpB: number[], slot: number }` where `slot` indexes
     the full schedule (missile slots first, then cannon slots; cannon slots wrap). Roster
     order is preserved for materialization fidelity (fact 7).
   - **Canonical key** (for memoization): within each group of identical-`configKey` ships,
     sort the HP values (identical ships are interchangeable); concatenate
     `configKey#hp` lists per fleet plus the slot index. Missile-slot consumption is captured
     by the slot index alone because missile slots are a strictly ordered prefix.
   Healing makes HP non-monotone, so the state graph can contain cycles; the solver must not
   assume a DAG.

10. **The objective, precisely.** Let terminals be: `AttackerWins`, `DefenderWins`, `Draw`
    (fact 4/5). Engine semantics: a draw is a loss for both players' "win" event, and any
    non-terminating play (possible only in heal corner cases) is a **defender** win via the
    round cap. This asymmetry means the two roles need different formulations, both solved by
    value iteration from `V ≡ 0` (least fixed point):
    - **Player is the attacker**: `V(s) = P(reach AttackerWins)`, decision nodes take **max**.
      LFP from 0 is the maximal reachability probability; non-terminating mass correctly counts
      as 0 (a loss). `W_player = V`.
    - **Player is the defender**: compute `V(s) = P(reach AttackerWins ∪ Draw)` with decision
      nodes taking **min**. LFP from 0 is the minimal reachability probability, and
      non-terminating mass correctly counts as 0 — i.e. as a defender win, matching the round
      cap. `W_player = 1 − V`.
    Do NOT compute `P(reach DefenderWins)` with max for the defender: that undercounts
    non-terminating defender wins.
    Iterate synchronously (`V_{n+1}` from `V_n`) until `max |ΔV| < 1e-10` (cap 10_000 sweeps;
    non-convergence → solver failure → planner fallback). Chance nodes:
    `V(s) = Σ_outcome p · V(succ)`; policy-mode assignments are baked into `succ`
    deterministically; optimal-mode attacker nodes take max and defender nodes take min over
    the candidate successor set.

11. **Dice outcome enumeration.** Per slot, the firing ships contribute dice groups; identical
    dice within a group are exchangeable, so enumerate multisets, not sequences.
    - **Cannon/missile die** with computers `c`, damage `d`, against the set `S` of distinct
      living enemy shield values: partition rolls 1–6 into classes by hit-set — roll 1 always
      misses; roll 6 always hits everything; roll `r ∈ {2..5}` hits exactly
      `{ s ∈ S : s ≤ r + c − 6 }`. Merge rolls with identical hit-sets. Class probability =
      (member-roll count)/6. A class with an empty hit-set produces no Shot (fact 3). A landed
      class produces `Shot { roll: r_representative, computers: c, damage: d }` — pick any
      member roll (6 for the always-hits class) so `shotHits` reproduces the class exactly.
      Antimatter splitter: a landed antimatter shot becomes four 1-damage Shots with the same
      roll (mirror `rollWeapons`); splitter applies to cannons only, never missiles.
    - **Rift die**: fixed five classes — nothing 2/6 (rolls 2–3); self-1 1/6 (roll 1);
      target-1 1/6; target-2 1/6; target-3-plus-self-1 1/6 (roll 6).
    - For a group of `n` identical dice with `k` classes `(p_1..p_k)`, outcomes are
      compositions `(n_1..n_k)`, `Σn_i = n`, with probability `n!/(∏ n_i!) · ∏ p_i^{n_i}` —
      `C(n+k−1, k−1)` outcomes. Combine groups by cartesian product. Verify each slot's
      outcome probabilities sum to 1 within 1e-12.
    - **Caps**: max 20_000 outcomes per slot (after the cartesian product). Breach → solver
      failure for that state → planner fallback.

12. **Known, accepted divergences from the engine** (document in code, do not "fix"):
    the 100-round cap (fact 5/10, measure-zero except heal-drift corners); heal timing when the
    engine's mutating `for` loop shortens a round mid-pass (the solver heals on schedule
  wrap-around — same divergence the rollout playouts already accept). Stage C's statistical
  tolerance absorbs these.

## Design overview

New files:
- `src/engine/dice-distribution.ts` — outcome classes + multinomial enumeration (fact 11).
- `src/engine/battle-state.ts` — schedule construction, working state, canonical key,
  terminal checks, materialization to Ship clones/Fleets/Phases, and the one-slot transition
  function (chance outcomes → assignment → successor).
- `src/engine/win-probability-solver.ts` — reachable-graph builder + value iteration
  (fact 10), assignment modes `'policy' | 'minimax'`, incremental `getValue(stateKey)` for
  planner reuse.
- `src/engine/optimal-damage-planner.ts` — thin planner over the solver.
- `scripts/measure-planner-gap.ts` — the exact-gap report.
- Tests for each engine file.

Modified: `constants.ts` (`DamageType.OPTIMAL = 'optimal'`), `fleet.ts` (planner injection in
`prepareForBattle`, same lazy-persistent pattern as rollout), `binned-damage-assignment-helper.ts`
(route OPTIMAL), UI (`state.ts` `PlannerType` + option in `fleet.html`/`index.ts`, `app.ts`
mapping), `scripts/benchmark-planners.ts` (add OPTIMAL column).

Solver lifetime and caching: the solver instance lives on the `OptimalDamagePlanner`, which
lives on the `Fleet` (surviving all CombatSimulator iterations). Key the solver by the battle
signature (both rosters' configKeys + roles); rebuild only when the opponent changes
(`MultiBattle` re-pairing). All value tables persist, so after the first battle every planner
decision is a table lookup.

Caps and fallback: solver failure (outcome cap, state cap of 500_000 nodes, non-convergence)
poisons the affected computation; the planner then delegates to the DPS fallback callback for
that decision — the same mechanism `RolloutDamagePlanner` uses.

---

## Stage A — Dice distribution module

Implement fact 11 as pure functions:

```ts
export type OutcomeClass = { prob: number; shots: Shot[]; selfDamage: number };
export type SlotOutcome = { prob: number; shots: Shot[]; selfDamage: number };

// All dice fired by `shooters` in one slot (cannon or missile), classed against
// the living enemy shield set, expanded to joint outcomes.
export function enumerateSlotOutcomes(
  shooters: Ship[],            // living ships at the slot's initiative
  missilePhase: boolean,
  enemyShields: number[],      // distinct shields of LIVING enemy ships
  antimatterSplitter: boolean,
  maxOutcomes: number
): SlotOutcome[] | null        // null ⇒ cap exceeded
```

Tests (`dice-distribution.test.ts`), all against hand-computed probabilities:
- Single ion die, no computers, enemy shields `[0]`: classes are miss 5/6 (rolls 1–5 all fail
  to reach 6), hit 1/6. With computers 1: miss 4/6, hit 2/6 (rolls 5,6).
- Shield split `[0, 2]`, computers 2: verify the three-way class partition and that the
  middle class's representative Shot hits the 0-shield ship and misses the 2-shield ship via
  `shotHits`.
- Two identical dice: 3 multiset outcomes with binomial probabilities, sum 1.
- Rift die: exactly the five fixed classes of fact 11.
- Antimatter splitter: a landed antimatter outcome carries four 1-damage shots.
- Cartesian combination of two groups; cap breach returns null; probabilities always sum to 1
  within 1e-12.

## Stage B — Battle state module

`battle-state.ts` responsibilities:

1. **Schedule**: build once from the two fleets (fact 1) as
   `{ role: 'A' | 'D', initiative: number, missile: boolean }[]`; `advance(slot)` returns the
   next slot index plus a `wrapped` flag (missile slots never repeat: advancing past the last
   missile slot enters the cannon cycle; wrapping goes to the first **cannon** slot).
2. **State + key** per fact 9.
3. **Terminal check** per facts 4–5 (fleet-dead outcomes; on wrap: heal, then mutual-no-cannons
   → DefenderWins).
4. **Materialization**: from a working state, produce cloned Fleets (template `Ship.clone()`
   per roster slot, damage set via `takeDamage(maxHP − hp)`, dead ships materialized at 0 HP so
   roster order and `getMinShield`'s living-only semantics survive) and a `Phase[]` tail for
   heuristic `evaluate` calls (fact 7): the remaining missile slots + one full cannon cycle
   starting from the current slot, built exactly like `getAllPhases` output filtered to the
   schedule position.
5. **Transition**: `expandSlot(state)` returns either `{ skip: nextState }` (no living
   shooters) or the chance-node structure: for each `SlotOutcome`, apply rift self-damage (NPC
   planner on materialized ships), then either the deterministic heuristic assignment
   (policy/enemy) or the candidate successor list (optimal-mode player), then advance/heal/
   terminal-check into successor working states.

Tests (`battle-state.test.ts`):
- Schedule construction matches `getAllPhases` ordering for a missile+cannon two-fleet setup
  (defender-first on ties, missiles first, initiative descending).
- Canonical key: permuted identical ships → same key; different HP or slot → different key.
- Materialized fleet reproduces `getMinShield` behavior after a death (min shield rises).
- Terminal checks: mutual-no-cannons → DefenderWins only at wrap; rift self-kill + target kill
  in one outcome → Draw.
- A deterministic transition (all-guaranteed-hit dice equivalent: single-class outcomes) walks
  a 2-ship battle to the same result `Battle.fight()` produces with `GUARANTEED_HIT`.

## Stage C — Solver in policy mode (the validation stage)

Value iteration per fact 10 with **all** decision nodes resolved by the DPS heuristic (player
side) and NPC/DPS (enemy side). Graph built lazily by worklist DFS (explicit stack, no
recursion) from the initial state; nodes store outcome edges; then sweep.

**The gate for this stage is the model-validation test** (`win-probability-solver.test.ts`):
- Exact closed-form case: 1v1 interceptors, both `{ initiative: 3, cannons: { ion: 1 } }`, no
  computers/shields/hull. Defender fires first each round; per shot P(kill) = 1/6. Attacker
  win probability = (5/36)/(1 − 25/36) = **5/11**. Assert within 1e-9. Also assert the
  defender-role value is exactly 6/11 (1 − 5/11; no draws possible).
- Statistical validation: for at least four no-heal matchups from
  `scripts/benchmark-planners.ts` (mirror interceptors, cruisers-vs-Ancients, missiles-vs-swarm,
  rift-vs-cruisers), run `CombatSimulator` at 10_000 iterations with the player on DPS and
  assert `|W_policy − simulated| < 0.015` (≈3σ). This single test validates schedule, dice
  classes, min-shield dynamics, rift handling, missile consumption, and the heuristic
  materialization all at once. Mark it as the slow test it is.
- Determinism: solving twice yields bit-identical values.

If the statistical test fails, debug the transition model — do not widen the tolerance.
Fact 12 lists the only acceptable divergence sources, all sub-tolerance for no-heal matchups.

## Stage D — Minimax assignments

Every non-NPC decision node branches over `enumerateCandidates` successors (fact 8).
Attacker-owned nodes take max and defender-owned nodes take min for the queried reach
objective. Everything else is unchanged.

Tests:
- **Dominance**: `W_optimal ≥ W_policy − 1e-9` on every Stage C matchup, both roles.
- The rollout test scenarios (`buildUrgentScenario` / `buildSpreadScenario` shapes from
  `rollout-damage-planner.test.ts`, rebuilt with real dice instead of guaranteed hits): the
  optimal argmax at the first decision matches the known winning line.
- A hand-checkable optimality case: player fires 2 guaranteed-equivalent hits (use computers
  high enough that only roll 1 misses, and verify against a hand-computed 2-candidate
  comparison).

## Stage E — OptimalDamagePlanner + wiring

Mirror `RolloutDamagePlanner`'s surface exactly: constructor takes the DPS fallback callback;
`setBattleContext(ctx, ownFleet)`; `assignDamage(shots, targetShips, upcomingPhases)`.
Decision procedure: locate the current schedule slot from `upcomingPhases[0]`'s
(role, missile?, initiative) — unique per fact 1 — then for each candidate from
`enumerateCandidates`, build the successor working state (candidate damage applied, slot =
`upcomingPhases[0]`'s slot) and pick the argmax/argmin of `solver.getValue(key)`. Any solver
failure → fallback callback. No decision cache needed — `getValue` *is* the cache.

Wiring (follow the rollout pattern commit-for-commit): `DamageType.OPTIMAL`; lazy planner field
+ injection in `Fleet.prepareForBattle` (rebuild solver when the battle signature changes);
routing in the helper; `'optimal'` in UI `PlannerType`, `fleet.html` option
("Optimal (exact)"), `app.ts` map.

Tests:
- Urgent/spread scenarios end-to-end through `Fleet.assignDamage` with `DamageType.OPTIMAL`.
- End-to-end `Battle.fight()` with an optimal player fleet completes and wins a winnable fight.
- Consistency: simulated win rate (CombatSimulator, 10_000 iterations, optimal player vs DPS
  enemy) matches `W_optimal` within 0.015.
- Fallback: a matchup engineered past the outcome cap still assigns all damage.

## Stage F — Measurement and acceptance

`scripts/measure-planner-gap.ts`: for each benchmark matchup (reuse the matchup list — import
it from a shared module rather than duplicating), print exact `W_dps` (policy mode), exact
`W_optimal`, the exact gap in pp, solver states/time, plus the simulated OPTIMAL win rate as a
sanity column. Add the OPTIMAL column to `scripts/benchmark-planners.ts`.

Acceptance criteria:
1. All stages' tests + full suite pass; typecheck and lint clean.
2. Stage C validation holds (5/11 exact; policy-vs-simulator within 0.015 on all four).
3. Dominance holds on every matchup (`W_optimal ≥ W_policy`, exact).
4. The gap report runs on all benchmark matchups without cap fallbacks (raise caps if a listed
   matchup needs it and note the cost), each matchup solving in under ~30s.
5. CombatSimulator wall time with OPTIMAL within ~10× DPS at 5000 iterations (solve once,
   then lookups).
6. Report the measured gaps honestly. If `W_optimal − W_dps` is ≈0 everywhere, that **is** the
   finding (DPS is near-optimal, now proven, question closed); do not tune matchups until one
   "wins". If a matchup shows a real gap, highlight it — that's where OPTIMAL earns its UI slot.

## Out of scope (do not build)

- Minimax / game-theoretic opponent modeling (fact 6) and INITIATIVE as an opponent model.
- Exact-probability display in the UI (the solver could power it; separate feature).
- Multi-battle chain objectives; deliberate shot discarding; round-cap fidelity (fact 12).
- Replacing the rollout planner — it stays, both as a UI option and as a cross-check oracle.
