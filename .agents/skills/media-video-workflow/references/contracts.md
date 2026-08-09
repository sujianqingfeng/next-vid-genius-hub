# Runtime Contracts

## Run Layout

`prepare-subtitles` and `prepare-comments` create this layout under `--out`:

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

## State Transitions

```text
awaiting_agent -> validated -> materialized
```

`validate` rejects incomplete, duplicate, unexpected, stale, or source-mutated rows. `materialize-comments` writes only `allow` rows to `comments.safe.json`.

## External Commands

- `download` and `fetch-comments` use local `yt-dlp` and need an explicit URL. When a platform requires authentication, pass a user-exported cookie file with `--cookies <cookies.txt>`; the runtime never reads browser cookies implicitly. YouTube comment collection defaults to 100 records and accepts `--max-comments <positive-integer|all>`.
- For YouTube the runtime forces a Node.js JS runtime (`--js-runtimes node`) and, by default, fetches the nsig challenge solver from GitHub (`--remote-components ejs:github`). Without the solver, modern YouTube only exposes storyboard images and downloads fail with "Requested format is not available". This needs `node` reachable on `PATH` and outbound network to GitHub; pass `--remote-components none` to opt out for fully offline runs.
- `extract-audio` and `render-subtitles` use local `ffmpeg`.
- `asr` only runs when `MEDIAFLOW_ASR_API_URL` and `MEDIAFLOW_ASR_API_KEY` are configured, or an explicit `--api-url` is provided. The provider is auto-detected from the URL host: an OpenAI-compatible `/v1/audio/transcriptions` endpoint by default (multipart `file` field, reads `segments`), or **Cloudflare Workers AI** when the host is `api.cloudflare.com` — set `MEDIAFLOW_ASR_API_URL` to `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/openai/whisper`; the audio is POSTed as a raw binary body with a container `Content-Type`, and the ready-made `result.vtt` is consumed. Because Cloudflare times out on long audio, audio longer than 30s is automatically split into 30s chunks (via ffmpeg), transcribed per chunk, and the cues are offset and merged back onto the original timeline. No `MEDIAFLOW_ASR_MODEL` is needed for Cloudflare (the model is in the URL path), and `--language` is not honored by the Cloudflare REST endpoint (use single-language audio).
- `render-comments` renders `comments.safe.json` with the bundled Remotion project in `runtime/remotion` (the branded "外网真实评论 / TubeTweet Studio" template, vendored from `packages/remotion-project`). Templates: `landscape` (default, `CommentsVideo`) and `vertical` (`CommentsVideoVertical`); both render a 1920×1080 canvas at 50 fps with per-comment durations derived from the comment timeline. Pass `--video <source.mp4>` to enable **compose-on-video**: the source video is scaled into the template's video slot via `ffmpeg` (so the output contains the original footage); without it the video slot is an empty placeholder. The renderer is fail-closed: only `comments.safe.json` (all `allow`) is accepted.
- `publish-bilibili` is an **optional** command (requires Python and `pip install bilibili-api-python`). It uploads a video and submits it to Bilibili via the web API (`bilibili-api`, web cookies — no QR/app login). Cookies come from `--cookie-file` (default `.bili.env`); if incomplete, the engine auto-extracts them from a logged-in Dia/Chromium session via the Kimi WebBridge daemon (CDP `Network.getCookies` at `127.0.0.1:10086`). The cover is auto-extracted from the video if `--cover` is omitted. Override the interpreter with `--python` or `MEDIAFLOW_PYTHON`. **Archive deletion is not supported**: B站 gates `/x/web/archive/delete` behind a verification token (returns `340022`), so deletes must be done by hand in the creator center.
