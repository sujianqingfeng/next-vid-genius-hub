---
name: local-media-orchestrator
description: Local-first media orchestration for this repository using Node scripts and function calls only. Use when implementing or running local `scripts/local-job-runner` tasks (download, subtitle render, comments pipelines, comments download, channel sync, thread asset ingest, ASR, proxy checks), diagnosing local job failures, or adding new local-run commands without database access and without calling internal app/orchestrator APIs.
---

# Local Media Orchestrator

Implement and run media workflows via `scripts/local-job-runner` with JSON state stored in `.local-jobs`.

## Quick start

1. Validate local guardrails:
   - `pnpm local-run:check`
2. Run scripted smoke in static mode:
   - `bash docs/skills/local-media-orchestrator/scripts/smoke.sh --mode static --skip-proxy`
3. Run one dynamic smoke job (optional, validates executable path):
   - `bash docs/skills/local-media-orchestrator/scripts/smoke.sh --mode minimal-run --skip-proxy`

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

Command names are sourced from `scripts/local-job-runner/src/command-surface.ts` and verified by `pnpm local-run:check`.

- `pnpm local-run download --input <file.json>`
- `pnpm local-run render-subtitles --input <file.json>`
- `pnpm local-run render-comments --input <file.json>`
- `pnpm local-run render-comments-compose --input <file.json>`
- `pnpm local-run comments-snapshot-build --input <file.json>`
- `pnpm local-run comments-translate --input <file.json>`
- `pnpm local-run comments-review --input <file.json>`
- `pnpm local-run comments-download --input <file.json>`
- `pnpm local-run channel-sync --input <file.json>`
- `pnpm local-run thread-asset-ingest --input <file.json>`
- `pnpm local-run asr --input <file.json>`
- `pnpm local-run subtitle-translate --input <file.json>`
- `pnpm local-run subtitle-review --input <file.json>`
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
- `render-comments` defaults to horizontal template (`comments-default` / `CommentsVideo`) when `templateId` is not provided.
- `render-comments` avatar default should use real avatars:
  - `avatarMode: "inline"` (default recommendation)
- Use vertical comments video only when explicitly required:
  - `templateId: "comments-vertical"`
- Recommended burned subtitle chain:
  - `download` -> `asr` -> `subtitle-translate` -> `subtitle-review` -> `render-subtitles`
  - `subtitle-translate` generates `subtitle-translation.template.json` in manual mode.
  - `subtitle-review` applies manual `translatedText` into final VTT for `render-subtitles`.
- Recommended publish-safe comments chain:
  - `comments-download` -> `comments-snapshot-build` -> `comments-translate` -> `comments-review` -> `render-comments`
  - `comments-translate` without `templatePath/templateUrl` emits `comments-translation.template.json` for editing.
  - After filling translated text, rerun `comments-translate` with `templatePath` (or `templateUrl`) so review input contains bilingual fields (`content` + `translatedContent`).
  - `comments-review` `prepare` now writes `items[].index` (1-based), so reviewers can decide by number.
  - During review, always export a human-readable checklist (index + author + bilingual text) from `comments-review.template.json` before asking for `removeIndexes`.
    - `jq -r '.items[] | "\(.index)\t\(.author)\t\(.content | gsub("\n"; " "))\t\((.translatedContent // "") | gsub("\n"; " "))"' <comments-review.template.json> > comments-review.index.tsv`
  - `comments-review` `prepare` marks `suggestedDecision=remove` when sensitive keywords are detected (default keywords include `中共`, `国家主席`).
  - `comments-review` `apply` can consume number input directly via `removeIndexes` (e.g. `3,7,12-15`) without editing template files.
  - If a comments overlay video is already available, use `render-comments-compose` to compose directly onto source video without re-rendering comment cards.
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
