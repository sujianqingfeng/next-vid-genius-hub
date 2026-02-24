# Failure Matrix

## `failed` with `Internal API URL is not allowed`

- Cause: input contains `/api/*` URL or local app/orchestrator endpoint.
- Fix: replace with third-party URL or local file path.

## `failed` in download stage

- Cause: `yt-dlp`, `ffmpeg`, or `ffprobe` missing on PATH.
- Fix: install binaries and rerun.

## `failed` in render-comments stage

- Cause: Remotion composition not found or Chromium runtime unavailable.
- Fix: verify `packages/remotion-project/remotion/Root.tsx` composition IDs and local Chrome/headless binary.

## `failed` in ASR stage

- Cause: missing ASR key/model/url, provider returned non-2xx, or unsupported payload shape.
- Fix: set `ASR_API_KEY` (or `input.apiKey`), confirm endpoint/model, inspect saved job error.

## Terminal state overwritten concerns

- Protection: `state-store.ts` blocks non-terminal updates after terminal state.
- Action: inspect `.local-jobs/<jobId>.json` `lastEventSeq` and `events[]`.

## `pnpm local-run:check-boundary` failed

- Cause: `fetch()` usage outside `executors/`.
- Fix: move outbound network logic into an executor module.
