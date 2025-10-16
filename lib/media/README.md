# Media Processing Module

This directory contains the media pipeline for Next Vid Genius Hub. It now prioritizes a Remotion-driven renderer instead of the legacy Node Canvas implementation.

## Structure

```
lib/media/
├── (no index barrel)     # Re-exports removed; import concrete modules
├── processing/           # FFmpeg utilities (audio extraction, subtitle muxing)
├── remotion/             # Remotion renderer wrapper
├── types/                # Shared data contracts (VideoInfo, Comment, ...)
└── README.md             # This file
```

## Key Modules

### `processing/`
- `extractAudio()` – Pulls raw audio from the source video using FFmpeg.
- `renderVideoWithSubtitles()` – Applies subtitles and outputs a muxed MP4.
- `convertWebVttToAss()` – Converts WebVTT captions into ASS format for FFmpeg.

### `remotion/`
- `renderVideoWithRemotion()` – Bundles the Remotion composition and composites it with the source video via FFmpeg.
- `CommentsVideo` composition – Defines the cover slide and per-comment sequences used for rendered overlays.

### `types/`
- `VideoInfo` – Title, author, counts, and thumbnail metadata required by the renderer.
- `Comment` – Structured comment payload consumed by the composition.

## Usage

Import from submodules directly:

```ts
import { renderVideoWithRemotion } from '~/lib/media/remotion/renderer'
import { extractAudio } from '@app/media-node'
import { renderVideoWithSubtitles } from '@app/media-subtitles'
import type { Comment, VideoInfo } from '~/lib/media/types'
```

## Maintenance Notes

1. **Remotion First** – All overlay rendering should flow through the Remotion composition; avoid reintroducing Node Canvas.
2. **FFmpeg Availability** – Ensure `ffmpeg` is installed in local and deployment environments (see `scripts/setup.sh`).
3. **Binary Rebuilds** – Use `pnpm rebuild:native` when Node or OS upgrades occur to rebuild native pieces such as `yt-dlp-wrap`. Ensure a system `ffmpeg` binary is available on PATH.
4. **Types Centralization** – Extend `lib/media/types` if additional renderer data is required so both Remotion and ORPC layers stay aligned.
