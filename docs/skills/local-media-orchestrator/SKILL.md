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

## Proxy guidance (provider flows)

- `comments-download` and `channel-sync` should pass `input.proxyUrl` in environments where direct access to provider endpoints is unstable or blocked.
- Do not assume `7890` is available. For smoke runs in this repo, use a dedicated non-default local port such as `17890`.
- Validate proxy path before provider flow runs:
  - `curl -x http://127.0.0.1:17890 -I https://www.youtube.com`
- Example commands:
  - `pnpm local-run comments-download --payload '{"url":"https://www.youtube.com/watch?v=...","source":"youtube","proxyUrl":"http://127.0.0.1:17890"}'`
  - `pnpm local-run channel-sync --payload '{"channelUrlOrId":"<channel-url-or-id>","limit":5,"proxyUrl":"http://127.0.0.1:17890"}'`
- Keep subscription URLs and credentials out of repo files; load them in local runtime only.

## Commands

- `pnpm local-run download --payload '{...}'`
- `pnpm local-run render-subtitles --payload '{...}'`
- `pnpm local-run render-comments --payload '{...}'`
- `pnpm local-run comments-translate --payload '{...}'`
- `pnpm local-run comments-review --payload '{...}'`
- `pnpm local-run comments-download --payload '{...}'`
- `pnpm local-run channel-sync --payload '{...}'`
- `pnpm local-run thread-asset-ingest --payload '{...}'`
- `pnpm local-run asr --payload '{...}'`
- `pnpm local-run proxy-check --payload '{...}'`
- `pnpm local-run status <jobId>`
- `pnpm local-run cancel <jobId>`

## Translation note (comments render)

- `comments-download` only fetches source-language comments. It does not run AI translation.
- Use `comments-translate` between download and render if translated title/comments are required.
- `render-comments` only consumes what is already in the snapshot JSON:
  - title translation field: `videoInfo.translatedTitle`
  - comment translation field: `comments[].translatedContent`
- If these fields are empty, output will be source language only.

## Review note (comments moderation)

- Recommended flow for publish-safe comments video:
  - `comments-download` -> `comments-translate` -> `comments-review` -> `render-comments`
- `comments-review` supports two modes:
  - `mode=prepare`: generate editable review template (`decision: keep|remove|pending`)
  - `mode=apply`: apply reviewed decisions and output filtered snapshot for rendering
- In `mode=apply`, strict mode is enabled by default:
  - command fails if any comment is still `pending` or missing in the review file
- Example:
  - `pnpm local-run comments-review --payload '{"dataPath":"<translated-snapshot.json>","mode":"prepare"}'`
  - edit generated template and set each item `decision` to `keep` or `remove`
  - `pnpm local-run comments-review --payload '{"dataPath":"<translated-snapshot.json>","mode":"apply","reviewPath":"<comments-review.template.json>"}'`
  - `pnpm local-run render-comments --payload '{"dataPath":"<reviewed-snapshot.json>","avatarMode":"inline"}'`

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
  - optional avatar handling:
    - `avatarMode`: `inline` (default), `remote`, `initial`
    - `avatarProxyUrl`: proxy URL used when `avatarMode=inline`
    - `avatarTimeoutMs`: per-image timeout in milliseconds
    - `avatarInlineConcurrency`: parallel avatar inlining limit
- Current compose-on-video support targets comments templates (`comments-default`, `comments-vertical`).

## References

- Pipeline map: `references/pipeline-map.md`
- New task template: `references/new-task-template.md`
- Failure matrix: `references/failure-matrix.md`
- Smoke checklist: `references/smoke-checklist.md`
