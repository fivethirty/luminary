# Combat Performance

Combat runs synchronously in the browser, so elapsed time is part of the user-facing contract.
The practical target is to keep a settled edit below one second on the development machine and to
avoid spending a fresh timeout at every fallback tier. Mobile devices need separate spot checks;
desktop timing alone is not a mobile guarantee.

Correctness remains the first constraint. Performance work must preserve the rules in
[architecture.md](architecture.md), and any new approximation must be named, measured, and
documented.

## Interactive Strategy Ladder

The engine's `CombatRunner` owns the strategy choice and a single total interactive deadline. It
evaluates these named tiers in order:

1. **`exact-optimal`:** enumerate dice outcomes and use minimax assignment for eligible optimal
   player roles.
2. **`exact-dps`:** if optimal exact is ineligible or exceeds its allocation, use the remaining
   exact budget to compute exact dice probabilities with deterministic DPS/NPC assignment.
3. **`monte-carlo-dps`:** if neither exact tier finishes, sample battles with explicit DPS planners
   for players and the official planner for NPCs.

The deadline is not reset between exact tiers. A tier receives only the time remaining, and an
exact tier is skipped when no budget remains. Once the runner chooses Monte Carlo, mutable fleets
must not start another hidden optimal solve. This prevents a failed exact attempt from paying one
timeout per fleet or engagement before reaching the intended fallback.

The default deadline is 950ms. The runner reserves 350ms for deadline-aware sampling and limits an
optimal exact attempt that passes preflight to 300ms, leaving room for the exact DPS tier. Monte
Carlo reports the number of iterations actually completed rather than assuming it reached its
requested 5,000.

`CombatRunResult` records the method, targeting policy, tier, a user-facing method label, elapsed
time, and actual iteration count when sampled. Its serializable diagnostics include the deadline,
preflight reason and state estimate, every attempt and fallback, and whether the total deadline was
exceeded. Exact DPS-policy results are exact for that deterministic targeting policy; they are not
minimax-optimal results.

Complexity preflights are routing decisions, not combat rules. The current estimate is a
deterministic upper bound derived from configuration-group HP multisets and schedule size. An
estimate at or above 50,000 states skips the minimax tier; for example, the tracked 8-interceptor
plus 4-cruiser mirror estimates 72,900 states. Keep the threshold with the exact preflight, cover
it with focused tests, and measure whether it still avoids wasted work as the solver changes.

The preflight also reports `trivial-target` when one engaged fleet has a single ship type. Damage
assignment against that target uses DPS policy without discarding any still-meaningful optimal role
for the other side.

## What to Measure

Record wall time for user impact and deterministic work counters for useful comparisons across
machines. At minimum, exact-solver investigations should capture:

- reachable and terminal state counts;
- chance states and attacker/defender decision states;
- enumerated chance outcomes and assignment options;
- value-iteration sweeps and convergence/failure reason;
- multi-fleet branch count where applicable; and
- selected strategy tier and remaining budget at each transition.

Also record input shape: fleet and ship counts, distinct ship configurations, weapon dice, shield
variety, missiles, rifts, healing, antimatter splitting, and assignment policy. A faster result is
not comparable if the policy or probability tolerance changed.

For Monte Carlo, report iterations, elapsed time, and a fixed-seed or statistical comparison when
evaluating accuracy. Do not treat a single sampled percentage as a correctness fixture.

## Benchmark Assets

Permanent repository assets are warranted when they make algorithmic regressions reproducible:

- a small named corpus covering trivial, representative, exact-boundary, many-dice,
  many-configuration, rift/heal, and multi-fleet battles;
- an opt-in runner that reports both work counters and wall time; and
- correctness expectations or tolerances plus a short explanation of what each case stresses.

Shared scenarios in `scripts/matchups.ts` are correctness fixtures. The opt-in permanent harness is
`scripts/benchmark-combat.ts`; run it with `bun run benchmark:combat -- [runs]` (three runs by
default). Neither file is a timing baseline. A scenario may be shared with the benchmark runner,
but a slow exploratory case should be promoted only when it represents a lasting correctness or
complexity boundary.

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

## Web Worker Decision

Moving combat to a Web Worker is deliberately deferred. A worker can keep input and rendering
responsive, but it does not reduce solver work or make an oversized graph finish sooner. It also
adds serialization, cancellation, bundling, and service-worker/offline considerations.

Revisit a worker after the strategy ladder and algorithmic optimizations are measured on mobile.
Use one when representative supported battles still create unacceptable main-thread stalls, or
when cancellation/progress becomes a product requirement. A worker implementation must call the
same combat runner and return the same result contract; it must not grow a second copy of combat
or fallback policy.
