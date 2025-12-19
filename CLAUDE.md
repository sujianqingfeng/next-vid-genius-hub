# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build, Test, and Development Commands

```bash
pnpm dev                    # Start TanStack Start dev server (Cloudflare Worker, :3100)
pnpm dev:next               # Start Next.js dev server (Turbopack, 0.0.0.0:3000)
pnpm build                  # Production build
pnpm lint                   # ESLint
pnpm test                   # Vitest (add --watch for dev loop)

# Database (Drizzle + D1)
pnpm db:generate            # Generate migrations from schema
pnpm db:studio              # Open Drizzle Studio
pnpm db:d1:migrate:remote   # Apply migrations to remote D1
pnpm db:d1:list:remote      # List remote migration status

# Media containers (Docker Compose)
pnpm dev:stack              # Start all media containers
pnpm dev:stack:down         # Stop and clean up containers
pnpm dev:stack:restart-*    # Rebuild and restart individual containers (burner, remotion, downloader)

# Cloudflare Worker (media-orchestrator)
pnpm cf:dev                 # Run Worker locally (external containers, no CF Containers)
pnpm cf:deploy              # Deploy to production

# Workspace packages
pnpm build:packages         # Build all @app/* packages
pnpm typecheck:packages     # Type-check all @app/* packages
```

## Architecture Overview

**Stack**: Next.js 16 (app router, Turbopack) + React 19 + Cloudflare (D1, R2, Workers) via OpenNext.

### Directory Structure

- `app/` — Next.js routes; `app/(workspace)/` contains core media workflows and server actions
- `lib/` — Domain modules (`auth`, `media`, `subtitle`, `points`, `providers`, `ai`, `job`) and infra (`config`, `db`, `logger`, `storage`, `proxy`, `orpc`, `query`, `cloudflare`)
- `packages/` — Shared `@app/*` packages used across Next, Workers, and containers:
  - `media-core`, `media-node`, `media-providers`, `media-subtitles`, `media-comments`, `media-domain`, `job-callbacks`
- `cloudflare/` — Workers (e.g., `media-orchestrator`) and Worker-specific components
- `containers/` — Media job containers: `burner-ffmpeg`, `renderer-remotion`, `media-downloader`
- `remotion/` — Remotion video templates for renderer containers
- `orpc/` — RPC definitions consumed by React Query via `@orpc/*`
- `components/business/` — Feature widgets; `components/ui/` — Primitives
- `i18n/`, `messages/` — next-intl config and locale catalogs
- `drizzle/` — Generated migrations (do not hand-edit)

### Media Pipeline Architecture

The system uses a **bucket-first** pattern with R2 as unified object storage:

1. **Next app** — UI/API, DB access, writes per-job manifests to R2
2. **Worker (media-orchestrator)** — Reads manifests, generates S3 presigned URLs, orchestrates containers via Durable Objects, polls for completion, calls back to Next
3. **Containers** — Receive presigned URLs, process media, upload results directly to R2

R2 path convention (defined in `@app/media-domain`):
- Manifests: `manifests/jobs/<jobId>.json`
- Media inputs/outputs: `media/{mediaId}-{slug}/inputs|outputs|downloads|asr/...`

### Local Development Stack

Full local development requires three components running:
1. `pnpm dev:stack` — Docker containers (burner-ffmpeg:9080, renderer-remotion:8190, media-downloader:8100)
2. `pnpm cf:dev` — Worker at localhost:8787
3. `pnpm dev` — Next.js at localhost:3000

## Code Style

- **Formatting**: Biome (tab indentation, single quotes, minimal semicolons)
- **Components**: Prefer server components; use `'use client'` only when interactivity required
- **Naming**: Components `PascalCase`, hooks/utilities `camelCase`, env vars `UPPER_SNAKE_CASE`
- **Path alias**: `~/*` maps to project root

## Database Workflow

Schema lives at `lib/db/schema.ts`. Local tooling uses `file:./local.db` (no env var needed).

Workflow: Edit schema → `pnpm db:generate` → Review generated SQL → `pnpm db:d1:migrate:remote`

## Testing

Vitest discovers tests in `**/__tests__/**/*.test.{ts,tsx}`. Stub AI providers and network calls with fixtures.
