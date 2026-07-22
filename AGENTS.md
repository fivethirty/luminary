# Luminary Agent Guide

This file is a routing index. Read [docs/architecture.md](docs/architecture.md) for ownership and
combat contracts, and [docs/performance.md](docs/performance.md) before changing solver strategy,
caps, fallbacks, or performance-sensitive code.

## Runtime

- Use Bun 1.2.19 and the tracked `bun.lock`; do not create npm or legacy binary lockfiles.
- If `bun` is not on `PATH`, prefix commands with `mise exec --`, for example
  `mise exec -- bun run test:engine`.
- Do not edit `dist/` or `node_modules/`. Preserve unrelated worktree changes.

## Task Routing

- App startup, routing, persistence wiring, and simulation orchestration: `src/app.ts`.
- Browser state and setup mutations: `src/ui/state.ts`.
- Ship-config equality and fleet legality: `src/ui/ship-config.ts` and `src/ui/fleet-rules.ts`;
  fleet colors, factions, and derived names: `src/ui/fleet-metadata.ts`.
- Share URLs, stored setups, and chat output: `src/ui/share.ts` and `src/ui/storage.ts`.
- UI elements: the matching folder under `src/ui/components/`; keep its HTML, CSS, and tests
  together.
- Mutable combat semantics and phase order: `src/engine/battle.ts`.
- Shared exact/sampled outcome shape: `src/engine/combat-result.ts`.
- Interactive exact/fallback policy and its shared deadline: `src/engine/combat-runner.ts`.
- Exact transitions: `src/engine/battle-state.ts`; graph solving: `win-probability-solver.ts`.
- Dice outcomes and damage assignment: `dice-distribution.ts`, `candidate-enumerator.ts`, and the
  damage planners.

## Contracts

- `Battle` is authoritative for user-visible combat. Mirror semantic changes in the exact model
  and focused contract tests.
- Preserve versioned share-link decoding and stored-setup compatibility.
- Preserve the state invariant that each fleet has one row/configuration per ship type.
- Reuse a control only when its interaction contract matches. NPC preset pickers are commands
  that add, increment, or swap ships; they are intentionally not ordinary value selects.
- Record new approximations or intentional mutable/exact differences in the architecture docs.

## Validation

- After changing source or test files, run `bun run lint:fix` to apply Prettier formatting and
  other safe ESLint fixes before final validation.
- Exact solver: `bun run test:solver`; other engine work: `bun run test:engine`.
- UI work: run the nearest component/state test while iterating.
- Type and style: `bun run typecheck` and `bun run lint`.
- Cross-module completion: `bun run check` (includes the production build). Use `bun run build`
  alone for a focused asset/build check.

Use the narrowest command while iterating. Do not commit benchmark output; the performance guide
explains which benchmark assets should persist.
