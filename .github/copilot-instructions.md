# Luminary

- Runtime and package manager: Bun.
- Language: strict TypeScript with path aliases from `tsconfig.json`.
- Keep changes focused and preserve public APIs unless the task requires a contract change.
- Prefer existing engine helpers and planners over parallel implementations.
- Read `docs/architecture.md` before changing combat semantics or the exact solver.

## Ownership

- `src/engine/battle.ts`: authoritative mutable combat loop and user-visible battle semantics.
- `src/engine/battle-rules.ts`: pure terminal-outcome mapping shared by both engines.
- `src/engine/ship.ts` and `fleet.ts`: mutable entities, weapons, planner lifetime, and reset behavior.
- `src/engine/battle-state.ts`: immutable exact-model schedule and one-slot transitions.
- `src/engine/dice-distribution.ts`: exact dice-outcome enumeration.
- `src/engine/win-probability-solver.ts`: graph construction, minimax evaluation, and outcome propagation.
- `src/engine/optimal-damage-planner.ts`: mutable-engine adapter and solver caching.
- `src/ui`: browser components and application state.

Do not duplicate mutable battle transitions in the solver. When `Battle` scheduling, terminal
rules, healing, or damage order changes, update the corresponding pure model behavior and
contract tests in the same change.

## Validation

- Solver changes: `bun run test:solver`.
- Other engine changes: `bun run test:engine`.
- Type checking: `bun run typecheck`.
- Linting: `bun run lint`.
- Cross-module or final validation: `bun run check`.

Use the narrowest relevant command while iterating. Do not edit generated output or commit
benchmark output as fixtures; shared solver scenarios belong in `scripts/matchups.ts`.