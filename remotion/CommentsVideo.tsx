import type { CSSProperties } from 'react'
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  useCurrentFrame,
} from 'remotion'
import type { CommentVideoInputProps } from './types'

const layout = {
  paddingX: 84,
  paddingY: 72,
  columnGap: 48,
  rowGap: 48,
  infoPanelWidth: 720,
  cardRadius: 24,
  cardPaddingX: 32,
  cardPaddingY: 30,
}

const VIDEO_WIDTH = 864
const VIDEO_HEIGHT = 486

const palette = {
  background: '#0b1120',
  surface: '#111827',
  border: 'rgba(148, 163, 184, 0.18)',
  textPrimary: '#f8fafc',
  textSecondary: '#cbd5f5',
  textMuted: '#94a3b8',
  accent: '#38bdf8',
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
  display: 'flex',
  gap: layout.columnGap,
  alignItems: 'stretch',
}

const baseCardStyle: CSSProperties = {
  backgroundColor: palette.surface,
  border: `1px solid ${palette.border}`,
  borderRadius: layout.cardRadius,
  padding: `${layout.cardPaddingY}px ${layout.cardPaddingX}px`,
  boxShadow: '0 20px 36px rgba(8, 11, 22, 0.22)',
}

const infoPanelStyle: CSSProperties = {
  ...baseCardStyle,
  width: layout.infoPanelWidth,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  gap: 32,
}

const videoPanelStyle: CSSProperties = {
  ...baseCardStyle,
  width: layout.cardPaddingX * 2 + VIDEO_WIDTH,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
}

const commentPanelStyle: CSSProperties = {
  ...baseCardStyle,
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
  minHeight: 480,
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
  maxWidth: '70ch',
}

const translatedStyle: CSSProperties = {
  marginTop: 18,
  padding: '16px 20px',
  borderRadius: 16,
  backgroundColor: 'rgba(56, 189, 248, 0.1)',
  color: palette.textSecondary,
  borderLeft: '4px solid rgba(56, 189, 248, 0.4)',
  whiteSpace: 'pre-wrap',
  fontSize: 24,
  lineHeight: 1.48,
}

const VIDEO_X = layout.paddingX + layout.infoPanelWidth + layout.columnGap + layout.cardPaddingX
const VIDEO_Y = layout.paddingY + layout.cardPaddingY

export const CommentsVideo: React.FC<CommentVideoInputProps> = ({
  videoInfo,
  comments,
  coverDurationInFrames,
  commentDurationsInFrames,
  fps,
}) => {
  const sequences = comments.map((comment, index) => {
    const startFrame =
      coverDurationInFrames + commentDurationsInFrames.slice(0, index).reduce((sum, frames) => sum + frames, 0)
    return { startFrame, durationInFrames: commentDurationsInFrames[index], comment, index }
  })

  return (
    <AbsoluteFill style={containerStyle}>
      <div style={topSectionStyle}>
        <InfoPanel videoInfo={videoInfo} commentCount={comments.length} />
        <VideoPanel videoInfo={videoInfo} />
      </div>
      <div style={commentPanelStyle}>
        <span style={sectionLabelStyle}>Comment Highlights</span>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Sequence layout="none" from={0} durationInFrames={coverDurationInFrames}>
            <CoverSlide videoInfo={videoInfo} commentCount={comments.length} fps={fps} />
          </Sequence>
          {sequences.map(({ startFrame, durationInFrames, comment, index }) => (
            <Sequence
              key={comment.id}
              layout="none"
              from={startFrame}
              durationInFrames={durationInFrames}
            >
              <CommentSlide
                comment={comment}
                index={index}
                total={comments.length}
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
    <div style={infoPanelStyle}>
      <div>
        <div style={{ ...sectionLabelStyle, color: palette.accent }}>Creator Digest</div>
        <h1
          style={{
            margin: '16px 0 0',
            fontSize: 48,
            fontWeight: 700,
            letterSpacing: '-0.01em',
          }}
        >
          {videoInfo.translatedTitle ?? videoInfo.title}
        </h1>
        <p style={{ margin: '12px 0 0', fontSize: 22, color: palette.textMuted }}>
          @{videoInfo.author ?? 'unknown'} · {commentCount} 条精选评论
        </p>
      </div>
      <div style={metaListStyle}>
        <MetaItem label="Views" value={formatCount(videoInfo.viewCount)} />
        <MetaItem label="Series" value={videoInfo.series ?? '未分组'} />
        <MetaItem label="Episode" value={videoInfo.seriesEpisode ? `#${videoInfo.seriesEpisode}` : 'N/A'} />
        <MetaItem label="Comments" value={String(commentCount)} />
      </div>
    </div>
  )
}

const VideoPanel: React.FC<{ videoInfo: CommentVideoInputProps['videoInfo'] }> = ({ videoInfo }) => {
  return (
    <div style={videoPanelStyle}>
      <VideoPlaceholder />
      {videoInfo.thumbnail ? (
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 20,
              overflow: 'hidden',
              border: `1px solid ${palette.border}`,
              flexShrink: 0,
            }}
          >
            <Img
              src={videoInfo.thumbnail}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 22, color: palette.textMuted }}>Original Title</p>
            <p style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 600 }}>{videoInfo.title}</p>
          </div>
        </div>
      ) : null}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, opacity }}>
      <p style={{ margin: 0, fontSize: 24, color: palette.textMuted }}>
        {videoInfo.title}
      </p>
      <h2 style={{ margin: 0, fontSize: 36, fontWeight: 600 }}>{videoInfo.translatedTitle ?? videoInfo.title}</h2>
      <p style={{ margin: 0, fontSize: 20, color: palette.textMuted }}>
        来自 {videoInfo.author ?? '未知'} · {formatCount(videoInfo.viewCount)} 次观看 · {commentCount} 条评论梳理完成
      </p>
    </div>
  )
}

const CommentSlide: React.FC<{
  comment: CommentVideoInputProps['comments'][number]
  index: number
  total: number
  durationInFrames: number
  fps: number
}> = ({ comment, index, total, durationInFrames, fps }) => {
  const frame = useCurrentFrame()
  const appear = interpolate(frame, [0, Math.max(8, fps / 3)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const exitStart = Math.max(durationInFrames - fps, 0)
  const disappear = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const opacity = Math.min(appear, disappear)

  return (
    <div style={{ opacity, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Avatar name={comment.author} src={comment.authorThumbnail} />
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>{comment.author}</p>
          <p style={{ margin: '6px 0 0', fontSize: 18, color: palette.textMuted }}>
            👍 {formatCount(comment.likes)} · 回复 {formatCount(comment.replyCount ?? 0)}
          </p>
        </div>
        <div style={{ fontSize: 18, color: palette.textMuted }}>
          {index + 1} / {total}
        </div>
      </div>
      <div>
        <p style={commentBodyStyle}>{comment.content}</p>
        {comment.translatedContent && comment.translatedContent !== comment.content ? (
          <div style={translatedStyle}>{comment.translatedContent}</div>
        ) : null}
      </div>
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
        backgroundColor: 'rgba(148, 163, 184, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 28,
        color: palette.textMuted,
        border: `2px solid ${palette.border}`,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

const VideoPlaceholder: React.FC = () => {
  return (
    <div
      style={{
        width: VIDEO_WIDTH,
        alignSelf: 'flex-start',
        borderRadius: 20,
        border: `1px solid ${palette.border}`,
        backgroundColor: '#0f172a',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          paddingTop: `${(VIDEO_HEIGHT / VIDEO_WIDTH) * 100}%`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: palette.textMuted,
          fontSize: 22,
        }}
      >
        Source Video
      </div>
    </div>
  )
}

const MetaItem: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  return (
    <div>
      <span style={{ display: 'block', fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
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

export const layoutConstants = {
  video: {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    x: VIDEO_X,
    y: VIDEO_Y,
  },
}
