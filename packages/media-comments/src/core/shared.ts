export interface Comment {
  id: string
  author?: string
  authorThumbnail?: string
  content: string
  translatedContent?: string
  likes?: number
  replyCount?: number
}

export interface TimelineDurations {
  coverDurationInFrames: number
  commentDurationsInFrames: number[]
  totalDurationInFrames: number
  totalDurationSeconds: number
  coverDurationSeconds: number
}

export interface SlotLayout { x: number; y: number; width: number; height: number }

// ---------------- Timeline constants & helpers ----------------
export const REMOTION_FPS = 30
export const COVER_DURATION_SECONDS = 3
export const MIN_COMMENT_DURATION_SECONDS = 3
export const MAX_COMMENT_DURATION_SECONDS = 8

const BASE_SECONDS = 2.8
const TRANSLATION_WEIGHT = 1.2
const CHARACTER_DIVISOR = 90
const APPEAR_DISAPPEAR_BUFFER_SECONDS = 1.6

const SCROLL_CONTAINER_HEIGHT = 320
const SCROLL_SPEED_PX_PER_SEC = 30
const MIN_SCROLL_TIME_SECONDS = 1.5

const chineseCharRegex = /[\u4e00-\u9fff]/
function isChinese(text?: string | null) { return Boolean(text && chineseCharRegex.test(text)) }

function estimateCommentHeight(comment: Comment) {
  const isPrimaryChinese = isChinese(comment?.content)
  const isTranslationChinese = isChinese(comment?.translatedContent)
  const mainFontSize = isPrimaryChinese ? 52 : 26
  const mainLineHeight = isPrimaryChinese ? 1.4 : 1.52
  const mainLineHeightPx = mainFontSize * mainLineHeight
  const mainLines = String(comment?.content || '').split('\n').length
  const mainHeight = mainLines * mainLineHeightPx
  let totalHeight = mainHeight
  if (comment?.translatedContent && comment.translatedContent !== comment.content) {
    const translationFontSize = isTranslationChinese ? 52 : 24
    const translationLineHeight = isTranslationChinese ? 1.4 : 1.48
    const translationLineHeightPx = translationFontSize * translationLineHeight
    const translationLines = String(comment?.translatedContent || '').split('\n').length
    const translationHeight = translationLines * translationLineHeightPx
    const spacingBetweenSections = 36
    totalHeight += spacingBetweenSections + translationHeight
  }
  return totalHeight
}

function calculateScrollingDuration(contentHeight: number) {
  if (contentHeight <= SCROLL_CONTAINER_HEIGHT) return 0
  const scrollDistance = contentHeight - SCROLL_CONTAINER_HEIGHT
  const timeNeeded = scrollDistance / SCROLL_SPEED_PX_PER_SEC
  return Math.max(MIN_SCROLL_TIME_SECONDS, timeNeeded)
}

export function estimateCommentDurationSeconds(comment: Comment) {
  const contentLength = String(comment?.content || '').length
  const translationLength = String(comment?.translatedContent || '').length
  const weightedChars = contentLength + translationLength * TRANSLATION_WEIGHT
  const readingDuration = BASE_SECONDS + weightedChars / CHARACTER_DIVISOR
  const contentHeight = estimateCommentHeight(comment)
  const scrollingDuration = calculateScrollingDuration(contentHeight)
  const total = readingDuration + scrollingDuration + APPEAR_DISAPPEAR_BUFFER_SECONDS
  return Math.min(MAX_COMMENT_DURATION_SECONDS, Math.max(MIN_COMMENT_DURATION_SECONDS, total))
}

export function buildCommentTimeline(comments: Comment[], fps: number = REMOTION_FPS): TimelineDurations {
  const coverDurationInFrames = Math.round(COVER_DURATION_SECONDS * fps)
  const commentDurationsInFrames = (Array.isArray(comments) ? comments : []).map((c) => Math.round(estimateCommentDurationSeconds(c) * fps))
  const totalDurationInFrames = coverDurationInFrames + commentDurationsInFrames.reduce((s, f) => s + f, 0)
  const totalDurationSeconds = totalDurationInFrames / fps
  return { coverDurationInFrames, commentDurationsInFrames, totalDurationInFrames, totalDurationSeconds, coverDurationSeconds: COVER_DURATION_SECONDS }
}

// ---------------- Layout constants & helpers ----------------
export const VIDEO_WIDTH = 720
export const VIDEO_HEIGHT = 405

const layout = {
  paddingX: 64,
  paddingY: 48,
  columnGap: 24,
  infoPanelWidth: 600,
  cardPaddingX: 24,
}

// Remotion base canvas is 1920x1080; compute slot position consistent with remotion/layout-constants.ts
const REMOTION_CANVAS_WIDTH = 1920
const containerContentWidth = REMOTION_CANVAS_WIDTH - layout.paddingX * 2
const videoPanelWidth = layout.cardPaddingX * 2 + VIDEO_WIDTH
const gridContentWidth = layout.infoPanelWidth + layout.columnGap + videoPanelWidth
const centerOffset = Math.max(0, (containerContentWidth - gridContentWidth) / 2)
const videoPanelX = layout.paddingX + centerOffset + layout.infoPanelWidth + layout.columnGap
const videoPanelY = layout.paddingY
const VIDEO_X = videoPanelX + layout.cardPaddingX
const VIDEO_Y = videoPanelY

export const layoutConstants = {
  video: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT, x: VIDEO_X, y: VIDEO_Y },
}

export function getOverlayFilter({ coverDurationSeconds, totalDurationSeconds, layout: overrideLayout, fps = REMOTION_FPS }: { coverDurationSeconds: number; totalDurationSeconds: number; layout?: SlotLayout; fps?: number }) {
  const slot = overrideLayout || (layoutConstants.video as SlotLayout)
  const actualX = Math.round(slot.x)
  const actualY = Math.round(slot.y)
  const actualWidth = Math.round(slot.width)
  const actualHeight = Math.round(slot.height)
  const delayMs = Math.round(coverDurationSeconds * 1000)
  const filterGraph = [
    `[1:v]fps=${fps},setpts=PTS-STARTPTS,scale=${actualWidth}:${actualHeight}:flags=lanczos,setsar=1[scaled_src]`,
    `[0:v][scaled_src]overlay=${actualX}:${actualY}:enable='between(t,${coverDurationSeconds},${totalDurationSeconds})'[composited]`,
    `[1:a]adelay=${delayMs}|${delayMs},atrim=0:${totalDurationSeconds},asetpts=PTS-STARTPTS[delayed_audio]`,
  ].join(';')
  return { filterGraph, actualX, actualY, actualWidth, actualHeight, delayMs }
}

export function buildComposeArgs({
  overlayPath,
  sourceVideoPath,
  outputPath,
  fps = REMOTION_FPS,
  coverDurationSeconds,
  totalDurationSeconds,
  layout: overrideLayout,
  videoCodec = 'libx264',
  audioCodec = 'aac',
  audioBitrate = '192k',
  preset,
  pixFmt = 'yuv420p',
  movFlags = '+faststart',
  vsync = 'cfr',
}: { overlayPath: string; sourceVideoPath: string; outputPath: string; fps?: number; coverDurationSeconds: number; totalDurationSeconds: number; layout?: SlotLayout; videoCodec?: string; audioCodec?: string; audioBitrate?: string; preset?: string; pixFmt?: string; movFlags?: string; vsync?: string }) {
  const { filterGraph } = getOverlayFilter({ coverDurationSeconds, totalDurationSeconds, layout: overrideLayout, fps })
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-progress', 'pipe:2',
    '-i', overlayPath,
    '-stream_loop', '-1', '-i', sourceVideoPath,
    '-filter_complex', filterGraph,
    '-map', '[composited]',
    '-map', '[delayed_audio]?',
    '-vsync', vsync,
    '-r', String(fps),
    '-c:v', videoCodec,
    '-c:a', audioCodec,
    '-b:a', audioBitrate,
  ]
  if (preset) args.push('-preset', preset)
  args.push(
    '-pix_fmt', pixFmt,
    '-movflags', movFlags,
    // Hard stop at the expected total duration to avoid edge cases where
    // filter graphs or looping sources keep ffmpeg alive beyond the overlay length.
    '-t', String(totalDurationSeconds),
    '-shortest',
    outputPath,
  )
  return args
}
