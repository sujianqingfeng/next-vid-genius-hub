# Comment video layout positioning

This note documents how the Remotion comment-video layout derives the overlay coordinates so future visual tweaks can retain correct FFmpeg composition alignment.

## Canvas and padding

- Remotion compositions render at `1920 × 1080` (`REMOTION_CANVAS_WIDTH`).
- The top-level container applies uniform padding of `paddingX = 64` and `paddingY = 48` pixels; therefore the usable content width is `1920 - 2 × 64 = 1792`.

## Grid structure

Within the padded area the top section is a two-column grid:

1. **Info panel** — fixed width `600`.
2. **Video panel** — horizontal padding of `cardPaddingX = 24` on both sides plus the playable video width `VIDEO_WIDTH = 720`, giving `videoPanelWidth = 24 + 720 + 24 = 768`.
3. Columns are separated by `columnGap = 24`.

Because the grid is centered (`justifyContent: 'center'`), any leftover horizontal space is split evenly:

```
gridContentWidth = infoPanelWidth + columnGap + videoPanelWidth = 600 + 24 + 768 = 1392
centerOffset = max(0, (usableWidth - gridContentWidth) / 2) = (1792 - 1392) / 2 = 200
```

## Video panel origin

The video panel’s top-left corner (`videoPanelX`, `videoPanelY`) is calculated from the container padding, center offset, and width of the info panel:

```
videoPanelX = paddingX + centerOffset + infoPanelWidth + columnGap = 64 + 200 + 600 + 24 = 888
videoPanelY = paddingY = 48
```

## Embedded video origin

Inside the video panel the `VideoPlaceholder` adds its own horizontal padding but no extra vertical offset. Accounting for the `24` px padding on both sides yields the final Remotion coordinates used by FFmpeg overlay:

```
VIDEO_X = videoPanelX + cardPaddingX = 888 + 24 = 912
VIDEO_Y = videoPanelY = 48
VIDEO_WIDTH = 720
VIDEO_HEIGHT = 405
```

## Verification loop

To ensure the constants match runtime behavior:

1. Render the `DebugLayout` composition or `CommentsVideo` preview.
2. Inspect the placeholder DOM rect (temporary logs showed `{ x: 912, y: 48, width: 720, height: ~408 }`).
3. Feed `VIDEO_X`, `VIDEO_Y`, `VIDEO_WIDTH`, `VIDEO_HEIGHT` into `composeWithSourceVideo` so FFmpeg overlays are aligned with the Remotion output.

When layout tweaks are required, recalculate the intermediate values above (container width, `centerOffset`, panel origins) and update `layout-constants.ts` accordingly so both the Remotion scene and the FFmpeg composition remain synchronized.
