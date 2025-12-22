# Media Module

This directory contains **application‑facing media helpers** for Vid Genius Hub.
Heavy FFmpeg / yt‑dlp / Remotion logic lives in `packages/*`; `src/lib/media` stays
focused on types, manifests, and orchestration helpers that the app Worker
directly consumes.

## Structure

```
src/lib/media/
├── comments-snapshot.ts  # Persist comments + videoInfo snapshot to object storage
├── stream.ts             # Helpers for streaming/ proxying media via the orchestrator
├── types/                # Shared data contracts (VideoInfo, Comment, ...)
└── README.md
```

## Key Modules

### `types/`

- `VideoInfo` – Title, author, counts, thumbnail, and series metadata consumed by
  Remotion and front‑end components.
- `Comment` – Structured comment payload aligned with the Remotion composition
  and `@app/media-comments` helpers.

These types are used by:

- App routes under `src/routes/api.media.*`
- Remotion compositions under `remotion/`
- Cloudflare orchestrator callbacks (via manifest payloads)

### `comments-snapshot.ts`

- `buildCommentsSnapshot(media, { comments, translatedTitle? })`
  - Builds a `videoInfo` object from the current `media` row
  - Persists `{ videoInfo, comments }` JSON to object storage using a stable key
    under `media/<mediaId>-<titleSlug>/inputs/comments/latest.json`
  - Updates the media manifest with `commentsKey`

Downstream consumers (Remotion containers, preview UI) treat this JSON shape as
the single source of truth for comments‑driven renders.

### `stream.ts`

- `resolveRemoteVideoUrl(media)` – Resolve the best playback URL for a media item,
  preferring:
  1. Cloudflare orchestrator artifact URL (by `filePath`/`downloadJobId`)
  2. R2 key via `presignGetByKey(remoteVideoKey)`
- `proxyRemoteWithRange(url, request)` – Fetch a remote video (Worker proxy or
  R2) while preserving `Range` headers and key caching headers.
- `createProxyResponse(upstream, options)` – Normalize headers for a browser `Response`
  and optionally force a download filename.
- `buildDownloadFilename(title, fallbackBase, ext)` – Build a safe,
  RFC‑5987‑compatible attachment filename.

These helpers are used by `src/routes/api.media.$id.downloaded.ts` / `src/routes/api.media.$id.rendered.ts`
to stream artifacts back to the browser.

## Relationship to `packages/*`

Runtime media processing has been pushed down into workspace packages:

- `@app/media-core` – Pure pipeline orchestration and ports (no Node/binaries).
- `@app/media-node` – Node‑only adapters for `ffmpeg`, `yt-dlp`, filesystem IO.
- `@app/media-providers` – YouTube/TikTok provider adapters (comments, metadata,
  channel listing).
- `@app/media-comments` – Comment‑timeline and layout helpers for Remotion
  compositions.
- `@app/media-subtitles` – Subtitle burn‑in and ASS/WebVTT conversion built on
  top of `ffmpeg`.

`src/lib/media` should **not** grow new FFmpeg or yt‑dlp helpers. When you need new
media functionality:

1. Add or extend the appropriate package in `packages/*`.
2. Expose any app‑specific glue or types here under `src/lib/media` (or via
   `src/lib/types`) so app routes / ORPC procedures can consume them.

## Maintenance Notes

1. Keep `src/lib/media` small and focused on **types and orchestration helpers**.
2. Prefer importing Remotion‑related helpers from `@app/media-comments` rather
   than duplicating timeline logic here.
3. When manifests or snapshot shapes change, update both:
   - `src/lib/media/types`
   - Any consumers under `src/routes/**`, `remotion/**`, and `src/orpc/**`.
