import type { Comment } from '../types'
import type { TimelineDurations } from '../../../remotion/types'

const chineseCharRegex = /[\u4e00-\u9fff]/

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

function isChinese(text?: string | null): boolean {
  return Boolean(text && chineseCharRegex.test(text))
}

function estimateCommentHeight(comment: Comment): number {
  const isPrimaryChinese = isChinese(comment.content)
  const isTranslationChinese = isChinese(comment.translatedContent)

  const mainFontSize = isPrimaryChinese ? 52 : 26
  const mainLineHeight = isPrimaryChinese ? 1.4 : 1.52
  const mainLineHeightPx = mainFontSize * mainLineHeight
  const mainLines = comment.content.split('\n').length
  const mainHeight = mainLines * mainLineHeightPx

  let totalHeight = mainHeight

  if (comment.translatedContent && comment.translatedContent !== comment.content) {
    const translationFontSize = isTranslationChinese ? 52 : 24
    const translationLineHeight = isTranslationChinese ? 1.4 : 1.48
    const translationLineHeightPx = translationFontSize * translationLineHeight
    const translationLines = comment.translatedContent.split('\n').length
    const translationHeight = translationLines * translationLineHeightPx

    const spacingBetweenSections = 20 + 16
    totalHeight += spacingBetweenSections + translationHeight
  }

  return totalHeight
}

function calculateScrollingDuration(contentHeight: number): number {
  if (contentHeight <= SCROLL_CONTAINER_HEIGHT) {
    return 0
  }

  const scrollDistance = contentHeight - SCROLL_CONTAINER_HEIGHT
  const timeNeeded = scrollDistance / SCROLL_SPEED_PX_PER_SEC
  return Math.max(MIN_SCROLL_TIME_SECONDS, timeNeeded)
}

export function estimateCommentDurationSeconds(comment: Comment): number {
  const contentLength = comment.content.length
  const translationLength = comment.translatedContent?.length ?? 0
  const weightedChars = contentLength + translationLength * TRANSLATION_WEIGHT
  const readingDuration = BASE_SECONDS + weightedChars / CHARACTER_DIVISOR

  const contentHeight = estimateCommentHeight(comment)
  const scrollingDuration = calculateScrollingDuration(contentHeight)

  const total = readingDuration + scrollingDuration + APPEAR_DISAPPEAR_BUFFER_SECONDS

  return Math.min(
    MAX_COMMENT_DURATION_SECONDS,
    Math.max(MIN_COMMENT_DURATION_SECONDS, total),
  )
}

export function buildCommentTimeline(
  comments: Comment[],
  fps: number = REMOTION_FPS,
): TimelineDurations {
  const coverDurationInFrames = Math.round(COVER_DURATION_SECONDS * fps)
  const commentDurationsInFrames = comments.map((comment) => {
    const seconds = estimateCommentDurationSeconds(comment)
    return Math.round(seconds * fps)
  })

  const commentsTotal = commentDurationsInFrames.reduce((sum, frames) => sum + frames, 0)
  const totalDurationInFrames = coverDurationInFrames + commentsTotal
  const totalDurationSeconds = totalDurationInFrames / fps

  return {
    coverDurationInFrames,
    commentDurationsInFrames,
    totalDurationInFrames,
    totalDurationSeconds,
    coverDurationSeconds: COVER_DURATION_SECONDS,
  }
}
