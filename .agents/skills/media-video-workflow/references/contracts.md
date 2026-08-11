# Runtime Contracts

## Run Layout

`prepare-subtitles` and `prepare-comments` require a new or empty `--out` directory and create this layout:

```text
<run-dir>/
  manifest.json
  input/
  tasks/
```

`manifest.json` owns the workflow state and the expected task IDs and hashes. Do not edit it by hand.

## Task Rows

Tasks are JSONL: one independent JSON object per line. Each row contains:

- `schemaVersion`: currently `1`
- `kind`: `subtitle`, `comment-title`, or `comment`
- `id`: immutable task ID
- `source`: immutable source data
- `sourceHash`: SHA-256 digest of `kind`, `id`, and `source`
- `targetLanguage`: requested target locale
- `translation`: agent-owned translated text
- `status`: set to `completed` when finished

Comment rows additionally require:

```json
{
  "moderation": {
    "decision": "allow",
    "categories": [],
    "confidence": "high",
    "reasonCode": "safe_relevant"
  }
}
```

Use `allow`, `exclude`, or `review` for `decision`; use `high`, `medium`, or `low` for `confidence`.
Categories must be IDs from `moderation-policy.md`. An `allow` row must use no categories and `reasonCode: "safe_relevant"`; an `exclude` row must include at least one category. Validation also rejects a changed `targetLanguage`. A non-empty `translation` is required for subtitle cues, the comment title, and `allow` comments (these are rendered); `exclude`/`review` comments are quarantined and never rendered, so their `translation` may be left empty.

## State Transitions

```text
awaiting_agent -> validated -> materialized
```

`validate` requires `awaiting_agent` and rejects incomplete, duplicate, unexpected, stale, source-mutated, target-language-mutated, or policy-invalid rows. Materialization requires the exact task file recorded by `validate`; `materialize-comments` writes only `allow` rows to `comments.safe.json`.

## External Commands

- `download` and `fetch-comments` use local `yt-dlp` and need an explicit URL. When a platform requires authentication, pass a user-exported cookie file with `--cookies <cookies.txt>`; the runtime never reads browser cookies implicitly. YouTube comment collection defaults to 100 records and accepts `--max-comments <positive-integer|all>`.
- For YouTube the runtime forces a Node.js JS runtime (`--js-runtimes node`) and, by default, fetches the nsig challenge solver from GitHub (`--remote-components ejs:github`). Without the solver, modern YouTube only exposes storyboard images and downloads fail with "Requested format is not available". This needs `node` reachable on `PATH` and outbound network to GitHub; pass `--remote-components none` to opt out for fully offline runs.
- `extract-audio` and `render-subtitles` use local `ffmpeg`.
- `asr` only runs when `MEDIAFLOW_ASR_API_URL` and `MEDIAFLOW_ASR_API_KEY` are configured, or an explicit `--api-url` is provided. The provider is auto-detected from the URL host: an OpenAI-compatible `/v1/audio/transcriptions` endpoint by default (multipart `file` field, reads `segments`), or **Cloudflare Workers AI** when the host is `api.cloudflare.com` — set `MEDIAFLOW_ASR_API_URL` to `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/openai/whisper`; the audio is POSTed as a raw binary body with a container `Content-Type`, and the ready-made `result.vtt` is consumed. Audio longer than 30s is split into 30s WAV chunks, transcribed per chunk, and merged back onto the original timeline. Any failed or empty chunk fails the ASR job so the output cannot silently omit an interval. No `MEDIAFLOW_ASR_MODEL` is needed for Cloudflare (the model is in the URL path), and `--language` is not honored by the Cloudflare REST endpoint (use single-language audio).
- `render-comments` renders `comments.safe.json` with the bundled Remotion project in `runtime/remotion` (the branded "外网真实评论 / TubeTweet Studio" template, vendored from `packages/remotion-project`). Templates: `landscape` (default, `CommentsVideo`) and `vertical` (`CommentsVideoVertical`); both render a 1920×1080 canvas at 50 fps with per-comment durations derived from the comment timeline. Pass `--video <source.mp4>` to enable **compose-on-video**. Pass `--plan` (add `--video` for compose-on-video) to print the timeline — total duration, each comment's on-screen seconds, and how many times the source loops — without rendering, so the allow-set can be sized before spending render time. Remote avatars are stripped by default; `--allow-remote-images` enables only public HTTPS image URLs. The renderer is fail-closed: only `comments.safe.json` (all `allow`) is accepted.
- `materialize-comments --fetch-avatars` downloads avatars only for `allow` comments into `<output-dir>/assets/avatars/`. Requests require public HTTPS URLs, follow redirects only after revalidation, accept JPEG/PNG/WebP/GIF signatures, enforce a 256 KiB limit and a 10 second timeout, and never send cookies. Successful rows replace the remote URL with `authorThumbnailAsset: "avatars/<sha256>.<ext>"`; failures are reported and use the template's initials fallback. `render-comments` reads the cached assets automatically from the safe snapshot's sibling `assets/` directory; `--assets <dir>` overrides it. The older `--allow-remote-images` flag remains an explicit direct-network compatibility mode.
- `publish-bilibili` is an **optional** command (requires Python and `pip install bilibili-api-python`). It uploads a video and submits it to Bilibili via the web API (`bilibili-api`, web cookies — no QR/app login). Cookies come from `--cookie-file` (default `.bili.env`); if incomplete, the engine auto-extracts them from a logged-in Dia/Chromium session via the Kimi WebBridge daemon (CDP `Network.getCookies` at `127.0.0.1:10086`). The cover is auto-extracted from the video if `--cover` is omitted. Override the interpreter with `--python` or `MEDIAFLOW_PYTHON`. On success it captures the printed `{aid, bvid}` and records the submission in the local registry (see below) unless `--no-registry` is passed; `--source-url <url>` links the originating source. **Archive deletion is not supported**: B站 gates `/x/web/archive/delete` behind a verification token (returns `340022`), so deletes must be done by hand in the creator center.

## Registry

A local registry tracks one record per source video — its rendered outputs, the Bilibili submission, and the review state — so published work can be tracked, status-polled, and re-handled. It is a single JSON file at `mediaflow-work/registry.json` (override: `--registry <file>` or `MEDIAFLOW_REGISTRY`); there is no database.

Record shape:

```json
{
  "id": "<source video id, e.g. the YouTube id>",
  "sourceUrl": "https://youtu.be/…",
  "jobDir": "mediaflow-work/jobs/<id>",
  "title": "…",
  "outputs": [{ "path": "…", "template": "landscape", "createdAt": "…" }],
  "publish": {
    "platform": "bilibili", "aid": 123, "bvid": "BV…",
    "publishedAt": "…", "reviewState": "processing | passed | rejected",
    "reviewCheckedAt": "…", "stateDesc": "开放浏览", "rejectReason": ""
  },
  "publishHistory": [],
  "createdAt": "…", "updatedAt": "…"
}
```

Commands: `registry add` (register or backfill a record; include `--bvid`/`--aid` for a video already published), `registry list [--status …]`, `registry show <id>`, `registry open <id>` (artifact paths), `registry refresh [--id <id>]` (poll B站's member API per published record using `.bili.env` cookies), and `registry rerun <id> --step comments|render|publish` (re-prepare moderation, re-render from the existing `comments.safe.json`, or re-publish as a new submission and mark the prior one superseded).

`refresh` maps the member-API `data.archive.state`: `0` → `passed`, a negative state with a non-empty `reject_reason` → `rejected`, any other negative state → `processing`. `publish-bilibili` auto-upserts the registry on success; the record `id` is derived from `--source-url`, or from the `--video` path's parent directory. Deleting a superseded B站 entry stays manual — the API delete is verification-gated (`340022`).
