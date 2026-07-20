# Luminary

[![Tests](https://github.com/fivethirty/luminary/actions/workflows/test.yml/badge.svg)](https://github.com/fivethirty/luminary/actions/workflows/test.yml)

Luminary is a battle calculator for [Eclipse: Second Dawn for the
Galaxy](https://boardgamegeek.com/boardgame/246900/eclipse-second-dawn-for-the-galaxy).
It lives at [luminary.baysoft.dev](https://luminary.baysoft.dev).

## Dependencies

Luminary uses Bun 1.2.19 as its runtime and package manager. Install it directly or with the
provided [mise](https://mise.jdx.dev/) file (recommended). `bun.lock` is the sole dependency
lockfile.

To start the dev server:

```bash
mise install
mise exec -- bun install --frozen-lockfile
mise exec -- bun run dev
```

If the pinned Bun version is already on your `PATH`, the `mise exec --` prefix is optional.

The app will be available at http://localhost:3000

## Architecture

See [docs/architecture.md](docs/architecture.md) for application and engine ownership, exact-solver
semantics, intentional model differences, and focused validation commands. Performance strategy
and measurement policy live in [docs/performance.md](docs/performance.md).

## Bugs

Please report any bugs using the
[Issues](https://github.com/fivethirty/luminary/issues) tab above.
