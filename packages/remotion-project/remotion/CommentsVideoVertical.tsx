"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ThumbsUp } from "lucide-react";
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  useCurrentFrame,
} from "remotion";
import type { CommentVideoInputProps } from "./types";
// Use relative import to avoid TS/Vite path aliases in Remotion bundler
import { formatCount } from "./utils/format";

// 与横屏 CommentsVideo 模板共享的布局与配色
const layout = {
  paddingX: 80,
  paddingY: 60,
  columnGap: 40,
  rowGap: 48,
  infoPanelWidth: 680,
  cardRadius: 0,
  cardPaddingX: 32,
  cardPaddingY: 32,
};

const palette = {
  // Airbnb Warm Minimal theme
  background: "#F7F3EF",
  surface: "#FFFFFF",
  border: "rgba(31, 42, 53, 0.08)",
  textPrimary: "#1F2A35",
  textSecondary: "#2C3A4A",
  textMuted: "#6B7280",
  accent: "#FF5A5F", // Airbnb coral
  accentGlow: "rgba(255, 90, 95, 0.2)",
};

const baseFontStack = [
  '"Noto Sans CJK SC"',
  '"Noto Sans SC"',
  '"Source Han Sans SC"',
  '"Noto Sans CJK"',
  '"Inter"',
  '"Helvetica Neue"',
  '"Arial Black"',
  "system-ui",
  "-apple-system",
  '"Segoe UI Emoji"',
  '"Apple Color Emoji"',
  '"Noto Color Emoji"',
  "sans-serif",
];

const baseFont = baseFontStack.join(", ");

const containerStyle: CSSProperties = {
  backgroundColor: palette.background,
  color: palette.textPrimary,
  fontFamily: baseFont,
  padding: `${layout.paddingY}px ${layout.paddingX}px`,
  display: "flex",
  flexDirection: "column",
  gap: layout.rowGap,
  height: "100%",
  boxSizing: "border-box",
};

// 与横屏模板一致的正文与翻译样式
const commentBodyStyle: CSSProperties = {
  fontSize: 28,
  lineHeight: 1.6,
  color: palette.textPrimary,
  whiteSpace: "pre-wrap",
  margin: 0,
  width: "100%",
  fontWeight: 400,
};

const translatedStyle: CSSProperties = {
  marginTop: 24,
  padding: "24px 0 24px 24px",
  borderRadius: 0,
  backgroundColor: "transparent",
  color: palette.textSecondary,
  borderLeft: `3px solid ${palette.accent}`,
  whiteSpace: "pre-wrap",
  fontSize: 26,
  lineHeight: 1.6,
  fontWeight: 300,
};

const chineseCharRegex = /[\u4e00-\u9fff]/;

function isLikelyChinese(text?: string | null): boolean {
  return Boolean(text && chineseCharRegex.test(text));
}

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
      {/* 封面场景（统一为与横屏模板一致的电影质感封面） */}
      <Sequence layout="none" from={0} durationInFrames={coverDurationInFrames}>
        <VerticalCover videoInfo={videoInfo} commentCount={comments.length} fps={fps} />
      </Sequence>

      {/* 主场景：横屏画布，左竖屏视频，右评论 */}
      <Sequence layout="none" from={coverDurationInFrames} durationInFrames={mainDuration}>
        <AbsoluteFill
          style={{
            ...containerStyle,
            background: palette.background,
            position: "relative",
          }}
        >
          {/* 背景网格 + 光晕，与横屏模板统一 */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `
                linear-gradient(0deg, ${palette.border} 1px, transparent 1px),
                linear-gradient(90deg, ${palette.border} 1px, transparent 1px)
              `,
              backgroundSize: "40px 40px",
              opacity: 0.1,
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "15%",
              left: "-8%",
              width: "320px",
              height: "320px",
              borderRadius: "50%",
              background: `radial-gradient(circle, ${palette.accentGlow} 0%, transparent 70%)`,
              filter: "blur(70px)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: "10%",
              right: "-5%",
              width: "380px",
              height: "380px",
              borderRadius: "50%",
              background: `radial-gradient(circle, ${palette.accentGlow} 0%, transparent 70%)`,
              filter: "blur(90px)",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: "560px 1fr",
              gridTemplateRows: "1fr",
              gap: 28,
              alignItems: "stretch",
              minHeight: 0,
              position: "relative",
              zIndex: 1,
            }}
          >
            {/* 左侧竖屏视频占位（9:16） */}
            <div
              style={{
                borderRadius: 24,
                backgroundColor: palette.surface,
                border: `2px solid ${palette.border}`,
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
                  border: `2px solid ${palette.border}`,
                  overflow: "hidden",
                  backgroundImage: `
                    linear-gradient(135deg, ${palette.surface} 0%, ${palette.background} 100%)
                  `,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
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
                display: "flex",
                flexDirection: "column",
                height: "100%",
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

// 竖屏封面：直接复用横屏模板的电影质感封面样式
const VerticalCover: React.FC<{
  videoInfo: CommentVideoInputProps["videoInfo"];
  commentCount: number;
  fps: number;
}> = ({ videoInfo, commentCount, fps }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, fps * 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const titleSlide = interpolate(frame, [fps * 0.3, fps * 0.8], [-50, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill
      style={{
        background: palette.background,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: palette.textPrimary,
        fontFamily: baseFont,
        padding: "0 100px",
        boxSizing: "border-box",
        opacity,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Cinematic grid overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(0deg, ${palette.border} 1px, transparent 1px),
            linear-gradient(90deg, ${palette.border} 1px, transparent 1px)
          `,
          backgroundSize: "50px 50px",
          opacity: 0.12,
        }}
      />

      {/* Dramatic accent glows */}
      <div
        style={{
          position: "absolute",
          top: "15%",
          left: "-5%",
          width: "430px",
          height: "430px",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${palette.accentGlow} 0%, transparent 70%)`,
          filter: "blur(80px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "10%",
          right: "-10%",
          width: "520px",
          height: "520px",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${palette.accentGlow} 0%, transparent 70%)`,
          filter: "blur(95px)",
        }}
      />

      {/* Film frame corners */}
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 60,
          width: 100,
          height: 100,
          borderTop: `4px solid ${palette.accent}`,
          borderLeft: `4px solid ${palette.accent}`,
          opacity: 0.4,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 60,
          right: 60,
          width: 100,
          height: 100,
          borderTop: `4px solid ${palette.accent}`,
          borderRight: `4px solid ${palette.accent}`,
          opacity: 0.4,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 60,
          left: 60,
          width: 100,
          height: 100,
          borderBottom: `4px solid ${palette.accent}`,
          borderLeft: `4px solid ${palette.accent}`,
          opacity: 0.4,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 60,
          right: 60,
          width: 100,
          height: 100,
          borderBottom: `4px solid ${palette.accent}`,
          borderRight: `4px solid ${palette.accent}`,
          opacity: 0.4,
        }}
      />

      <div
        style={{
          maxWidth: 1400,
          width: "100%",
          textAlign: "left",
          position: "relative",
          zIndex: 1,
          transform: `translateY(${titleSlide}px)`,
        }}
      >
        {/* Category badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 0",
            marginBottom: 40,
            fontSize: 13,
            fontWeight: 900,
            color: palette.accent,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            textShadow: `0 0 30px ${palette.accentGlow}`,
          }}
        >
          <div
            style={{
              width: 4,
              height: 16,
              backgroundColor: palette.accent,
              boxShadow: `0 0 20px ${palette.accentGlow}`,
            }}
          />
          外网真实评论
        </div>

        {/* Main Title */}
        <h1
          style={{
            margin: "0 0 50px 0",
            fontSize: 92,
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 0.95,
            color: palette.accent,
            textTransform: "uppercase",
            textShadow: `
              0 0 32px ${palette.accentGlow},
              0 6px 50px ${palette.accentGlow}
            `,
            maxWidth: "90%",
          }}
        >
          {videoInfo.translatedTitle ?? videoInfo.title}
        </h1>

        {/* Original Title (if translated) */}
        {videoInfo.translatedTitle &&
          videoInfo.translatedTitle !== videoInfo.title && (
            <p
              style={{
                margin: "0 0 70px 0",
                fontSize: 26,
                color: palette.textMuted,
                fontWeight: 300,
                lineHeight: 1.5,
                fontStyle: "italic",
                maxWidth: "85%",
                paddingLeft: 4,
              }}
            >
              {videoInfo.title}
            </p>
          )}

        {/* Dramatic divider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            margin: "0 0 70px 0",
          }}
        >
          <div
            style={{
              width: 120,
              height: 3,
              backgroundColor: palette.accent,
              boxShadow: `0 0 20px ${palette.accentGlow}`,
            }}
          />
          <div
            style={{
              width: 12,
              height: 12,
              backgroundColor: palette.accent,
              boxShadow: `0 0 30px ${palette.accentGlow}`,
            }}
          />
          <div
            style={{
              flex: 1,
              height: 1,
              background: `linear-gradient(90deg, ${palette.border}, transparent)`,
            }}
          />
        </div>

        {/* Enhanced Meta Information */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 48,
            fontSize: 18,
            color: palette.textSecondary,
            marginBottom: 50,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: "20px 28px",
              backgroundColor: palette.surface,
              border: `1px solid ${palette.border}`,
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: palette.textMuted,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              观看量
            </span>
            <span
              style={{
                fontSize: 32,
                fontWeight: 900,
                color: palette.accent,
                textShadow: `0 0 20px ${palette.accentGlow}`,
              }}
            >
              {formatCount(videoInfo.viewCount)}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: "20px 28px",
              backgroundColor: palette.surface,
              border: `1px solid ${palette.border}`,
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: palette.textMuted,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              评论数
            </span>
            <span
              style={{
                fontSize: 32,
                fontWeight: 900,
                color: palette.accent,
                textShadow: `0 0 20px ${palette.accentGlow}`,
              }}
            >
              {commentCount}
            </span>
          </div>
        </div>

        {/* Author and source */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            fontSize: 18,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 24px",
              backgroundColor: palette.surface,
              border: `1px solid ${palette.border}`,
            }}
          >
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: palette.textPrimary,
                letterSpacing: "0.05em",
              }}
            >
              @{videoInfo.author ?? "未知创作者"}
            </span>
          </div>
          <div
            style={{
              fontSize: 13,
              color: palette.textMuted,
              fontWeight: 700,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            TubeTweet Studio
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

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
    fontSize: isChinesePrimary ? 56 : 28,
    lineHeight: isChinesePrimary ? 1.4 : 1.6,
    letterSpacing: isChinesePrimary ? "0.02em" : "normal",
    color: isChinesePrimary ? palette.accent : palette.textPrimary,
    fontWeight: isChinesePrimary ? 700 : 400,
    textShadow: isChinesePrimary ? `0 0 12px ${palette.accentGlow}` : "none",
  }

  const totalTextLength = comment.content.length + (comment.translatedContent?.length || 0)
  const needsScroll = totalTextLength > 100

  return (
    <div
      style={{
        opacity,
        display: "flex",
        flexDirection: "column",
        gap: 28,
        height: "100%",
        position: "relative",
        padding: "32px 40px",
        backgroundColor: palette.surface,
        border: `2px solid ${palette.border}`,
      }}
    >
      {/* Decorative corner frame */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 40,
          height: 40,
          borderTop: `3px solid ${palette.accent}`,
          borderLeft: `3px solid ${palette.accent}`,
          opacity: 0.6,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          right: 0,
          width: 40,
          height: 40,
          borderBottom: `3px solid ${palette.accent}`,
          borderRight: `3px solid ${palette.accent}`,
          opacity: 0.6,
        }}
      />

      {/* 倒计时 */}
      <div
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          opacity: countdownOpacity,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 14,
          color: palette.textMuted,
          backgroundColor: palette.background,
          padding: "8px 14px",
          border: `1px solid ${palette.border}`,
          fontWeight: 700,
          letterSpacing: "0.1em",
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            backgroundColor: remainingSeconds <= 2 ? palette.accent : palette.textMuted,
            boxShadow:
              remainingSeconds <= 2
                ? `0 0 15px ${palette.accentGlow}`
                : "none",
          }}
        />
        <span>{remainingSeconds}S</span>
      </div>

      {/* 头像 / 作者 / 点赞 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexShrink: 0,
        }}
      >
        <Avatar name={comment.author} src={comment.authorThumbnail} />
        <div
          style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 26,
              fontWeight: 800,
              color: palette.textPrimary,
              letterSpacing: "-0.01em",
            }}
          >
            {comment.author}
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: palette.textMuted,
              fontSize: 16,
            }}
          >
            <ThumbsUp size={18} strokeWidth={2.5} />
            <span style={{ fontWeight: 700, letterSpacing: "0.05em" }}>
              {formatCount(comment.likes)}
            </span>
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
          <p style={{ ...commentBodyStyle, ...displayCommentStyle }}>
            {comment.content}
          </p>
          {comment.translatedContent &&
          comment.translatedContent !== comment.content ? (
            <div
              style={{
                ...translatedStyle,
                ...(isChineseTranslation
                  ? {
                      backgroundColor: "transparent",
                      borderLeft: `3px solid ${palette.accent}`,
                      color: palette.accent,
                      padding: "0 0 0 24px",
                      marginTop: 28,
                      fontSize: 56,
                      lineHeight: 1.4,
                      letterSpacing: "0.02em",
                      fontWeight: 700,
                      textShadow: `0 0 12px ${palette.accentGlow}`,
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
      <div
        style={{
          width: 80,
          height: 80,
          overflow: "hidden",
          border: `3px solid ${palette.border}`,
          position: "relative",
        }}
      >
        <Img
          src={src}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        {/* Corner accent */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 20,
            height: 20,
            borderTop: `2px solid ${palette.accent}`,
            borderLeft: `2px solid ${palette.accent}`,
          }}
        />
      </div>
    )
  }
  return (
    <div
      style={{
        width: 80,
        height: 80,
        backgroundColor: palette.surface,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 32,
        color: palette.accent,
        border: `3px solid ${palette.border}`,
        fontWeight: 900,
        textShadow: `0 0 20px ${palette.accentGlow}`,
        position: "relative",
      }}
    >
      {name?.charAt(0)?.toUpperCase()}
      {/* Corner accent */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 20,
          height: 20,
          borderTop: `2px solid ${palette.accent}`,
          borderLeft: `2px solid ${palette.accent}`,
        }}
      />
    </div>
  )
}
