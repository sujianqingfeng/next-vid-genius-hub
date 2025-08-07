# Media Processing Module

This module has been refactored from a single large file (`lib/media.ts`) into a well-organized folder structure to improve maintainability and follow the single responsibility principle.

## Structure

```
lib/media/
├── index.ts              # Main entry point - re-exports all functionality
├── types/                # Type definitions
│   └── index.ts         # VideoInfo, Comment, CanvasContext, etc.
├── emoji/               # Emoji processing utilities
│   └── index.ts         # Emoji download, cache, rendering
├── processing/          # Video processing utilities
│   └── index.ts         # Audio extraction, subtitle rendering
├── rendering/           # Canvas rendering components
│   ├── engine.ts        # Main video rendering engine
│   ├── components.ts    # UI components (header, comment cards, cover)
│   └── ui.ts           # Basic UI utilities (background, icons)
├── utils/              # General utilities
│   └── index.ts        # Text wrapping, rounded rectangles
└── README.md           # This file
```

## Modules

### Types (`types/index.ts`)
- `VideoInfo` - Video metadata interface
- `Comment` - Comment data interface
- `CanvasContext` - Canvas context type
- `LikeIconOptions` - Icon rendering options

### Emoji (`emoji/index.ts`)
- `emojiToCodepoint()` - Convert emoji to Twemoji codepoint
- `downloadEmojiImage()` - Download emoji from CDN
- `getEmojiImage()` - Get emoji with caching
- `splitTextAndEmojis()` - Split text into text and emoji parts
- `fillTextWithEmojis()` - Render text with colored emojis

### Processing (`processing/index.ts`)
- `extractAudio()` - Extract audio from video
- `renderVideoWithSubtitles()` - Render video with ASS subtitles
- `convertWebVttToAss()` - Convert WebVTT to ASS format
- `cleanupTempFile()` - Clean up temporary files

### Rendering Engine (`rendering/engine.ts`)
- `renderVideoWithCanvas()` - Main video rendering function

### Rendering Components (`rendering/components.ts`)
- `renderHeader()` - Render video header section
- `renderCommentCard()` - Render comment card with avatar
- `renderCoverSection()` - Render video cover section

### Rendering UI (`rendering/ui.ts`)
- `renderBackground()` - Render white background
- `renderVideoArea()` - Render video placeholder area
- `renderLikeIcon()` - Render thumbs up icon
- `renderLikeCount()` - Render like count with icon

### Utils (`utils/index.ts`)
- `roundRect()` - Draw rounded rectangle on canvas
- `wrapText()` - Wrap text to fit within maxWidth

## Usage

The module maintains backward compatibility. You can still import from the main entry point:

```typescript
import { 
  renderVideoWithCanvas, 
  extractAudio, 
  renderVideoWithSubtitles 
} from '~/lib/media'
```

Or import specific modules for better tree-shaking:

```typescript
import { renderVideoWithCanvas } from '~/lib/media/rendering/engine'
import { extractAudio } from '~/lib/media/processing'
import type { VideoInfo, Comment } from '~/lib/media/types'
```

## Benefits of Refactoring

1. **Single Responsibility**: Each module has a clear, focused purpose
2. **Maintainability**: Easier to find and modify specific functionality
3. **Testability**: Individual modules can be tested in isolation
4. **Reusability**: Components can be imported independently
5. **Code Organization**: Clear separation of concerns
6. **File Size**: Each file is now under 500 lines (following project guidelines)
