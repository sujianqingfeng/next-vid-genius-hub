---
name: local-media-orchestrator
description: Local-first media orchestration for this repository using Node scripts and function calls only. Use when implementing or running local `scripts/local-job-runner` tasks (download, subtitle render, comments pipelines, comments download, channel sync, thread asset ingest, ASR, proxy checks), diagnosing local job failures, or adding new local-run commands without database access and without calling internal app/orchestrator APIs.
---

# Local Media Orchestrator

Implement and run media workflows via `scripts/local-job-runner` with JSON state stored in `.local-jobs`.

## Core rules

- Keep the orchestration core API-first and local-only:
  - `runJob(spec, ports)`
  - `cancelJob(jobId, reason?)`
  - `getStatus(jobId)`
  - `emitEvent(jobId, event)`
- Store state in `.local-jobs/*.json`, and preserve terminal-state protection.
- Do not call internal repository APIs (`/api/*`, local app worker, local orchestrator worker).
- Allow outbound network only in `scripts/local-job-runner/src/executors/*`.
- Prefer `--input <file.json>` for reusable runs; use `--payload` only for quick one-off experiments.

## Commands (authoritative surface)

- `pnpm local-run download --input <file.json>`
- `pnpm local-run render-subtitles --input <file.json>`
- `pnpm local-run render-comments --input <file.json>`
- `pnpm local-run comments-translate --input <file.json>`
- `pnpm local-run comments-review --input <file.json>`
- `pnpm local-run comments-download --input <file.json>`
- `pnpm local-run channel-sync --input <file.json>`
- `pnpm local-run thread-asset-ingest --input <file.json>`
- `pnpm local-run asr --input <file.json>`
- `pnpm local-run proxy-check --input <file.json>`
- `pnpm local-run status <jobId>`
- `pnpm local-run cancel <jobId>`
- `pnpm local-run clean --days <n> --dry-run`
- `pnpm local-run:check`

Use `references/commands.md` for payload examples and operational flags.

## Workflow guidance

- For provider flows (`comments-download`, `channel-sync`), pass `proxyUrl` when direct access is unstable.
- Do not assume `7890` is available; default to a dedicated local port like `17890`.
- Validate proxy path before provider runs:
  - `curl -x http://127.0.0.1:17890 -I https://www.youtube.com`
- Recommended burned subtitle chain:
  - `download` -> `asr` -> (optional translation/bilingual transform) -> `render-subtitles`
- Recommended publish-safe comments chain:
  - `comments-download` -> `comments-translate` -> `comments-review` -> `render-comments`
- Keep credentials/subscription URLs out of repo files; load secrets at runtime.

## Implement in this order

1. Add or adjust contracts in `scripts/local-job-runner/src/contracts.ts`.
2. Keep state idempotency and terminal-state protection in `scripts/local-job-runner/src/state-store.ts`.
3. Add or update executor logic under `scripts/local-job-runner/src/executors/*`.
4. Wire executor mapping in `scripts/local-job-runner/src/dispatch.ts`.
5. Keep CLI behavior in `scripts/local-job-runner/src/cli.ts` stable.
6. Run checks: `pnpm local-run:check`.

## References

- Commands reference (payload/flags/examples): `references/commands.md`
- Smoke checklist (manual + scripted smoke): `references/smoke-checklist.md`
- Failure matrix (error signature -> fix): `references/failure-matrix.md`
- New task template (add one command safely): `references/new-task-template.md`
- Pipeline map (entrypoints and ownership): `references/pipeline-map.md`
