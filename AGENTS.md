# Repository Guidelines

## Project Structure & Module Organization
- Framework: TanStack Start (React `19.2.1`) + Vite (Cloudflare Workers runtime via Wrangler).
- `apps/web/src/` holds app routes (`apps/web/src/routes/**`), router setup, and Worker entry (`apps/web/src/worker.ts`).
- `apps/web/src/components/business/` hosts feature-level widgets (e.g. channels, dashboard, media); `apps/web/src/components/ui/` contains primitives (buttons, inputs, dialogs). Share only via explicit exports.
- `apps/web/src/lib/` is domain‑oriented (e.g. `auth`, `media`, `subtitle`, `providers`, `ai`, `points`, `job`) plus infra modules (`config`, `db`, `logger`, `storage`, `proxy`, `orpc`, `query`, `cloudflare`) and shared `errors/hooks/utils/types`.
- `apps/web/src/orpc/` stores RPC definitions consumed by TanStack Query clients via `@orpc/*`.
- `packages/` contains shared media engine packages (e.g. `@app/media-core`, `@app/media-node`, `@app/media-providers`, `@app/media-subtitles`, `@app/media-comments`, `@app/media-domain`, `@app/job-callbacks`) used by the app Worker, the orchestrator Worker, and containers.
- `workers/media-orchestrator/` hosts the orchestrator Worker runtime (wrangler dev/deploy).
- `docs/` hosts internal development and deployment docs (DEV/PRODUCTION, Cloudflare and containers migration guides, etc.).
- `apps/web/src/integrations/i18n` and `apps/web/src/messages/` define i18n wiring and locale message catalogs for multi-language UI.
- `apps/web/drizzle/` is generated migration output (do not hand-edit); `apps/web/public/` serves static assets.
- `containers/` defines media job containers (e.g. `burner-ffmpeg`, `renderer-remotion`, `media-downloader`) that compose the `@app/*` packages.
- `packages/remotion-project/` contains the Remotion project used by both Web UI and renderer containers.

Cloudflare deployment is wired through `apps/web/wrangler.root.jsonc` (app Worker) and `workers/media-orchestrator/wrangler.toml` (orchestrator Worker).

## Build, Test, and Development Commands
- `pnpm dev:web` — local app dev via `wrangler dev` (closest to production Worker runtime). (`pnpm dev` aliases to this)
- `pnpm dev:web:vite` — Vite dev server for fast UI iteration (not identical to Worker runtime).
- `pnpm build:web` / `pnpm preview:web` — build and preview the production bundle locally (Vite). (`pnpm build` / `pnpm preview` are aliases)
- `pnpm deploy:web` — deploy the app Worker to Cloudflare with root routing config. (`pnpm deploy` is an alias)
- `pnpm lint:web` / `pnpm format:web` / `pnpm test:web` — lint/format/test the web app. (`pnpm lint` / `pnpm format` / `pnpm test` are aliases)
- `pnpm db:generate`, `pnpm db:studio`, `pnpm db:d1:migrate:*`, `pnpm db:d1:list:*` — manage Drizzle schema changes and apply/list D1 migrations (root scripts forward into `apps/web`).
- `pnpm dev:stack` / `pnpm dev:stack:down` — start or tear down the media containers defined in `docker-compose.dev.yml`.
- `pnpm dev:stack:rebuild-*` / `pnpm dev:stack:restart-*` / `pnpm dev:stack:restart-all` — rebuild and restart individual containers or the full media stack.
- `pnpm cf:dev` — run the Cloudflare Worker stack for the media orchestrator (local-lite, external containers); `pnpm cf:deploy` deploys to production.
- `pnpm build:packages`, `pnpm typecheck:packages` — build and type‑check all workspace packages under `packages/*`.

## Coding Style & Naming Conventions
- Prefer TypeScript; keep client-only logic isolated where interactivity is required.
- Oxc formatting (oxfmt): tab indentation, single quotes, minimal semicolons. Run the formatter before commits.
- Naming: components `PascalCase`; hooks/utilities `camelCase`; environment variables `UPPER_SNAKE_CASE`.
- Group new features under `src/routes` and colocate reusable UI logic in `components/business`.
  - Web app routes live under `apps/web/src/routes`.

## Testing Guidelines
- Vitest auto-discovers tests in `**/__tests__/**/*.test.{ts,tsx}` mirroring the source tree.
- Stub AI providers, network fetches, and download pipelines with local fixtures for deterministic runs.
- Cover success, error, and cancellation paths for media pipelines and database adapters.
- Capture `pnpm test` (and coverage when used) output in the PR description.

## Commit & Pull Request Guidelines
- Use Conventional Commits (e.g., `feat:`, `fix:`, `refactor:`) with imperative, scoped summaries; link issues and squash exploratory commits.
- PRs must outline problem, solution, and verification steps; include screenshots or clips for UI changes.
- Flag schema migrations or long‑running media jobs so reviewers can plan rollouts.

## Database & Media Tooling Notes
- Local schema tooling uses a fixed sqlite URL `file:./local.db` configured in `drizzle.config.ts` (no `DATABASE_URL` env required).
- Update schema types → `pnpm db:generate` → inspect SQL → apply to D1 with `pnpm db:d1:migrate:remote` → (optionally) `pnpm db:d1:list:remote` to verify remote state; never hand‑edit `drizzle/`.

## Server Environment Variables (App Worker)
These are read from `process.env` under `apps/web/src/lib/config/env.ts` and used across the app:

- `CLOUDFLARE_ASR_MAX_UPLOAD_BYTES` — max payload size for Workers AI ASR upload (bytes); default `4 * 1024 * 1024`.
- `ASR_TARGET_BITRATES` — comma-separated audio target bitrates for ASR pre-processing, e.g. `48,24`.
- `ASR_SAMPLE_RATE` — target audio sample rate for ASR; default `16000`.
- `CF_ORCHESTRATOR_URL` — public URL of the orchestrator Worker; used for `/artifacts/:jobId` and debug presign endpoints.
- `JOB_CALLBACK_HMAC_SECRET` — shared secret used for HMAC between the app and the orchestrator (callbacks, debug delete, etc.).
- `PROXY_CHECK_TEST_URL` — test video URL used by scheduled proxy health checks (must be a stable, publicly reachable URL).
- `PROXY_CHECK_TIMEOUT_MS` — per-proxy probe timeout in milliseconds; default `20000`.
- `PROXY_CHECK_PROBE_BYTES` — number of bytes to range-download for probe; default `65536`.
