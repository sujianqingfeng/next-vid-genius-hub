# Repository Guidelines

## Project Structure & Module Organization
- Framework: Next.js `16.0.8` with React `19.2.1` (app router, Turbopack).
- `app/` holds Next.js routes/layouts; `app/(workspace)/` contains core media workflows and server actions.
- `components/business/` hosts feature-level widgets; `components/ui/` contains primitives. Share only via explicit exports.
- `lib/` is domain‑oriented (e.g. `auth`, `media`, `subtitle`, `providers`) plus infra modules (`config`, `db`, `logger`, `storage`, `proxy`, `orpc`, `query`) and shared `hooks/utils/types`.
- `orpc/` stores RPC definitions consumed by React Query (TanStack Query) clients via `@orpc/*`.
- `packages/` contains shared media engine packages (e.g. `@app/media-core`, `@app/media-node`, `@app/media-providers`, `@app/media-subtitles`, `@app/media-comments`, `@app/job-callbacks`) used by Next, Workers, and containers.
- `drizzle/` is generated migration output (do not hand-edit); `public/` serves static assets.
- `containers/` defines media job containers (e.g. `burner-ffmpeg`, `renderer-remotion`, `media-downloader`, `audio-transcoder`) that compose the `@app/*` packages.
- `cloudflare/` hosts Workers (e.g. `media-orchestrator`) and Cloudflare-specific config; `remotion/` contains the Remotion project used by renderer containers.

## Build, Test, and Development Commands
- `pnpm dev` — start Turbopack dev server during feature work; `pnpm dev:host` binds to `0.0.0.0` for container / remote access.
- `pnpm build` then `pnpm start` — create and validate the production bundle locally.
- `pnpm lint` — run the Next.js ESLint suite; fix or annotate warnings.
- `pnpm test` — run Vitest; add `--watch` for local loops and `--coverage` on persistence‑heavy changes.
- `pnpm db:generate`, `pnpm db:studio`, `pnpm db:d1:migrate:remote` — manage Drizzle schema changes and inspect state against D1.
- `pnpm dev:stack` / `pnpm dev:stack:restart-all` — build and start the media containers defined in `docker-compose.dev.yml`.
- `pnpm cf:dev` — run the Cloudflare Worker stack for the media orchestrator; `pnpm cf:deploy` deploys to production.

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
- Update schema types → `pnpm db:generate` → inspect SQL → apply to D1 with `pnpm db:d1:migrate:remote`; never hand‑edit `drizzle/`.
