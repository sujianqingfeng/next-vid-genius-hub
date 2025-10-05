import type { CSSProperties } from 'react'
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  useCurrentFrame,
} from 'remotion'
import type { CommentVideoInputProps } from './types'

const VIDEO_WIDTH = 900
const VIDEO_HEIGHT = 506
const VIDEO_X = 950
const VIDEO_Y = 30
const PADDING = 72

const backgroundStyle: CSSProperties = {
  background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 45%, #020617 100%)',
  color: '#e2e8f0',
  fontFamily: 'Inter, "Noto Sans", system-ui, -apple-system, BlinkMacSystemFont',
}

const sectionTitleStyle: CSSProperties = {
  textTransform: 'uppercase',
  letterSpacing: '0.24em',
  fontSize: 18,
  color: '#38bdf8',
}

const cardStyle: CSSProperties = {
  background: 'rgba(15, 23, 42, 0.55)',
  borderRadius: 32,
  backdropFilter: 'blur(18px)',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  boxShadow: '0 24px 80px rgba(15, 23, 42, 0.45)',
}

const videoFrameStyle: CSSProperties = {
  position: 'relative',
  width: VIDEO_WIDTH,
  height: VIDEO_HEIGHT,
  borderRadius: 28,
  border: '1px solid rgba(148, 163, 184, 0.25)',
  background: 'radial-gradient(circle at 20% 20%, rgba(148, 163, 184, 0.2), rgba(15, 23, 42, 0.6))',
  overflow: 'hidden',
}

const badgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '8px 16px',
  borderRadius: 9999,
  backgroundColor: 'rgba(56, 189, 248, 0.15)',
  color: '#38bdf8',
  fontSize: 20,
  fontWeight: 600,
}

const subTitleStyle: CSSProperties = {
  color: 'rgba(226, 232, 240, 0.68)',
  fontSize: 28,
  lineHeight: 1.4,
}

const commentBodyStyle: CSSProperties = {
  fontSize: 30,
  lineHeight: 1.5,
  color: '#f8fafc',
  whiteSpace: 'pre-wrap',
}

const translatedStyle: CSSProperties = {
  marginTop: 32,
  padding: '24px 28px',
  borderRadius: 24,
  background: 'rgba(59, 130, 246, 0.15)',
  borderLeft: '4px solid rgba(59, 130, 246, 0.55)',
  color: '#cbd5f5',
  fontSize: 30,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
}

export const CommentsVideo: React.FC<CommentVideoInputProps> = ({
  videoInfo,
  comments,
  coverDurationInFrames,
  commentDurationsInFrames,
  fps,
}) => {
  const coverFrames = coverDurationInFrames
  const sequences = comments.map((comment, index) => {
    const startFrame =
      coverFrames + commentDurationsInFrames.slice(0, index).reduce((sum, f) => sum + f, 0)
    return { startFrame, durationInFrames: commentDurationsInFrames[index], comment, index }
  })

  return (
    <AbsoluteFill style={{ ...backgroundStyle, padding: PADDING }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          gap: 40,
        }}
      >
        <Header videoInfo={videoInfo} commentCount={comments.length} />
        <div style={{ display: 'flex', gap: 48, flex: 1 }}>
          <div style={{ flex: '0 0 820px', position: 'relative' }}>
            <Sequence from={0} durationInFrames={coverDurationInFrames}>
              <CoverSlide videoInfo={videoInfo} commentCount={comments.length} fps={fps} />
            </Sequence>
            {sequences.map(({ startFrame, durationInFrames, comment, index }) => (
              <Sequence key={comment.id} from={startFrame} durationInFrames={durationInFrames}>
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
          <div style={{ flex: 1, minWidth: VIDEO_WIDTH }}>
            <div style={videoFrameStyle}>
              <VideoPlaceholder fps={fps} />
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}

const Header: React.FC<{ videoInfo: CommentVideoInputProps['videoInfo']; commentCount: number }> = ({
  videoInfo,
  commentCount,
}) => {
  return (
    <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
      <div style={badgeStyle}>Creator Comments</div>
      <div style={{ flex: 1 }}>
        <h1
          style={{
            fontSize: 56,
            margin: 0,
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}
        >
          {videoInfo.translatedTitle ?? videoInfo.title}
        </h1>
        <p style={{ ...subTitleStyle, marginTop: 12 }}>
          @{videoInfo.author ?? 'unknown'} · {commentCount} 条精选评论
        </p>
      </div>
      <div style={{ textAlign: 'right' }}>
        <p style={{ fontSize: 24, color: 'rgba(148, 163, 184, 0.9)', margin: 0 }}>Series</p>
        <p style={{ fontSize: 30, fontWeight: 600, margin: '4px 0 0' }}>
          {videoInfo.series ?? '外网真实评论'}
        </p>
      </div>
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
  const translateY = interpolate(frame, [0, fps], [40, 0], {
    easing: Easing.out(Easing.quad),
    extrapolateRight: 'clamp',
  })

  return (
    <div
      style={{
        ...cardStyle,
        padding: '48px 44px',
        display: 'flex',
        flexDirection: 'column',
        gap: 32,
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      <span style={sectionTitleStyle}>Episode overview</span>
      <div style={{ display: 'flex', gap: 28 }}>
        {videoInfo.thumbnail ? (
          <div
            style={{
              width: 180,
              height: 180,
              borderRadius: 28,
              overflow: 'hidden',
              flexShrink: 0,
              border: '1px solid rgba(148, 163, 184, 0.2)',
            }}
          >
            <Img src={videoInfo.thumbnail} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <h2 style={{ fontSize: 38, fontWeight: 600, margin: 0 }}>{videoInfo.title}</h2>
          <p style={subTitleStyle}>来自 {videoInfo.author ?? '未知'} · {videoInfo.viewCount} 次观看</p>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 18px',
              borderRadius: 9999,
              background: 'rgba(34, 197, 94, 0.18)',
              color: '#4ade80',
              fontSize: 24,
              fontWeight: 600,
              width: 'fit-content',
            }}
          >
            {commentCount} 条评论已整理完毕
          </div>
        </div>
      </div>
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
  const appear = interpolate(frame, [0, Math.max(6, fps / 3)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const disappear = interpolate(frame, [durationInFrames - fps, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const opacity = Math.min(appear, disappear)
  const translateY = interpolate(frame, [0, fps / 2], [36, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateRight: 'clamp',
  })

  return (
    <div
      style={{
        ...cardStyle,
        padding: '44px 40px',
        display: 'flex',
        flexDirection: 'column',
        gap: 32,
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div
          style={{
            width: 88,
            height: 88,
            borderRadius: '50%',
            overflow: 'hidden',
            border: '3px solid rgba(148, 163, 184, 0.35)',
            boxShadow: '0 12px 36px rgba(15, 23, 42, 0.45)',
          }}
        >
          {comment.authorThumbnail ? (
            <Img
              src={comment.authorThumbnail}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                background: 'rgba(148, 163, 184, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 32,
                color: 'rgba(148, 163, 184, 0.7)',
              }}
            >
              {comment.author.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 30, fontWeight: 600 }}>{comment.author}</p>
          <p style={{ margin: '10px 0 0', color: 'rgba(148, 163, 184, 0.85)', fontSize: 26 }}>
            👍 {comment.likes} · 回复 {comment.replyCount ?? 0}
          </p>
        </div>
        <div style={{ textAlign: 'right', color: 'rgba(148, 163, 184, 0.8)', fontSize: 24 }}>
          {index + 1} / {total}
        </div>
      </div>
      <div>
        <p style={{ ...commentBodyStyle, margin: 0 }}>{comment.content}</p>
        {comment.translatedContent && comment.translatedContent !== comment.content ? (
          <div style={translatedStyle}>{comment.translatedContent}</div>
        ) : null}
      </div>
    </div>
  )
}

const VideoPlaceholder: React.FC<{ fps: number }> = ({ fps }) => {
  const frame = useCurrentFrame()
  const shimmer = interpolate(
    frame % (fps * 2),
    [0, fps, fps * 2],
    [0, 1, 0],
    {
      extrapolateRight: 'clamp',
    },
  )
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(135deg, rgba(56, 189, 248, 0.12), rgba(59, 130, 246, 0.08), rgba(15, 23, 42, 0.6))',
          opacity: 0.6 + shimmer * 0.2,
        }}
      />
      <div
        style={{
          position: 'relative',
          padding: '18px 36px',
          borderRadius: 9999,
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          color: '#cbd5f5',
          fontSize: 26,
          letterSpacing: '0.08em',
        }}
      >
        视频播放区域
      </div>
    </div>
  )
}

export const layoutConstants = {
  video: {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    x: VIDEO_X,
    y: VIDEO_Y,
  },
}
