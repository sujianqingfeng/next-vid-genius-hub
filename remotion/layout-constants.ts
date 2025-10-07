export const VIDEO_WIDTH = 720
export const VIDEO_HEIGHT = 405

const layout = {
  paddingX: 64,
  paddingY: 48,
  columnGap: 24,
  rowGap: 36,
  infoPanelWidth: 600,
  cardRadius: 24,
  cardPaddingX: 24,
  cardPaddingY: 24,
}

const VIDEO_X = layout.paddingX + layout.infoPanelWidth + layout.columnGap + layout.cardPaddingX
const VIDEO_Y = layout.paddingY + layout.cardPaddingY

export const layoutConstants = {
  video: {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    x: VIDEO_X,
    y: VIDEO_Y,
  },
}