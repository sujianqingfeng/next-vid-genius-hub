# Repository Guidelines

## Project Structure & Module Organization
- `app/` holds Next.js routes/layouts; `app/(workspace)/` contains core media workflows and server actions.
- `components/business/` hosts feature-level widgets; `components/ui/` contains primitives. Share only via explicit exports.
- `lib/` centralizes AI/media utilities and shared hooks; `orpc/` stores RPC definitions consumed by React Query clients.
- `drizzle/` is generated migration output (do not hand-edit); `public/` serves static assets; `scripts/` contains operational helpers (e.g., ingestion jobs, ffmpeg/yt-dlp wrappers).

## Build, Test, and Development Commands
- `pnpm dev` — start Turbopack dev server during feature work.
- `pnpm build` then `pnpm start` — create and validate the production bundle locally.
- `pnpm lint` — run the Next.js ESLint suite; fix or annotate warnings.
- `pnpm test` — run Vitest; add `--watch` for local loops and `--coverage` on persistence‑heavy changes.
- `pnpm db:generate`, `pnpm db:studio`, `pnpm db:d1:migrate:remote` — manage Drizzle schema changes and inspect state against D1.

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
