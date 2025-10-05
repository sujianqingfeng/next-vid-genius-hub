# Repository Guidelines

## Project Structure & Module Organization
- `app/` holds Next.js routes and layouts; `app/(workspace)/` packages the core media workflows and server actions.
- `components/business/` contains feature-level widgets, while `components/ui/` keeps primitives; share only through explicit exports.
- `lib/` centralizes AI/media utilities and shared hooks, and `orpc/` stores RPC definitions consumed by React Query clients.
- `drizzle/` is migration output, `public/` serves static assets, and `scripts/` hosts operational helpers such as ingestion jobs.

## Build, Test, and Development Commands
- `pnpm dev` starts the Turbopack dev server; run from repo root during feature work.
- `pnpm build` + `pnpm start` validate the production bundle before releases.
- `pnpm lint` runs the Next.js ESLint suite; fix or annotate any warnings.
- `pnpm test` executes Vitest; use `--watch` for local loops and `--coverage` on persistence-heavy changes.
- `pnpm db:generate`, `pnpm db:migrate`, and `pnpm db:studio` manage Drizzle schema changes.
- `pnpm rebuild:native` rebuilds native deps (`fluent-ffmpeg`, `yt-dlp-wrap`) after Node or OS upgrades.

## Coding Style & Naming Conventions
- Default to TypeScript and server components; mark files with `'use client'` only when interactivity is required.
- Biome enforces tab indentation, single quotes, and minimal semicolons; run the formatter before commits.
- Components use `PascalCase`, hooks/utilities use `camelCase`, environment variables use `UPPER_SNAKE_CASE`.
- Group new features under `app/(workspace)` and colocate reusable UI logic in `components/business`.

## Testing Guidelines
- Place tests in `**/__tests__/**/*.test.{ts,tsx}` mirroring the source tree so Vitest auto-discovers them.
- Stub AI providers, network fetches, and download pipelines with local fixtures for deterministic runs.
- Cover success, error, and cancellation paths for media pipelines and database adapters prior to merging.
- Capture `pnpm test` (and coverage when used) output in the PR description.

## Commit & Pull Request Guidelines
- Use Conventional Commits (`feat:`, `refactor:`, `fix:`) with imperative, scoped summaries and context in the body.
- Reference issues or tasks when available and squash exploratory commits before review.
- PRs must outline problem, solution, verification steps, and include screenshots or clips for UI adjustments.
- Flag schema migrations or long-running media jobs so reviewers can plan rollouts.

## Database & Media Tooling Notes
- Update schema types, run `pnpm db:generate`, inspect SQL, then apply with `pnpm db:migrate`; never hand-edit `drizzle/`.
- Keep ffmpeg, yt-dlp, and similar helpers in `scripts/` and document required binaries in the PR when usage changes.
