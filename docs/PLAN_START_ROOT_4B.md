# Plan 4B: Move TanStack Start to repo root (no `apps/start`) + clean structure

## Goal

- Make TanStack Start the **root app** (no `apps/start` directory).
- Align the web app layout with the TanStack Start `start-basic` example:
  - `public/`
  - `src/` (all app code)
  - `src/routes/*`
  - `src/router.tsx`, `src/routeTree.gen.ts`
- Remove the “repo-root aliasing” behavior:
  - `~/*` must resolve to `src/*` only.
  - App code must not rely on `~` pointing to the repository root.

Non-goals:
- Do not move or re-architect container/worker/media engine packages unless required.
- Keep `packages/*`, `containers/*`, `cloudflare/*`, `remotion/*` stable.

## Target structure (web app)

- `public/` (Start assets + existing static files)
- `src/`
  - `routes/` (TanStack Router routes)
  - `components/` (web UI components)
  - `lib/` (web/server runtime for Start)
  - `orpc/` (RPC contract/client for the web app)
  - `i18n/`, `messages/` (next-intl catalogs/config used by UI)
  - `styles.css`
  - `router.tsx`
  - `routeTree.gen.ts`
  - `worker.ts`

## Execution steps

### Step 1 — Move Start app from `apps/start` to repo root

Use `git mv` to preserve history:
- `apps/start/src` → `src`
- `apps/start/public/*` → `public/*` (merge; remove obviously Next-only boilerplate assets if unused)
- Move/merge root-level configs from `apps/start/` into repo root:
  - `apps/start/vite.config.ts` → `vite.config.ts`
  - `apps/start/vite.root.config.ts` → `vite.root.config.ts` (if still needed)
  - `apps/start/wrangler.*.jsonc` → `wrangler.*.jsonc` (keep current `wrangler.toml` for orchestrator)
  - `apps/start/postcss.config.mjs` → `postcss.config.mjs` (merge with existing)
  - `apps/start/biome.json` → keep repo root `biome.json`
  - Remove `apps/start/package.json` by merging required deps/scripts into root `package.json`

### Step 2 — Clean up path aliases (4B requirement)

Update repo-root TS/Vite config so `~/*` only points at `src/*`:
- `tsconfig.json` paths: `~/*` → `./src/*`
- `vite.config.ts` remove `repoRoot` alias replacement (`{ find: /^~\\//, replacement: ... }`)
  - rely on `vite-tsconfig-paths` (or add a Vite alias for `~/` → `<root>/src/`).

Then fix imports:
- Any import that used `~/lib/*`, `~/orpc/*`, `~/i18n/*`, `~/messages/*`, `~/components/*` must now resolve inside `src/`.

### Step 3 — Move web-shared folders into `src/`

Move the folders currently living at repo root (web app dependencies) into `src/`:
- `components/` → `src/components/`
- `lib/` → `src/lib/`
- `orpc/` → `src/orpc/`
- `i18n/` → `src/i18n/`
- `messages/` → `src/messages/`

Notes:
- The Start template ships with demo code (`src/routes/demo/*`, `src/data/demo.*`, `src/orpc/*`). If it collides with the real app folders (especially `orpc/`), remove the demo/template code or move it under `src/demo/` before moving the real folders.
- If anything outside the web app imports these (e.g. `cloudflare/*`, `containers/*`, `packages/*`), either:
  - update those imports to use relative paths to `src/*`, or
  - (preferred) stop sharing UI/server code across those targets and keep them independent.

### Step 4 — Update workspace and scripts

- `pnpm-workspace.yaml`: remove `apps/*` pattern if no longer used.
- Root `package.json` scripts:
  - Replace `pnpm -C apps/start ...` with direct root scripts (`vite`, `wrangler`, etc).
  - Update D1 migration scripts to use `--config wrangler.root.jsonc` at repo root.

### Step 5 — Remove `apps/` folder (if empty) and verify

Verification commands:
- `pnpm install` (if lockfile changes)
- `pnpm build`
- `pnpm dev` (local-lite)
- `pnpm lint`
- `pnpm test` (if applicable)

### Step 6 — Commit

One commit with a clear message, e.g.:
- `refactor(start): move app to repo root (plan 4B)`
