'use client'

import type { CSSProperties } from 'react'
import * as React from 'react'
import { ThumbsUp } from 'lucide-react'
import {
	AbsoluteFill,
	Audio,
	Img,
	Sequence,
	Video,
	interpolate,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion'
import type { ThreadVideoInputProps } from './types'
import { formatCount } from './utils/format'

function clamp01(v: number) {
	if (v < 0) return 0
	if (v > 1) return 1
	return v
}

function lerp(a: number, b: number, t: number) {
	return a + (b - a) * t
}

function easeInOutCubic(t: number) {
	const x = clamp01(t)
	return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

function resolveAvatarFallback(name?: string | null) {
	const value = (name ?? '').trim()
	if (!value) return '?'
	const parts = value.split(/\s+/).filter(Boolean)
	if (parts.length === 0) return '?'
	if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
	return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase()
}

function buildCssVars(
	cfg: ThreadVideoInputProps['templateConfig'],
): CSSProperties {
	const theme = cfg?.theme ?? {}
	const typo = cfg?.typography ?? {}

	const fontScale = typeof typo.fontScale === 'number' ? typo.fontScale : 1
	const fontFamily =
		typo.fontPreset === 'inter'
			? ['"Inter"', 'system-ui', '-apple-system', '"Segoe UI Emoji"', 'sans-serif'].join(
					', ',
				)
			: typo.fontPreset === 'system'
				? ['system-ui', '-apple-system', '"Segoe UI"', '"Segoe UI Emoji"', 'sans-serif'].join(
						', ',
					)
				: [
						'"Noto Sans CJK SC"',
						'"Noto Sans SC"',
						'"Source Han Sans SC"',
						'"Inter"',
						'system-ui',
						'-apple-system',
						'"Segoe UI Emoji"',
						'sans-serif',
					].join(', ')

	return {
		'--tf-bg': theme.background ?? '#0b1020',
		'--tf-surface': theme.surface ?? 'rgba(255,255,255,0.06)',
		'--tf-border': theme.border ?? 'rgba(255,255,255,0.10)',
		'--tf-text': theme.textPrimary ?? '#e5e7eb',
		'--tf-muted': theme.textMuted ?? 'rgba(229,231,235,0.65)',
		'--tf-accent': theme.accent ?? '#22c55e',
		'--tf-font-family': fontFamily,
		'--tf-font-scale': String(fontScale),
	} as unknown as CSSProperties
}

function resolveAssetUrl(
	assetId: string,
	assets: ThreadVideoInputProps['assets'] | undefined,
): string | null {
	const fromMap = assets?.[assetId]?.url
	if (typeof fromMap === 'string' && fromMap) return fromMap
	if (assetId.startsWith('ext:')) return assetId.slice('ext:'.length)
	if (assetId.startsWith('http://') || assetId.startsWith('https://')) return assetId
	return null
}

function renderBlocks(
	blocks: ThreadVideoInputProps['root']['contentBlocks'],
	assets: ThreadVideoInputProps['assets'] | undefined,
) {
	return blocks.map((b) => {
		if (b.type === 'text') {
			return (
				<p
					key={b.id}
					style={{
						margin: 0,
						fontSize: 'calc(28px * var(--tf-font-scale))',
						lineHeight: 1.55,
						whiteSpace: 'pre-wrap',
					}}
				>
					{b.data.text}
				</p>
			)
		}
		if (b.type === 'quote') {
			return (
				<div
					key={b.id}
					style={{
						borderLeft: '3px solid var(--tf-accent)',
						paddingLeft: 18,
						color: 'var(--tf-muted)',
						fontSize: 'calc(24px * var(--tf-font-scale))',
						lineHeight: 1.55,
						whiteSpace: 'pre-wrap',
					}}
				>
					{b.data.text}
				</div>
			)
		}
		if (b.type === 'divider') {
			return (
				<div
					key={b.id}
					style={{
						height: 1,
						backgroundColor: 'var(--tf-border)',
						margin: '18px 0',
					}}
				/>
			)
		}
		if (b.type === 'image') {
			const url = resolveAssetUrl(b.data.assetId, assets)
			return (
				<div
					key={b.id}
					style={{
						border: '1px solid var(--tf-border)',
						background: 'rgba(255,255,255,0.02)',
						padding: 14,
					}}
				>
					{url ? (
						<Img
							src={url}
							style={{
								display: 'block',
								width: '100%',
								height: 'auto',
								maxHeight: 520,
								objectFit: 'contain',
								borderRadius: 0,
							}}
						/>
					) : (
						<div
							style={{
								border: '1px dashed var(--tf-border)',
								background: 'rgba(255,255,255,0.03)',
								padding: 18,
								fontSize: 'calc(16px * var(--tf-font-scale))',
								color: 'var(--tf-muted)',
							}}
						>
							[image: {b.data.caption ?? b.data.assetId}]
						</div>
					)}
					{b.data.caption ? (
						<div
							style={{
								marginTop: 10,
								fontSize: 'calc(16px * var(--tf-font-scale))',
								color: 'var(--tf-muted)',
								lineHeight: 1.4,
								whiteSpace: 'pre-wrap',
							}}
						>
							{b.data.caption}
						</div>
					) : null}
				</div>
			)
		}
		if (b.type === 'video') {
			const url = resolveAssetUrl(b.data.assetId, assets)
			return (
				<div
					key={b.id}
					style={{
						border: '1px dashed var(--tf-border)',
						background: 'rgba(255,255,255,0.03)',
						padding: 18,
						fontSize: 'calc(16px * var(--tf-font-scale))',
						color: 'var(--tf-muted)',
					}}
				>
					{url ? (
						<Video
							src={url}
							muted
							style={{
								display: 'block',
								width: '100%',
								maxHeight: 520,
								borderRadius: 0,
								border: '1px solid var(--tf-border)',
								backgroundColor: 'rgba(0,0,0,0.25)',
							}}
						/>
					) : (
						<span>[video cover card: {b.data.title ?? b.data.assetId}]</span>
					)}
				</div>
			)
		}
		if (b.type === 'link') {
			return (
				<div
					key={b.id}
					style={{
						border: '1px solid var(--tf-border)',
						background: 'rgba(255,255,255,0.02)',
						padding: 18,
					}}
				>
					<div
						style={{
							fontSize: 'calc(18px * var(--tf-font-scale))',
							fontWeight: 700,
						}}
					>
						{b.data.title ?? b.data.url}
					</div>
					{b.data.description ? (
						<div
							style={{
								marginTop: 8,
								fontSize: 'calc(16px * var(--tf-font-scale))',
								color: 'var(--tf-muted)',
								lineHeight: 1.5,
							}}
						>
							{b.data.description}
						</div>
					) : null}
					<div
						style={{
							marginTop: 10,
							fontSize: 'calc(14px * var(--tf-font-scale))',
							color: 'var(--tf-muted)',
							opacity: 0.8,
						}}
					>
						{b.data.url}
					</div>
				</div>
			)
		}
		return null
	})
}

type BilingualPrimary = 'zh' | 'original'
type SecondaryPlacement = 'above' | 'below'

function resolveBilingualPostText(
	post: ThreadVideoInputProps['root'],
	primary: BilingualPrimary,
): {
	primaryText: string
	secondaryText: string | null
} {
	const zh = (post as any)?.translations?.['zh-CN']?.plainText
	const zhText = typeof zh === 'string' ? zh.trim() : ''

	const original = (post.plainText ?? '').trim()
	if (!zhText) return { primaryText: original, secondaryText: null }

	if (primary === 'original') {
		if (!original) return { primaryText: zhText, secondaryText: null }
		return {
			primaryText: original,
			secondaryText: original !== zhText ? zhText : null,
		}
	}

	return {
		primaryText: zhText,
		secondaryText: original && original !== zhText ? original : null,
	}
}

function locateSegmentForFrame(
	frame: number,
	durationsInFrames: number[],
): { idx: number; localFrame: number; durationInFrames: number } {
	const safeFrame = Math.max(0, Math.floor(frame))
	let cursor = 0
	for (let idx = 0; idx < durationsInFrames.length; idx++) {
		const durationInFrames = Math.max(1, Math.floor(durationsInFrames[idx] ?? 1))
		const start = cursor
		const end = cursor + durationInFrames
		if (safeFrame >= start && safeFrame < end)
			return { idx, localFrame: safeFrame - start, durationInFrames }
		cursor = end
	}
	const lastIdx = Math.max(0, durationsInFrames.length - 1)
	const lastDuration = Math.max(1, Math.floor(durationsInFrames[lastIdx] ?? 1))
	const lastStart = Math.max(0, cursor - lastDuration)
	return {
		idx: lastIdx,
		localFrame: Math.max(0, safeFrame - lastStart),
		durationInFrames: lastDuration,
	}
}

function buildDisplayBlocks(
	post: ThreadVideoInputProps['root'],
	primaryText: string,
): ThreadVideoInputProps['root']['contentBlocks'] {
	const rest = (post.contentBlocks ?? []).filter((b) => b.type !== 'text')
	const text = primaryText.trim()
	if (!text) return post.contentBlocks ?? []
	return [{ id: `text:${post.id}`, type: 'text', data: { text } }, ...rest] as any
}

function CoverSlide({
	thread,
	root,
	assets,
	fps,
}: {
	thread: ThreadVideoInputProps['thread']
	root: ThreadVideoInputProps['root']
	assets: ThreadVideoInputProps['assets'] | undefined
	fps: number
}) {
	const frame = useCurrentFrame()
	const opacity = interpolate(frame, [0, fps * 0.5], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	})

	return (
		<AbsoluteFill
			style={{
				background: 'var(--tf-bg)',
				color: 'var(--tf-text)',
				fontFamily: 'var(--tf-font-family)',
				padding: '80px',
				boxSizing: 'border-box',
				opacity,
			}}
		>
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap: 26,
					maxWidth: 1500,
				}}
			>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 12,
						color: 'var(--tf-muted)',
						fontSize: 'calc(14px * var(--tf-font-scale))',
						letterSpacing: '0.22em',
						textTransform: 'uppercase',
					}}
				>
					<span
						style={{
							width: 10,
							height: 10,
							background: 'var(--tf-accent)',
						}}
					/>
					<span>{thread.source ?? 'thread'}</span>
					{thread.sourceUrl ? (
						<span style={{ opacity: 0.75 }}>{thread.sourceUrl}</span>
					) : null}
				</div>

				<h1
					style={{
						margin: 0,
						fontSize: 'calc(64px * var(--tf-font-scale))',
						lineHeight: 1.05,
						fontWeight: 900,
						letterSpacing: '-0.03em',
					}}
				>
					{thread.title}
				</h1>

				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 14,
						color: 'var(--tf-muted)',
						fontSize: 'calc(16px * var(--tf-font-scale))',
					}}
				>
					<div
						style={{
							width: 44,
							height: 44,
							borderRadius: 999,
							border: '1px solid var(--tf-border)',
							background: 'rgba(255,255,255,0.04)',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							color: 'var(--tf-text)',
							fontWeight: 800,
						}}
					>
						{resolveAvatarFallback(root.author.name)}
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
						<div style={{ color: 'var(--tf-text)', fontWeight: 800 }}>
							{root.author.name}
							{root.author.handle ? (
								<span style={{ marginLeft: 10, color: 'var(--tf-muted)' }}>
									{root.author.handle}
								</span>
							) : null}
						</div>
						<div style={{ fontSize: 'calc(12px * var(--tf-font-scale))' }}>
							ROOT POST
						</div>
					</div>
				</div>

				<div
					style={{
						marginTop: 6,
						border: '1px solid var(--tf-border)',
						background: 'var(--tf-surface)',
						padding: 28,
					}}
				>
					{(() => {
						const { primaryText, secondaryText } = resolveBilingualPostText(
							root,
							'zh',
						)
						const blocks = buildDisplayBlocks(root, primaryText)
						return (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
								<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
									{renderBlocks(blocks, assets)}
								</div>
								{secondaryText ? (
									<div
										style={{
											borderTop: '1px solid var(--tf-border)',
											paddingTop: 14,
											fontSize: 'calc(16px * var(--tf-font-scale))',
											color: 'var(--tf-muted)',
											lineHeight: 1.55,
											whiteSpace: 'pre-wrap',
										}}
									>
										{secondaryText}
									</div>
								) : null}
							</div>
						)
					})()}
				</div>
			</div>
		</AbsoluteFill>
	)
}

function PostCard({
	post,
	assets,
	title,
	showLikes,
	bilingualPrimary = 'zh',
	secondaryPlacement = 'below',
	scrollProgress,
}: {
	post: ThreadVideoInputProps['root']
	assets: ThreadVideoInputProps['assets'] | undefined
	title: string
	showLikes?: boolean
	bilingualPrimary?: BilingualPrimary
	secondaryPlacement?: SecondaryPlacement
	scrollProgress?: number
}) {
	const { primaryText, secondaryText } = resolveBilingualPostText(post, bilingualPrimary)
	const blocks = buildDisplayBlocks(post, primaryText)

	const secondary =
		secondaryText && secondaryPlacement === 'above' ? (
			<div
				style={{
					borderBottom: '1px solid var(--tf-border)',
					paddingBottom: 14,
					fontSize: 'calc(16px * var(--tf-font-scale))',
					color: 'var(--tf-muted)',
					lineHeight: 1.55,
					whiteSpace: 'pre-wrap',
				}}
			>
				{secondaryText}
			</div>
		) : secondaryText && secondaryPlacement === 'below' ? (
			<div
				style={{
					borderTop: '1px solid var(--tf-border)',
					paddingTop: 14,
					fontSize: 'calc(16px * var(--tf-font-scale))',
					color: 'var(--tf-muted)',
					lineHeight: 1.55,
					whiteSpace: 'pre-wrap',
				}}
			>
				{secondaryText}
			</div>
			) : null

	const isScrollable = typeof scrollProgress === 'number'
	const bodyViewportRef = React.useRef<HTMLDivElement | null>(null)
	const bodyContentRef = React.useRef<HTMLDivElement | null>(null)
	const [bodyMaxScrollY, setBodyMaxScrollY] = React.useState(0)

	React.useLayoutEffect(() => {
		if (!isScrollable) return
		const viewport = bodyViewportRef.current
		const content = bodyContentRef.current
		if (!viewport || !content) return
		setBodyMaxScrollY(Math.max(0, content.scrollHeight - viewport.clientHeight))
	}, [isScrollable, post.id])

	const bodyScrollY = isScrollable ? bodyMaxScrollY * clamp01(scrollProgress!) : 0

	return (
		<div
			style={{
				border: '1px solid var(--tf-border)',
				background: 'var(--tf-surface)',
				padding: 28,
				display: 'flex',
				flexDirection: 'column',
				gap: 16,
				height: isScrollable ? '100%' : undefined,
				minHeight: 0,
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					gap: 14,
				}}
			>
				<div
					style={{
						fontSize: 'calc(12px * var(--tf-font-scale))',
						letterSpacing: '0.22em',
						textTransform: 'uppercase',
						color: 'var(--tf-muted)',
					}}
				>
					{title}
				</div>

				{showLikes ? (
					<div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--tf-muted)' }}>
						<ThumbsUp size={18} color="var(--tf-muted)" />
						<span style={{ fontSize: 'calc(14px * var(--tf-font-scale))' }}>
							{formatCount(Number(post.metrics?.likes ?? 0) || 0)}
						</span>
					</div>
				) : null}
			</div>

			<div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
				<div
					style={{
						width: 44,
						height: 44,
						borderRadius: 999,
						border: '1px solid var(--tf-border)',
						background: 'rgba(255,255,255,0.04)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						color: 'var(--tf-text)',
						fontWeight: 800,
						flex: '0 0 auto',
					}}
				>
					{resolveAvatarFallback(post.author.name)}
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
					<div style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' }}>
						{post.author.name}
						{post.author.handle ? (
							<span style={{ marginLeft: 10, color: 'var(--tf-muted)' }}>
								{String(post.author.handle)}
							</span>
						) : null}
					</div>
					<div
						style={{
							fontSize: 'calc(12px * var(--tf-font-scale))',
							color: 'var(--tf-muted)',
						}}
					>
						{post.createdAt ? String(post.createdAt).slice(0, 10) : '—'}
					</div>
				</div>
			</div>

			{isScrollable ? (
				<div
					ref={bodyViewportRef}
					style={{
						flex: '1 1 auto',
						minHeight: 0,
						overflow: 'hidden',
					}}
				>
					<div
						ref={bodyContentRef}
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: 14,
							transform: `translateY(-${bodyScrollY}px)`,
							willChange: 'transform',
						}}
					>
						{secondaryPlacement === 'above' ? secondary : null}
						{renderBlocks(blocks, assets)}
						{secondaryPlacement === 'below' ? secondary : null}
					</div>
				</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
					{secondaryPlacement === 'above' ? secondary : null}
					{renderBlocks(blocks, assets)}
					{secondaryPlacement === 'below' ? secondary : null}
				</div>
			)}
		</div>
	)
}

function RepliesListSlide({
	thread,
	root,
	replies,
	replyDurationsInFrames,
	assets,
	fps,
}: {
	thread: ThreadVideoInputProps['thread']
	root: ThreadVideoInputProps['root']
	replies: ThreadVideoInputProps['replies']
	replyDurationsInFrames: number[]
	assets: ThreadVideoInputProps['assets'] | undefined
	fps: number
}) {
	const frame = useCurrentFrame()
	const opacity = interpolate(frame, [0, Math.min(fps * 0.3, 18)], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	})

	const totalRepliesFrames = React.useMemo(
		() => replyDurationsInFrames.reduce((sum, d) => sum + d, 0),
		[replyDurationsInFrames],
	)
	const rootScrollProgress =
		totalRepliesFrames > 0 ? clamp01(frame / totalRepliesFrames) : 0

	const { idx: activeIdx, localFrame, durationInFrames } = React.useMemo(
		() => locateSegmentForFrame(frame, replyDurationsInFrames),
		[frame, replyDurationsInFrames],
	)

	const rightViewportRef = React.useRef<HTMLDivElement | null>(null)
	const rightContentRef = React.useRef<HTMLDivElement | null>(null)
	const [rightItemTops, setRightItemTops] = React.useState<number[] | null>(null)
	const [rightMaxScrollY, setRightMaxScrollY] = React.useState(0)

	React.useLayoutEffect(() => {
		const viewport = rightViewportRef.current
		const content = rightContentRef.current
		if (!viewport || !content) return

		let raf = 0
		const measure = () => {
			const nodes = Array.from(
				content.querySelectorAll<HTMLElement>('[data-reply-idx]'),
			)
			const tops: number[] = []
			for (const n of nodes) {
				const idxStr = n.dataset.replyIdx
				if (!idxStr) continue
				const idx = Number(idxStr)
				if (!Number.isFinite(idx)) continue
				tops[idx] = n.offsetTop
			}
			setRightItemTops(tops.length > 0 ? tops : null)
			setRightMaxScrollY(Math.max(0, content.scrollHeight - viewport.clientHeight))
		}
		const scheduleMeasure = () => {
			cancelAnimationFrame(raf)
			raf = requestAnimationFrame(measure)
		}

		scheduleMeasure()

		if (typeof ResizeObserver !== 'undefined') {
			const ro = new ResizeObserver(() => scheduleMeasure())
			ro.observe(content)
			ro.observe(viewport)
			return () => {
				ro.disconnect()
				cancelAnimationFrame(raf)
			}
		}

		return () => {
			cancelAnimationFrame(raf)
		}
	}, [replies.length])

	// Smoothly scroll from current reply to the next one, but do the transition
	// in a short "handoff" window so the active highlight doesn't drift off-screen.
	const transition = React.useMemo(() => {
		const dur = Math.max(1, durationInFrames)
		const transitionFrames = Math.max(8, Math.min(dur, Math.round(fps * 0.35)))
		const startAt = Math.max(0, dur - transitionFrames)
		const t = (localFrame - startAt) / transitionFrames
		return { t: clamp01(t), startAt, transitionFrames }
	}, [durationInFrames, fps, localFrame])

	const rightScrollY = React.useMemo(() => {
		if (replies.length === 0) return 0
		if (!rightItemTops || rightItemTops.length === 0) return 0

		const paddingTop = 18
		const startRaw = rightItemTops[activeIdx] ?? 0
		const startY = Math.max(0, startRaw - paddingTop)
		const endRaw =
			activeIdx + 1 < replies.length
				? (rightItemTops[activeIdx + 1] ?? startRaw)
				: rightMaxScrollY
		const endY = Math.max(0, endRaw - paddingTop)

		const y = lerp(startY, endY, easeInOutCubic(transition.t))
		return Math.max(0, Math.min(rightMaxScrollY, y))
	}, [
		activeIdx,
		durationInFrames,
		localFrame,
		transition.t,
		replies.length,
		rightItemTops,
		rightMaxScrollY,
	])

	const replyIndicator =
		replies.length > 0 ? `REPLY ${activeIdx + 1}/${replies.length}` : 'REPLIES 0'

	return (
		<AbsoluteFill
			style={{
				background: 'var(--tf-bg)',
				color: 'var(--tf-text)',
				fontFamily: 'var(--tf-font-family)',
				padding: '64px',
				boxSizing: 'border-box',
				opacity,
			}}
		>
			<div
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					gap: 24,
					alignItems: 'flex-end',
				}}
			>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 12,
						color: 'var(--tf-muted)',
						fontSize: 'calc(12px * var(--tf-font-scale))',
						letterSpacing: '0.22em',
						textTransform: 'uppercase',
					}}
				>
					<span
						style={{
							width: 10,
							height: 10,
							background: 'var(--tf-accent)',
						}}
					/>
					<span
						style={{
							maxWidth: 980,
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}
					>
						{thread.title}
					</span>
				</div>

				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 10,
						color: 'var(--tf-muted)',
						fontSize: 'calc(14px * var(--tf-font-scale))',
					}}
				>
					<span
						style={{
							letterSpacing: '0.22em',
							textTransform: 'uppercase',
							fontSize: 'calc(12px * var(--tf-font-scale))',
						}}
					>
						{replyIndicator}
					</span>
				</div>
			</div>

			<div style={{ marginTop: 18, display: 'flex', gap: 22, height: 'calc(100% - 70px)' }}>
				<div style={{ flex: '0 0 58%', minHeight: 0 }}>
					<PostCard
						post={root}
						assets={assets}
						title="ROOT"
						showLikes
						scrollProgress={rootScrollProgress}
					/>
				</div>
				<div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex' }}>
					<div
						ref={rightViewportRef}
						style={{
							flex: 1,
							minHeight: 0,
							overflow: 'hidden',
							border: '1px solid var(--tf-border)',
							background: 'rgba(255,255,255,0.02)',
						}}
					>
						<div
							ref={rightContentRef}
							style={{
								display: 'flex',
								flexDirection: 'column',
								gap: 16,
								padding: 18,
								transform: `translateY(-${rightScrollY}px)`,
								willChange: 'transform',
							}}
						>
							{replies.map((reply, idx) => (
								<div
									key={reply.id}
									data-reply-idx={idx}
									style={{
										position: 'relative',
									}}
								>
									{(() => {
										const isCurrent = idx === activeIdx
										const isNext = idx === activeIdx + 1
										const strength = isCurrent ? 1 - transition.t : isNext ? transition.t : 0
										if (strength <= 0) return null
										return (
											<div
												style={{
													position: 'absolute',
													inset: 0,
													border: '2px solid var(--tf-accent)',
													opacity: strength,
													pointerEvents: 'none',
													boxSizing: 'border-box',
												}}
											/>
										)
									})()}
									<PostCard
										post={reply as any}
										assets={assets}
										title={`REPLY ${idx + 1}`}
										showLikes
										bilingualPrimary="zh"
										secondaryPlacement="above"
									/>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</AbsoluteFill>
	)
}

export function ThreadForumVideo({
	thread,
	audio,
	root,
	replies,
	assets,
	coverDurationInFrames,
	replyDurationsInFrames,
	fps,
	templateConfig,
}: ThreadVideoInputProps) {
	const videoConfig = useVideoConfig()
	const repliesTotalDuration = replyDurationsInFrames.reduce((sum, f) => sum + f, 0)
	const mainDuration = Math.max(repliesTotalDuration, fps)

	const bgmDurationInFrames =
		audio?.durationMs && audio.durationMs > 0
			? Math.max(1, Math.round((audio.durationMs / 1000) * fps))
			: 0

	const totalDurationInFrames = videoConfig.durationInFrames
	const maxAudioLoops = 2000
	const audioLoops =
		audio?.url && bgmDurationInFrames > 0
			? Math.min(Math.ceil(totalDurationInFrames / bgmDurationInFrames), maxAudioLoops)
			: 0

	return (
		<AbsoluteFill
			style={{
				...(buildCssVars(templateConfig) as any),
				background: 'var(--tf-bg)',
			}}
		>
			{audio?.url && bgmDurationInFrames > 0 ? (
				<>
					{Array.from({ length: audioLoops }).map((_, idx) => {
						const from = idx * bgmDurationInFrames
						const remaining = totalDurationInFrames - from
						if (remaining <= 0) return null
						return (
							<Sequence
								key={idx}
								layout="none"
								from={from}
								durationInFrames={Math.min(bgmDurationInFrames, remaining)}
							>
								<Audio src={audio.url} volume={audio.volume ?? 1} />
							</Sequence>
						)
					})}
				</>
			) : null}
			<Sequence layout="none" from={0} durationInFrames={coverDurationInFrames}>
				<CoverSlide thread={thread} root={root} assets={assets} fps={fps} />
			</Sequence>
			<Sequence layout="none" from={coverDurationInFrames} durationInFrames={mainDuration}>
				<RepliesListSlide
					thread={thread}
					root={root}
					replies={replies}
					replyDurationsInFrames={replyDurationsInFrames}
					assets={assets}
					fps={fps}
				/>
			</Sequence>
		</AbsoluteFill>
	)
}
