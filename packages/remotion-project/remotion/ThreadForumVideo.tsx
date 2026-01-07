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
import type { ThreadRenderTreeNode, ThreadVideoInputProps } from './types'
import { formatCount } from './utils/format'
import { DEFAULT_THREAD_TEMPLATE_CONFIG } from './thread-template-config'

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
			? [
					'"Inter"',
					'system-ui',
					'-apple-system',
					'"Segoe UI Emoji"',
					'sans-serif',
				].join(', ')
			: typo.fontPreset === 'system'
				? [
						'system-ui',
						'-apple-system',
						'"Segoe UI"',
						'"Segoe UI Emoji"',
						'sans-serif',
					].join(', ')
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
		'--tf-bg': theme.background ?? '#fbf7f1',
		'--tf-surface': theme.surface ?? 'rgba(255,255,255,0.92)',
		'--tf-border': theme.border ?? 'rgba(17,24,39,0.10)',
		'--tf-text': theme.textPrimary ?? '#111827',
		'--tf-muted': theme.textMuted ?? 'rgba(17,24,39,0.60)',
		'--tf-accent': theme.accent ?? '#16a34a',
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
	return null
}

function renderMainMediaCard(
	block: ThreadVideoInputProps['root']['contentBlocks'][number],
	assets: ThreadVideoInputProps['assets'] | undefined,
	opts?: { extraCount?: number; videoMode?: 'inline' | 'placeholder' },
): React.ReactNode {
	if (!block || (block as any).type == null) return null
	const extraCount = Math.max(0, Math.floor(opts?.extraCount ?? 0))
	const videoMode = opts?.videoMode ?? 'inline'

	const cardStyle: CSSProperties = {
		border: '1px solid var(--tf-border)',
		background: 'var(--tf-surface)',
		borderRadius: 18,
		overflow: 'hidden',
		position: 'relative',
		width: '100%',
		height: 420,
		boxSizing: 'border-box',
	}

	const badgeStyle: CSSProperties = {
		position: 'absolute',
		top: 12,
		right: 12,
		border: '1px solid rgba(0,0,0,0.06)',
		background: 'var(--tf-accent)',
		color: '#fff',
		fontSize: 'calc(12px * var(--tf-font-scale))',
		fontWeight: 800,
		padding: '6px 10px',
		borderRadius: 999,
		letterSpacing: '0.06em',
		boxShadow: '0 8px 18px rgba(17,24,39,0.12)',
	}

	const captionStyle: CSSProperties = {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		padding: '12px 14px',
		background:
			'linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0.05))',
		color: '#fff',
		fontSize: 'calc(14px * var(--tf-font-scale))',
		lineHeight: 1.35,
		textShadow: '0 1px 2px rgba(0,0,0,0.35)',
	}

	if ((block as any).type === 'image') {
		const assetId = String((block as any).data?.assetId ?? '')
		const url = assetId ? resolveAssetUrl(assetId, assets) : null
		const caption = String((block as any).data?.caption ?? '').trim()
		return (
			<div style={cardStyle}>
				{url ? (
					<Img
						src={url}
						style={{
							position: 'absolute',
							inset: 0,
							width: '100%',
							height: '100%',
							objectFit: 'cover',
							objectPosition: 'center',
						}}
					/>
				) : (
					<div
						style={{
							position: 'absolute',
							inset: 0,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							color: 'var(--tf-muted)',
							fontSize: 'calc(14px * var(--tf-font-scale))',
							border: '1px dashed var(--tf-border)',
							margin: 14,
							borderRadius: 14,
							background: 'rgba(17,24,39,0.03)',
						}}
					>
						[image: {assetId || 'no-id'}]
					</div>
				)}
				{extraCount > 0 ? <div style={badgeStyle}>+{extraCount}</div> : null}
				{caption ? <div style={captionStyle}>{caption}</div> : null}
			</div>
		)
	}

	if ((block as any).type === 'video') {
		const assetId = String((block as any).data?.assetId ?? '')
		const url = assetId ? resolveAssetUrl(assetId, assets) : null
		const title = String((block as any).data?.title ?? '').trim()
		return (
			<div style={cardStyle}>
				{url && videoMode === 'inline' ? (
					<Video
						src={url}
						muted
						loop
						style={{
							position: 'absolute',
							inset: 0,
							width: '100%',
							height: '100%',
							objectFit: 'cover',
							backgroundColor: 'rgba(17,24,39,0.06)',
						}}
					/>
				) : (
					<div
						style={{
							position: 'absolute',
							inset: 0,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							color: 'var(--tf-muted)',
							fontSize: 'calc(14px * var(--tf-font-scale))',
							border: '1px dashed var(--tf-border)',
							margin: 14,
							borderRadius: 14,
							background: 'rgba(17,24,39,0.03)',
						}}
					>
						[video: {assetId || 'no-id'}]
					</div>
				)}
				{extraCount > 0 ? <div style={badgeStyle}>+{extraCount}</div> : null}
				{title ? <div style={captionStyle}>{title}</div> : null}
			</div>
		)
	}

	return null
}

function renderThreadTemplateNode(
	node: ThreadRenderTreeNode | undefined,
	ctx: {
		templateConfig: ThreadVideoInputProps['templateConfig'] | undefined
		videoMode?: 'inline' | 'placeholder'
		scene?: 'cover' | 'post'
		frame?: number
		thread: ThreadVideoInputProps['thread']
		root: ThreadVideoInputProps['root']
		post?: ThreadVideoInputProps['root']
		replies: ThreadVideoInputProps['replies']
		assets: ThreadVideoInputProps['assets'] | undefined
		coverDurationInFrames: number
		replyDurationsInFrames: number[]
		fps: number
	},
	opts?: { isRoot?: boolean; path?: Array<string | number> },
): React.ReactNode {
	if (!node) return null
	const path = opts?.path ?? []
	const key =
		ctx.scene && (ctx.scene === 'cover' || ctx.scene === 'post')
			? `${ctx.scene}:${JSON.stringify(path)}`
			: undefined

	if (node.type === 'Background') {
		const url = node.assetId
			? resolveAssetUrl(String(node.assetId), ctx.assets)
			: null
		const opacity = typeof node.opacity === 'number' ? clamp01(node.opacity) : 1
		const blur = typeof node.blur === 'number' ? Math.max(0, node.blur) : 0

		return (
			<div
				style={{
					position: 'absolute',
					inset: 0,
					opacity,
					filter: blur > 0 ? `blur(${blur}px)` : undefined,
					pointerEvents: 'none',
				}}
			>
				{url ? (
					<Img
						src={url}
						style={{
							width: '100%',
							height: '100%',
							objectFit: 'cover',
							display: 'block',
						}}
					/>
				) : null}
				{node.color ? (
					<div
						style={{
							position: 'absolute',
							inset: 0,
							background: String(node.color),
						}}
					/>
				) : null}
			</div>
		)
	}

	if (node.type === 'Repeat') {
		const source = node.source ?? 'replies'
		if (source !== 'replies') return null
		return (
			<RepliesRepeat
				templateConfig={ctx.templateConfig}
				scene={ctx.scene}
				frame={ctx.frame}
				thread={ctx.thread}
				root={ctx.root}
				replies={ctx.replies}
				replyDurationsInFrames={ctx.replyDurationsInFrames}
				coverDurationInFrames={ctx.coverDurationInFrames}
				assets={ctx.assets}
				fps={ctx.fps}
				itemRoot={node.itemRoot}
				itemRootPath={[...path, 'itemRoot']}
				wrapItemRoot={node.wrapItemRoot}
				gap={node.gap}
				scroll={node.scroll}
				maxItems={node.maxItems}
				highlight={node.highlight}
			/>
		)
	}

	if (node.type === 'Text') {
		const post = ctx.post ?? ctx.root
		const localFrame =
			typeof ctx.frame === 'number'
				? Math.max(
						0,
						ctx.scene === 'post'
							? ctx.frame - ctx.coverDurationInFrames
							: ctx.frame,
					)
				: 0
		const active = locateSegmentForFrame(localFrame, ctx.replyDurationsInFrames)
		const bound = (() => {
			switch (node.bind) {
				case 'thread.title':
					return ctx.thread.title
				case 'thread.source':
					return ctx.thread.source ?? null
				case 'thread.sourceUrl':
					return ctx.thread.sourceUrl ?? null
				case 'timeline.replyIndicator': {
					const count = ctx.replies.length
					if (count <= 0) return 'REPLIES 0'
					return `REPLY ${active.idx + 1}/${count}`
				}
				case 'timeline.replyIndex':
					return String(active.idx + 1)
				case 'timeline.replyCount':
					return String(ctx.replies.length)
				case 'root.author.name':
					return ctx.root.author.name
				case 'root.author.handle':
					return ctx.root.author.handle ?? null
				case 'root.plainText':
					return ctx.root.plainText
				case 'root.translations.zh-CN.plainText':
					return (
						ctx.root.translations?.['zh-CN']?.plainText ?? ctx.root.plainText
					)
				case 'post.author.name':
					return post.author.name
				case 'post.author.handle':
					return post.author.handle ?? null
				case 'post.plainText':
					return post.plainText
				case 'post.translations.zh-CN.plainText':
					return post.translations?.['zh-CN']?.plainText ?? post.plainText
				default:
					return null
			}
		})()

		const wantsBilingual =
			node.text == null &&
			node.bilingual === true &&
			(node.bind === 'root.plainText' ||
				node.bind === 'root.translations.zh-CN.plainText' ||
				node.bind === 'post.plainText' ||
				node.bind === 'post.translations.zh-CN.plainText')
		const bilingualTargetPost =
			node.bind === 'root.plainText' || node.bind === 'root.translations.zh-CN.plainText'
				? ctx.root
				: post
		const bilingualPrimary = node.bilingualPrimary ?? 'zh'
		const { primaryText, secondaryText } = wantsBilingual
			? resolveBilingualPostText(bilingualTargetPost, bilingualPrimary)
			: { primaryText: '', secondaryText: null }

		const text = wantsBilingual ? primaryText : node.text ?? bound ?? ''
		const color =
			node.color === 'accent'
				? 'var(--tf-accent)'
				: node.color === 'muted'
					? 'var(--tf-muted)'
					: 'var(--tf-text)'

		const sizePx = typeof node.size === 'number' ? node.size : 16
		const weight = typeof node.weight === 'number' ? node.weight : 600
		const lineHeight =
			typeof node.lineHeight === 'number'
				? Math.min(2, Math.max(0.8, node.lineHeight))
				: null
		const style: CSSProperties = {
			margin: 0,
			color,
			opacity:
				typeof node.opacity === 'number' ? clamp01(node.opacity) : undefined,
			fontWeight: weight,
			fontSize: `calc(${sizePx}px * var(--tf-font-scale))`,
			lineHeight: lineHeight ?? 1.25,
			whiteSpace: 'pre-wrap',
			letterSpacing:
				typeof node.letterSpacing === 'number'
					? `${node.letterSpacing}em`
					: undefined,
			textTransform: node.uppercase ? 'uppercase' : undefined,
			textAlign:
				node.align === 'center'
					? 'center'
					: node.align === 'right'
						? 'right'
						: 'left',
		}

		if (typeof node.maxLines === 'number' && node.maxLines > 0) {
			;(style as any).display = '-webkit-box'
			;(style as any).WebkitBoxOrient = 'vertical'
			;(style as any).WebkitLineClamp = String(node.maxLines)
			style.overflow = 'hidden'
		}

		if (wantsBilingual && secondaryText) {
			const secondaryStyle: CSSProperties = {
				margin: 0,
				color: 'var(--tf-muted)',
				opacity: 0.9,
				fontWeight: Math.max(400, Math.min(700, weight - 100)),
				fontSize: `calc(${Math.max(12, sizePx - 2)}px * var(--tf-font-scale))`,
				lineHeight: lineHeight ?? 1.25,
				whiteSpace: 'pre-wrap',
				textAlign: style.textAlign,
			}

			if (typeof node.maxLines === 'number' && node.maxLines > 0) {
				;(secondaryStyle as any).display = '-webkit-box'
				;(secondaryStyle as any).WebkitBoxOrient = 'vertical'
				;(secondaryStyle as any).WebkitLineClamp = String(node.maxLines)
				secondaryStyle.overflow = 'hidden'
			}

			const placement = node.secondaryPlacement ?? 'below'
			return (
				<div
					data-tt-key={key}
					data-tt-type="Text"
					style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
				>
					{placement === 'above' ? (
						<>
							<p style={secondaryStyle}>{secondaryText}</p>
							<p style={style}>{text}</p>
						</>
					) : (
						<>
							<p style={style}>{text}</p>
							<p style={secondaryStyle}>{secondaryText}</p>
						</>
					)}
				</div>
			)
		}

		return (
			<p data-tt-key={key} data-tt-type="Text" style={style}>
				{text}
			</p>
		)
	}

	if (node.type === 'Metrics') {
		const post = ctx.post ?? ctx.root
		const likes =
			node.bind === 'root.metrics.likes'
				? Number(ctx.root.metrics?.likes ?? 0) || 0
				: node.bind === 'post.metrics.likes'
					? Number(post.metrics?.likes ?? 0) || 0
					: Number(post.metrics?.likes ?? 0) || 0

		const color =
			node.color === 'accent'
				? 'var(--tf-accent)'
				: node.color === 'muted'
					? 'var(--tf-muted)'
					: 'var(--tf-text)'
		const sizePx = typeof node.size === 'number' ? node.size : 14
		const showIcon = node.showIcon !== false

		return (
			<div
				data-tt-key={key}
				data-tt-type="Metrics"
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 10,
					color,
					opacity:
						typeof node.opacity === 'number'
							? clamp01(node.opacity)
							: undefined,
					fontSize: `calc(${sizePx}px * var(--tf-font-scale))`,
					lineHeight: 1,
					whiteSpace: 'nowrap',
				}}
			>
				{showIcon ? (
					<ThumbsUp
						size={Math.max(12, Math.round(sizePx * 1.15))}
						color={color}
					/>
				) : null}
				<span>{formatCount(likes)}</span>
			</div>
		)
	}

	if (node.type === 'Watermark') {
		const brand = ctx.templateConfig?.brand
		if (brand?.showWatermark !== true) return null

		const rawText = (node.text ?? brand?.watermarkText ?? '').trim()
		if (!rawText) return null

		const pos = node.position ?? 'bottom-right'
		const offset = typeof node.padding === 'number' ? node.padding : 18

		const color =
			node.color === 'accent'
				? 'var(--tf-accent)'
				: node.color === 'primary'
					? 'var(--tf-text)'
					: 'var(--tf-muted)'
		const sizePx = typeof node.size === 'number' ? node.size : 12
		const weight = typeof node.weight === 'number' ? node.weight : 700
		const opacity =
			typeof node.opacity === 'number' ? clamp01(node.opacity) : 0.7

		const placement: CSSProperties =
			pos === 'top-left'
				? { left: offset, top: offset }
				: pos === 'top-right'
					? { right: offset, top: offset }
					: pos === 'bottom-left'
						? { left: offset, bottom: offset }
						: { right: offset, bottom: offset }

		return (
			<div
				data-tt-key={key}
				data-tt-type="Watermark"
				style={{
					position: 'absolute',
					...placement,
					color,
					opacity,
					fontWeight: weight,
					fontSize: `calc(${sizePx}px * var(--tf-font-scale))`,
					letterSpacing: '0.22em',
					textTransform: 'uppercase',
					pointerEvents: 'none',
					zIndex: 10,
				}}
			>
				{rawText}
			</div>
		)
	}

	if (node.type === 'Avatar') {
		const post = ctx.post ?? ctx.root
		const assetId =
			node.bind === 'root.author.avatarAssetId'
				? ctx.root.author.avatarAssetId
				: node.bind === 'post.author.avatarAssetId'
					? post.author.avatarAssetId
					: null
		const url = assetId ? resolveAssetUrl(String(assetId), ctx.assets) : null
		const size = typeof node.size === 'number' ? node.size : 96
		const radius = typeof node.radius === 'number' ? node.radius : 999
		const bg = node.background ?? 'rgba(17,24,39,0.04)'
		const border = node.border ? '1px solid var(--tf-border)' : undefined
		const opacity =
			typeof node.opacity === 'number' ? clamp01(node.opacity) : undefined

		if (url) {
			return (
				<Img
					src={url}
					data-tt-key={key}
					data-tt-type="Avatar"
					style={{
						width: size,
						height: size,
						borderRadius: radius,
						objectFit: 'cover',
						border,
						background: bg,
						opacity,
						display: 'block',
					}}
				/>
			)
		}

		const fallbackName =
			node.bind === 'post.author.avatarAssetId'
				? post.author.name
				: ctx.root.author.name
		const fallback = resolveAvatarFallback(fallbackName)
		return (
			<div
				data-tt-key={key}
				data-tt-type="Avatar"
				style={{
					width: size,
					height: size,
					borderRadius: radius,
					border,
					background: bg,
					opacity,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					color: 'var(--tf-text)',
					fontWeight: 800,
					fontSize: `calc(${Math.max(14, Math.round(size / 3))}px * var(--tf-font-scale))`,
					letterSpacing: '0.06em',
					textTransform: 'uppercase',
					boxSizing: 'border-box',
				}}
			>
				{fallback}
			</div>
		)
	}

	if (node.type === 'ContentBlocks') {
		const post =
			node.bind === 'post.contentBlocks' ? (ctx.post ?? ctx.root) : ctx.root
		const blocks =
			node.bind === 'root.contentBlocks'
				? ctx.root.contentBlocks
				: node.bind === 'post.contentBlocks'
					? post.contentBlocks
					: []
		const hasZhTranslation = Boolean(
			typeof post.translations?.['zh-CN']?.plainText === 'string' &&
				post.translations?.['zh-CN']?.plainText.trim(),
		)
		const { primaryText, secondaryText } = hasZhTranslation
			? resolveBilingualPostText(post, 'zh')
			: { primaryText: '', secondaryText: null }
		const displayBlocks = hasZhTranslation
			? buildDisplayBlocks(post, primaryText)
			: blocks

		const prefersPostTwoColumn =
			ctx.scene === 'post' &&
			(node.bind === 'root.contentBlocks' || node.bind === 'post.contentBlocks')

		if (prefersPostTwoColumn) {
			const mediaBlocks = (displayBlocks ?? []).filter(
				(b) => b?.type === 'image' || b?.type === 'video',
			)
			const mainMedia = mediaBlocks[0] ?? null
			const extraCount = Math.max(0, mediaBlocks.length - 1)
			const hasMedia = Boolean(mainMedia)

			const primary =
				hasZhTranslation && primaryText.trim()
					? primaryText.trim()
					: (post.plainText ?? '').trim()
			const secondary =
				hasZhTranslation && secondaryText && secondaryText.trim()
					? secondaryText.trim()
					: null

			const tagStyle: CSSProperties = {
				border: '1px solid var(--tf-border)',
				background: 'rgba(17,24,39,0.03)',
				color: 'var(--tf-muted)',
				fontSize: 'calc(11px * var(--tf-font-scale))',
				fontWeight: 800,
				padding: '4px 8px',
				borderRadius: 999,
				letterSpacing: '0.08em',
				textTransform: 'uppercase',
				display: 'inline-flex',
				alignItems: 'center',
				gap: 6,
			}

			const textPrimaryStyle: CSSProperties = {
				margin: 0,
				fontSize: 'calc(26px * var(--tf-font-scale))',
				lineHeight: 1.55,
				whiteSpace: 'pre-wrap',
				color: 'var(--tf-text)',
				fontWeight: 700,
				display: '-webkit-box',
				WebkitBoxOrient: 'vertical',
				WebkitLineClamp: String(hasMedia ? 10 : 16),
				overflow: 'hidden',
			}

			const textSecondaryStyle: CSSProperties = {
				margin: 0,
				fontSize: 'calc(18px * var(--tf-font-scale))',
				lineHeight: 1.55,
				whiteSpace: 'pre-wrap',
				color: 'var(--tf-muted)',
				opacity: 0.92,
				fontWeight: 600,
				display: '-webkit-box',
				WebkitBoxOrient: 'vertical',
				WebkitLineClamp: String(hasMedia ? 7 : 10),
				overflow: 'hidden',
			}

			const maxHeight =
				typeof node.maxHeight === 'number' ? node.maxHeight : undefined
			const opacity =
				typeof node.opacity === 'number' ? clamp01(node.opacity) : undefined

			return (
				<div
					data-tt-key={key}
					data-tt-type="ContentBlocks"
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 18,
						alignItems: 'stretch',
						maxHeight,
						overflow: maxHeight ? 'hidden' : undefined,
						opacity,
					}}
				>
					{mainMedia
						? renderMainMediaCard(mainMedia as any, ctx.assets, {
								extraCount,
								videoMode: ctx.videoMode,
							})
						: null}

					<div style={{ minWidth: 0 }}>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
							<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
								{hasZhTranslation && secondary ? (
									<span style={{ ...tagStyle, opacity: 0.75 }}>ORIGINAL</span>
								) : null}
								<span style={tagStyle}>
									<span
										style={{
											width: 8,
											height: 8,
											background: 'var(--tf-accent)',
											borderRadius: 999,
											display: 'inline-block',
										}}
									/>
									{hasZhTranslation ? 'TRANSLATION' : 'TEXT'}
								</span>
							</div>
							{secondary ? <p style={textSecondaryStyle}>{secondary}</p> : null}
							{primary ? <p style={textPrimaryStyle}>{primary}</p> : null}
						</div>
					</div>
				</div>
			)
		}

		const gap = typeof node.gap === 'number' ? node.gap : 14
		const maxHeight =
			typeof node.maxHeight === 'number' ? node.maxHeight : undefined
		const opacity =
			typeof node.opacity === 'number' ? clamp01(node.opacity) : undefined

		return (
			<div
				data-tt-key={key}
				data-tt-type="ContentBlocks"
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap,
					maxHeight,
					overflow: maxHeight ? 'hidden' : undefined,
					opacity,
				}}
			>
				{renderBlocks(displayBlocks, ctx.assets, ctx.videoMode)}
				{hasZhTranslation && secondaryText ? (
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

	if (node.type === 'Image') {
		const url = resolveAssetUrl(String(node.assetId), ctx.assets)
		const fit = node.fit === 'contain' ? 'contain' : 'cover'
		const position =
			typeof node.position === 'string' && node.position.trim()
				? node.position
				: undefined
		const opacity =
			typeof node.opacity === 'number' ? clamp01(node.opacity) : undefined
		const blur = typeof node.blur === 'number' ? Math.max(0, node.blur) : 0
		const width = typeof node.width === 'number' ? node.width : undefined
		const height = typeof node.height === 'number' ? node.height : undefined
		const radius = typeof node.radius === 'number' ? node.radius : 0
		const border = node.border ? '1px solid var(--tf-border)' : undefined
		const background = node.background ?? 'var(--tf-surface)'

		if (url) {
			return (
				<Img
					src={url}
					data-tt-key={key}
					data-tt-type="Image"
					style={{
						display: 'block',
						width: width ?? '100%',
						height: height ?? 'auto',
						objectFit: fit,
						objectPosition: position,
						borderRadius: radius,
						border,
						background,
						opacity,
						filter: blur > 0 ? `blur(${blur}px)` : undefined,
					}}
				/>
			)
		}

		return (
			<div
				data-tt-key={key}
				data-tt-type="Image"
				style={{
					border: border ?? '1px dashed var(--tf-border)',
					background,
					borderRadius: radius,
					padding: 14,
					fontSize: 'calc(14px * var(--tf-font-scale))',
					color: 'var(--tf-muted)',
					boxSizing: 'border-box',
					width: width ?? '100%',
					height: height ?? undefined,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					textAlign: 'center',
					opacity,
					filter: blur > 0 ? `blur(${blur}px)` : undefined,
				}}
			>
				[image: {String(node.assetId)}]
			</div>
		)
	}

	if (node.type === 'Video') {
		const assetId = String(node.assetId)
		const url = resolveAssetUrl(assetId, ctx.assets)
		const fit = node.fit === 'contain' ? 'contain' : 'cover'
		const position =
			typeof node.position === 'string' && node.position.trim()
				? node.position
				: undefined
		const videoMode = ctx.videoMode ?? 'inline'
		const isSentinelAssetId = assetId.startsWith('__') && assetId.endsWith('__')
		const opacity =
			typeof node.opacity === 'number' ? clamp01(node.opacity) : undefined
		const blur = typeof node.blur === 'number' ? Math.max(0, node.blur) : 0
		const width = typeof node.width === 'number' ? node.width : undefined
		const height = typeof node.height === 'number' ? node.height : undefined
		const radius = typeof node.radius === 'number' ? node.radius : 0
		const border = node.border ? '1px solid var(--tf-border)' : undefined
		const background = node.background ?? 'rgba(17,24,39,0.06)'

		if (url && videoMode === 'inline') {
			return (
				<Video
					src={url}
					muted
					loop
					data-tt-key={key}
					data-tt-type="Video"
					style={{
						display: 'block',
						width: width ?? '100%',
						height: height ?? 'auto',
						objectFit: fit,
						objectPosition: position,
						borderRadius: radius,
						border,
						backgroundColor: background,
						opacity,
						filter: blur > 0 ? `blur(${blur}px)` : undefined,
					}}
				/>
			)
		}

		if (videoMode === 'inline' && !url && isSentinelAssetId) {
			return null
		}

		if (videoMode === 'placeholder') {
			return (
				<div
					data-tt-key={key}
					data-tt-type="Video"
					style={{
						background,
						borderRadius: radius,
						border,
						opacity,
						filter: blur > 0 ? `blur(${blur}px)` : undefined,
						boxSizing: 'border-box',
						width: width ?? '100%',
						height: height ?? undefined,
						overflow: 'hidden',
					}}
				/>
			)
		}

		return (
			<div
				data-tt-key={key}
				data-tt-type="Video"
				style={{
					border: border ?? '1px dashed var(--tf-border)',
					background: 'var(--tf-surface)',
					borderRadius: radius,
					padding: 14,
					fontSize: 'calc(14px * var(--tf-font-scale))',
					color: 'var(--tf-muted)',
					boxSizing: 'border-box',
					width: width ?? '100%',
					height: height ?? undefined,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					textAlign: 'center',
					opacity,
					filter: blur > 0 ? `blur(${blur}px)` : undefined,
				}}
			>
				[video: {String(node.assetId)}]
			</div>
		)
	}

	if (node.type === 'Spacer') {
		const size = typeof node.size === 'number' ? node.size : undefined
		const width =
			typeof node.width === 'number'
				? node.width
				: node.axis === 'x'
					? (size ?? 0)
					: undefined
		const height =
			typeof node.height === 'number'
				? node.height
				: node.axis === 'y'
					? (size ?? 0)
					: undefined

		return (
			<div
				data-tt-key={key}
				data-tt-type="Spacer"
				style={{
					width,
					height,
					flex: '0 0 auto',
				}}
			/>
		)
	}

	if (node.type === 'Divider') {
		const thickness = typeof node.thickness === 'number' ? node.thickness : 1
		const length = typeof node.length === 'number' ? node.length : undefined
		const axis = node.axis === 'y' ? 'y' : 'x'
		const margin = typeof node.margin === 'number' ? node.margin : 0
		const opacity = typeof node.opacity === 'number' ? clamp01(node.opacity) : 1
		const color = node.color ?? 'var(--tf-border)'

		const style: CSSProperties =
			axis === 'y'
				? {
						width: thickness,
						height: length ?? '100%',
						marginLeft: margin,
						marginRight: margin,
						backgroundColor: color,
						opacity,
						flex: '0 0 auto',
					}
				: {
						height: thickness,
						width: length ?? '100%',
						marginTop: margin,
						marginBottom: margin,
						backgroundColor: color,
						opacity,
						flex: '0 0 auto',
					}

		return <div data-tt-key={key} data-tt-type="Divider" style={style} />
	}

	if (node.type === 'Stack') {
		const hasGapXY =
			typeof node.gapX === 'number' || typeof node.gapY === 'number'
		const paddingX =
			typeof node.paddingX === 'number'
				? node.paddingX
				: typeof node.padding === 'number'
					? node.padding
					: undefined
		const paddingY =
			typeof node.paddingY === 'number'
				? node.paddingY
				: typeof node.padding === 'number'
					? node.padding
					: undefined
		const flex = typeof node.flex === 'number' ? node.flex : undefined
		const borderWidth =
			node.border && typeof node.borderWidth === 'number' ? node.borderWidth : 1
		const borderColor =
			node.borderColor === 'primary'
				? 'var(--tf-text)'
				: node.borderColor === 'muted'
					? 'var(--tf-muted)'
					: node.borderColor === 'accent'
						? 'var(--tf-accent)'
						: 'var(--tf-border)'
		const style: CSSProperties = {
			...(opts?.isRoot ? null : { position: 'relative' }),
			display: 'flex',
			flexDirection: node.direction === 'row' ? 'row' : 'column',
			flex,
			opacity:
				typeof node.opacity === 'number' ? clamp01(node.opacity) : undefined,
			minWidth: flex != null ? 0 : undefined,
			minHeight: flex != null ? 0 : undefined,
			overflow: node.overflow === 'hidden' ? 'hidden' : undefined,
			gap: !hasGapXY && typeof node.gap === 'number' ? node.gap : undefined,
			columnGap: hasGapXY
				? typeof node.gapX === 'number'
					? node.gapX
					: typeof node.gap === 'number'
						? node.gap
						: undefined
				: undefined,
			rowGap: hasGapXY
				? typeof node.gapY === 'number'
					? node.gapY
					: typeof node.gap === 'number'
						? node.gap
						: undefined
				: undefined,
			paddingLeft: paddingX,
			paddingRight: paddingX,
			paddingTop: paddingY,
			paddingBottom: paddingY,
			border: node.border
				? `${Math.max(1, Math.round(borderWidth))}px solid ${borderColor}`
				: undefined,
			background: node.background ?? undefined,
			borderRadius: typeof node.radius === 'number' ? node.radius : undefined,
			...(typeof node.width === 'number' ? { width: node.width } : null),
			...(typeof node.height === 'number' ? { height: node.height } : null),
			...(typeof node.maxWidth === 'number' ? { maxWidth: node.maxWidth } : null),
			...(typeof node.maxHeight === 'number'
				? { maxHeight: node.maxHeight }
				: null),
			boxSizing: 'border-box',
			alignItems:
				node.align === 'center'
					? 'center'
					: node.align === 'end'
						? 'flex-end'
						: node.align === 'stretch'
							? 'stretch'
							: 'stretch',
			justifyContent:
				node.justify === 'center'
					? 'center'
					: node.justify === 'end'
						? 'flex-end'
						: node.justify === 'between'
							? 'space-between'
							: 'flex-start',
		}

		const children = (node.children ?? []).map(
			(c: ThreadRenderTreeNode, idx: number) => (
				<React.Fragment key={idx}>
					{renderThreadTemplateNode(c, ctx, {
						path: [...path, 'children', idx],
					})}
				</React.Fragment>
			),
		)

		if (opts?.isRoot) {
			return (
				<AbsoluteFill data-tt-key={key} data-tt-type="Stack" style={style}>
					{children}
				</AbsoluteFill>
			)
		}
		return (
			<div data-tt-key={key} data-tt-type="Stack" style={style}>
				{children}
			</div>
		)
	}

	if (node.type === 'Grid') {
		const columns = typeof node.columns === 'number' ? node.columns : 2
		const hasGapXY =
			typeof node.gapX === 'number' || typeof node.gapY === 'number'
		const paddingX =
			typeof node.paddingX === 'number'
				? node.paddingX
				: typeof node.padding === 'number'
					? node.padding
					: undefined
		const paddingY =
			typeof node.paddingY === 'number'
				? node.paddingY
				: typeof node.padding === 'number'
					? node.padding
					: undefined
		const flex = typeof node.flex === 'number' ? node.flex : undefined
		const borderWidth =
			node.border && typeof node.borderWidth === 'number' ? node.borderWidth : 1
		const borderColor =
			node.borderColor === 'primary'
				? 'var(--tf-text)'
				: node.borderColor === 'muted'
					? 'var(--tf-muted)'
					: node.borderColor === 'accent'
						? 'var(--tf-accent)'
						: 'var(--tf-border)'
		const alignItems =
			node.align === 'center'
				? 'center'
				: node.align === 'end'
					? 'end'
					: node.align === 'stretch'
						? 'stretch'
						: 'start'
		const justifyItems =
			node.justify === 'center'
				? 'center'
				: node.justify === 'end'
					? 'end'
					: node.justify === 'stretch'
						? 'stretch'
						: 'start'
		const style: CSSProperties = {
			...(opts?.isRoot ? null : { position: 'relative' }),
			display: 'grid',
			flex,
			opacity:
				typeof node.opacity === 'number' ? clamp01(node.opacity) : undefined,
			minWidth: flex != null ? 0 : undefined,
			minHeight: flex != null ? 0 : undefined,
			overflow: node.overflow === 'hidden' ? 'hidden' : undefined,
			gridTemplateColumns: `repeat(${Math.max(1, Math.floor(columns))}, minmax(0, 1fr))`,
			gap: !hasGapXY && typeof node.gap === 'number' ? node.gap : undefined,
			columnGap: hasGapXY
				? typeof node.gapX === 'number'
					? node.gapX
					: typeof node.gap === 'number'
						? node.gap
						: undefined
				: undefined,
			rowGap: hasGapXY
				? typeof node.gapY === 'number'
					? node.gapY
					: typeof node.gap === 'number'
						? node.gap
						: undefined
				: undefined,
			paddingLeft: paddingX,
			paddingRight: paddingX,
			paddingTop: paddingY,
			paddingBottom: paddingY,
			border: node.border
				? `${Math.max(1, Math.round(borderWidth))}px solid ${borderColor}`
				: undefined,
			background: node.background ?? undefined,
			borderRadius: typeof node.radius === 'number' ? node.radius : undefined,
			...(typeof node.width === 'number' ? { width: node.width } : null),
			...(typeof node.height === 'number' ? { height: node.height } : null),
			...(typeof node.maxWidth === 'number' ? { maxWidth: node.maxWidth } : null),
			...(typeof node.maxHeight === 'number'
				? { maxHeight: node.maxHeight }
				: null),
			alignItems,
			justifyItems,
			boxSizing: 'border-box',
		}

		const children = (node.children ?? []).map(
			(c: ThreadRenderTreeNode, idx: number) => (
				<React.Fragment key={idx}>
					{renderThreadTemplateNode(c, ctx, {
						path: [...path, 'children', idx],
					})}
				</React.Fragment>
			),
		)

		if (opts?.isRoot) {
			return (
				<AbsoluteFill data-tt-key={key} data-tt-type="Grid" style={style}>
					{children}
				</AbsoluteFill>
			)
		}
		return (
			<div data-tt-key={key} data-tt-type="Grid" style={style}>
				{children}
			</div>
		)
	}

	if (node.type === 'Absolute') {
		const transforms: string[] = []
		if (typeof node.rotate === 'number')
			transforms.push(`rotate(${node.rotate}deg)`)
		if (typeof node.scale === 'number') transforms.push(`scale(${node.scale})`)
		const origin =
			node.origin === 'top-left'
				? 'top left'
				: node.origin === 'top-right'
					? 'top right'
					: node.origin === 'bottom-left'
						? 'bottom left'
						: node.origin === 'bottom-right'
							? 'bottom right'
							: node.origin === 'center'
								? 'center'
								: undefined
		const style: CSSProperties = {
			position: 'absolute',
			left: typeof node.x === 'number' ? node.x : undefined,
			top: typeof node.y === 'number' ? node.y : undefined,
			width: typeof node.width === 'number' ? node.width : undefined,
			height: typeof node.height === 'number' ? node.height : undefined,
			zIndex: typeof node.zIndex === 'number' ? node.zIndex : undefined,
			opacity:
				typeof node.opacity === 'number' ? clamp01(node.opacity) : undefined,
			pointerEvents: node.pointerEvents === false ? 'none' : undefined,
			transform: transforms.length ? transforms.join(' ') : undefined,
			transformOrigin: origin,
			boxSizing: 'border-box',
		}

		const children = (node.children ?? []).map(
			(c: ThreadRenderTreeNode, idx: number) => (
				<React.Fragment key={idx}>
					{renderThreadTemplateNode(c, ctx, {
						path: [...path, 'children', idx],
					})}
				</React.Fragment>
			),
		)

		return (
			<div data-tt-key={key} data-tt-type="Absolute" style={style}>
				{children}
			</div>
		)
	}

	if (node.type === 'Box') {
		const paddingX =
			typeof node.paddingX === 'number'
				? node.paddingX
				: typeof node.padding === 'number'
					? node.padding
					: undefined
		const paddingY =
			typeof node.paddingY === 'number'
				? node.paddingY
				: typeof node.padding === 'number'
					? node.padding
					: undefined
		const flex = typeof node.flex === 'number' ? node.flex : undefined
		const borderWidth =
			node.border && typeof node.borderWidth === 'number' ? node.borderWidth : 1
		const borderColor =
			node.borderColor === 'primary'
				? 'var(--tf-text)'
				: node.borderColor === 'muted'
					? 'var(--tf-muted)'
					: node.borderColor === 'accent'
						? 'var(--tf-accent)'
						: 'var(--tf-border)'
		const style: CSSProperties = {
			...(opts?.isRoot ? null : { position: 'relative' }),
			flex,
			opacity:
				typeof node.opacity === 'number' ? clamp01(node.opacity) : undefined,
			minWidth: flex != null ? 0 : undefined,
			minHeight: flex != null ? 0 : undefined,
			overflow: node.overflow === 'hidden' ? 'hidden' : undefined,
			paddingLeft: paddingX,
			paddingRight: paddingX,
			paddingTop: paddingY,
			paddingBottom: paddingY,
			border: node.border
				? `${Math.max(1, Math.round(borderWidth))}px solid ${borderColor}`
				: undefined,
			background: node.background ?? undefined,
			borderRadius: typeof node.radius === 'number' ? node.radius : undefined,
			...(typeof node.width === 'number' ? { width: node.width } : null),
			...(typeof node.height === 'number' ? { height: node.height } : null),
			...(typeof node.maxWidth === 'number' ? { maxWidth: node.maxWidth } : null),
			...(typeof node.maxHeight === 'number'
				? { maxHeight: node.maxHeight }
				: null),
			boxSizing: 'border-box',
		}
		const children = (node.children ?? []).map(
			(c: ThreadRenderTreeNode, idx: number) => (
				<React.Fragment key={idx}>
					{renderThreadTemplateNode(c, ctx, {
						path: [...path, 'children', idx],
					})}
				</React.Fragment>
			),
		)
		if (opts?.isRoot)
			return (
				<AbsoluteFill data-tt-key={key} data-tt-type="Box" style={style}>
					{children}
				</AbsoluteFill>
			)
		return (
			<div data-tt-key={key} data-tt-type="Box" style={style}>
				{children}
			</div>
		)
	}

	return null
}

function renderBlocks(
	blocks: ThreadVideoInputProps['root']['contentBlocks'],
	assets: ThreadVideoInputProps['assets'] | undefined,
	videoMode: 'inline' | 'placeholder' = 'inline',
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
						background: 'var(--tf-surface)',
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
								background: 'rgba(17,24,39,0.03)',
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
						background: 'rgba(17,24,39,0.03)',
						padding: 18,
						fontSize: 'calc(16px * var(--tf-font-scale))',
						color: 'var(--tf-muted)',
					}}
				>
					{url && videoMode === 'inline' ? (
						<Video
							src={url}
							muted
							loop
							style={{
								display: 'block',
								width: '100%',
								maxHeight: 520,
								borderRadius: 0,
								border: '1px solid var(--tf-border)',
								backgroundColor: 'rgba(17,24,39,0.06)',
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
						background: 'var(--tf-surface)',
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
		const durationInFrames = Math.max(
			1,
			Math.floor(durationsInFrames[idx] ?? 1),
		)
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
	return [
		{ id: `text:${post.id}`, type: 'text', data: { text } },
		...rest,
	] as any
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
							background: 'rgba(17,24,39,0.04)',
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
							<div
								style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
							>
								<div
									style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
								>
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

function RepliesListHeader({
	thread,
	replies,
	replyDurationsInFrames,
	fps,
}: {
	thread: ThreadVideoInputProps['thread']
	replies: ThreadVideoInputProps['replies']
	replyDurationsInFrames: number[]
	fps: number
}) {
	const frame = useCurrentFrame()
	const { idx: activeIdx } = React.useMemo(
		() => locateSegmentForFrame(frame, replyDurationsInFrames),
		[frame, replyDurationsInFrames],
	)
	const replyIndicator =
		replies.length > 0
			? `REPLY ${activeIdx + 1}/${replies.length}`
			: 'REPLIES 0'

	return (
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
					minWidth: 0,
				}}
			>
				<span
					style={{
						width: 10,
						height: 10,
						background: 'var(--tf-accent)',
						flex: '0 0 auto',
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
	)
}

function RepliesListRootPost({
	templateConfig,
	chromeless,
	thread,
	root,
	replies,
	replyDurationsInFrames,
	coverDurationInFrames,
	assets,
	fps,
	rootRoot,
	rootRootPath,
	wrapRootRoot,
}: {
	templateConfig: ThreadVideoInputProps['templateConfig'] | undefined
	chromeless?: boolean
	thread: ThreadVideoInputProps['thread']
	root: ThreadVideoInputProps['root']
	replies: ThreadVideoInputProps['replies']
	replyDurationsInFrames: number[]
	coverDurationInFrames: number
	assets: ThreadVideoInputProps['assets'] | undefined
	fps: number
	rootRoot?: ThreadRenderTreeNode
	rootRootPath?: Array<string | number>
	wrapRootRoot?: boolean
}) {
	const frame = useCurrentFrame()
	const totalRepliesFrames = React.useMemo(
		() => replyDurationsInFrames.reduce((sum, d) => sum + d, 0),
		[replyDurationsInFrames],
	)
	const rootScrollProgress =
		totalRepliesFrames > 0 ? clamp01(frame / totalRepliesFrames) : 0

	if (rootRoot) {
		const inner = (
			<>
				{renderThreadTemplateNode(
					rootRoot,
					{
						templateConfig,
						scene: 'post',
						frame,
						thread,
						root,
						post: root,
						replies,
						assets,
						coverDurationInFrames,
						replyDurationsInFrames,
						fps,
					},
					{ path: rootRootPath },
				)}
			</>
		)

		return wrapRootRoot === true ? (
			<div
				style={{
					border: '1px solid var(--tf-border)',
					background: 'var(--tf-surface)',
					padding: 28,
					boxSizing: 'border-box',
					height: '100%',
					minHeight: 0,
				}}
			>
				{inner}
			</div>
		) : (
			inner
		)
	}

	return (
		<PostCard
			post={root}
			assets={assets}
			title="ROOT"
			showLikes
			chromeless={chromeless}
			scrollProgress={rootScrollProgress}
		/>
	)
}

function RepliesListReplies({
	templateConfig,
	thread,
	root,
	replies,
	replyDurationsInFrames,
	coverDurationInFrames,
	assets,
	fps,
	itemRoot,
	itemRootPath,
	wrapItemRoot,
	gap,
	highlight,
}: {
	templateConfig: ThreadVideoInputProps['templateConfig'] | undefined
	thread: ThreadVideoInputProps['thread']
	root: ThreadVideoInputProps['root']
	replies: ThreadVideoInputProps['replies']
	replyDurationsInFrames: number[]
	coverDurationInFrames: number
	assets: ThreadVideoInputProps['assets'] | undefined
	fps: number
	itemRoot?: ThreadRenderTreeNode
	itemRootPath?: Array<string | number>
	wrapItemRoot?: boolean
	gap?: number
	highlight?: {
		enabled?: boolean
		color?: 'primary' | 'muted' | 'accent'
		thickness?: number
		radius?: number
		opacity?: number
	}
}) {
	const frame = useCurrentFrame()

	const {
		idx: activeIdx,
		localFrame,
		durationInFrames,
	} = React.useMemo(
		() => locateSegmentForFrame(frame, replyDurationsInFrames),
		[frame, replyDurationsInFrames],
	)

	const rightViewportRef = React.useRef<HTMLDivElement | null>(null)
	const rightContentRef = React.useRef<HTMLDivElement | null>(null)
	const [rightItemTops, setRightItemTops] = React.useState<number[] | null>(
		null,
	)
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
			setRightMaxScrollY(
				Math.max(0, content.scrollHeight - viewport.clientHeight),
			)
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

		const paddingTop = 0
		const startRaw = rightItemTops[activeIdx] ?? 0
		const startY = Math.max(0, startRaw - paddingTop)
		const endRaw = rightItemTops[activeIdx + 1]
		const endY =
			typeof endRaw === 'number' ? Math.max(0, endRaw - paddingTop) : startY

		const target = lerp(startY, endY, transition.t)
		return Math.max(0, Math.min(rightMaxScrollY, target))
	}, [activeIdx, replies.length, rightItemTops, rightMaxScrollY, transition.t])

	return (
		<div
			ref={rightViewportRef}
			style={{
				width: '100%',
				height: '100%',
				minHeight: 0,
				overflow: 'hidden',
			}}
		>
			<div
				ref={rightContentRef}
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap: typeof gap === 'number' ? gap : 16,
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
							const enabled = highlight?.enabled !== false
							if (!enabled) return null

							const isCurrent = idx === activeIdx
							const isNext = idx === activeIdx + 1
							const strength = isCurrent
								? 1 - transition.t
								: isNext
									? transition.t
									: 0
							if (strength <= 0) return null
							const color =
								highlight?.color === 'primary'
									? 'var(--tf-text)'
									: highlight?.color === 'muted'
										? 'var(--tf-muted)'
										: 'var(--tf-accent)'
							const thickness =
								typeof highlight?.thickness === 'number'
									? highlight.thickness
									: 2
							const radius =
								typeof highlight?.radius === 'number' ? highlight.radius : 0
							const opacityScale =
								typeof highlight?.opacity === 'number'
									? clamp01(highlight.opacity)
									: 1
							return (
								<div
									style={{
										position: 'absolute',
										inset: 0,
										border: `${Math.max(1, Math.round(thickness))}px solid ${color}`,
										borderRadius: radius > 0 ? radius : undefined,
										opacity: strength * opacityScale,
										pointerEvents: 'none',
										boxSizing: 'border-box',
									}}
								/>
							)
						})()}
							{itemRoot ? (
								wrapItemRoot ? (
									<div
									style={{
										border: '1px solid var(--tf-border)',
										background: 'var(--tf-surface)',
										padding: 28,
										boxSizing: 'border-box',
									}}
									>
										{renderThreadTemplateNode(
											itemRoot,
											{
												templateConfig,
												scene: 'post',
												thread,
												root,
												post: reply,
												replies,
												assets,
												coverDurationInFrames,
												replyDurationsInFrames,
												fps,
											},
											{ path: itemRootPath },
										)}
									</div>
								) : (
									<>
										{renderThreadTemplateNode(
											itemRoot,
											{
												templateConfig,
												scene: 'post',
												thread,
												root,
												post: reply,
												replies,
												assets,
												coverDurationInFrames,
												replyDurationsInFrames,
												fps,
											},
											{ path: itemRootPath },
										)}
									</>
								)
							) : (
							<PostCard
								post={reply as any}
								assets={assets}
								title={`REPLY ${idx + 1}`}
								showLikes
								chromeless={false}
								bilingualPrimary="zh"
								secondaryPlacement="above"
							/>
						)}
					</div>
				))}
			</div>
		</div>
	)
}

function RepliesRepeat({
	templateConfig,
	scene,
	frame,
	thread,
	root,
	replies,
	replyDurationsInFrames,
	coverDurationInFrames,
	assets,
	fps,
	itemRoot,
	itemRootPath,
	wrapItemRoot,
	gap,
	scroll,
	maxItems,
	highlight,
}: {
	templateConfig: ThreadVideoInputProps['templateConfig'] | undefined
	scene?: 'cover' | 'post'
	frame?: number
	thread: ThreadVideoInputProps['thread']
	root: ThreadVideoInputProps['root']
	replies: ThreadVideoInputProps['replies']
	replyDurationsInFrames: number[]
	coverDurationInFrames: number
	assets: ThreadVideoInputProps['assets'] | undefined
	fps: number
	itemRoot: ThreadRenderTreeNode
	itemRootPath?: Array<string | number>
	wrapItemRoot?: boolean
	gap?: number
	scroll?: boolean
	maxItems?: number
	highlight?: {
		enabled?: boolean
		color?: 'primary' | 'muted' | 'accent'
		thickness?: number
		radius?: number
		opacity?: number
	}
}) {
	const localFrame =
		typeof frame === 'number'
			? Math.max(0, scene === 'post' ? frame - coverDurationInFrames : frame)
			: 0

	const {
		idx: activeIdxRaw,
		localFrame: segmentFrame,
		durationInFrames,
	} = React.useMemo(
		() => locateSegmentForFrame(localFrame, replyDurationsInFrames),
		[localFrame, replyDurationsInFrames],
	)

	const safeMaxItems =
		typeof maxItems === 'number'
			? Math.max(1, Math.min(100, Math.floor(maxItems)))
			: 50
	const repliesToRender = replies.slice(0, safeMaxItems)
	const activeIdx =
		repliesToRender.length > 0
			? Math.min(activeIdxRaw, repliesToRender.length - 1)
			: 0

	const viewportRef = React.useRef<HTMLDivElement | null>(null)
	const contentRef = React.useRef<HTMLDivElement | null>(null)
	const [itemTops, setItemTops] = React.useState<number[] | null>(null)
	const [maxScrollY, setMaxScrollY] = React.useState(0)

	React.useLayoutEffect(() => {
		if (scroll === false) return
		const viewport = viewportRef.current
		const content = contentRef.current
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
			setItemTops(tops.length > 0 ? tops : null)
			setMaxScrollY(Math.max(0, content.scrollHeight - viewport.clientHeight))
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
	}, [repliesToRender.length, scroll])

	const transition = React.useMemo(() => {
		const dur = Math.max(1, durationInFrames)
		const transitionFrames = Math.max(8, Math.min(dur, Math.round(fps * 0.35)))
		const startAt = Math.max(0, dur - transitionFrames)
		const t = (segmentFrame - startAt) / transitionFrames
		return { t: clamp01(t), startAt, transitionFrames }
	}, [durationInFrames, fps, segmentFrame])

	const scrollY = React.useMemo(() => {
		if (scroll === false) return 0
		if (repliesToRender.length === 0) return 0
		if (!itemTops || itemTops.length === 0) return 0

		const paddingTop = 0
		const startRaw = itemTops[activeIdx] ?? 0
		const startY = Math.max(0, startRaw - paddingTop)
		const endRaw = itemTops[activeIdx + 1]
		const endY =
			typeof endRaw === 'number' ? Math.max(0, endRaw - paddingTop) : startY

		const target = lerp(startY, endY, transition.t)
		return Math.max(0, Math.min(maxScrollY, target))
	}, [
		activeIdx,
		itemTops,
		maxScrollY,
		repliesToRender.length,
		scroll,
		transition.t,
	])

	const chrome = wrapItemRoot
		? {
				border: '1px solid var(--tf-border)',
				background: 'var(--tf-surface)',
				padding: 28,
				boxSizing: 'border-box' as const,
			}
		: null

	return (
		<div
			ref={viewportRef}
			style={{
				width: '100%',
				height: '100%',
				minHeight: 0,
				overflow: 'hidden',
			}}
		>
			<div
				ref={contentRef}
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap: typeof gap === 'number' ? gap : 16,
					transform: scroll === false ? undefined : `translateY(-${scrollY}px)`,
					willChange: scroll === false ? undefined : 'transform',
				}}
			>
				{repliesToRender.map((reply, idx) => (
					<div
						key={reply.id}
						data-reply-idx={idx}
						style={{ position: 'relative' }}
					>
						{(() => {
							const enabled = highlight?.enabled !== false
							if (!enabled) return null

							const isCurrent = idx === activeIdx
							const isNext = idx === activeIdx + 1
							const strength = isCurrent
								? 1 - transition.t
								: isNext
									? transition.t
									: 0
							if (strength <= 0) return null
							const color =
								highlight?.color === 'primary'
									? 'var(--tf-text)'
									: highlight?.color === 'muted'
										? 'var(--tf-muted)'
										: 'var(--tf-accent)'
							const thickness =
								typeof highlight?.thickness === 'number'
									? highlight.thickness
									: 2
							const radius =
								typeof highlight?.radius === 'number' ? highlight.radius : 0
							const opacityScale =
								typeof highlight?.opacity === 'number'
									? clamp01(highlight.opacity)
									: 1
							return (
								<div
									style={{
										position: 'absolute',
										inset: 0,
										border: `${Math.max(1, Math.round(thickness))}px solid ${color}`,
										borderRadius: radius > 0 ? radius : undefined,
										opacity: strength * opacityScale,
										pointerEvents: 'none',
										boxSizing: 'border-box',
									}}
								/>
							)
						})()}
							{chrome ? (
								<div style={chrome}>
									{renderThreadTemplateNode(
										itemRoot,
										{
											templateConfig,
											scene: 'post',
											frame,
											thread,
											root,
											post: reply,
											replies,
											assets,
											coverDurationInFrames,
											replyDurationsInFrames,
											fps,
										},
										{ path: itemRootPath },
									)}
								</div>
							) : (
								<>
									{renderThreadTemplateNode(
										itemRoot,
										{
											templateConfig,
											scene: 'post',
											frame,
											thread,
											root,
											post: reply,
											replies,
											assets,
											coverDurationInFrames,
											replyDurationsInFrames,
											fps,
										},
										{ path: itemRootPath },
									)}
								</>
							)}
					</div>
				))}
			</div>
		</div>
	)
}

function PostCard({
	post,
	assets,
	title,
	showLikes,
	chromeless,
	bilingualPrimary = 'zh',
	secondaryPlacement = 'below',
	scrollProgress,
}: {
	post: ThreadVideoInputProps['root']
	assets: ThreadVideoInputProps['assets'] | undefined
	title: string
	showLikes?: boolean
	chromeless?: boolean
	bilingualPrimary?: BilingualPrimary
	secondaryPlacement?: SecondaryPlacement
	scrollProgress?: number
}) {
	const { primaryText, secondaryText } = resolveBilingualPostText(
		post,
		bilingualPrimary,
	)
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

	const bodyScrollY = isScrollable
		? bodyMaxScrollY * clamp01(scrollProgress!)
		: 0

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 16,
				...(chromeless
					? {}
					: {
							border: '1px solid var(--tf-border)',
							background: 'var(--tf-surface)',
							padding: 28,
						}),
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
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 10,
							color: 'var(--tf-muted)',
						}}
					>
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
						background: 'rgba(17,24,39,0.04)',
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
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 2,
						minWidth: 0,
					}}
				>
					<div
						style={{
							fontWeight: 800,
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}
					>
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
	templateConfig,
	thread,
	root,
	replies,
	replyDurationsInFrames,
	coverDurationInFrames,
	assets,
	fps,
	rootRoot,
	rootRootPath,
	wrapRootRoot,
	itemRoot,
	itemRootPath,
	wrapItemRoot,
	repliesGap,
	repliesHighlight,
}: {
	templateConfig: ThreadVideoInputProps['templateConfig'] | undefined
	thread: ThreadVideoInputProps['thread']
	root: ThreadVideoInputProps['root']
	replies: ThreadVideoInputProps['replies']
	replyDurationsInFrames: number[]
	coverDurationInFrames: number
	assets: ThreadVideoInputProps['assets'] | undefined
	fps: number
	rootRoot?: ThreadRenderTreeNode
	rootRootPath?: Array<string | number>
	wrapRootRoot?: boolean
	itemRoot?: ThreadRenderTreeNode
	itemRootPath?: Array<string | number>
	wrapItemRoot?: boolean
	repliesGap?: number
	repliesHighlight?: {
		enabled?: boolean
		color?: 'primary' | 'muted' | 'accent'
		thickness?: number
		radius?: number
		opacity?: number
	}
}) {
	const frame = useCurrentFrame()
	const opacity = interpolate(frame, [0, Math.min(fps * 0.3, 18)], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	})

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
			<RepliesListHeader
				thread={thread}
				replies={replies}
				replyDurationsInFrames={replyDurationsInFrames}
				fps={fps}
			/>

			<div
				style={{
					marginTop: 18,
					display: 'flex',
					gap: 22,
					height: 'calc(100% - 70px)',
				}}
			>
				<div style={{ flex: '0 0 58%', minHeight: 0 }}>
						<RepliesListRootPost
							templateConfig={templateConfig}
							thread={thread}
							root={root}
						replies={replies}
						replyDurationsInFrames={replyDurationsInFrames}
						coverDurationInFrames={coverDurationInFrames}
							assets={assets}
							fps={fps}
							rootRoot={rootRoot}
							rootRootPath={rootRootPath}
							wrapRootRoot={wrapRootRoot ?? Boolean(rootRoot)}
						/>
				</div>
				<div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex' }}>
					<div
						style={{
							flex: 1,
							minHeight: 0,
							overflow: 'hidden',
							border: '1px solid var(--tf-border)',
							background: 'var(--tf-surface)',
							padding: 18,
							boxSizing: 'border-box',
						}}
					>
							<RepliesListReplies
								templateConfig={templateConfig}
								thread={thread}
								root={root}
							replies={replies}
							replyDurationsInFrames={replyDurationsInFrames}
							coverDurationInFrames={coverDurationInFrames}
								assets={assets}
								fps={fps}
								itemRoot={itemRoot}
								itemRootPath={itemRootPath}
								wrapItemRoot={wrapItemRoot ?? Boolean(itemRoot)}
								gap={repliesGap}
								highlight={repliesHighlight}
							/>
					</div>
				</div>
			</div>
		</AbsoluteFill>
	)
}

export function ThreadForumVideo(props: ThreadVideoInputProps) {
	const {
		thread,
		audio,
		root,
		replies,
		assets,
		coverDurationInFrames,
		replyDurationsInFrames,
		fps,
		templateConfig,
	} = props
	const videoConfig = useVideoConfig()
	const frame = useCurrentFrame()
	const effectiveTemplateConfig =
		templateConfig ?? DEFAULT_THREAD_TEMPLATE_CONFIG
	const videoMode: 'inline' | 'placeholder' =
		(props as any)?.renderHints?.composeMode === 'compose-on-video'
			? 'placeholder'
			: 'inline'
	const coverRoot: ThreadRenderTreeNode =
		effectiveTemplateConfig.scenes?.cover?.root ??
		DEFAULT_THREAD_TEMPLATE_CONFIG.scenes!.cover!.root!
	const postRoot: ThreadRenderTreeNode =
		effectiveTemplateConfig.scenes?.post?.root ??
		DEFAULT_THREAD_TEMPLATE_CONFIG.scenes!.post!.root!
	const repliesTotalDuration = replyDurationsInFrames.reduce(
		(sum, f) => sum + f,
		0,
	)
	const mainDuration = Math.max(repliesTotalDuration, fps)

	const bgmDurationInFrames =
		audio?.durationMs && audio.durationMs > 0
			? Math.max(1, Math.round((audio.durationMs / 1000) * fps))
			: 0

	const totalDurationInFrames = videoConfig.durationInFrames
	const maxAudioLoops = 2000
	const audioLoops =
		audio?.url && bgmDurationInFrames > 0
			? Math.min(
					Math.ceil(totalDurationInFrames / bgmDurationInFrames),
					maxAudioLoops,
				)
			: 0

	const coverFadeDurationInFrames = Math.max(
		1,
		Math.min(coverDurationInFrames, Math.round(fps * 0.5)),
	)
	const coverOpacity =
		effectiveTemplateConfig.motion?.enabled === false
			? 1
			: interpolate(frame, [0, coverFadeDurationInFrames], [0, 1], {
					extrapolateLeft: 'clamp',
					extrapolateRight: 'clamp',
				})

	const activePost = React.useMemo(() => {
		const localFrame = Math.max(0, frame - coverDurationInFrames)
		const { idx } = locateSegmentForFrame(localFrame, replyDurationsInFrames)
		return replies[idx] ?? root
	}, [coverDurationInFrames, frame, replies, replyDurationsInFrames, root])

	return (
			<AbsoluteFill
				style={{
					...(buildCssVars(effectiveTemplateConfig) as any),
					background: 'var(--tf-bg)',
					color: 'var(--tf-text)',
					fontFamily: 'var(--tf-font-family)',
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
				<AbsoluteFill style={{ opacity: coverOpacity }}>
						{renderThreadTemplateNode(
							coverRoot,
							{
								templateConfig: effectiveTemplateConfig,
								videoMode,
								scene: 'cover',
								frame,
								thread,
								root,
							post: root,
							replies,
							assets,
							coverDurationInFrames,
							replyDurationsInFrames,
							fps,
						},
						{ isRoot: true },
					)}
				</AbsoluteFill>
			</Sequence>
			<Sequence
				layout="none"
				from={coverDurationInFrames}
				durationInFrames={mainDuration}
			>
					{renderThreadTemplateNode(
						postRoot,
						{
							templateConfig: effectiveTemplateConfig,
							videoMode,
							scene: 'post',
							frame,
							thread,
							root,
						post: activePost,
						replies,
						assets,
						coverDurationInFrames,
						replyDurationsInFrames,
						fps,
					},
					{ isRoot: true },
				)}
			</Sequence>
		</AbsoluteFill>
	)
}
