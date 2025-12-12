# Repository Guidelines

## Project Structure & Module Organization
- Framework: Next.js `16.0.8` with React `19.2.1` (app router, Turbopack, Cloudflare/OpenNext deployment).
- `app/` holds Next.js routes/layouts; `app/(workspace)/` contains core media workflows and server actions.
- `components/business/` hosts feature-level widgets (e.g. channels, dashboard, media); `components/ui/` contains primitives (buttons, inputs, dialogs). Share only via explicit exports.
- `lib/` is domain‑oriented (e.g. `auth`, `media`, `subtitle`, `providers`, `ai`, `points`, `job`) plus infra modules (`config`, `db`, `logger`, `storage`, `proxy`, `orpc`, `query`, `cloudflare`) and shared `errors/hooks/utils/types`.
- `orpc/` stores RPC definitions consumed by React Query (TanStack Query) clients via `@orpc/*`.
- `packages/` contains shared media engine packages (e.g. `@app/media-core`, `@app/media-node`, `@app/media-providers`, `@app/media-subtitles`, `@app/media-comments`, `@app/media-domain`, `@app/job-callbacks`) used by Next, Workers, and containers.
- `docs/` hosts internal development and deployment docs (DEV/PRODUCTION, Cloudflare and containers migration guides, etc.).
- `i18n/` and `messages/` define next-intl configuration and locale message catalogs for multi-language UI.
- `drizzle/` is generated migration output (do not hand-edit); `public/` serves static assets.
- `containers/` defines media job containers (e.g. `burner-ffmpeg`, `renderer-remotion`, `media-downloader`, `audio-transcoder`) that compose the `@app/*` packages.
- `cloudflare/` hosts Workers (e.g. `media-orchestrator`) plus Worker-specific React components/templates; `remotion/` contains the Remotion project used by renderer containers.

Cloudflare deployment is wired through `wrangler.json` / `wrangler.toml` and `open-next.config.ts` at the repository root.

## Build, Test, and Development Commands
- `pnpm dev` / `pnpm dev:host` — start the Turbopack dev server bound to `0.0.0.0` for local and container / remote access.
- `pnpm build` then `pnpm start` — create and validate the production bundle locally.
- `pnpm lint` — run the Next.js ESLint suite (core-web-vitals); fix or annotate warnings.
- `pnpm test` — run Vitest; add `--watch` for local loops and `--coverage` on persistence‑heavy changes.
- `pnpm db:generate`, `pnpm db:studio`, `pnpm db:d1:migrate:remote`, `pnpm db:d1:list:remote` — manage Drizzle schema changes and inspect D1 state (including applied/pending migrations) against remote.
- `pnpm dev:stack` / `pnpm dev:stack:down` — start or tear down the media containers defined in `docker-compose.dev.yml`.
- `pnpm dev:stack:rebuild-*` / `pnpm dev:stack:restart-*` / `pnpm dev:stack:restart-all` — rebuild and restart individual containers or the full media stack.
- `pnpm cf:dev` / `pnpm cf:dev:lite` — run the Cloudflare Worker stack for the media orchestrator (full vs lite local env); `pnpm cf:deploy` deploys to production.
- `pnpm build:packages`, `pnpm typecheck:packages` — build and type‑check all `@app/*` workspace packages.

## Coding Style & Naming Conventions
- Prefer TypeScript and server components; add `'use client'` only when interactivity is required.
- Biome formatting: tab indentation, single quotes, minimal semicolons. Run the formatter before commits.
- Naming: components `PascalCase`; hooks/utilities `camelCase`; environment variables `UPPER_SNAKE_CASE`.
- Group new features under `app/(workspace)` and colocate reusable UI logic in `components/business`.

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

## Server Environment Variables (Next app)
These are read from `process.env` under `lib/config/env.ts` and used across the app:

- `CLOUDFLARE_ASR_MAX_UPLOAD_BYTES` — max payload size for Workers AI ASR upload (bytes); default `4 * 1024 * 1024`.
- `ASR_TARGET_BITRATES` — comma-separated audio target bitrates for ASR pre-processing, e.g. `48,24`.
- `ASR_SAMPLE_RATE` — target audio sample rate for ASR; default `16000`.
- `CF_ORCHESTRATOR_URL` — public URL of the orchestrator Worker; used for `/artifacts/:jobId` and debug presign endpoints.
- `JOB_CALLBACK_HMAC_SECRET` — shared secret used for HMAC between Next and the orchestrator (callbacks, debug delete, etc.).
