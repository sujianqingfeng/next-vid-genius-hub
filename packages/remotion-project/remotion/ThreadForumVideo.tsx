'use client'

import type { CSSProperties } from 'react'
import * as React from 'react'
import { ThumbsUp } from 'lucide-react'
import {
	AbsoluteFill,
	Img,
	Sequence,
	Video,
	interpolate,
	useCurrentFrame,
} from 'remotion'
import type { ThreadVideoInputProps } from './types'
import { formatCount } from './utils/format'

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

function buildSequences(replyDurationsInFrames: number[]) {
	let cursor = 0
	return replyDurationsInFrames.map((durationInFrames, idx) => {
		const startFrame = cursor
		cursor += durationInFrames
		return { idx, startFrame, durationInFrames }
	})
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

function resolvePreferredPostText(post: ThreadVideoInputProps['root']): {
	primaryText: string
	secondaryText: string | null
} {
	const zh = (post as any)?.translations?.['zh-CN']?.plainText
	const zhText = typeof zh === 'string' ? zh.trim() : ''
	if (zhText) {
		const original = (post.plainText ?? '').trim()
		return {
			primaryText: zhText,
			secondaryText: original && original !== zhText ? original : null,
		}
	}
	return { primaryText: (post.plainText ?? '').trim(), secondaryText: null }
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
						const { primaryText, secondaryText } = resolvePreferredPostText(root)
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
}: {
	post: ThreadVideoInputProps['root']
	assets: ThreadVideoInputProps['assets'] | undefined
	title: string
	showLikes?: boolean
}) {
	const { primaryText, secondaryText } = resolvePreferredPostText(post)
	const blocks = buildDisplayBlocks(post, primaryText)

	return (
		<div
			style={{
				border: '1px solid var(--tf-border)',
				background: 'var(--tf-surface)',
				padding: 28,
				display: 'flex',
				flexDirection: 'column',
				gap: 16,
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
}

function ReplyWithContextSlide({
	thread,
	root,
	reply,
	index,
	total,
	durationInFrames,
	assets,
	fps,
}: {
	thread: ThreadVideoInputProps['thread']
	root: ThreadVideoInputProps['root']
	reply: ThreadVideoInputProps['replies'][number]
	index: number
	total: number
	durationInFrames: number
	assets: ThreadVideoInputProps['assets'] | undefined
	fps: number
}) {
	const frame = useCurrentFrame()
	const enter = interpolate(frame, [0, Math.min(fps * 0.3, 18)], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	})
	const exit = interpolate(
		frame,
		[Math.max(0, durationInFrames - Math.min(fps * 0.3, 18)), durationInFrames],
		[1, 0],
		{
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		},
	)
	const opacity = enter * exit

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
						REPLY {index + 1}/{total}
					</span>
					<ThumbsUp size={18} color="var(--tf-muted)" />
					<span>{formatCount(Number(reply.metrics?.likes ?? 0) || 0)}</span>
				</div>
			</div>

			<div style={{ marginTop: 18, display: 'flex', gap: 22, height: 'calc(100% - 70px)' }}>
				<div style={{ flex: '0 0 58%', minHeight: 0 }}>
					<PostCard post={root} assets={assets} title="ROOT" showLikes />
				</div>
				<div style={{ flex: '1 1 auto', minHeight: 0 }}>
					<PostCard post={reply as any} assets={assets} title="REPLY" />
				</div>
			</div>
		</AbsoluteFill>
	)
}

export function ThreadForumVideo({
	thread,
	root,
	replies,
	assets,
	coverDurationInFrames,
	replyDurationsInFrames,
	fps,
	templateConfig,
}: ThreadVideoInputProps) {
	const sequences = React.useMemo(
		() => buildSequences(replyDurationsInFrames),
		[replyDurationsInFrames],
	)
	const repliesTotalDuration = replyDurationsInFrames.reduce((sum, f) => sum + f, 0)
	const mainDuration = Math.max(repliesTotalDuration, fps)

	return (
		<AbsoluteFill
			style={{
				...(buildCssVars(templateConfig) as any),
				background: 'var(--tf-bg)',
			}}
		>
			<Sequence layout="none" from={0} durationInFrames={coverDurationInFrames}>
				<CoverSlide thread={thread} root={root} assets={assets} fps={fps} />
			</Sequence>
			<Sequence layout="none" from={coverDurationInFrames} durationInFrames={mainDuration}>
				<AbsoluteFill style={{ background: 'var(--tf-bg)' }}>
					{sequences.map(({ startFrame, durationInFrames, idx }) => {
						const reply = replies[idx]
						if (!reply) return null
						return (
							<Sequence
								key={reply.id}
								layout="none"
								from={startFrame}
								durationInFrames={durationInFrames}
							>
								<ReplyWithContextSlide
									thread={thread}
									root={root}
									reply={reply}
									index={idx}
									total={replies.length}
									durationInFrames={durationInFrames}
									assets={assets}
									fps={fps}
								/>
							</Sequence>
						)
					})}
				</AbsoluteFill>
			</Sequence>
		</AbsoluteFill>
	)
}
