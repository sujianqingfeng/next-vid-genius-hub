"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, useCurrentFrame, Img } from "remotion";
import { ThumbsUp } from "lucide-react";
import type { CommentVideoInputProps } from "./types";

// 与横屏模板保持一致的配色与字体
const palette = {
  background: "#ffffff",
  surface: "#f8fafc",
  border: "rgba(226, 232, 240, 0.8)",
  textPrimary: "#0f172a",
  textSecondary: "#334155",
  textMuted: "#64748b",
  accent: "#ef4444",
};

const baseFontStack = [
  '"Noto Sans CJK SC"',
  '"Noto Sans SC"',
  '"Source Han Sans SC"',
  '"Noto Sans CJK"',
  "Inter",
  '"Noto Sans"',
  "system-ui",
  "-apple-system",
  "BlinkMacSystemFont",
  '"Segoe UI Emoji"',
  '"Apple Color Emoji"',
  '"Noto Color Emoji"',
  '"Twemoji Mozilla"',
  '"EmojiSymbols"',
  "sans-serif",
];
const baseFont = baseFontStack.join(", ");

const containerStyle: CSSProperties = {
  backgroundColor: palette.background,
  color: palette.textPrimary,
  fontFamily: baseFont,
  height: "100%",
  width: "100%",
  display: "flex",
  flexDirection: "column",
};

// 与默认模板保持一致的正文与翻译样式
const commentBodyStyle: CSSProperties = {
  fontSize: 26,
  lineHeight: 1.52,
  color: palette.textPrimary,
  whiteSpace: "pre-wrap",
  margin: 0,
  width: "100%",
};

const translatedStyle: CSSProperties = {
  marginTop: 18,
  padding: "16px 20px",
  borderRadius: 16,
  backgroundColor: "rgba(239, 68, 68, 0.08)",
  color: palette.textSecondary,
  borderLeft: "4px solid rgba(239, 68, 68, 0.3)",
  whiteSpace: "pre-wrap",
  fontSize: 24,
  lineHeight: 1.48,
};

// 竖屏主布局：封面 + 主画面
export const CommentsVideoVertical: React.FC<CommentVideoInputProps> = ({
  videoInfo,
  comments,
  coverDurationInFrames,
  commentDurationsInFrames,
  fps,
}) => {
  const sequences = commentDurationsInFrames.reduce<
    {
      startFrame: number;
      durationInFrames: number;
      comment: CommentVideoInputProps["comments"][number];
    }[]
  >((acc, durationInFrames, index) => {
    const startFrame = index === 0 ? 0 : acc[index - 1].startFrame + acc[index - 1].durationInFrames
    const comment = comments[index]
    if (comment) acc.push({ startFrame, durationInFrames, comment })
    return acc
  }, [])

  const commentsTotalDuration = commentDurationsInFrames.reduce((sum, f) => sum + f, 0)
  const mainDuration = Math.max(commentsTotalDuration, fps)

  return (
    <AbsoluteFill style={{ backgroundColor: palette.background }}>
      {/* 封面场景（保持横屏模板风格） */}
      <Sequence layout="none" from={0} durationInFrames={coverDurationInFrames}>
        <VerticalCover videoInfo={videoInfo} commentCount={comments.length} fps={fps} />
      </Sequence>

      {/* 主场景：横屏画布，左竖屏视频，右评论 */}
      <Sequence layout="none" from={coverDurationInFrames} durationInFrames={mainDuration}>
        <AbsoluteFill style={{ ...containerStyle, padding: "36px 48px", boxSizing: "border-box" }}>
          <div
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: "560px 1fr",
              gridTemplateRows: "1fr",
              gap: 28,
              alignItems: "stretch",
              minHeight: 0,
            }}
          >
            {/* 左侧竖屏视频占位（9:16） */}
            <div
              style={{
                borderRadius: 24,
                background: "#ffffff",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 540,
                  height: 960,
                  borderRadius: 20,
                  overflow: "hidden",
                  background: "#ffffff",
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: palette.textMuted,
                  fontSize: 18,
                  fontFamily: baseFont,
                }}
              >
                竖屏视频占位
              </div>
            </div>

            {/* 右侧评论区域：样式与默认模板一致 */}
            <div
              style={{
                borderRadius: 24,
                background: palette.surface,
                border: `1px solid ${palette.border}`,
                padding: 24,
                display: "flex",
                flexDirection: "column",
                gap: 16,
                overflow: "hidden",
                height: "100%",
                minHeight: 0,
              }}
            >
              {sequences.map(({ startFrame, durationInFrames, comment }) => (
                <Sequence key={comment.id} layout="none" from={startFrame} durationInFrames={durationInFrames}>
                  <VerticalCommentSlide comment={comment} durationInFrames={durationInFrames} fps={fps} />
                </Sequence>
              ))}
            </div>
          </div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  )
}

// 竖屏封面（复用横屏风格）
const VerticalCover: React.FC<{ videoInfo: CommentVideoInputProps["videoInfo"]; commentCount: number; fps: number }>
  = ({ videoInfo, commentCount, fps }) => {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #f8fafc 0%, #ffffff 50%, #f8fafc 100%)",
        color: palette.textPrimary,
        fontFamily: baseFont,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "0 48px",
        boxSizing: "border-box",
        opacity,
      }}
    >
      <div style={{ fontSize: 28, letterSpacing: "0.12em", color: palette.accent, textTransform: "uppercase" }}>Creator Digest</div>
      <h1 style={{ margin: "16px 0 8px", fontSize: 54, fontWeight: 800, letterSpacing: "-0.01em" }}>
        {videoInfo.translatedTitle ?? videoInfo.title}
      </h1>
      <div style={{ fontSize: 22, color: palette.textMuted, marginBottom: 24 }}>
        @{videoInfo.author ?? "unknown"} · 外网真实评论
      </div>
      <div style={{ display: "flex", gap: 18, fontSize: 20, color: palette.textSecondary }}>
        <Badge text={`观看 ${formatCount(videoInfo.viewCount)}`} />
        <Badge text={`评论 ${commentCount}`} />
      </div>
    </AbsoluteFill>
  )
}

const Badge: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ padding: "10px 16px", borderRadius: 999, background: "rgba(248, 250, 252, 0.8)", border: `1px solid ${palette.border}` }}>{text}</div>
)

const VerticalVideoPlaceholder: React.FC = () => {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#ffffff",
        color: palette.textMuted,
        fontFamily: baseFont,
        fontSize: 18,
      }}
    >
      竖屏视频占位
    </div>
  )
}

function isLikelyChinese(text?: string | null): boolean {
  return Boolean(text && /[\u4e00-\u9fff]/.test(text))
}

const VerticalCommentSlide: React.FC<{
  comment: CommentVideoInputProps["comments"][number]
  durationInFrames: number
  fps: number
}> = ({ comment, durationInFrames, fps }) => {
  const frame = useCurrentFrame()

  const fadeTime = Math.min(fps * 0.8, 12)
  const appear = interpolate(frame, [0, fadeTime], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const exitStart = Math.max(durationInFrames - fadeTime, 0)
  const disappear = interpolate(frame, [exitStart, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const opacity = Math.min(appear, disappear)

  const remainingFrames = Math.max(0, durationInFrames - frame)
  const remainingSeconds = Math.ceil(remainingFrames / fps)
  const countdownOpacity = interpolate(frame, [durationInFrames - fps * 3, durationInFrames - fps * 2], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  const isChinesePrimary = isLikelyChinese(comment.content)
  const isChineseTranslation = isLikelyChinese(comment.translatedContent)
  const displayCommentStyle: CSSProperties = {
    fontSize: isChinesePrimary ? 52 : 26,
    lineHeight: isChinesePrimary ? 1.4 : 1.52,
    letterSpacing: isChinesePrimary ? "0.024em" : "normal",
    color: isChinesePrimary ? palette.accent : palette.textPrimary,
  }

  const totalTextLength = comment.content.length + (comment.translatedContent?.length || 0)
  const needsScroll = totalTextLength > 100

  return (
    <div style={{ opacity, display: "flex", flexDirection: "column", gap: 20, height: "100%", minHeight: 0, position: "relative" }}>
      {/* 倒计时 */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          opacity: countdownOpacity,
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 16,
          color: palette.textMuted,
          backgroundColor: "rgba(248, 250, 252, 0.8)",
          padding: "6px 10px",
          borderRadius: 8,
          border: `1px solid ${palette.border}`,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: remainingSeconds <= 2 ? palette.accent : palette.textMuted,
            transition: "background-color 0.3s ease",
          }}
        />
        <span>{remainingSeconds}s</span>
      </div>

      {/* 头像 / 作者 / 点赞 */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
        <Avatar name={comment.author} src={comment.authorThumbnail} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={{ margin: 0, fontSize: 24, fontWeight: 600, color: palette.textPrimary }}>{comment.author}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: palette.textMuted, fontSize: 18 }}>
            <ThumbsUp size={18} strokeWidth={2} />
            <span>{formatCount(comment.likes)}</span>
          </div>
        </div>
      </div>

      {needsScroll ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <ScrollingCommentWithTranslation
            comment={comment}
            displayCommentStyle={displayCommentStyle}
            durationInFrames={durationInFrames}
            fps={fps}
          />
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <p style={{ ...commentBodyStyle, ...displayCommentStyle }}>{comment.content}</p>
          {comment.translatedContent && comment.translatedContent !== comment.content ? (
            <div
              style={{
                ...translatedStyle,
                ...(isChineseTranslation
                  ? {
                      backgroundColor: "transparent",
                      borderLeft: "none",
                      color: palette.accent,
                      padding: 0,
                      marginTop: 12,
                      fontSize: 52,
                      lineHeight: 1.4,
                      letterSpacing: "0.024em",
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

// 与默认模板一致的长评论滚动实现
const ScrollingCommentWithTranslation: React.FC<{
  comment: CommentVideoInputProps["comments"][number]
  displayCommentStyle: CSSProperties
  durationInFrames: number
  fps: number
}> = ({ comment, displayCommentStyle, durationInFrames, fps }) => {
  const frame = useCurrentFrame()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerHeight, setContainerHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    const node = containerRef.current
    if (!node) return

    const measure = () => setContainerHeight(node.getBoundingClientRect().height)
    measure()

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure)
      observer.observe(node)
      return () => observer.disconnect()
    }

    return undefined
  }, [])

  const fadeTime = Math.min(fps * 0.8, 12)
  const minDwellFrames = Math.round(0.2 * fps)
  const scrollStart = fadeTime

  const isChineseTranslation = isLikelyChinese(comment.translatedContent)

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
      padding: "16px 20px",
      borderRadius: 16,
      backgroundColor: isChineseTranslation ? "transparent" : "rgba(239, 68, 68, 0.08)",
      color: isChineseTranslation ? palette.accent : palette.textSecondary,
      borderLeft: isChineseTranslation ? "none" : "4px solid rgba(239, 68, 68, 0.3)",
      fontSize: translationFontSize,
      lineHeight: translationLineHeight,
      letterSpacing: isChineseTranslation ? "0.024em" : "normal",
    }
  }

  const viewportHeight = containerHeight ?? 320
  const effectiveContentH = estimatedTotalHeight
  const maxScroll = Math.max(0, effectiveContentH - viewportHeight)

  const availableForScroll = Math.max(durationInFrames - fadeTime - minDwellFrames, 0)
  const minScrollFrames = Math.round(fps * 0.6)
  const pixelsPerSecond = 100
  const desiredScrollFrames = maxScroll > 0 ? Math.ceil((maxScroll / pixelsPerSecond) * fps) : 0
  const scrollDurationFrames = maxScroll > 0 ? Math.min(availableForScroll, Math.max(minScrollFrames, desiredScrollFrames)) : 0
  const scrollEnd = scrollStart + scrollDurationFrames

  const currentScroll = maxScroll > 0 && scrollDurationFrames > 0
    ? interpolate(frame, [scrollStart, scrollEnd], [0, maxScroll], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.ease })
    : 0

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flex: 1,
        minHeight: 0,
        flexDirection: 'column',
        gap: 0,
      }}
    >
      <div style={{ transform: `translateY(-${currentScroll}px)`, display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div style={{ ...displayCommentStyle, whiteSpace: 'pre-wrap', marginBottom: 0 }}>{comment.content}</div>
        {comment.translatedContent && comment.translatedContent !== comment.content ? (
          <div style={translationStyle ?? undefined}>{comment.translatedContent}</div>
        ) : null}
      </div>
    </div>
  )
}

const Avatar: React.FC<{ name: string; src?: string | null }> = ({ name, src }) => {
  if (src) {
    return (
      <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', border: `2px solid ${palette.border}` }}>
        <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }
  return (
    <div style={{ width: 72, height: 72, borderRadius: '50%', backgroundColor: 'rgba(239, 68, 68, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: palette.accent, border: `2px solid ${palette.border}` }}>
      {name?.charAt(0)?.toUpperCase()}
    </div>
  )
}

function formatCount(n?: number) {
  if (!n || n <= 0) return "0"
  if (n < 1000) return String(n)
  if (n < 10000) return `${(n / 1000).toFixed(1)}K`
  return `${(n / 10000).toFixed(1)}万`
}
