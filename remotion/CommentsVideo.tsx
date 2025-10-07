"use client"

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { ThumbsUp } from 'lucide-react'
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  useCurrentFrame,
} from 'remotion'
import type { CommentVideoInputProps } from './types'
import { layoutConstants, VIDEO_WIDTH, VIDEO_HEIGHT } from './layout-constants'

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

const palette = {
  background: '#f8fafc',
  surface: '#ffffff',
  border: 'rgba(15, 23, 42, 0.08)',
  textPrimary: '#0f172a',
  textSecondary: '#334155',
  textMuted: '#64748b',
  accent: '#ef4444',
}

const baseFont = 'Inter, "Noto Sans", system-ui, -apple-system, BlinkMacSystemFont'

const containerStyle: CSSProperties = {
  backgroundColor: palette.background,
  color: palette.textPrimary,
  fontFamily: baseFont,
  padding: `${layout.paddingY}px ${layout.paddingX}px`,
  display: 'flex',
  flexDirection: 'column',
  gap: layout.rowGap,
  height: '100%',
  boxSizing: 'border-box',
}

const topSectionStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto auto',
  gap: layout.columnGap,
  alignItems: 'stretch',
  justifyContent: 'center',
  width: '100%',
}

const baseCardStyle: CSSProperties = {
  backgroundColor: palette.surface,
  border: `1px solid ${palette.border}`,
  borderRadius: layout.cardRadius,
  padding: `${layout.cardPaddingY}px ${layout.cardPaddingX}px`,
  boxShadow: '0 20px 36px rgba(15, 23, 42, 0.06)',
}

const infoPanelStyle: CSSProperties = {
  ...baseCardStyle,
  width: layout.infoPanelWidth,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  gap: 24,
}

const videoPanelStyle: CSSProperties = {
  ...baseCardStyle,
  width: layout.cardPaddingX * 2 + VIDEO_WIDTH,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
}

const commentPanelStyle: CSSProperties = {
  ...baseCardStyle,
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
  minHeight: 420,
}

const sectionLabelStyle: CSSProperties = {
  fontSize: 18,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: palette.textMuted,
}

const metaListStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 16,
  fontSize: 18,
  color: palette.textMuted,
}

const commentBodyStyle: CSSProperties = {
  fontSize: 26,
  lineHeight: 1.52,
  color: palette.textPrimary,
  whiteSpace: 'pre-wrap',
  margin: 0,
  width: '100%',
}

const translatedStyle: CSSProperties = {
  marginTop: 18,
  padding: '16px 20px',
  borderRadius: 16,
  backgroundColor: 'rgba(239, 68, 68, 0.08)',
  color: palette.textSecondary,
  borderLeft: '4px solid rgba(239, 68, 68, 0.3)',
  whiteSpace: 'pre-wrap',
  fontSize: 24,
  lineHeight: 1.48,
}

const chineseCharRegex = /[\u4e00-\u9fff]/

function isLikelyChinese(text?: string | null): boolean {
  return Boolean(text && chineseCharRegex.test(text))
}


export const CommentsVideo: React.FC<CommentVideoInputProps> = ({
  videoInfo,
  comments,
  coverDurationInFrames,
  commentDurationsInFrames,
  fps,
}) => {
  const sequences = commentDurationsInFrames.reduce<
    {
      startFrame: number
      durationInFrames: number
      comment: CommentVideoInputProps['comments'][number]
    }[]
  >((acc, durationInFrames, index) => {
    const startFrame = index === 0 ? 0 : acc[index - 1].startFrame + acc[index - 1].durationInFrames
    const comment = comments[index]
    if (comment) {
      acc.push({ startFrame, durationInFrames, comment })
    }
    return acc
  }, [])

  const commentsTotalDuration = commentDurationsInFrames.reduce((sum, frames) => sum + frames, 0)
  const mainDuration = Math.max(commentsTotalDuration, fps)

  return (
    <AbsoluteFill style={{ backgroundColor: palette.background }}>
      <Sequence layout="none" from={0} durationInFrames={coverDurationInFrames}>
        <CoverSlide videoInfo={videoInfo} commentCount={comments.length} fps={fps} />
      </Sequence>
      <Sequence layout="none" from={coverDurationInFrames} durationInFrames={mainDuration}>
        <MainLayout videoInfo={videoInfo} comments={comments} sequences={sequences} fps={fps} />
      </Sequence>
    </AbsoluteFill>
  )
}

const MainLayout: React.FC<{
  videoInfo: CommentVideoInputProps['videoInfo']
  comments: CommentVideoInputProps['comments']
  sequences: {
    startFrame: number
    durationInFrames: number
    comment: CommentVideoInputProps['comments'][number]
  }[]
  fps: number
}> = ({ videoInfo, comments, sequences, fps }) => {
  return (
    <AbsoluteFill style={{
      ...containerStyle,
      background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.18), rgba(239, 68, 68, 0.04))',
    }}>
      <div style={topSectionStyle}>
        <InfoPanel videoInfo={videoInfo} commentCount={comments.length} />
        <VideoPanel />
      </div>
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        minHeight: 420,
      }}>
        <span style={sectionLabelStyle}>Comment Highlights</span>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {sequences.map(({ startFrame, durationInFrames, comment }) => (
            <Sequence
              key={comment.id}
              layout="none"
              from={startFrame}
              durationInFrames={durationInFrames}
            >
              <CommentSlide
                comment={comment}
                durationInFrames={durationInFrames}
                fps={fps}
              />
            </Sequence>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  )
}

const InfoPanel: React.FC<{ videoInfo: CommentVideoInputProps['videoInfo']; commentCount: number }> = ({
  videoInfo,
  commentCount,
}) => {
  return (
    <div style={{
      width: layout.infoPanelWidth,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: 24,
    }}>
      <div>
        <div style={{ ...sectionLabelStyle, color: palette.accent }}>Creator Digest</div>
        <h1
          style={{
            margin: '16px 0 0',
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: palette.textPrimary,
          }}
        >
          {videoInfo.translatedTitle ?? videoInfo.title}
        </h1>
        <p style={{ margin: '12px 0 0', fontSize: 20, color: palette.textMuted }}>
          @{videoInfo.author ?? 'unknown'} · 外网真实评论
        </p>
      </div>
      <div style={metaListStyle}>
        <MetaItem label="观看量" value={formatCount(videoInfo.viewCount)} />
        <MetaItem label="评论数" value={String(commentCount)} />
        <MetaItem label="视频制作者" value="真实评论-TubeTweet" />
      </div>
    </div>
  )
}

const VideoPanel: React.FC = () => {
  return (
    <div style={{
      width: layout.cardPaddingX * 2 + VIDEO_WIDTH,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <VideoPlaceholder />
    </div>
  )
}

const CoverSlide: React.FC<{
  videoInfo: CommentVideoInputProps['videoInfo']
  commentCount: number
  fps: number
}> = ({ videoInfo, commentCount, fps }) => {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, fps], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(239, 68, 68, 0.03))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: palette.textPrimary,
        fontFamily: baseFont,
        padding: '0 80px',
        boxSizing: 'border-box',
        opacity,
      }}
    >
      <div style={{
        maxWidth: 1000,
        width: '100%',
        textAlign: 'center',
      }}>
        {/* Main Title */}
        <h1
          style={{
            margin: '0 0 32px 0',
            fontSize: 68,
            fontWeight: 600,
            letterSpacing: '-0.025em',
            lineHeight: 1.15,
            color: palette.textPrimary,
          }}
        >
          {videoInfo.translatedTitle ?? videoInfo.title}
        </h1>

        {/* Original Title (if translated) */}
        {videoInfo.translatedTitle && videoInfo.translatedTitle !== videoInfo.title && (
          <p style={{
            margin: '0 0 48px 0',
            fontSize: 28,
            color: palette.textSecondary,
            fontWeight: 400,
            lineHeight: 1.4,
          }}>
            {videoInfo.title}
          </p>
        )}

        {/* Simple divider */}
        <div style={{
          width: '80px',
          height: '2px',
          backgroundColor: palette.accent,
          margin: '0 auto 48px',
          opacity: 0.6,
        }} />

        {/* Meta Information */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 32,
          fontSize: 20,
          color: palette.textMuted,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 500 }}>{formatCount(videoInfo.viewCount)}</span>
            <span>观看</span>
          </div>
          <span>·</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 500 }}>{commentCount}</span>
            <span>评论</span>
          </div>
          <span>·</span>
          <span>@{videoInfo.author ?? '未知'}</span>
        </div>

        {/* Source indicator */}
        <div style={{
          marginTop: 16,
          fontSize: 18,
          color: palette.textMuted,
          opacity: 0.7,
        }}>
          外网真实评论 · TubeTweet
        </div>
      </div>
    </AbsoluteFill>
  )
}


const ScrollingCommentWithTranslation: React.FC<{
  comment: CommentVideoInputProps['comments'][number]
  displayCommentStyle: CSSProperties
  durationInFrames: number
  fps: number
}> = ({ comment, displayCommentStyle, durationInFrames, fps }) => {
  const frame = useCurrentFrame()

  // Fade timings and scroll pacing to maintain smoothness on long comments
  const fadeTime = Math.min(fps * 0.8, 12)
  const minDwellFrames = Math.round(0.2 * fps)
  const scrollStart = fadeTime

  const isChineseTranslation = isLikelyChinese(comment.translatedContent)

  // Estimated height (fallback) based on font metrics and rough line count
  const fontSize = displayCommentStyle.fontSize as number
  const lineHeight = displayCommentStyle.lineHeight as number
  const lineHeightPx = fontSize * lineHeight
  const mainTextLines = Math.ceil(comment.content.length / 50)
  let estimatedTotalHeight = mainTextLines * lineHeightPx

  let translationStyle: CSSProperties | null = null
  if (comment.translatedContent && comment.translatedContent !== comment.content) {
    const translationFontSize = isChineseTranslation ? 52 : 24
    const translationLineHeight = isChineseTranslation ? 1.4 : 1.48
    const translationLineHeightPx = translationFontSize * translationLineHeight
    const translationLines = Math.ceil(comment.translatedContent.length / 50)
    estimatedTotalHeight += 20 + translationLines * translationLineHeightPx

    translationStyle = {
      marginTop: 20,
      padding: '16px 20px',
      borderRadius: 16,
      backgroundColor: isChineseTranslation ? 'transparent' : 'rgba(239, 68, 68, 0.08)',
      color: isChineseTranslation ? palette.accent : palette.textSecondary,
      borderLeft: isChineseTranslation ? 'none' : '4px solid rgba(239, 68, 68, 0.3)',
      fontSize: translationFontSize,
      lineHeight: translationLineHeight,
      letterSpacing: isChineseTranslation ? '0.024em' : 'normal',
    }
  }

  // Measure real content height to avoid under-estimation for large Chinese text
  const CONTAINER_HEIGHT = 320
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState<{ content: number; container: number }>({ content: 0, container: CONTAINER_HEIGHT })

  useLayoutEffect(() => {
    const measure = () => {
      const containerH = containerRef.current?.clientHeight ?? CONTAINER_HEIGHT
      const contentH = contentRef.current?.scrollHeight ?? 0
      setMeasured((prev) => (prev.content === contentH && prev.container === containerH ? prev : { content: contentH, container: containerH }))
    }
    measure()
    const raf = requestAnimationFrame(measure)
    // Observe size changes of either container or content
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : undefined
    if (containerRef.current) ro?.observe(containerRef.current)
    if (contentRef.current) ro?.observe(contentRef.current)
    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
    }
    // Re-measure when content or language style changes
  }, [comment.content, comment.translatedContent, isChineseTranslation])

  const containerH = measured.container || CONTAINER_HEIGHT
  const effectiveContentH = measured.content || estimatedTotalHeight
  const maxScroll = Math.max(0, effectiveContentH - containerH)

  const availableForScroll = Math.max(durationInFrames - fadeTime - minDwellFrames, 0)
  const minScrollFrames = Math.round(fps * 0.6)
  const pixelsPerSecond = 100
  const desiredScrollFrames = maxScroll > 0 ? Math.ceil((maxScroll / pixelsPerSecond) * fps) : 0
  const scrollDurationFrames = maxScroll > 0
    ? Math.min(availableForScroll, Math.max(minScrollFrames, desiredScrollFrames))
    : 0
  const scrollEnd = scrollStart + scrollDurationFrames

  const currentScroll = maxScroll > 0 && scrollDurationFrames > 0
    ? interpolate(
        frame,
        [scrollStart, scrollEnd],
        [0, maxScroll],
        {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: Easing.ease,
        }
      )
    : 0

  return (
    <div
      ref={containerRef}
      style={{
        height: CONTAINER_HEIGHT,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      <div
        ref={contentRef}
        style={{
          transform: `translateY(-${currentScroll}px)`,
          // No CSS transition: frame-driven for exact positioning
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        <div style={{ ...displayCommentStyle, whiteSpace: 'pre-wrap', marginBottom: 0 }}>
          {comment.content}
        </div>
        {comment.translatedContent && comment.translatedContent !== comment.content ? (
          <div style={translationStyle ?? undefined}>{comment.translatedContent}</div>
        ) : null}
      </div>
    </div>
  )
}


const CommentSlide: React.FC<{
  comment: CommentVideoInputProps['comments'][number]
  durationInFrames: number
  fps: number
}> = ({ comment, durationInFrames, fps }) => {
  const frame = useCurrentFrame()

  // Use shorter fade times to match scrolling component
  const fadeTime = Math.min(fps * 0.8, 12)
  const appear = interpolate(frame, [0, fadeTime], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const exitStart = Math.max(durationInFrames - fadeTime, 0)
  const disappear = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const opacity = Math.min(appear, disappear)

  // Calculate countdown timer
  const remainingFrames = Math.max(0, durationInFrames - frame)
  const remainingSeconds = Math.ceil(remainingFrames / fps)
  const countdownOpacity = interpolate(frame, [durationInFrames - fps * 3, durationInFrames - fps * 2], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const isChinesePrimary = isLikelyChinese(comment.content)
  const isChineseTranslation = isLikelyChinese(comment.translatedContent)
  const displayCommentStyle: CSSProperties = {
    fontSize: isChinesePrimary ? 52 : 26,
    lineHeight: isChinesePrimary ? 1.4 : 1.52,
    letterSpacing: isChinesePrimary ? '0.024em' : 'normal',
    color: isChinesePrimary ? palette.accent : palette.textPrimary,
  }

  const commentText = comment.content
  const totalTextLength = commentText.length + (comment.translatedContent?.length || 0)
  const needsScroll = totalTextLength > 100 // Consider both main and translation content

  return (
    <div style={{ opacity, display: 'flex', flexDirection: 'column', gap: 20, height: '100%', position: 'relative' }}>
      {/* Countdown Timer */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          opacity: countdownOpacity,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 16,
          color: palette.textMuted,
          backgroundColor: 'rgba(15, 23, 42, 0.05)',
          padding: '6px 10px',
          borderRadius: 8,
          border: `1px solid ${palette.border}`,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: remainingSeconds <= 2 ? palette.accent : palette.textMuted,
            transition: 'background-color 0.3s ease',
          }}
        />
        <span>{remainingSeconds}s</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <Avatar name={comment.author} src={comment.authorThumbnail} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ margin: 0, fontSize: 24, fontWeight: 600, color: palette.textPrimary }}>{comment.author}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: palette.textMuted, fontSize: 18 }}>
            <ThumbsUp size={18} strokeWidth={2} />
            <span>{formatCount(comment.likes)}</span>
          </div>
        </div>
      </div>

      {needsScroll ? (
        <ScrollingCommentWithTranslation
          comment={comment}
          displayCommentStyle={displayCommentStyle}
          durationInFrames={durationInFrames}
          fps={fps}
        />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <p style={{ ...commentBodyStyle, ...displayCommentStyle }}>{comment.content}</p>
          {comment.translatedContent && comment.translatedContent !== comment.content ? (
            <div
              style={{
                ...translatedStyle,
                ...(isChineseTranslation
                  ? {
                      backgroundColor: 'transparent',
                      borderLeft: 'none',
                      color: palette.accent,
                      padding: 0,
                      marginTop: 12,
                      fontSize: 52,
                      lineHeight: 1.4,
                      letterSpacing: '0.024em',
                    }
                  : {}),
              }}
            >
              {comment.translatedContent}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

const Avatar: React.FC<{ name: string; src?: string | null }> = ({ name, src }) => {
  if (src) {
    return (
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          overflow: 'hidden',
          border: `2px solid ${palette.border}`,
        }}
      >
        <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }

  return (
    <div
      style={{
        width: 72,
        height: 72,
        borderRadius: '50%',
        backgroundColor: 'rgba(239, 68, 68, 0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 28,
        color: palette.accent,
        border: `2px solid ${palette.border}`,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

const VideoPlaceholder: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={ref}
      style={{
        width: VIDEO_WIDTH,
        alignSelf: 'center',
        borderRadius: 20,
        border: `1px solid ${palette.border}`,
        backgroundColor: '#e0f2fe',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          paddingTop: `${(VIDEO_HEIGHT / VIDEO_WIDTH) * 100}%`,
          backgroundImage: 'linear-gradient(135deg, rgba(239, 68, 68, 0.18), rgba(239, 68, 68, 0.06))',
          borderTop: `1px solid ${palette.border}`,
          borderBottom: `1px solid ${palette.border}`,
        }}
      />
    </div>
  )
}

const MetaItem: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  return (
    <div>
      <span
        style={{ display: 'block', fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase', color: palette.textMuted }}
      >
        {label}
      </span>
      <span style={{ display: 'block', fontSize: 20, color: palette.textPrimary }}>{value}</span>
    </div>
  )
}

function formatCount(value?: number): string {
  if (!value) {
    return '0'
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`
  }

  return new Intl.NumberFormat('en-US').format(value)
}

