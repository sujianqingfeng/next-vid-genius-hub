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
import { VIDEO_WIDTH, VIDEO_HEIGHT } from "@app/media-comments";
// Use relative import to avoid Next.js path alias in Remotion bundler
import { formatCount } from "./utils/format";

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
  background: "#0a0a0a",
  surface: "#141414",
  border: "rgba(255, 255, 255, 0.08)",
  textPrimary: "#ffffff",
  textSecondary: "#e5e5e5",
  textMuted: "#a3a3a3",
  accent: "#ff3b30",
  accentGlow: "rgba(255, 59, 48, 0.3)",
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

const topSectionStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto auto",
  gap: layout.columnGap,
  alignItems: "stretch",
  justifyContent: "center",
  width: "100%",
};

// base card style was only used by removed styles

// removed unused local style objects to reduce dead code

const sectionLabelStyle: CSSProperties = {
  fontSize: 14,
  letterSpacing: "0.24em",
  textTransform: "uppercase",
  color: palette.accent,
  fontWeight: 900,
  textShadow: `0 0 20px ${palette.accentGlow}`,
};

// Removed metaListStyle - now using inline compact horizontal layout

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

export const CommentsVideo: React.FC<CommentVideoInputProps> = ({
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
    const startFrame =
      index === 0
        ? 0
        : acc[index - 1].startFrame + acc[index - 1].durationInFrames;
    const comment = comments[index];
    if (comment) {
      acc.push({ startFrame, durationInFrames, comment });
    }
    return acc;
  }, []);

  const commentsTotalDuration = commentDurationsInFrames.reduce(
    (sum, frames) => sum + frames,
    0,
  );
  const mainDuration = Math.max(commentsTotalDuration, fps);

  return (
    <AbsoluteFill style={{ backgroundColor: palette.background }}>
      <Sequence layout="none" from={0} durationInFrames={coverDurationInFrames}>
        <CoverSlide
          videoInfo={videoInfo}
          commentCount={comments.length}
          fps={fps}
        />
      </Sequence>
      <Sequence
        layout="none"
        from={coverDurationInFrames}
        durationInFrames={mainDuration}
      >
        <MainLayout
          videoInfo={videoInfo}
          comments={comments}
          sequences={sequences}
          fps={fps}
        />
      </Sequence>
    </AbsoluteFill>
  );
};

const MainLayout: React.FC<{
  videoInfo: CommentVideoInputProps["videoInfo"];
  comments: CommentVideoInputProps["comments"];
  sequences: {
    startFrame: number;
    durationInFrames: number;
    comment: CommentVideoInputProps["comments"][number];
  }[];
  fps: number;
}> = ({ videoInfo, comments, sequences, fps }) => {
  return (
    <AbsoluteFill
      style={{
        ...containerStyle,
        background: palette.background,
        position: "relative",
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
          backgroundSize: "40px 40px",
          opacity: 0.15,
          pointerEvents: "none",
        }}
      />
      
      {/* Accent glow effects */}
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "-10%",
          width: "400px",
          height: "400px",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${palette.accentGlow} 0%, transparent 70%)`,
          filter: "blur(80px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "10%",
          right: "-5%",
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${palette.accentGlow} 0%, transparent 70%)`,
          filter: "blur(100px)",
          pointerEvents: "none",
        }}
      />

      <div style={topSectionStyle}>
        <InfoPanel videoInfo={videoInfo} commentCount={comments.length} />
        <VideoPanel />
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 32,
          minHeight: 420,
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 4,
              height: 24,
              backgroundColor: palette.accent,
              boxShadow: `0 0 20px ${palette.accentGlow}`,
            }}
          />
          <span style={sectionLabelStyle}>AUDIENCE VOICE</span>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
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
  );
};

const InfoPanel: React.FC<{
  videoInfo: CommentVideoInputProps["videoInfo"];
  commentCount: number;
}> = ({ videoInfo, commentCount }) => {
  return (
    <div
      style={{
        width: layout.infoPanelWidth,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 20,
        position: "relative",
      }}
    >
      {/* Decorative corner frame */}
      <div
        style={{
          position: "absolute",
          top: -20,
          left: -20,
          width: 50,
          height: 50,
          borderTop: `3px solid ${palette.accent}`,
          borderLeft: `3px solid ${palette.accent}`,
          opacity: 0.5,
        }}
      />
      
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div
            style={{
              width: 3,
              height: 16,
              backgroundColor: palette.accent,
              boxShadow: `0 0 15px ${palette.accentGlow}`,
            }}
          />
          <span style={{ ...sectionLabelStyle, fontSize: 11 }}>CREATOR SPOTLIGHT</span>
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 36,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            color: palette.textPrimary,
            lineHeight: 1.15,
            textTransform: "uppercase",
            textShadow: "0 2px 30px rgba(0, 0, 0, 0.8)",
          }}
        >
          {videoInfo.translatedTitle ?? videoInfo.title}
        </h1>
        <div
          style={{
            margin: "14px 0 0",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              padding: "6px 12px",
              backgroundColor: palette.surface,
              border: `1px solid ${palette.border}`,
              fontSize: 14,
              color: palette.textSecondary,
              fontWeight: 600,
              letterSpacing: "0.03em",
            }}
          >
            @{videoInfo.author ?? "unknown"}
          </div>
          <div
            style={{
              fontSize: 11,
              color: palette.textMuted,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            外网真实评论
          </div>
        </div>
      </div>
      
      {/* Compact meta info - horizontal layout */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          paddingTop: 12,
          borderTop: `1px solid ${palette.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span
            style={{
              fontSize: 9,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: palette.textMuted,
              fontWeight: 700,
            }}
          >
            观看
          </span>
          <span
            style={{
              fontSize: 18,
              color: palette.accent,
              fontWeight: 800,
              letterSpacing: "-0.01em",
            }}
          >
            {formatCount(videoInfo.viewCount)}
          </span>
        </div>
        <div
          style={{
            width: 1,
            height: 16,
            backgroundColor: palette.border,
          }}
        />
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span
            style={{
              fontSize: 9,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: palette.textMuted,
              fontWeight: 700,
            }}
          >
            评论
          </span>
          <span
            style={{
              fontSize: 18,
              color: palette.accent,
              fontWeight: 800,
              letterSpacing: "-0.01em",
            }}
          >
            {String(commentCount)}
          </span>
        </div>
        <div
          style={{
            width: 1,
            height: 16,
            backgroundColor: palette.border,
          }}
        />
        <div
          style={{
            fontSize: 9,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: palette.textMuted,
            fontWeight: 700,
          }}
        >
          TubeTweet Studio
        </div>
      </div>
    </div>
  );
};

const VideoPanel: React.FC = () => {
  return (
    <div
      style={{
        width: layout.cardPaddingX * 2 + VIDEO_WIDTH,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <VideoPlaceholder />
    </div>
  );
};

const CoverSlide: React.FC<{
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
          opacity: 0.2,
        }}
      />
      
      {/* Dramatic accent glows */}
      <div
        style={{
          position: "absolute",
          top: "15%",
          left: "-5%",
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${palette.accentGlow} 0%, transparent 70%)`,
          filter: "blur(100px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "10%",
          right: "-10%",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${palette.accentGlow} 0%, transparent 70%)`,
          filter: "blur(120px)",
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
            color: palette.textPrimary,
            textTransform: "uppercase",
            textShadow: `
              0 0 40px ${palette.accentGlow},
              0 4px 60px rgba(0, 0, 0, 0.9)
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

const ScrollingCommentWithTranslation: React.FC<{
  comment: CommentVideoInputProps["comments"][number];
  displayCommentStyle: CSSProperties;
  durationInFrames: number;
  fps: number;
}> = ({ comment, displayCommentStyle, durationInFrames, fps }) => {
  const frame = useCurrentFrame();

  // Fade timings and scroll pacing to maintain smoothness on long comments
  const fadeTime = Math.min(fps * 0.8, 12);
  const minDwellFrames = Math.round(0.2 * fps);
  const scrollStart = fadeTime;

  const isChineseTranslation = isLikelyChinese(comment.translatedContent);

  // Estimated height (fallback) based on font metrics and rough line count
  const fontSize = displayCommentStyle.fontSize as number;
  const lineHeight = displayCommentStyle.lineHeight as number;
  const lineHeightPx = fontSize * lineHeight;
  const mainTextLines = Math.ceil(comment.content.length / 50);
  let estimatedTotalHeight = mainTextLines * lineHeightPx;

  let translationStyle: CSSProperties | null = null;
  if (
    comment.translatedContent &&
    comment.translatedContent !== comment.content
  ) {
    const translationFontSize = isChineseTranslation ? 56 : 26;
    const translationLineHeight = isChineseTranslation ? 1.4 : 1.6;
    const translationLineHeightPx = translationFontSize * translationLineHeight;
    const translationLines = Math.ceil(comment.translatedContent.length / 50);
    estimatedTotalHeight += 28 + translationLines * translationLineHeightPx;

    translationStyle = {
      marginTop: 28,
      padding: isChineseTranslation ? "0 0 0 24px" : "0 0 0 24px",
      borderRadius: 0,
      backgroundColor: "transparent",
      color: isChineseTranslation ? palette.accent : palette.textSecondary,
      borderLeft: `3px solid ${palette.accent}`,
      fontSize: translationFontSize,
      lineHeight: translationLineHeight,
      letterSpacing: isChineseTranslation ? "0.02em" : "normal",
      fontWeight: isChineseTranslation ? 700 : 300,
      textShadow: isChineseTranslation
        ? `0 0 20px ${palette.accentGlow}`
        : "none",
    };
  }

  // Measure real content height to avoid under-estimation for large Chinese text
  const CONTAINER_HEIGHT = 320;
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<{
    content: number;
    container: number;
  }>({ content: 0, container: CONTAINER_HEIGHT });

  useLayoutEffect(() => {
    const measure = () => {
      const containerH = containerRef.current?.clientHeight ?? CONTAINER_HEIGHT;
      const contentH = contentRef.current?.scrollHeight ?? 0;
      setMeasured((prev) =>
        prev.content === contentH && prev.container === containerH
          ? prev
          : { content: contentH, container: containerH },
      );
    };
    measure();
    const raf = requestAnimationFrame(measure);
    // Observe size changes of either container or content
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : undefined;
    if (containerRef.current) ro?.observe(containerRef.current);
    if (contentRef.current) ro?.observe(contentRef.current);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
    // Re-measure when content or language style changes
  }, [comment.content, comment.translatedContent, isChineseTranslation]);

  const containerH = measured.container || CONTAINER_HEIGHT;
  const effectiveContentH = measured.content || estimatedTotalHeight;
  const maxScroll = Math.max(0, effectiveContentH - containerH);

  const availableForScroll = Math.max(
    durationInFrames - fadeTime - minDwellFrames,
    0,
  );
  const minScrollFrames = Math.round(fps * 0.6);
  const pixelsPerSecond = 100;
  const desiredScrollFrames =
    maxScroll > 0 ? Math.ceil((maxScroll / pixelsPerSecond) * fps) : 0;
  const scrollDurationFrames =
    maxScroll > 0
      ? Math.min(
          availableForScroll,
          Math.max(minScrollFrames, desiredScrollFrames),
        )
      : 0;
  const scrollEnd = scrollStart + scrollDurationFrames;

  const currentScroll =
    maxScroll > 0 && scrollDurationFrames > 0
      ? interpolate(frame, [scrollStart, scrollEnd], [0, maxScroll], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.ease,
        })
      : 0;

  return (
    <div
      ref={containerRef}
      style={{
        height: CONTAINER_HEIGHT,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}
    >
      <div
        ref={contentRef}
        style={{
          transform: `translateY(-${currentScroll}px)`,
          // No CSS transition: frame-driven for exact positioning
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        <div
          style={{
            ...displayCommentStyle,
            whiteSpace: "pre-wrap",
            marginBottom: 0,
          }}
        >
          {comment.content}
        </div>
        {comment.translatedContent &&
        comment.translatedContent !== comment.content ? (
          <div style={translationStyle ?? undefined}>
            {comment.translatedContent}
          </div>
        ) : null}
      </div>
    </div>
  );
};

const CommentSlide: React.FC<{
  comment: CommentVideoInputProps["comments"][number];
  durationInFrames: number;
  fps: number;
}> = ({ comment, durationInFrames, fps }) => {
  const frame = useCurrentFrame();

  // Use shorter fade times to match scrolling component
  const fadeTime = Math.min(fps * 0.8, 12);
  const appear = interpolate(frame, [0, fadeTime], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitStart = Math.max(durationInFrames - fadeTime, 0);
  const disappear = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(appear, disappear);

  // Calculate countdown timer
  const remainingFrames = Math.max(0, durationInFrames - frame);
  const remainingSeconds = Math.ceil(remainingFrames / fps);
  const countdownOpacity = interpolate(
    frame,
    [durationInFrames - fps * 3, durationInFrames - fps * 2],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const isChinesePrimary = isLikelyChinese(comment.content);
  const isChineseTranslation = isLikelyChinese(comment.translatedContent);
  const displayCommentStyle: CSSProperties = {
    fontSize: isChinesePrimary ? 56 : 28,
    lineHeight: isChinesePrimary ? 1.4 : 1.6,
    letterSpacing: isChinesePrimary ? "0.02em" : "normal",
    color: isChinesePrimary ? palette.accent : palette.textPrimary,
    fontWeight: isChinesePrimary ? 700 : 400,
    textShadow: isChinesePrimary ? `0 0 20px ${palette.accentGlow}` : "none",
  };

  const commentText = comment.content;
  const totalTextLength =
    commentText.length + (comment.translatedContent?.length || 0);
  const needsScroll = totalTextLength > 100; // Consider both main and translation content

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
      
      {/* Countdown Timer */}
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
            backgroundColor:
              remainingSeconds <= 2 ? palette.accent : palette.textMuted,
            boxShadow:
              remainingSeconds <= 2
                ? `0 0 15px ${palette.accentGlow}`
                : "none",
          }}
        />
        <span>{remainingSeconds}S</span>
      </div>

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
        <ScrollingCommentWithTranslation
          comment={comment}
          displayCommentStyle={displayCommentStyle}
          durationInFrames={durationInFrames}
          fps={fps}
        />
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
                      textShadow: `0 0 20px ${palette.accentGlow}`,
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
  );
};

const Avatar: React.FC<{ name: string; src?: string | null }> = ({
  name,
  src,
}) => {
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
    );
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
      {name.charAt(0).toUpperCase()}
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
  );
};

const VideoPlaceholder: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      style={{
        width: VIDEO_WIDTH,
        alignSelf: "center",
        border: `2px solid ${palette.border}`,
        backgroundColor: palette.surface,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Film frame perforations */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 8,
          backgroundColor: palette.border,
          zIndex: 2,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 8,
          backgroundColor: palette.border,
          zIndex: 2,
        }}
      />
      
      <div
        style={{
          position: "relative",
          width: "100%",
          paddingTop: `${(VIDEO_HEIGHT / VIDEO_WIDTH) * 100}%`,
          backgroundImage: `
            linear-gradient(135deg, ${palette.surface} 0%, ${palette.background} 100%)
          `,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Cinematic aspect ratio indicator */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            fontSize: 14,
            color: palette.textMuted,
            letterSpacing: "0.3em",
            fontWeight: 700,
            textTransform: "uppercase",
          }}
        >
          16:9
        </div>
      </div>
    </div>
  );
};

// use shared formatter from lib/utils
