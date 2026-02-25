# Commands Reference

Command surface source:

- `scripts/local-job-runner/src/command-surface.ts`
- `pnpm local-run:check-skill-doc` verifies this doc, `SKILL.md`, and CLI `help` output stay aligned.

## Global usage

- Recommended for repeatability:
  - `pnpm local-run <command> --input <file.json>`
- Fast one-off usage:
  - `pnpm local-run <command> --payload '{"key":"value"}'`
- Common optional flags:
  - `--job-id <id>`
  - `--state-dir <dir>`
  - `--upload` (optional cloud upload)
  - `--upload-base-url <url>` (or use `LOCAL_RUN_UPLOAD_BASE_URL` / `CF_ORCHESTRATOR_URL`)
  - `--upload-prefix <prefix>` (default `local-run`)

## Job commands

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

## Operational commands

- Check status:
  - `pnpm local-run status <jobId>`
- Cancel job:
  - `pnpm local-run cancel <jobId> [--reason <text>]`
- Clean old local state:
  - `pnpm local-run clean [--state-dir <dir>] [--days <n>] [--all] [--orphans-only] [--dry-run]`

## Sanity checks

- Network boundary guard:
  - `pnpm local-run:check-boundary`
- Skill command list drift guard:
  - `pnpm local-run:check-skill-doc`
- Run all guards:
  - `pnpm local-run:check`

## JSON examples

- `comments-download` (proxy-ready):
  - `{"url":"https://www.youtube.com/watch?v=<video-id>","source":"youtube","proxyUrl":"http://127.0.0.1:17890","pages":2}`
- `channel-sync` (proxy-ready):
  - `{"channelUrlOrId":"<channel-url-or-id>","limit":5,"proxyUrl":"http://127.0.0.1:17890"}`
- `render-subtitles` (bilingual overlap clip):
  - `{"videoPath":"<video.mp4>","subtitlePath":"<bilingual.vtt>","overlapPolicy":"force-clip"}`
- `subtitle-translate` manual mode (generate translation template):
  - `{"subtitlePath":"<transcript.vtt>","targetLanguage":"zh-CN","mode":"manual"}`
- `subtitle-review` apply manual template to VTT:
  - `{"mode":"apply","reviewPath":"<subtitle-translation.template.json>","format":"bilingual"}`
- `render-comments` (default horizontal template):
  - `{"dataPath":"<comments-snapshot.reviewed.json>","templateId":"comments-default"}`
- `render-comments` (vertical template, opt-in only):
  - `{"dataPath":"<comments-snapshot.reviewed.json>","templateId":"comments-vertical"}`
- `render-comments` compose onto source video (recommended horizontal default):
  - `{"dataPath":"<comments-snapshot.reviewed.json>","templateId":"comments-default","sourceVideoPath":"<source.mp4>","composeMode":"compose-on-video"}`
- `render-comments-compose` (compose existing comments overlay video):
  - `{"overlayVideoPath":"<comments-overlay.mp4>","sourceVideoPath":"<source.mp4>"}`
- `comments-snapshot-build` (normalize raw comments into snapshot for translate/review/render):
  - `{"dataPath":"<comments.json>","title":"<video-title>","author":"<channel-name>"}`
- `render-subtitles` upload to cloud object store:
  - `pnpm local-run render-subtitles --payload '{"videoPath":"<video.mp4>","subtitlePath":"<bilingual.vtt>"}' --upload --upload-base-url 'https://media-orchestrator.<account>.workers.dev' --upload-prefix 'shared'`
- `comments-review` prepare/apply:
  - `{"dataPath":"<translated-snapshot.json>","mode":"prepare"}`
  - `{"dataPath":"<translated-snapshot.json>","mode":"apply","reviewPath":"<comments-review.template.json>"}`
- `comments-translate` manual mode:
  - `{"dataPath":"<comments-snapshot.json>","targetLanguage":"zh-CN","mode":"manual"}`
- `comments-translate` default behavior (manual template generation):
  - `{"dataPath":"<comments-snapshot.json>","targetLanguage":"zh-CN"}`
