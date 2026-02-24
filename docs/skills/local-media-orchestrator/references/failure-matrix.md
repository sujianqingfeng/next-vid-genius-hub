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

## `failed` or long retry in render-comments with avatar URL 429/ORB

- Cause: remote avatar host throttles/blocks rendering runtime (`yt3.ggpht.com` often returns 429), causing `<Img>` fetch retry loops.
- Fix:
  - Prefer avatar inlining (default): `avatarMode=inline`
  - For blocked environments, pass `avatarProxyUrl`
  - Force placeholder avatars: `avatarMode=initial`
- Example:
  - `pnpm local-run render-comments --payload '{"dataPath":"<comments-snapshot.json>","avatarMode":"initial"}'`

## `failed` in ASR stage

- Cause: missing ASR key/model/url, provider returned non-2xx, or unsupported payload shape.
- Fix: set `ASR_API_KEY` (or `input.apiKey`), confirm endpoint/model, inspect saved job error.

## `failed` in comments-translate stage

- Cause: missing translation key/model/url, provider returned non-2xx, or response is not valid JSON array payload.
- Fix: set `TRANSLATE_API_KEY` (or `input.apiKey`), confirm `input.apiUrl` and `input.model`, then retry with smaller `batchSize`.

## `failed` in comments-review stage

- Cause: `mode=apply` without review file, invalid review schema, or unresolved decisions in strict mode.
- Fix:
  - provide `reviewPath`/`reviewUrl` when applying
  - ensure review file contains `items` (or `decisions`) with `id` + `decision`
  - finish all decisions (`keep` or `remove`) before strict apply
  - if needed for fast draft, set `"strict": false` to auto-resolve missing/pending by fallback decision

## `failed` with `fetch failed` in comments/channel provider flows

- Cause: provider endpoint is blocked/unreachable on direct path, or local DNS/TLS path is hijacked.
- Typical signal: TLS name mismatch such as `ERR_TLS_CERT_ALTNAME_INVALID` when requesting YouTube.
- Fix: run provider flows with explicit `proxyUrl`, and verify with:
  - `curl -x http://127.0.0.1:17890 -I https://www.youtube.com`

## `failed` with proxy connection refused

- Cause: proxy core not running, wrong local port, or port conflict.
- Typical signal: `Failed to connect to 127.0.0.1:<port>`.
- Fix: use an available dedicated local port (recommended `17890`) and update payload `proxyUrl`.

## Terminal state overwritten concerns

- Protection: `state-store.ts` blocks non-terminal updates after terminal state.
- Action: inspect `.local-jobs/<jobId>.json` `lastEventSeq` and `events[]`.

## `pnpm local-run:check-boundary` failed

- Cause: `fetch()` usage outside `executors/`.
- Fix: move outbound network logic into an executor module.
