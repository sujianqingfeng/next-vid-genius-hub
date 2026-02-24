# Smoke Checklist

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

- Run:
  - `pnpm local-run render-subtitles --payload '{"videoPath":"<video.mp4>","subtitlePath":"<subtitles.vtt>"}'`
- Verify:
  - output video exists
  - progress increases monotonically in job state

## 3) Comments render

- Run:
  - `pnpm local-run render-comments --payload '{"dataPath":"<comments-snapshot.json>"}'`
- Optional (if remote avatars are unstable):
  - `pnpm local-run render-comments --payload '{"dataPath":"<comments-snapshot.json>","avatarMode":"initial"}'`
- Verify:
  - output video exists
  - composition metadata saved in job state

## 3.0) Comments translate (optional before render)

- Run:
  - `pnpm local-run comments-translate --payload '{"dataPath":"<comments-snapshot.json>","targetLanguage":"zh-CN"}'`
- Verify:
  - output snapshot exists
  - output includes `videoInfo.translatedTitle` and `comments[].translatedContent` (for translated items)

## 3.1) Comments review (recommended before render)

- Run:
  - `pnpm local-run comments-review --payload '{"dataPath":"<translated-snapshot.json>","mode":"prepare"}'`
  - edit template and set each item `decision` to `keep` or `remove`
  - `pnpm local-run comments-review --payload '{"dataPath":"<translated-snapshot.json>","mode":"apply","reviewPath":"<comments-review.template.json>"}'`
- Verify:
  - reviewed snapshot exists
  - removed comments list exists
  - strict apply fails when decisions remain `pending`

## 3.2) Comments render + source compose

- Run:
  - `pnpm local-run render-comments --payload '{"dataPath":"<comments-snapshot.reviewed.json>","sourceVideoPath":"<source.mp4>","composeMode":"compose-on-video"}'`
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
  - `pnpm local-run:check-boundary`
- Verify:
  - no `fetch()` found outside `executors/`.
