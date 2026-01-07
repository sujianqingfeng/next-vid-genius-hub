# `src/lib` layering

This folder is split by intent to keep dependencies predictable.

## Layers

- `shared/`: cross-cutting utilities (types, utils, hooks, i18n, config). Safe to import from anywhere.
- `domain/`: business logic and domain types. Prefer pure functions; may import from `shared/`.
- `features/`: use-cases / orchestration (server actions, workflows). May import from `domain/`, `shared/`, and `infra/`.
- `infra/`: platform/external adapters (Cloudflare, DB, logging, proxy). Should be dependency-bottom; avoid importing `features/`.

## Dependency rules (recommended)

- `shared` → no dependencies on other `src/lib/*` layers.
- `domain` → may depend on `shared` (and workspace packages like `@app/*`), but not on `features`.
- `features` → may depend on `domain`, `shared`, `infra`.
- `infra` → may depend on `shared` (prefer moving shared types/utilities out of `domain` if `infra` needs them).
