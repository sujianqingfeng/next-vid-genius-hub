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
- `pnpm local-run comments-translate --input <file.json>`
- `pnpm local-run comments-review --input <file.json>`
- `pnpm local-run comments-download --input <file.json>`
- `pnpm local-run channel-sync --input <file.json>`
- `pnpm local-run thread-asset-ingest --input <file.json>`
- `pnpm local-run asr --input <file.json>`
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
- `render-subtitles` upload to cloud object store:
  - `pnpm local-run render-subtitles --payload '{"videoPath":"<video.mp4>","subtitlePath":"<bilingual.vtt>"}' --upload --upload-base-url 'https://media-orchestrator.<account>.workers.dev' --upload-prefix 'shared'`
- `comments-review` prepare/apply:
  - `{"dataPath":"<translated-snapshot.json>","mode":"prepare"}`
  - `{"dataPath":"<translated-snapshot.json>","mode":"apply","reviewPath":"<comments-review.template.json>"}`
