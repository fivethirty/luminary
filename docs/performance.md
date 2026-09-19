# Combat Performance

Combat runs in a dedicated browser worker, so elapsed time remains part of the user-facing
contract without blocking editing, rendering, or status updates on the main thread. The practical
target is to keep a settled edit below one second on the development machine and to avoid spending
a fresh timeout at every fallback tier. Mobile devices need separate spot checks; desktop timing
alone is not a mobile guarantee.

Correctness remains the first constraint. Performance work must preserve the rules in
[architecture.md](architecture.md), and any new approximation must be named, measured, and
documented.

## Interactive Strategy Ladder

The engine's `CombatRunner` owns the strategy choice and a single total interactive deadline. It
evaluates these named tiers in order:

1. **`exact-dps`:** compute exact dice probabilities with deterministic DPS/NPC assignment, using
   the whole exact budget. Optimal player fleets run as DPS here; explicitly selected and inherent
   NPC policies remain NPC. This tier's work is a subset of the optimal tier's, so running it first
   never costs a feasible optimal result, and its measured cost calibrates the device.
2. **`exact-optimal`:** when a fleet requested optimal targeting and the DPS tier succeeded,
   predict the minimax solve's cost from the preflight's option estimate and attempt it with the
   exact budget that remains only when the prediction fits. A successful attempt replaces the DPS
   result; a failed or skipped one keeps it.
3. **`monte-carlo-dps`:** only when the DPS tier itself fails, sample battles with the same
   policies for the rest of the deadline.

The deadline is not reset between tiers. A tier receives only the time remaining, and an exact
tier is skipped when no budget remains. Once the runner chooses Monte Carlo, mutable fleets must
not start another hidden optimal solve. The default deadline is 950ms with 350ms reserved for
deadline-aware sampling; the exact tiers share the remaining 600ms. Monte Carlo reports the number
of iterations actually completed rather than assuming it reached its requested 5,000.

The optimal prediction is `estimatedOptions × rate`. The rate starts at a reference of 0.2 ms per
thousand estimated options (the corpus median on the development machine, where the spread is 0.1 to
0.5) multiplied by a device factor, and is replaced by the learned rate once an optimal attempt has
run on the device: successful attempts blend in their observed rate, and an attempt that ran out of
time raises it to twice its observed lower bound so the same fleet is not retried into the same
failure. The device factor comes from a reference probe (`solver-calibration.ts`): a fixed
4-interceptor, 2-cruiser optimal mirror solved three times, the fastest run taken as the warm speed,
divided by its 12.4 ms on the development machine and clamped to 0.5 to 8. The probe runs once per
calibration, outside the request deadline, on the first request of a client, and costs about 55 ms
cold on the development machine. It is deliberately not derived from the request's own DPS solve:
per counted dice outcome, a rift fleet costs two to four times what an ion fleet costs on the same
machine, so that measurement would call a fast machine slow for exactly the fleets whose optimal
solves matter. The DPS solve's work counters are still reported in the attempt diagnostics. This
`SolverCalibration` is part of every result's diagnostics and is passed back into the next run by
whoever owns the runner, so it survives worker restarts. Multi-fleet battles have no estimate, so
their optimal attempt is made on the remaining budget without a prediction, with the DPS result
already in hand as its fallback. On the development machine the rule admits every corpus fleet
whose optimal solve fits its budget (for example the 3-rift-cruiser variant of the shared battle at
about 280 ms and the 6-interceptor plus 2-cruiser mirror at about 80 ms) and skips the ones that do
not without spending budget on them.

`CombatRunResult` records the method, targeting policy, tier, a user-facing method label, elapsed
time, and actual iteration count when sampled. Its serializable diagnostics include the deadline,
preflight reason and estimates, the optimal decision with its prediction and rate source, the
updated calibration, every attempt and fallback with the exact work counters (states and dice
outcomes) each solve performed, and whether the total deadline was exceeded. Exact DPS-policy
results are exact for that deterministic targeting policy; they are not minimax-optimal results.

Complexity preflights are routing decisions, not combat rules. The state estimate is a
deterministic upper bound derived from configuration-group HP multisets and schedule size; at or
above 100,000 states the option probe is not run and the optimal tier is skipped. Below that, the
probe expands one full-HP state per schedule slot through the real model (bounded by the
interactive outcome cap and a fixed amount of probe work) and multiplies the options each decision
slot produced by the per-slot share of the state bound. Minimax cost is dominated by decision
outcomes times their candidates rather than by states: two antimatter starbases and a dreadnought
against four rift cruisers is 44,100 states by the bound but about 7.8 million estimated and
760,000 actual assignment options, more than a second uncapped, while the 8-interceptor plus
4-cruiser mirror at 72,900 states estimates 9.7 million options. The runner turns the estimate into
a time prediction as described above; direct `computeExactCombat` callers, which have no budget,
still apply a static 200,000-option cutoff. Keep both thresholds with the exact preflight, cover
them with focused tests, and measure whether they still avoid wasted work as the solver changes.

Homogeneous targeting is reduced inside the exact state model rather than by the preflight. When
all living targets share one combat configuration, the slot uses deterministic DPS concentration
without discarding optimal decisions against heterogeneous targets elsewhere in the same battle.

Exact multi-fleet combat memoizes successful engagements for one request. Fleet identity and
reputation payload do not enter the engagement key; attacker/defender role, planner policy,
splitter state, current HP, configuration, and resolved missile/cannon initiative-slot order do.
Equivalent raw initiative values therefore share a solve when they produce the same phase order.
When both resolved policies are optimal, unsplit ordinary weapons are also keyed by damage capped
to the opposing fleet's reachable HP: current HP for non-healers and configured maximum HP for
healers. DPS/NPC keys retain nominal loadouts; split antimatter and rifts remain distinct. Cached
terminal HP is applied to the caller's original ships, so their raw loadouts still govern later
engagements. Diagnostics report engagement requests, solves, and cache hits on each exact attempt;
each hit is one avoided solve, and the benchmark runner reports both forms plus a consistency check.

Neutral transition-graph reuse across reversed attacker/defender mappings remains deferred. The
benchmark corpus includes an asymmetric role-reversal control so the missed opportunity remains
visible, but a graph cache would retain substantially more memory and require role-specific minimax
reevaluation. Revisit it only when representative expensive multi-fleet cases show repeated
role-reversed solves that the cheaper result cache cannot serve.

## What to Measure

Record wall time for user impact and deterministic work counters for useful comparisons across
machines. At minimum, exact-solver investigations should capture:

- reachable and terminal state counts;
- chance states and attacker/defender decision states;
- enumerated chance outcomes and assignment options;
- value-iteration sweeps and convergence/failure reason;
- multi-fleet branch count where applicable; and
- engagement requests, solves, and request-local cache hits;
- selected strategy tier and remaining budget at each transition.

Also record input shape: fleet and ship counts, distinct ship configurations, weapon dice, shield
variety, missiles, rifts, healing, antimatter splitting, and assignment policy. A faster result is
not comparable if the policy or probability tolerance changed.

For Monte Carlo, report iterations, elapsed time, and a fixed-seed or statistical comparison when
evaluating accuracy. Do not treat a single sampled percentage as a correctness fixture.

## Measured Exact Optimizations

The benchmark baseline is three warmed runs of the mixed optimal mirrors on the local development
machine. Both mirrors route to the exact-DPS tier because the minimax preflight estimate exceeds
the cutoff. Before this work the 12-ship case (8 interceptors plus 4 cruisers per fleet) completed
exact DPS in a median of 135 ms, and the 14-ship case (plus 2 dreadnoughts per fleet) exhausted its
600 ms exact-DPS allocation and fell back to roughly 865 Monte Carlo iterations.

Two exact-model optimizations landed first and are covered by the existing state and combat tests:

- Reusing materialized shooter and target fleets for every outcome in one expanded state reduced
  the 12-ship exact-DPS median to about 106 ms.
- Encoding interchangeable HP multisets as mixed-radix histogram values instead of sorting and
  joining HP arrays reduced that median further to about 101 ms.

An uncapped solve of the 14-ship case then measured where its time actually goes: about 9.4 s of
graph construction over 150,076 states and 473,648 edges, about 32 s of value iteration (407
sweeps, because index-order sweeps over a DFS-discovered graph advance roughly one schedule slot
per sweep), and about 4.8 s of forward propagation. An earlier five-second probe that never left
graph construction had suggested that expansion was the only target; fixed-point iteration is the
larger one. A sparse forward-propagation trial was rejected because it regressed the target
workload and is not part of the implementation.

Two structural measurements explain the construction cost and bound the remaining wins:

- The joint state space is close to a product of the two sides. Each side of the 14-ship mirror
  reaches only 158 canonical HP configurations, and 158 x 158 x 6 slots is essentially the whole
  graph, so only 5,372 distinct (slot, living shooters, target HP) transitions exist among the
  149,760 expansions. The 12-ship minimax graph has the same shape (134 x 134 x 4).
- Deterministic planner calls dominated construction. On the 12-ship case, 2,816 `assignDamage`
  calls were about 105 ms of a 139 ms instrumented build, and 99% of the 14-ship case's roughly
  324,000 calls repeated an input that had already been planned.

Three further exact transformations target those planner calls and are covered by the state,
solver, and combat tests:

- `BattleModel` memoizes each heuristic assignment result per model. The planners are
  deterministic functions of the shot sequence they sort, the living targets' `(configKey, HP)` in
  roster order, the shooter fleet's minimum shield after rift self-damage, and which of the
  target's own missile phases remain, so the memo key is exactly that (the missile tail reduces to
  a set of initiatives per schedule slot, and the key includes the target role so attacker and
  defender rosters never share an entry). The value is the resulting HP of each configuration
  group's living ships in (HP, roster) order, which is the order the planners' stable sort leaves
  interchangeable ships in. When the planner's ordering never ties two different configuration
  groups, checked once per context by sorting representative ships with the real planner, the
  memo keys on the canonical HP code; otherwise it keys on the raw roster HP vector. Both cases
  reproduce the planner's raw HP vector bit for bit; the 12-ship build makes 256 planner calls
  instead of 2,816 and the 14-ship build about 3,160.
- `BinnedDamageAssignmentHelper` keys its per-call memo by a mixed-radix code of each
  configuration group's effective-HP histogram (a numeric key when the whole key fits a safe
  integer, strings otherwise) instead of sorting and joining HP arrays, replays cached plans by
  (HP, index) rank without sorting, and shares immutable plan objects instead of copying them.
  Memo equivalence, recursion counts, and evaluation counts are unchanged; the instrumented cost
  per `assignDamage` fell from about 33 us to 18 us. The mutable engine shares this helper, so
  Monte Carlo sampling benefits as well.
- `BattleModel` clones each side's scratch fleet once per solve and resets it to an outcome's HP
  before a planner or candidate enumeration reads it; the shooter fleet is reset again only after
  an outcome applied rift self-damage, and the successor's shooter HP is copied from the state
  vector unless self-damage changed it. This removed about 226,000 `materializeFleet` and 3.2
  million `Ship.clone` calls from the 14-ship build.

Measured together, as medians of paired runs: uncapped 12-ship graph construction fell from about
89 ms to 18 ms and the interactive 12-ship exact-DPS tier from about 95 ms to 27 ms; uncapped
14-ship construction fell from about 9.4 s to 0.9 s. State counts, edge counts, and probabilities
are identical, including for the mutable engine, and the 14-ship mirror now completes roughly
1,200 to 1,350 sampled battles in its 350 ms Monte Carlo window instead of about 900. Value
iteration is untouched by these three changes; a faster 14-ship iterate observed in the same runs
was a garbage-collection side effect of fewer allocations, not a solver change.

Value iteration and forward propagation now follow the graph's strongly connected components (an
iterative Tarjan pass over every option of every outcome) instead of sweeping all states in index
order until nothing moves. Components are solved successors first, so an acyclic state is
evaluated once. A cyclic component (healing, or a round in which every shot misses) that holds no
minimax decision and has at most 256 states is solved exactly as the linear system `(I - P) v = c`
by Gaussian elimination with partial pivoting, which removes the sweep tolerance from its value
entirely. The exact solve is refused, and the component swept instead, when a pivot falls below
`1e-9` (the component can never shed its mass, and the swept value is the least fixed point) or a
solved value leaves `[0, 1]`. Every other cyclic component is swept over its own states until the
estimated remaining error, not only the last change, is inside the convergence threshold; at the
sweep cap the documented rule (the last sweep moved less than the threshold) still accepts, so no
input the whole-graph sweep solved is rejected. Mass is pushed through components in topological
order; a cyclic component circulates until at most its share of the 1e-12 total residual is in
flight or the 20,000-pass cap is reached, and whatever remains stays with the defender as before.
`sweeps` reports the most sweeps any one swept component needed, and 1 when every cycle was solved
exactly.

Decision ties are broken toward the lowest option index among options within `1e-9` of the best
value, in the solver's own policy and in the mutable optimal planner. Iteration residuals used to
pick between equally optimal lines, so survivor mixes for minimax fleets could change between
solver versions while win probabilities did not; they are now a deterministic function of the
candidate order. Uncapped, on the development machine, with the planner memo already in place:

| case | states | value iteration (before, now) | forward propagation (before, now) |
| --- | --- | --- | --- |
| 12-ship exact DPS | 1,056 | 249 sweeps 13 ms, exact 2 ms | 250 steps 11 ms, 3 ms |
| 14-ship exact DPS | 150,076 | 407 sweeps 22-32 s, exact 0.14 s | 400 steps 4-5 s, 0.07 s |
| 12-ship minimax | 72,092 | 242 sweeps 27-29 s, 43 sweeps 0.25 s | 0.5 s, 0.01 s |

Outcome probabilities moved by at most 5e-13 on those cases and on the healing, missile,
self-loop, and 1v1 controls; state and terminal counts are unchanged. Slow healing cycles that
the sweep solved only to about 5e-8, or not at all within the cap, are now exact (for example six
interceptors against an unarmed dreadnought that heals to full unless every shot lands). The
12-ship exact-DPS tier was then about 17 ms, and graph construction (0.9 s for the 14-ship case,
26 s for the 12-ship minimax case) was essentially the whole solve; the bookkeeping and
transition-template changes below address it. Reversing the sweep direction alone was tried first
and only reached 96 sweeps on the 12-ship case, because every all-miss round is a cycle whose
convergence rate, not the sweep order, bounds a whole-graph sweep.

Three further exact bookkeeping changes then landed together (state, edge, and probability
values are deterministic; times are the development machine):

- Numeric state keys and flat graph storage: states are keyed by `canonicalCode` (mixed-radix
  integers in a `Map<number, number>`) and terminals by a packed raw-HP code; nodes, edges, and
  options live in CSR-style typed arrays instead of per-node objects. A key-only microbenchmark
  measured 0.75 us per string key plus map insert against 0.08 us numeric, and the 14-ship heap
  after construction fell from about 163 MB to 60 MB.
- Dice-less slot skipping: `advance` walks past slots whose living ships roll no dice, so those
  pass-through states (24% of the 14-ship graph) are never stored. The 14-ship graph fell from
  150,076 states and 473,648 edges to 113,436 and 437,008; `getStateValue` resolves a dice-less
  state to the successor it passes through to.
- Duplicate-successor merging in chance nodes: dice outcomes of one state that land in the same
  successor share an edge with summed probability, 3% fewer stored edges on the 14-ship graph;
  `chanceOutcomes` still reports enumerated outcomes.

With those in place the 14-ship uncapped solve was 0.42 s (construction 0.36 s) and the
interactive exact-DPS tier completed it in about 513 ms, inside the 600 ms allocation with too
little margin for slower hardware. Construction was then per-outcome bookkeeping: 437,000
outcomes each paid a memo lookup, deadline checks, and terminal checks, while the planner itself
ran only 3,160 times.

Transition templates remove that per-outcome work. Everything an expansion computes before the
joint advance step (dice outcomes, rift self-damage, and the target HP vector of every assignment
option) depends on the joint state only through a factor: the slot and solver context, the living
dice ships of the slot by configuration group, the shooter's minimum living shield when its fleet
mixes shields, the shooter's whole canonical HP when the slot fires missiles or rift dice, and the
target's canonical HP. The 14-ship graph has 113,000 expansions but only about 5,400 distinct
factors, so `BattleModel` memoizes the template per factor and joint states that share it pay
only the advance step per outcome. Template vectors are representatives of canonical states: a
joint state whose raw roster layout differs from the first-seen layout receives canonically equal
successors, which the solver identifies anyway, and multi-fleet carry-over consumes them by
canonical equivalence. A heuristic planner whose ordering can tie ships of different
configurations depends on the raw layout, so such factors are marked and their states keep
per-state expansion. Measured uncapped: 14-ship construction 0.36 s to 0.20 s (total 0.26 s), the
12-ship minimax build 24 s to 1.8 s (total 1.9 s), and the interactive 14-ship exact-DPS tier
about 274 ms (range 270 to 299 ms over five runs). A 48-row differential across rift, missile,
mixed-shield, tie-prone, splitter, NPC, heal, damaged-roster, and multi-fleet cases in policy and
minimax modes matched the previous solver to 2e-14.

The 12-ship exact-optimal tier remains outside the 300 ms budget: its build is now candidate
enumeration and option bookkeeping over about 2.1 million assignment options, so the preflight
still routes it to exact DPS.

## Benchmark Assets

Permanent repository assets are warranted when they make algorithmic regressions reproducible:

- a small named corpus covering trivial, representative, exact-boundary, many-dice,
  many-configuration, rift/heal, and multi-fleet battles;
- an opt-in runner that reports both work counters and wall time; and
- correctness expectations or tolerances plus a short explanation of what each case stresses.

Shared scenarios in `scripts/matchups.ts` are correctness fixtures. The opt-in permanent harness is
`scripts/benchmark-combat.ts`; run it with `bun run benchmark:combat -- [runs]` (three runs by
default). It covers small and large mirrors, homogeneous and late-homogeneous minimax states,
repeated multi-fleet engagements, positive and negative initiative-order reuse, saturated ordinary
damage with a DPS safeguard, asymmetric role reversal, missiles, and healing. Neither file is a
timing baseline. A scenario may be shared with the benchmark runner, but a slow exploratory case
should be promoted only when it represents a lasting correctness or complexity boundary.

Keep these artifacts temporary and out of version control:

- raw before/after timing tables;
- CPU profiles, flamegraphs, and heap snapshots;
- generated benchmark output and machine-specific baselines; and
- exploratory fleets that do not encode a lasting regression case.

Do not use a hard one-second CI assertion. Shared runners vary too much for a stable wall-clock
gate. CI should enforce correctness and, where robust, coarse deterministic work limits. Evaluate
the user-facing time target locally and spot-check representative mobile hardware.

## Measurement Procedure

1. Run focused correctness tests before profiling.
2. Warm the runtime, then run each case multiple times in the same Bun/browser version.
3. Record median wall time, work counters, strategy tier, and result accuracy.
4. Profile the dominant case and change one cost center at a time.
5. Re-run the full corpus and mutable/exact parity tests.
6. Commit only reusable cases, runner changes, tests, and updated methodology—not generated data.

## Web Worker Execution

The browser application snapshots serializable fleet inputs and runs `CombatRunner` in a dedicated
worker that stays alive between requests, so later requests run on warm code (a fresh worker's
first small solve costs about twice as much as a warm one). A new edit terminates a worker whose
request is still in flight before the debounced replacement request begins, and the next request
starts a fresh worker; an app-level request version also prevents a late response from replacing
newer odds. The client keeps the latest `SolverCalibration` from each result and sends it with the
next request, so calibration survives those restarts. The previous result remains visible but is
explicitly labeled as stale while the replacement is pending.

The worker keeps input and rendering responsive, but it does not reduce solver work or make an
oversized graph finish sooner. It must continue to call the same combat runner and return the same
result contract; do not add a second copy of combat or fallback policy to the worker boundary.
