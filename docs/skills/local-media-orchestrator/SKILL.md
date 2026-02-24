---
name: local-media-orchestrator
description: Local-first media orchestration for this repository using Node scripts and function calls only. Use when implementing or running download, subtitle render, comments render, comments download, channel sync, thread asset ingest, ASR, or proxy checks without database access and without calling internal app/orchestrator APIs.
---

# Local Media Orchestrator

Implement and run media workflows via `scripts/local-job-runner`.

## Core rules

- Keep the orchestration core API-first and local-only:
  - `runJob(spec, ports)`
  - `cancelJob(jobId, reason?)`
  - `getStatus(jobId)`
  - `emitEvent(jobId, event)`
- Store state in `.local-jobs/*.json`.
- Do not call internal repository APIs (`/api/*`, local app worker, local orchestrator worker).
- Allow outbound network only in `executors/*`.

## Commands

- `pnpm local-run download --payload '{...}'`
- `pnpm local-run render-subtitles --payload '{...}'`
- `pnpm local-run render-comments --payload '{...}'`
- `pnpm local-run comments-download --payload '{...}'`
- `pnpm local-run channel-sync --payload '{...}'`
- `pnpm local-run thread-asset-ingest --payload '{...}'`
- `pnpm local-run asr --payload '{...}'`
- `pnpm local-run proxy-check --payload '{...}'`
- `pnpm local-run status <jobId>`
- `pnpm local-run cancel <jobId>`

## Implement in this order

1. Add or adjust contracts in `scripts/local-job-runner/src/contracts.ts`.
2. Keep state idempotency and terminal-state protection in `scripts/local-job-runner/src/state-store.ts`.
3. Add or update executor logic under `scripts/local-job-runner/src/executors/*`.
4. Wire executor mapping in `scripts/local-job-runner/src/dispatch.ts`.
5. Keep CLI behavior in `scripts/local-job-runner/src/cli.ts` stable.
6. Run boundary check: `pnpm local-run:check-boundary`.

## Render compose notes

- `render-comments` supports source-video composition:
  - provide `sourceVideoPath` or `sourceVideoUrl`
  - optional `composeMode`: `auto` (default), `overlay-only`, `compose-on-video`
  - optional `composeLayout` (`x,y,width,height`) for custom source slot
- Current compose-on-video support targets comments templates (`comments-default`, `comments-vertical`).

## References

- Pipeline map: `references/pipeline-map.md`
- New task template: `references/new-task-template.md`
- Failure matrix: `references/failure-matrix.md`
- Smoke checklist: `references/smoke-checklist.md`
