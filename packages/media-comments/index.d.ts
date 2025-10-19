export interface Comment {
  id: string
  author?: string
  authorThumbnail?: string
  content: string
  translatedContent?: string
  likes?: number
  replyCount?: number
}

export interface VideoInfo {
  title?: string
  translatedTitle?: string
  viewCount?: number
  author?: string
  thumbnail?: string
  series?: string
}

export interface TimelineDurations {
  coverDurationInFrames: number
  commentDurationsInFrames: number[]
  totalDurationInFrames: number
  totalDurationSeconds: number
  coverDurationSeconds: number
}

export interface SlotLayout { x: number; y: number; width: number; height: number }

export const REMOTION_FPS: number
export const COVER_DURATION_SECONDS: number
export const MIN_COMMENT_DURATION_SECONDS: number
export const MAX_COMMENT_DURATION_SECONDS: number

export function estimateCommentDurationSeconds(comment: Comment): number
export function buildCommentTimeline(comments: Comment[], fps?: number): TimelineDurations

export const VIDEO_WIDTH: number
export const VIDEO_HEIGHT: number
export const layoutConstants: { video: SlotLayout }

export function getOverlayFilter(args: { coverDurationSeconds: number; totalDurationSeconds: number; layout?: SlotLayout; fps?: number }): {
  filterGraph: string
  actualX: number
  actualY: number
  actualWidth: number
  actualHeight: number
  delayMs: number
}

export function buildComposeArgs(args: {
  overlayPath: string
  sourceVideoPath: string
  outputPath: string
  fps?: number
  coverDurationSeconds: number
  totalDurationSeconds: number
  layout?: SlotLayout
  videoCodec?: string
  audioCodec?: string
  audioBitrate?: string
  preset?: string
  pixFmt?: string
  movFlags?: string
  vsync?: string
}): string[]

export function inlineRemoteImage(url?: string | null, opts?: { proxyUrl?: string; timeoutMs?: number }): Promise<string | undefined>

declare const _default: {
  REMOTION_FPS: typeof REMOTION_FPS
  COVER_DURATION_SECONDS: typeof COVER_DURATION_SECONDS
  MIN_COMMENT_DURATION_SECONDS: typeof MIN_COMMENT_DURATION_SECONDS
  MAX_COMMENT_DURATION_SECONDS: typeof MAX_COMMENT_DURATION_SECONDS
  estimateCommentDurationSeconds: typeof estimateCommentDurationSeconds
  buildCommentTimeline: typeof buildCommentTimeline
  layoutConstants: typeof layoutConstants
  getOverlayFilter: typeof getOverlayFilter
  buildComposeArgs: typeof buildComposeArgs
  inlineRemoteImage: typeof inlineRemoteImage
  VIDEO_WIDTH: typeof VIDEO_WIDTH
  VIDEO_HEIGHT: typeof VIDEO_HEIGHT
}

export default _default

