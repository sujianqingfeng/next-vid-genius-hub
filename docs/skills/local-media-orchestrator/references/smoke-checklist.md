# Smoke Checklist

## Prerequisites

- `ffmpeg` available
- `ffprobe` available
- `yt-dlp` available
- Node modules installed (`pnpm install`)

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
- Verify:
  - output video exists
  - composition metadata saved in job state

## 3.1) Comments render + source compose

- Run:
  - `pnpm local-run render-comments --payload '{"dataPath":"<comments-snapshot.json>","sourceVideoPath":"<source.mp4>","composeMode":"compose-on-video"}'`
- Verify:
  - final output video exists
  - job metadata has `"composedWithSource": true`

## 4) Provider flows

- Run comments download / channel sync with known sources.
- Verify JSON outputs and terminal status.

## 5) Boundary guard

- Run:
  - `pnpm local-run:check-boundary`
- Verify:
  - no `fetch()` found outside `executors/`.
