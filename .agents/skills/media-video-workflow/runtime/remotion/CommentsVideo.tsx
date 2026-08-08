import type { CSSProperties, FC } from 'react'
import {
	AbsoluteFill,
	Easing,
	Sequence,
	interpolate,
	useCurrentFrame,
} from 'remotion'
import type { CommentsVideoProps, SafeComment } from './types'

const palette = {
	canvas: '#edf2f5',
	surface: '#ffffff',
	ink: '#12212a',
	muted: '#61717b',
	border: '#cfdae0',
	teal: '#0e8c87',
	coral: '#d8574d',
	deep: '#16343b',
}

function countLabel(value: number | undefined) {
	const count = Number(value || 0)
	if (count < 1_000) return String(count)
	if (count < 1_000_000) return `${(count / 1_000).toFixed(1)}K`
	return `${(count / 1_000_000).toFixed(1)}M`
}

function initials(author: string) {
	const words = author.trim().split(/\s+/).filter(Boolean)
	return (words.slice(0, 2).map((word) => word[0]).join('') || '?').toUpperCase()
}

function currentSlide(
	comments: SafeComment[],
	durations: number[],
	frame: number,
	coverDurationInFrames: number,
) {
	let offset = coverDurationInFrames
	for (let index = 0; index < comments.length; index += 1) {
		const duration = durations[index] || 1
		if (frame >= offset && frame < offset + duration) {
			return { comment: comments[index]!, localFrame: frame - offset, duration, index }
		}
		offset += duration
	}
	return { comment: comments[comments.length - 1]!, localFrame: 0, duration: 1, index: comments.length - 1 }
}

const sectionLabel: CSSProperties = {
	fontSize: 20,
	fontWeight: 700,
	letterSpacing: 0,
	textTransform: 'uppercase',
	color: palette.teal,
}

export const CommentsVideo: FC<CommentsVideoProps> = ({
	videoInfo,
	comments,
	coverDurationInFrames,
	commentDurationsInFrames,
	fps,
	orientation,
}) => {
	const frame = useCurrentFrame()
	const isPortrait = orientation === 'portrait'
	const isCover = frame < coverDurationInFrames
	const active = currentSlide(comments, commentDurationsInFrames, frame, coverDurationInFrames)
	const coverOpacity = interpolate(frame, [0, fps * 0.5, coverDurationInFrames - fps * 0.35, coverDurationInFrames], [0, 1, 1, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
		easing: Easing.out(Easing.cubic),
	})

	return (
		<AbsoluteFill style={{ backgroundColor: palette.canvas, color: palette.ink, fontFamily: 'Arial, Noto Sans SC, sans-serif' }}>
			{isCover ? (
				<Cover videoInfo={videoInfo} count={comments.length} opacity={coverOpacity} portrait={isPortrait} />
			) : (
				<Main
					videoInfo={videoInfo}
					comment={active.comment}
					commentIndex={active.index}
					commentCount={comments.length}
					localFrame={active.localFrame}
					duration={active.duration}
					portrait={isPortrait}
				/>
			)}
		</AbsoluteFill>
	)
}

const Cover: FC<{
	videoInfo: CommentsVideoProps['videoInfo']
	count: number
	opacity: number
	portrait: boolean
}> = ({ videoInfo, count, opacity, portrait }) => {
	return (
		<AbsoluteFill
			style={{
				padding: portrait ? 96 : 128,
				boxSizing: 'border-box',
				opacity,
				justifyContent: 'space-between',
				backgroundColor: palette.deep,
				color: palette.surface,
			}}
		>
			<div style={sectionLabel}>Community selection</div>
			<div style={{ maxWidth: portrait ? 820 : 1300 }}>
				<div style={{ fontSize: portrait ? 72 : 86, lineHeight: 1.12, fontWeight: 700 }}>{videoInfo.title}</div>
				{videoInfo.translatedTitle ? (
					<div style={{ marginTop: 32, color: '#c8dadb', fontSize: portrait ? 50 : 54, lineHeight: 1.3 }}>{videoInfo.translatedTitle}</div>
				) : null}
			</div>
			<div style={{ display: 'flex', justifyContent: 'space-between', color: '#c8dadb', fontSize: portrait ? 32 : 30 }}>
				<span>{videoInfo.author || 'Media workflow'}</span>
				<span>{count} selected comments</span>
			</div>
		</AbsoluteFill>
	)
}

const Main: FC<{
	videoInfo: CommentsVideoProps['videoInfo']
	comment: SafeComment
	commentIndex: number
	commentCount: number
	localFrame: number
	duration: number
	portrait: boolean
}> = ({ videoInfo, comment, commentIndex, commentCount, localFrame, duration, portrait }) => {
	const enter = interpolate(localFrame, [0, 12], [24, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
		easing: Easing.out(Easing.cubic),
	})
	const opacity = interpolate(localFrame, [0, 8, duration - 8, duration], [0, 1, 1, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	})
	const padding = portrait ? 64 : 88

	return (
		<AbsoluteFill style={{ padding, boxSizing: 'border-box', gap: portrait ? 48 : 56 }}>
			<header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 32 }}>
				<div style={{ maxWidth: portrait ? 700 : 1200 }}>
					<div style={sectionLabel}>Audience voice</div>
					<div style={{ marginTop: 14, fontSize: portrait ? 38 : 42, lineHeight: 1.2, fontWeight: 700 }}>{videoInfo.title}</div>
				</div>
				<div style={{ color: palette.muted, fontSize: portrait ? 28 : 26, whiteSpace: 'nowrap' }}>
					{commentIndex + 1} / {commentCount}
				</div>
			</header>
			<div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
				<article
					style={{
						width: '100%',
						backgroundColor: palette.surface,
						border: `2px solid ${palette.border}`,
						borderRadius: 8,
						padding: portrait ? 52 : 64,
						boxSizing: 'border-box',
						transform: `translateY(${enter}px)`,
						opacity,
					}}
				>
					<div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
						<div style={{ width: portrait ? 78 : 70, height: portrait ? 78 : 70, borderRadius: '50%', backgroundColor: palette.teal, color: palette.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: portrait ? 30 : 28, fontWeight: 700 }}>
							{initials(comment.author)}
						</div>
						<div>
							<div style={{ fontSize: portrait ? 36 : 32, fontWeight: 700 }}>{comment.author}</div>
							<div style={{ marginTop: 6, color: palette.muted, fontSize: portrait ? 26 : 24 }}>{countLabel(comment.likes)} approvals</div>
						</div>
					</div>
					<div style={{ marginTop: portrait ? 48 : 42, fontSize: portrait ? 50 : 46, lineHeight: 1.42, whiteSpace: 'pre-wrap' }}>{comment.content}</div>
					{comment.translatedContent ? (
						<div style={{ marginTop: portrait ? 42 : 36, borderLeft: `6px solid ${palette.coral}`, paddingLeft: 28, color: '#344750', fontSize: portrait ? 46 : 40, lineHeight: 1.42, whiteSpace: 'pre-wrap' }}>
							{comment.translatedContent}
						</div>
					) : null}
				</article>
			</div>
			<footer style={{ display: 'flex', justifyContent: 'space-between', color: palette.muted, fontSize: portrait ? 25 : 22 }}>
				<span>{videoInfo.author || 'Media workflow'}</span>
				<span>Translated and safety-filtered</span>
			</footer>
		</AbsoluteFill>
	)
}
