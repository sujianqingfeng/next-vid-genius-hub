# Media Processing Module

This directory contains the media pipeline for Next Vid Genius Hub. It now prioritizes a Remotion-driven renderer instead of the legacy Node Canvas implementation.

## Structure

```
lib/media/
├── (no index barrel)     # Re-exports removed; import concrete modules
├── processing/           # FFmpeg utilities (audio extraction, subtitle muxing)
├── remotion/             # Remotion duration helpers
├── types/                # Shared data contracts (VideoInfo, Comment, ...)
└── README.md             # This file
```

## Key Modules

### `processing/`
- `extractAudio()` – Pulls raw audio from the source video using FFmpeg.
- `renderVideoWithSubtitles()` – Applies subtitles and outputs a muxed MP4.
- `convertWebVttToAss()` – Converts WebVTT captions into ASS format for FFmpeg.

### `remotion/`
- `buildCommentTimeline()` – Calculates shot-by-shot durations for comments.
- `durations.ts` constants – Keep component previews aligned with production Remotion renders.

### `types/`
- `VideoInfo` – Title, author, counts, and thumbnail metadata required by the renderer.
- `Comment` – Structured comment payload consumed by the composition.

## Usage

Import from submodules directly:

```ts
import { buildCommentTimeline, REMOTION_FPS } from '~/lib/media/remotion/durations'
import type { Comment, VideoInfo } from '~/lib/media/types'
```

## Maintenance Notes

1. **Remotion First** – Runtime renders are handled by the standalone container (`containers/renderer-remotion`). Keep shared helpers light and focused.
2. **FFmpeg Availability** – Ensure `ffmpeg` is installed in local and deployment environments (see `scripts/setup.sh`).
3. **Binary Rebuilds** – Use `pnpm rebuild:native` when Node or OS upgrades occur to rebuild native pieces such as `yt-dlp-wrap`. Ensure a system `ffmpeg` binary is available on PATH.
4. **Types Centralization** – Extend `lib/media/types` if additional renderer data is required so both Remotion and ORPC layers stay aligned.
