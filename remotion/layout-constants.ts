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

// Remotion 画布尺寸
const REMOTION_CANVAS_WIDTH = 1920

// 容器内容区域尺寸（减去 padding）
const containerContentWidth = REMOTION_CANVAS_WIDTH - (layout.paddingX * 2)

// Grid 内容总宽度
const videoPanelWidth = layout.cardPaddingX * 2 + VIDEO_WIDTH
const gridContentWidth = layout.infoPanelWidth + layout.columnGap + videoPanelWidth

// 由于 justifyContent: 'center'，计算居中偏移
const centerOffset = Math.max(0, (containerContentWidth - gridContentWidth) / 2)

// VideoPanel 在 grid 中的位置（考虑居中偏移）
const videoPanelX = layout.paddingX + centerOffset + layout.infoPanelWidth + layout.columnGap
const videoPanelY = layout.paddingY

// 视频在 VideoPanel 内的实际位置（基于实际渲染测量）
const VIDEO_X = videoPanelX + layout.cardPaddingX
const VIDEO_Y = videoPanelY

export const layoutConstants = {
  video: {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    x: VIDEO_X,
    y: VIDEO_Y,
  },
}