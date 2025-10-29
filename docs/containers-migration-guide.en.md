# Container Migration Guide (v2): Layered Packages

## Overview
This guide (v2) updates the plan to avoid concentrating everything inside `@app/media-core`. We introduce a layered design:

- `@app/media-core`: pure orchestration + types (no Node/HTTP/binaries)
- `@app/media-node`: Node-only adapters (yt-dlp, ffmpeg, fs helpers)
- `@app/media-providers`: provider adapters (YouTube/TikTok) using `youtubei.js` + `undici`

Containers compose these packages via simple adapters. The goal remains: eliminate duplicate code, unify progress, and centralize uploads via ports.

## Architecture (v2)
- `@app/media-core`
  - Pipelines: `runDownloadPipeline`, `runCommentsPipeline` (orchestrators only)
  - Types/ports: `artifactStore`, `VideoDownloader`, `AudioExtractor`, `CommentsDownloader`, `ProgressReporter`
- `@app/media-node`
  - `downloadVideo(url, quality, out, { proxy?, captureJson? })` via yt-dlp / yt-dlp-wrap
  - `extractAudio(videoPath, audioPath)` via ffmpeg
- `@app/media-providers`
  - `downloadYoutubeComments({ url, pages?, proxy? })`
  - `downloadTikTokCommentsByUrl({ url, pages?, proxy? })`
  - `extractVideoId(url)`
- Containers assemble:
  - Parse request → prepare temp paths
  - Inject node/provider adapters into `@app/media-core` pipelines
  - Map progress and run artifact uploads via injected `artifactStore`

## Prerequisites
- The monorepo is managed via `pnpm` workspaces (`pnpm-workspace.yaml` includes `packages/*`); root dependencies reference internal packages with `workspace:*`. Container manifests keep local `file:` references so they can be installed inside Docker with plain `npm install`.
- Build from repository root so containers can install local workspace packages:
  - `COPY containers/<container>/package.json ./package.json`
  - `COPY packages/media-core ./packages/media-core`
  - `COPY packages/media-node ./packages/media-node`
  - `COPY packages/media-providers ./packages/media-providers`
  - `RUN npm install --omit=dev`
  - `COPY containers/<container>/index.mjs ./index.mjs`
- Ensure `yt-dlp` and `ffmpeg` are available in runtime images where required.

## Step-by-Step Migration

1) Add dependencies to the container
- File: `containers/<container>/package.json`
```
{
  "dependencies": {
    "@app/media-core": "file:./packages/media-core",
    "@app/media-node": "file:./packages/media-node",
    "@app/media-providers": "file:./packages/media-providers"
  }
}
```

2) Update Dockerfile to install from monorepo
Example structure:
```
WORKDIR /app
COPY containers/<container>/package.json ./package.json
COPY packages/media-core ./packages/media-core
COPY packages/media-node ./packages/media-node
COPY packages/media-providers ./packages/media-providers
RUN npm install --omit=dev
COPY containers/<container>/index.mjs ./index.mjs
```

3) Wire adapters into the pipeline
- Download/video + audio extraction (downloader-like container):
```js
import { runDownloadPipeline } from '@app/media-core'
import { downloadVideo as nodeDownloadVideo, extractAudio as nodeExtractAudio } from '@app/media-node'

await runDownloadPipeline(
  { url, quality },
  {
    ensureDir: (dir) => fsPromises.mkdir(dir, { recursive: true }),
    resolvePaths: async () => ({ videoPath, audioPath }),
    downloader: (u, q, out) => nodeDownloadVideo(u, q, out, { proxy, captureJson: Boolean(outputMetadataPutUrl) }),
    audioExtractor: outputAudioPutUrl ? (v, a) => nodeExtractAudio(v, a) : async () => {},
    artifactStore: {
      uploadMetadata: async (data) => {
        if (!outputMetadataPutUrl) return
        const buf = Buffer.from(JSON.stringify(data, null, 2), 'utf8')
        await uploadArtifact(outputMetadataPutUrl, buf, 'application/json')
      },
      uploadVideo: async (path) => {
        const buf = Buffer.from(readFileSync(path))
        await uploadArtifact(outputVideoPutUrl, buf, 'video/mp4')
      },
      uploadAudio: async (path) => {
        if (!outputAudioPutUrl) return
        const buf = Buffer.from(readFileSync(path))
        await uploadArtifact(outputAudioPutUrl, buf, 'audio/mpeg')
      },
    },
  },
  (e) => {
    const stage = e.stage === 'completed' ? 'running' : e.stage
    const pct = Math.max(0, Math.min(1, e.progress ?? 0))
    // map to orchestrator callback here
  }
)
```

- Comments-only:
```js
import { runCommentsPipeline } from '@app/media-core'
import { downloadYoutubeComments, downloadTikTokCommentsByUrl } from '@app/media-providers'

await runCommentsPipeline(
  { url, source, pages, proxy },
  {
    commentsDownloader: async ({ url: commentUrl, source: commentSource, pages: commentPages, proxy: commentProxy }) => (
      commentSource === 'tiktok'
        ? downloadTikTokCommentsByUrl({ url: commentUrl, pages: commentPages, proxy: commentProxy })
        : downloadYoutubeComments({ url: commentUrl, pages: commentPages, proxy: commentProxy })
    ),
    artifactStore: { /* as above */ },
  },
  onProgress
)
```

4) Remove redundant code from containers
- Typical functions to delete after migration:
  - Inline `yt-dlp` wrappers, `ffmpeg` audio-extraction helpers
  - ad-hoc YouTube/TikTok comment scraping (now in provider adapters)
  - local proxy fetch wrappers (provider package handles Request normalization + proxy)

5) Trim container dependencies
- Containers should not import `undici` / `youtubei.js` directly; they now live in `@app/media-providers`.
- `yt-dlp-wrap` should live in `@app/media-node` (not in containers).
- Keep only container-specific deps (e.g., `yaml` for Clash configuration).

6) Validate
- From repo root:
  - `pnpm install`
  - `docker compose build <container>`
  - `docker compose up -d <container>`
- Trigger representative jobs; verify:
  - Progress callbacks (status/phase/progress)
  - Uploaded artifacts (video/audio/metadata) keys

## Proxy Handling
- If the container runs a local Clash/Mihomo, inject `proxy` as a plain HTTP URL (e.g., `http://127.0.0.1:7890`).
- `@app/media-providers` normalizes Request inputs for `youtubei.js`/Undici to prevent `ERR_INVALID_URL`.

## Rollout Plan
- Migrate containers one by one; keep previous image tags for quick rollback.
- Document validation steps in PRs and include logs for progress callbacks and object storage uploads.

## Troubleshooting
- Module not found for core files
  - Ensure Docker build context is repo root and `packages/media-core`, `packages/media-node`, `packages/media-providers` are copied before `npm install`.
  - Re-run `pnpm install` locally and fully restart dev servers.
- YouTube comments via proxy errors
  - Confirm proxy reachable; provider fetch wrapper handles Request→URL normalization.
- yt-dlp issues
  - Ensure binary is installed in the downloader container; locally, core falls back to `yt-dlp-wrap` if binary is missing.
