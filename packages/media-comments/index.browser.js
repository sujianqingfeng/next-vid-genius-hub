// Browser-friendly entry for @app/media-comments
// Avoid any Node-only globals or imports (e.g., Buffer, undici, node:* schemes)

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
function isChinese(text) { return Boolean(text && chineseCharRegex.test(text)) }

function estimateCommentHeight(comment) {
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

function calculateScrollingDuration(contentHeight) {
  if (contentHeight <= SCROLL_CONTAINER_HEIGHT) return 0
  const scrollDistance = contentHeight - SCROLL_CONTAINER_HEIGHT
  const timeNeeded = scrollDistance / SCROLL_SPEED_PX_PER_SEC
  return Math.max(MIN_SCROLL_TIME_SECONDS, timeNeeded)
}

export function estimateCommentDurationSeconds(comment) {
  const contentLength = String(comment?.content || '').length
  const translationLength = String(comment?.translatedContent || '').length
  const weightedChars = contentLength + translationLength * TRANSLATION_WEIGHT
  const readingDuration = BASE_SECONDS + weightedChars / CHARACTER_DIVISOR
  const contentHeight = estimateCommentHeight(comment)
  const scrollingDuration = calculateScrollingDuration(contentHeight)
  const total = readingDuration + scrollingDuration + APPEAR_DISAPPEAR_BUFFER_SECONDS
  return Math.min(MAX_COMMENT_DURATION_SECONDS, Math.max(MIN_COMMENT_DURATION_SECONDS, total))
}

export function buildCommentTimeline(comments, fps = REMOTION_FPS) {
  const coverDurationInFrames = Math.round(COVER_DURATION_SECONDS * fps)
  const commentDurationsInFrames = (Array.isArray(comments) ? comments : []).map((c) => Math.round(estimateCommentDurationSeconds(c) * fps))
  const totalDurationInFrames = coverDurationInFrames + commentDurationsInFrames.reduce((s, f) => s + f, 0)
  const totalDurationSeconds = totalDurationInFrames / fps
  return { coverDurationInFrames, commentDurationsInFrames, totalDurationInFrames, totalDurationSeconds, coverDurationSeconds: COVER_DURATION_SECONDS }
}

// ---------------- Layout constants & FFmpeg helpers ----------------
export const VIDEO_WIDTH = 720
export const VIDEO_HEIGHT = 405

const layout = {
  paddingX: 64,
  paddingY: 48,
  columnGap: 24,
  infoPanelWidth: 600,
  cardPaddingX: 24,
}

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

export function getOverlayFilter({ coverDurationSeconds, totalDurationSeconds, layout: overrideLayout, fps = REMOTION_FPS }) {
  const slot = overrideLayout || layoutConstants.video
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
} = {}) {
  const { filterGraph } = getOverlayFilter({ coverDurationSeconds, totalDurationSeconds, layout: overrideLayout, fps })
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-progress', 'pipe:2',
    '-i', overlayPath,
    // Loop the source stream at the demuxer level; filtergraph only trims/offsets
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
    '-shortest',
    outputPath,
  )
  return args
}

function inferContentTypeFromUrl(url) {
  try {
    const ext = new URL(url).pathname.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'png': return 'image/png'
      case 'webp': return 'image/webp'
      case 'gif': return 'image/gif'
      case 'bmp': return 'image/bmp'
      case 'svg': return 'image/svg+xml'
      case 'jpeg':
      case 'jpg': return 'image/jpeg'
      default: return undefined
    }
  } catch {
    return undefined
  }
}

export async function inlineRemoteImage(url, { timeoutMs = 15000 } = {}) {
  if (!url) return undefined
  const isRemote = /^https?:\/\//i.test(String(url))
  if (!isRemote) return url
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined
    const timer = controller && timeoutMs > 0 ? setTimeout(() => { try { controller.abort() } catch {} }, timeoutMs) : undefined
    const r = await fetch(url, controller ? { signal: controller.signal } : undefined)
    if (timer) clearTimeout(timer)
    if (!r.ok) throw new Error(String(r.status))
    const arrayBuffer = await r.arrayBuffer()
    // btoa for browser base64
    let binary = ''
    const bytes = new Uint8Array(arrayBuffer)
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    // eslint-disable-next-line no-undef
    const base64 = typeof btoa === 'function' ? btoa(binary) : ''
    const contentType = r.headers.get('content-type') || inferContentTypeFromUrl(url) || 'image/jpeg'
    return `data:${contentType};base64,${base64}`
  } catch {
    return undefined
  }
}

export default {
  REMOTION_FPS,
  COVER_DURATION_SECONDS,
  MIN_COMMENT_DURATION_SECONDS,
  MAX_COMMENT_DURATION_SECONDS,
  estimateCommentDurationSeconds,
  buildCommentTimeline,
  layoutConstants,
  getOverlayFilter,
  buildComposeArgs,
  inlineRemoteImage,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
}
