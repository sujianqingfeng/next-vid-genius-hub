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

## `failed` in comments-snapshot-build stage

- Cause: input payload is not an array/object with `comments`, or normalized comments list becomes empty.
- Fix:
  - pass raw comments array/object via `dataPath`/`dataUrl`, or inline `comments`
  - ensure each comment has basic text fields (`content`, optional `author`)
- Example:
  - `pnpm local-run comments-snapshot-build --payload '{"dataPath":"<comments.json>","title":"<video-title>","author":"<channel-name>"}'`

## `failed` or long retry in render-comments with avatar URL 429/ORB

- Cause: remote avatar host throttles/blocks rendering runtime (`yt3.ggpht.com` often returns 429), causing `<Img>` fetch retry loops.
- Fix:
  - Prefer avatar inlining (default): `avatarMode=inline`
  - For blocked environments, pass `avatarProxyUrl`
  - Force placeholder avatars: `avatarMode=initial`
- Example:
  - `pnpm local-run render-comments --payload '{"dataPath":"<comments-snapshot.json>","avatarMode":"initial"}'`

## Comments video rendered as vertical unexpectedly

- Cause: payload explicitly set `templateId: "comments-vertical"`.
- Fix:
  - Use horizontal default by omitting `templateId`, or set `templateId: "comments-default"` explicitly.
- Example:
  - `pnpm local-run render-comments --payload '{"dataPath":"<comments-snapshot.reviewed.json>","templateId":"comments-default"}'`

## `failed` in render-comments-compose stage

- Cause: missing `overlayVideoPath/sourceVideoPath`, invalid media file, or `ffmpeg` compose failure.
- Fix:
  - ensure both overlay and source video inputs are reachable/local
  - verify media files are playable (`ffprobe <file>`)
  - rerun with explicit duration/layout only when needed
- Example:
  - `pnpm local-run render-comments-compose --payload '{"overlayVideoPath":"<comments-overlay.mp4>","sourceVideoPath":"<source.mp4>"}'`

## `failed` in ASR stage

- Cause: missing ASR key/model/url, provider returned non-2xx, or unsupported payload shape.
- Fix: set `ASR_API_KEY` (or `input.apiKey`), confirm endpoint/model, inspect saved job error.

## `failed` in subtitle-translate stage

- Cause: missing/invalid subtitle input, invalid VTT shape (no cues), or output path permission issues.
- Fix:
  - provide `subtitlePath` / `subtitleUrl` / `subtitleText`
  - verify source file has valid VTT cues
  - check generated `subtitle-translation.template.json` and fill `translatedText` manually
- Example:
  - `pnpm local-run subtitle-translate --payload '{"subtitlePath":"<transcript.vtt>","targetLanguage":"zh-CN","mode":"manual"}'`

## `failed` in subtitle-review stage

- Cause: `mode` not set to `apply`, missing `reviewPath/reviewUrl`, unresolved `translatedText` in strict mode, or invalid item timings.
- Fix:
  - run with `{"mode":"apply","reviewPath":"<subtitle-translation.template.json>"}`
  - fill each item `translatedText` (or set `"strict": false` to fallback to source text)
  - keep `start/end` fields intact in template
- Example:
  - `pnpm local-run subtitle-review --payload '{"mode":"apply","reviewPath":"<subtitle-translation.template.json>","format":"bilingual"}'`

## Subtitle render shows 4 stacked lines in bilingual output

- Cause: consecutive VTT cues overlap in time; each cue has 2 lines (EN+ZH), so two active cues become 4 visible lines.
- Fix:
  - run `render-subtitles` with overlap clipping:
    - `overlapPolicy: "force-clip"` (recommended for bilingual)
    - or keep default `auto-clip` when source follows expected bilingual layout
  - if needed, tune `overlapGapSec` / `minCueDurationSec`.
- Example:
  - `pnpm local-run render-subtitles --payload '{"videoPath":"<video.mp4>","subtitlePath":"<bilingual.vtt>","overlapPolicy":"force-clip"}'`

## `failed` in comments-translate stage

- Cause: missing/invalid `input.dataPath` or `input.dataUrl`, invalid snapshot JSON shape, or output path permission issues.
- Fix:
  - `pnpm local-run comments-translate --payload '{"dataPath":"<comments-snapshot.json>","targetLanguage":"zh-CN"}'`
  - edit generated `comments-translation.template.json`, then apply it:
    - `pnpm local-run comments-translate --payload '{"dataPath":"<comments-snapshot.json>","templatePath":"<comments-translation.template.json>"}'`
  - if partial translations are acceptable, use `"strict": false` in apply mode.

## `failed` with `comments-translate input.mode is no longer supported`

- Cause: payload still includes `mode` (`manual/apply/auto`).
- Fix:
  - remove `mode` from payload
  - use template flow:
    - `pnpm local-run comments-translate --payload '{"dataPath":"<comments-snapshot.json>","targetLanguage":"zh-CN"}'`
    - edit `comments-translation.template.json`
    - `pnpm local-run comments-translate --payload '{"dataPath":"<comments-snapshot.json>","templatePath":"<comments-translation.template.json>"}'`

## `failed` with `comments-translate apply strict mode failed`

- Cause: title or one/more pending comments are still missing `translated` / `translatedContent` in translation template.
- Fix:
  - complete missing translated fields in `comments-translation.template.json`
  - rerun apply mode, or set `"strict": false` for draft runs

## `failed` in comments-review stage

- Cause: `mode=apply` without `reviewPath/reviewUrl/removeIndexes`, invalid review schema, unresolved decisions in strict mode, or out-of-range `removeIndexes`.
- Fix:
  - provide `reviewPath`/`reviewUrl` when applying
  - or provide number-based input: `removeIndexes` (e.g. `"3,7,12-15"`)
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

- Cause: outbound-network usage outside `executors/` (for example `fetch()`, `node:http/https`, `axios/got/ky/undici` imports).
- Fix: move outbound network logic into an executor module.

## `pnpm local-run:check-skill-doc` failed

- Cause: command lists drifted from actual local-run command surface in one or more of:
  - `docs/skills/local-media-orchestrator/SKILL.md`
  - `docs/skills/local-media-orchestrator/references/commands.md`
  - CLI `help` output (`scripts/local-job-runner/src/cli.ts`)
- Fix:
  - sync command list docs to match `scripts/local-job-runner/src/command-surface.ts`
  - keep one `pnpm local-run <command>` entry for each supported command
  - rerun `pnpm local-run:check`
