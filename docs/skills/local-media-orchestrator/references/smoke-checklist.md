# Smoke Checklist

## Fast path (scripted)

- Static guard-only run (doc + boundary checks + clean dry-run):
  - `bash docs/skills/local-media-orchestrator/scripts/smoke.sh --mode static --skip-proxy`
- Minimal executable run (includes one `render-subtitles` local job):
  - `bash docs/skills/local-media-orchestrator/scripts/smoke.sh --mode minimal-run --skip-proxy`
- With proxy probe enabled:
  - `bash docs/skills/local-media-orchestrator/scripts/smoke.sh --mode static --proxy-url http://127.0.0.1:17890`

## Prerequisites

- `ffmpeg` available
- `ffprobe` available
- `yt-dlp` available
- Node modules installed (`pnpm install`)
- Local proxy core available for provider flows (Clash/Mihomo/sing-box) with an HTTP/SOCKS entrypoint.
- Use a dedicated proxy port for smoke tests (recommended: `17890`, avoid assuming `7890` is free).

## 0) Proxy readiness (for provider flows)

- Run:
  - `curl -x http://127.0.0.1:17890 -I https://www.youtube.com`
- Verify:
  - proxy tunnel is established (`HTTP/1.1 200 Connection established`)
  - target responds with HTTPS status (for example `200`/`302`)

## 1) Download

- Run:
  - `pnpm local-run download --payload '{"url":"<video-url>","quality":"1080p"}'`
- Verify:
  - `.local-jobs/<jobId>.json` status is `completed`
  - output video/audio/metadata files exist

## 2) Subtitle render

- Optional (translate ASR VTT to bilingual VTT before burn-in):
  - `pnpm local-run subtitle-translate --payload '{"subtitlePath":"<transcript.vtt>","targetLanguage":"zh-CN","mode":"manual"}'`
- Optional (apply manual template into bilingual VTT):
  - `pnpm local-run subtitle-review --payload '{"mode":"apply","reviewPath":"<subtitle-translation.template.json>","format":"bilingual"}'`
- Run:
  - `pnpm local-run render-subtitles --payload '{"videoPath":"<video.mp4>","subtitlePath":"<subtitles.vtt>"}'`
- Optional (for bilingual/multi-line VTT with overlap):
  - `pnpm local-run render-subtitles --payload '{"videoPath":"<video.mp4>","subtitlePath":"<bilingual.vtt>","overlapPolicy":"force-clip"}'`
- Verify:
  - output video exists
  - progress increases monotonically in job state
  - if overlap clipping is enabled, final metadata shows overlap reduction (`metadata.overlap`)

## 3) Comments render

- Run:
  - `pnpm local-run render-comments --payload '{"dataPath":"<comments-snapshot.json>","templateId":"comments-default"}'`
- Optional (if remote avatars are unstable):
  - `pnpm local-run render-comments --payload '{"dataPath":"<comments-snapshot.json>","templateId":"comments-default","avatarMode":"initial"}'`
- Optional (vertical output, opt-in only):
  - `pnpm local-run render-comments --payload '{"dataPath":"<comments-snapshot.json>","templateId":"comments-vertical"}'`
- Verify:
  - output video exists
  - composition metadata saved in job state

## 3.0) Comments snapshot build (recommended after comments-download)

- Run:
  - `pnpm local-run comments-snapshot-build --payload '{"dataPath":"<comments.json>","title":"<video-title>","author":"<channel-name>"}'`
- Verify:
  - output snapshot exists
  - output includes `videoInfo` and `comments[]`

## 3.1) Comments translate (optional before render)

- Run:
  - `pnpm local-run comments-translate --payload '{"dataPath":"<comments-snapshot.json>","targetLanguage":"zh-CN"}'`
  - explicit manual mode:
    - `pnpm local-run comments-translate --payload '{"dataPath":"<comments-snapshot.json>","targetLanguage":"zh-CN","mode":"manual"}'`
- Verify:
  - output snapshot exists
  - output includes original `videoInfo` and `comments[]` without automatic translation
  - output includes `comments-translation.template.json` for human translation edits

## 3.2) Comments review (recommended before render)

- Run:
  - `pnpm local-run comments-review --payload '{"dataPath":"<translated-snapshot.json>","mode":"prepare"}'`
  - edit template and set each item `decision` to `keep` or `remove`
  - or skip file editing and apply by number list directly:
    - `pnpm local-run comments-review --payload '{"dataPath":"<translated-snapshot.json>","mode":"apply","removeIndexes":"3,7,12-15"}'`
  - `pnpm local-run comments-review --payload '{"dataPath":"<translated-snapshot.json>","mode":"apply","reviewPath":"<comments-review.template.json>"}'`
- Verify:
  - reviewed snapshot exists
  - removed comments list exists
  - strict apply fails when decisions remain `pending`

## 3.3) Comments render + source compose

- Run:
  - `pnpm local-run render-comments --payload '{"dataPath":"<comments-snapshot.reviewed.json>","templateId":"comments-default","sourceVideoPath":"<source.mp4>","composeMode":"compose-on-video"}'`
- Verify:
  - final output video exists
  - job metadata has `"composedWithSource": true`

## 3.4) Compose-only from existing comments overlay video

- Run:
  - `pnpm local-run render-comments-compose --payload '{"overlayVideoPath":"<comments-overlay.mp4>","sourceVideoPath":"<source.mp4>"}'`
- Verify:
  - final output video exists
  - job metadata has `"composedWithSource": true`

## 4) Provider flows

- Run comments download / channel sync with known sources and explicit `proxyUrl`.
- Example:
  - `pnpm local-run comments-download --payload '{"url":"https://www.youtube.com/watch?v=<video-id>","source":"youtube","proxyUrl":"http://127.0.0.1:17890","pages":2}'`
  - `pnpm local-run channel-sync --payload '{"channelUrlOrId":"<channel-url-or-id>","limit":5,"proxyUrl":"http://127.0.0.1:17890"}'`
- Verify JSON outputs and terminal status.

## 5) Boundary guard

- Run:
  - `pnpm local-run:check`
- Verify:
  - no outbound network usage (`fetch`, `node:http/https`, common HTTP clients) outside `executors/`
  - `SKILL.md`, `references/commands.md`, and CLI `help` command list stay aligned with local-run command surface
