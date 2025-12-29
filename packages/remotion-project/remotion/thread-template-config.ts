import type { ThreadRenderTreeNode, ThreadTemplateConfigV1 } from './types'

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function clampNumber(value: unknown, min: number, max: number): number | null {
	if (typeof value !== 'number') return null
	if (!Number.isFinite(value)) return null
	return Math.min(max, Math.max(min, value))
}

function clampInt(value: unknown, min: number, max: number): number | null {
	const n = clampNumber(value, min, max)
	if (n == null) return null
	return Math.round(n)
}

function safeString(value: unknown, maxLen: number): string | null {
	if (typeof value !== 'string') return null
	const s = value.trim()
	if (!s) return null
	return s.length > maxLen ? s.slice(0, maxLen) : s
}

function safeCssValue(value: unknown, maxLen: number): string | null {
	const s = safeString(value, maxLen)
	if (!s) return null
	const lower = s.toLowerCase()
	if (
		lower.includes('url(') ||
		lower.includes('image-set(') ||
		lower.includes('image(') ||
		lower.includes('src(') ||
		lower.includes('http://') ||
		lower.includes('https://') ||
		lower.includes('ext:')
	) {
		return null
	}
	return s
}

function safeBoolean(value: unknown): boolean | null {
	return typeof value === 'boolean' ? value : null
}

type ColorToken = 'primary' | 'muted' | 'accent'

function safeColorToken(value: unknown): ColorToken | null {
	return value === 'primary' || value === 'muted' || value === 'accent' ? value : null
}

type BorderColorToken = 'border' | ColorToken

function safeBorderColorToken(value: unknown): BorderColorToken | null {
	return value === 'border' ? value : safeColorToken(value)
}

type TransformOriginToken =
	| 'center'
	| 'top-left'
	| 'top-right'
	| 'bottom-left'
	| 'bottom-right'

function safeTransformOriginToken(value: unknown): TransformOriginToken | null {
	return value === 'center' ||
		value === 'top-left' ||
		value === 'top-right' ||
		value === 'bottom-left' ||
		value === 'bottom-right'
		? value
		: null
}

const DEFAULT_SCENES: NonNullable<ThreadTemplateConfigV1['scenes']> = {
	cover: {
		root: {
			type: 'Stack',
			direction: 'column',
			gap: 26,
			paddingX: 80,
			paddingY: 80,
			maxWidth: 1500,
			children: [
				{
					type: 'Stack',
					direction: 'row',
					align: 'center',
					gap: 12,
					children: [
						{
							type: 'Box',
							width: 10,
							height: 10,
							background: 'var(--tf-accent)',
						},
						{
							type: 'Text',
							bind: 'thread.source',
							color: 'muted',
							size: 14,
							weight: 700,
							maxLines: 1,
						},
						{
							type: 'Text',
							bind: 'thread.sourceUrl',
							color: 'muted',
							size: 12,
							weight: 600,
							maxLines: 1,
						},
					],
				},
				{
					type: 'Text',
					bind: 'thread.title',
					size: 64,
					weight: 900,
					maxLines: 4,
				},
				{
					type: 'Stack',
					direction: 'row',
					align: 'center',
					gap: 14,
					children: [
						{
							type: 'Avatar',
							bind: 'root.author.avatarAssetId',
							size: 44,
							border: true,
							background: 'rgba(255,255,255,0.04)',
						},
						{
							type: 'Stack',
							direction: 'column',
							gap: 2,
							children: [
								{
									type: 'Text',
									bind: 'root.author.name',
									size: 16,
									weight: 800,
									maxLines: 1,
								},
								{
									type: 'Text',
									text: 'ROOT POST',
									color: 'muted',
									size: 12,
									weight: 700,
									maxLines: 1,
								},
							],
						},
					],
				},
				{
					type: 'Box',
					padding: 28,
					border: true,
					background: 'var(--tf-surface)',
					children: [
						{
							type: 'ContentBlocks',
							bind: 'root.contentBlocks',
							gap: 16,
							maxHeight: 900,
						},
					],
				},
				{
					type: 'Watermark',
					position: 'bottom-right',
					color: 'muted',
					size: 12,
					weight: 700,
					opacity: 0.7,
					padding: 18,
				},
			],
		},
	},
	post: {
		root: {
			type: 'Stack',
			direction: 'column',
			gapY: 18,
			padding: 64,
			children: [
				{
					type: 'Stack',
					direction: 'row',
					align: 'end',
					justify: 'between',
					gapX: 24,
					children: [
						{
							type: 'Stack',
							direction: 'row',
							align: 'center',
							gapX: 12,
							children: [
								{
									type: 'Box',
									width: 10,
									height: 10,
									background: 'var(--tf-accent)',
								},
								{
									type: 'Text',
									bind: 'thread.title',
									color: 'muted',
									size: 12,
									weight: 700,
									maxLines: 1,
								},
							],
						},
						{
							type: 'Text',
							bind: 'timeline.replyIndicator',
							color: 'muted',
							size: 12,
							weight: 700,
							maxLines: 1,
						},
					],
				},
				{
					type: 'Stack',
					direction: 'row',
					align: 'stretch',
					gapX: 22,
					flex: 1,
					children: [
						{
							type: 'Box',
							flex: 58,
							border: true,
							background: 'var(--tf-surface)',
							padding: 28,
							maxHeight: 2000,
							children: [{ type: 'Builtin', kind: 'repliesListRootPost' }],
						},
						{
							type: 'Box',
							flex: 42,
							maxHeight: 2000,
							border: true,
							background: 'rgba(255,255,255,0.02)',
							padding: 18,
							children: [{ type: 'Builtin', kind: 'repliesListReplies' }],
						},
					],
				},
				{
					type: 'Watermark',
					position: 'bottom-right',
					color: 'muted',
					size: 12,
					weight: 700,
					opacity: 0.7,
					padding: 18,
				},
			],
		},
	},
}

type RenderTreeNormalizeState = {
	nodeCount: number
}

function normalizeBoxSize(input: Record<string, unknown>): {
	width?: number
	height?: number
	maxWidth?: number
	maxHeight?: number
} {
	const width = clampInt(input.width, 0, 2000) ?? undefined
	const height = clampInt(input.height, 0, 2000) ?? undefined
	const maxWidth = clampInt(input.maxWidth, 0, 2000) ?? undefined
	const maxHeight = clampInt(input.maxHeight, 0, 2000) ?? undefined
	return { width, height, maxWidth, maxHeight }
}

function normalizeBoxPadding(input: Record<string, unknown>): {
	padding?: number
	paddingX?: number
	paddingY?: number
} {
	const padding = clampInt(input.padding, 0, 240) ?? undefined
	const paddingX = clampInt(input.paddingX, 0, 240) ?? undefined
	const paddingY = clampInt(input.paddingY, 0, 240) ?? undefined
	return { padding, paddingX, paddingY }
}

function normalizeFlex(input: Record<string, unknown>): { flex?: number } {
	const flex = clampNumber(input.flex, 0, 100) ?? undefined
	return { flex }
}

function normalizeGap(input: Record<string, unknown>): {
	gap?: number
	gapX?: number
	gapY?: number
} {
	const gap = clampInt(input.gap, 0, 240) ?? undefined
	const gapX = clampInt(input.gapX, 0, 240) ?? undefined
	const gapY = clampInt(input.gapY, 0, 240) ?? undefined
	return { gap, gapX, gapY }
}

function normalizeRenderTreeNode(
	input: unknown,
	state: RenderTreeNormalizeState,
	depth: number,
): ThreadRenderTreeNode | null {
	if (depth > 12) return null
	if (!isPlainObject(input)) return null
	if (state.nodeCount >= 200) return null

	const type = input.type
	if (type === 'Background') {
		const color = safeCssValue(input.color, 200) ?? undefined
		let assetId = safeString(input.assetId, 240) ?? undefined
		if (
			assetId &&
			(assetId.startsWith('ext:') ||
				assetId.startsWith('http://') ||
				assetId.startsWith('https://'))
		) {
			assetId = undefined
		}
		const opacity = clampNumber(input.opacity, 0, 1) ?? undefined
		const blur = clampInt(input.blur, 0, 80) ?? undefined

		if (!color && !assetId) return null

		state.nodeCount += 1
		return { type: 'Background', color, assetId, opacity, blur }
	}

	if (type === 'Builtin') {
		const kind = input.kind
		if (
			kind !== 'cover' &&
			kind !== 'repliesList' &&
			kind !== 'repliesListHeader' &&
			kind !== 'repliesListRootPost' &&
			kind !== 'repliesListReplies'
		) {
			return null
		}
		const wrapRootRoot =
			kind === 'repliesList' || kind === 'repliesListRootPost'
				? (safeBoolean(input.wrapRootRoot) ?? undefined)
				: undefined
		const wrapItemRoot =
			kind === 'repliesList' || kind === 'repliesListReplies'
				? (safeBoolean(input.wrapItemRoot) ?? undefined)
				: undefined
		const gap =
			kind === 'repliesList' || kind === 'repliesListReplies'
				? (clampInt(input.gap, 0, 80) ?? undefined)
				: undefined
		const highlightRaw = isPlainObject(input.highlight) ? input.highlight : null
		const highlight =
			kind === 'repliesList' || kind === 'repliesListReplies'
				? highlightRaw
					? {
							enabled: safeBoolean(highlightRaw.enabled) ?? undefined,
							color: safeColorToken(highlightRaw.color) ?? undefined,
							thickness: clampInt(highlightRaw.thickness, 1, 12) ?? undefined,
							radius: clampInt(highlightRaw.radius, 0, 48) ?? undefined,
							opacity: clampNumber(highlightRaw.opacity, 0, 1) ?? undefined,
						}
					: undefined
				: undefined
		const rootRoot =
			kind === 'repliesList' || kind === 'repliesListRootPost'
				? normalizeRenderTreeNode(input.rootRoot, state, depth + 1)
				: null
		const itemRoot =
			kind === 'repliesList' || kind === 'repliesListReplies'
				? normalizeRenderTreeNode(input.itemRoot, state, depth + 1)
				: null
		state.nodeCount += 1
		if (kind === 'repliesListRootPost') {
			return rootRoot
				? {
						type: 'Builtin',
						kind,
						rootRoot,
						...(wrapRootRoot != null ? { wrapRootRoot } : {}),
					}
				: { type: 'Builtin', kind }
		}
		if (kind === 'repliesListReplies') {
			return itemRoot || gap != null || highlight
				? {
						type: 'Builtin',
						kind,
						...(itemRoot ? { itemRoot } : {}),
						...(wrapItemRoot != null ? { wrapItemRoot } : {}),
						...(gap != null ? { gap } : {}),
						...(highlight ? { highlight } : {}),
					}
				: { type: 'Builtin', kind }
		}
		if (kind === 'repliesList') {
			return rootRoot || itemRoot
				? {
						type: 'Builtin',
						kind,
						...(rootRoot ? { rootRoot } : {}),
						...(wrapRootRoot != null ? { wrapRootRoot } : {}),
						...(itemRoot ? { itemRoot } : {}),
						...(wrapItemRoot != null ? { wrapItemRoot } : {}),
						...(gap != null ? { gap } : {}),
						...(highlight ? { highlight } : {}),
					}
				: gap != null || highlight
					? {
							type: 'Builtin',
							kind,
							...(wrapRootRoot != null ? { wrapRootRoot } : {}),
							...(wrapItemRoot != null ? { wrapItemRoot } : {}),
							...(gap != null ? { gap } : {}),
							...(highlight ? { highlight } : {}),
						}
					: { type: 'Builtin', kind }
		}
		return { type: 'Builtin', kind }
	}

	if (type === 'Text') {
		const text = safeString(input.text, 3000) ?? undefined
			const bind = input.bind
			const bindAllowed =
				bind === 'thread.title' ||
				bind === 'thread.source' ||
				bind === 'thread.sourceUrl' ||
				bind === 'timeline.replyIndicator' ||
				bind === 'timeline.replyIndex' ||
				bind === 'timeline.replyCount' ||
				bind === 'root.author.name' ||
				bind === 'root.author.handle' ||
				bind === 'root.plainText' ||
				bind === 'post.author.name' ||
				bind === 'post.author.handle' ||
				bind === 'post.plainText'
					? bind
					: undefined

		if (!text && !bindAllowed) return null

		const color =
			input.color === 'primary' || input.color === 'muted' || input.color === 'accent'
				? input.color
				: undefined
		const align =
			input.align === 'left' || input.align === 'center' || input.align === 'right'
				? input.align
				: undefined
		const size = clampInt(input.size, 8, 120) ?? undefined
		const weight = clampInt(input.weight, 200, 900) ?? undefined
		const lineHeight = clampNumber(input.lineHeight, 0.8, 2) ?? undefined
		const letterSpacing = clampNumber(input.letterSpacing, -0.2, 1) ?? undefined
		const uppercase = safeBoolean(input.uppercase) ?? undefined
		const maxLines = clampInt(input.maxLines, 1, 20) ?? undefined

		state.nodeCount += 1
		return {
			type: 'Text',
			text,
			bind: bindAllowed,
			color,
			align,
			size,
			weight,
			lineHeight,
			letterSpacing,
			uppercase,
			maxLines,
		}
	}

	if (type === 'Watermark') {
		const text = safeString(input.text, 160) ?? undefined
		const position =
			input.position === 'top-left' ||
			input.position === 'top-right' ||
			input.position === 'bottom-left' ||
			input.position === 'bottom-right'
				? input.position
				: undefined
		const color =
			input.color === 'primary' || input.color === 'muted' || input.color === 'accent'
				? input.color
				: undefined
		const size = clampInt(input.size, 8, 64) ?? undefined
		const weight = clampInt(input.weight, 200, 900) ?? undefined
		const opacity = clampNumber(input.opacity, 0, 1) ?? undefined
		const padding = clampInt(input.padding, 0, 120) ?? undefined

		state.nodeCount += 1
		return { type: 'Watermark', text, position, color, size, weight, opacity, padding }
	}

	if (type === 'Metrics') {
		const bind = input.bind
		const bindAllowed =
			bind === 'root.metrics.likes' || bind === 'post.metrics.likes' ? bind : undefined
		const color =
			input.color === 'primary' || input.color === 'muted' || input.color === 'accent'
				? input.color
				: undefined
		const size = clampInt(input.size, 10, 64) ?? undefined
		const showIcon = safeBoolean(input.showIcon) ?? undefined

		state.nodeCount += 1
		return { type: 'Metrics', bind: bindAllowed, color, size, showIcon }
	}

	if (type === 'Avatar') {
		const bind = input.bind
		const bindAllowed =
			bind === 'root.author.avatarAssetId' || bind === 'post.author.avatarAssetId'
				? bind
				: undefined
		if (!bindAllowed) return null

		const size = clampInt(input.size, 24, 240) ?? undefined
		const radius = clampInt(input.radius, 0, 999) ?? undefined
		const border = safeBoolean(input.border) ?? undefined
		const background = safeCssValue(input.background, 200) ?? undefined

		state.nodeCount += 1
		return { type: 'Avatar', bind: bindAllowed, size, radius, border, background }
	}

	if (type === 'ContentBlocks') {
		const bind = input.bind
		const bindAllowed =
			bind === 'root.contentBlocks' || bind === 'post.contentBlocks' ? bind : undefined
		if (!bindAllowed) return null
		const gap = clampInt(input.gap, 0, 80) ?? undefined
		const maxHeight = clampInt(input.maxHeight, 100, 1200) ?? undefined

		state.nodeCount += 1
		return { type: 'ContentBlocks', bind: bindAllowed, gap, maxHeight }
	}

	if (type === 'Image') {
		const assetId = safeString(input.assetId, 240) ?? undefined
		if (!assetId) return null
		if (
			assetId.startsWith('ext:') ||
			assetId.startsWith('http://') ||
			assetId.startsWith('https://')
		) {
			return null
		}
		const fit = input.fit === 'cover' || input.fit === 'contain' ? input.fit : undefined
		const position = safeString(input.position, 40) ?? undefined
		const opacity = clampNumber(input.opacity, 0, 1) ?? undefined
		const blur = clampInt(input.blur, 0, 80) ?? undefined
		const width = clampInt(input.width, 16, 1600) ?? undefined
		const height = clampInt(input.height, 16, 1600) ?? undefined
		const radius = clampInt(input.radius, 0, 999) ?? undefined
		const border = safeBoolean(input.border) ?? undefined
		const background = safeCssValue(input.background, 200) ?? undefined

		state.nodeCount += 1
		return {
			type: 'Image',
			assetId,
			fit,
			position,
			opacity,
			blur,
			width,
			height,
			radius,
			border,
			background,
		}
	}

	if (type === 'Video') {
		const assetId = safeString(input.assetId, 240) ?? undefined
		if (!assetId) return null
		if (
			assetId.startsWith('ext:') ||
			assetId.startsWith('http://') ||
			assetId.startsWith('https://')
		) {
			return null
		}
		const fit = input.fit === 'cover' || input.fit === 'contain' ? input.fit : undefined
		const position = safeString(input.position, 40) ?? undefined
		const opacity = clampNumber(input.opacity, 0, 1) ?? undefined
		const blur = clampInt(input.blur, 0, 80) ?? undefined
		const width = clampInt(input.width, 16, 1600) ?? undefined
		const height = clampInt(input.height, 16, 1600) ?? undefined
		const radius = clampInt(input.radius, 0, 999) ?? undefined
		const border = safeBoolean(input.border) ?? undefined
		const background = safeCssValue(input.background, 200) ?? undefined

		state.nodeCount += 1
		return {
			type: 'Video',
			assetId,
			fit,
			position,
			opacity,
			blur,
			width,
			height,
			radius,
			border,
			background,
		}
	}

	if (type === 'Spacer') {
		const axis = input.axis === 'x' || input.axis === 'y' ? input.axis : undefined
		const size = clampInt(input.size, 0, 800) ?? undefined
		const width = clampInt(input.width, 0, 2000) ?? undefined
		const height = clampInt(input.height, 0, 2000) ?? undefined

		if (!size && !width && !height) return null

		state.nodeCount += 1
		return { type: 'Spacer', axis, size, width, height }
	}

	if (type === 'Divider') {
		const axis = input.axis === 'x' || input.axis === 'y' ? input.axis : undefined
		const thickness = clampInt(input.thickness, 1, 20) ?? undefined
		const length = clampInt(input.length, 8, 2000) ?? undefined
		const margin = clampInt(input.margin, 0, 240) ?? undefined
		const opacity = clampNumber(input.opacity, 0, 1) ?? undefined
		const color = safeString(input.color, 200) ?? undefined

		state.nodeCount += 1
		return { type: 'Divider', axis, thickness, length, margin, opacity, color }
	}

	if (type === 'Grid') {
		const columns = clampInt(input.columns, 1, 12) ?? undefined
		const align =
			input.align === 'start' ||
			input.align === 'center' ||
			input.align === 'end' ||
			input.align === 'stretch'
				? input.align
				: undefined
		const justify =
			input.justify === 'start' ||
			input.justify === 'center' ||
			input.justify === 'end' ||
			input.justify === 'stretch'
				? input.justify
				: undefined
		const border = safeBoolean(input.border) ?? undefined
		const borderWidth = clampInt(input.borderWidth, 1, 12) ?? undefined
		const borderColor = safeBorderColorToken(input.borderColor) ?? undefined
		const background = safeCssValue(input.background, 200) ?? undefined
		const radius = clampInt(input.radius, 0, 120) ?? undefined
		const overflow = input.overflow === 'hidden' ? 'hidden' : undefined
		const gap = normalizeGap(input)
		const padding = normalizeBoxPadding(input)
		const size = normalizeBoxSize(input)
		const flex = normalizeFlex(input)
		const children = Array.isArray(input.children) ? input.children : []
		state.nodeCount += 1
		const nextChildren: ThreadRenderTreeNode[] = []
		for (const c of children.slice(0, 50)) {
			const child = normalizeRenderTreeNode(c, state, depth + 1)
			if (child) nextChildren.push(child)
		}
		return {
			type: 'Grid',
			columns,
			align,
			justify,
			...flex,
			...gap,
			...padding,
			border,
			borderWidth,
			borderColor,
			background,
			radius,
			overflow,
			...size,
			children: nextChildren.length ? nextChildren : undefined,
		}
	}

	if (type === 'Absolute') {
		const x = clampInt(input.x, -2000, 2000) ?? undefined
		const y = clampInt(input.y, -2000, 2000) ?? undefined
		const width = clampInt(input.width, 0, 2000) ?? undefined
		const height = clampInt(input.height, 0, 2000) ?? undefined
		const zIndex = clampInt(input.zIndex, -100, 100) ?? undefined
		const pointerEvents = safeBoolean(input.pointerEvents) ?? undefined
		const rotate = clampNumber(input.rotate, -180, 180) ?? undefined
		const scale = clampNumber(input.scale, 0.1, 4) ?? undefined
		const origin = safeTransformOriginToken(input.origin) ?? undefined
		const children = Array.isArray(input.children) ? input.children : []
		state.nodeCount += 1
		const nextChildren: ThreadRenderTreeNode[] = []
		for (const c of children.slice(0, 50)) {
			const child = normalizeRenderTreeNode(c, state, depth + 1)
			if (child) nextChildren.push(child)
		}
		return {
			type: 'Absolute',
			x,
			y,
			width,
			height,
			zIndex,
			pointerEvents,
			rotate,
			scale,
			origin,
			children: nextChildren.length ? nextChildren : undefined,
		}
	}

	if (type === 'Stack') {
		const direction =
			input.direction === 'row' || input.direction === 'column'
				? input.direction
				: undefined
		const align =
			input.align === 'start' ||
			input.align === 'center' ||
			input.align === 'end' ||
			input.align === 'stretch'
				? input.align
				: undefined
		const justify =
			input.justify === 'start' ||
			input.justify === 'center' ||
			input.justify === 'end' ||
			input.justify === 'between'
				? input.justify
				: undefined
		const border = safeBoolean(input.border) ?? undefined
		const borderWidth = clampInt(input.borderWidth, 1, 12) ?? undefined
		const borderColor = safeBorderColorToken(input.borderColor) ?? undefined
		const background = safeCssValue(input.background, 200) ?? undefined
		const radius = clampInt(input.radius, 0, 120) ?? undefined
		const overflow = input.overflow === 'hidden' ? 'hidden' : undefined
		const gap = normalizeGap(input)
		const padding = normalizeBoxPadding(input)
		const size = normalizeBoxSize(input)
		const flex = normalizeFlex(input)
		const children = Array.isArray(input.children) ? input.children : []
		state.nodeCount += 1
		const nextChildren: ThreadRenderTreeNode[] = []
		for (const c of children.slice(0, 50)) {
			const child = normalizeRenderTreeNode(c, state, depth + 1)
			if (child) nextChildren.push(child)
		}
		return {
			type: 'Stack',
			direction,
			align,
			justify,
			...flex,
			...gap,
			...padding,
			border,
			borderWidth,
			borderColor,
			background,
			radius,
			overflow,
			...size,
			children: nextChildren.length ? nextChildren : undefined,
		}
	}

	if (type === 'Box') {
		const padding = normalizeBoxPadding(input)
		const radius = clampInt(input.radius, 0, 120) ?? undefined
		const border = safeBoolean(input.border) ?? undefined
		const borderWidth = clampInt(input.borderWidth, 1, 12) ?? undefined
		const borderColor = safeBorderColorToken(input.borderColor) ?? undefined
		const background = safeCssValue(input.background, 200) ?? undefined
		const size = normalizeBoxSize(input)
		const overflow = input.overflow === 'hidden' ? 'hidden' : undefined
		const flex = normalizeFlex(input)
		const children = Array.isArray(input.children) ? input.children : []
		state.nodeCount += 1
		const nextChildren: ThreadRenderTreeNode[] = []
		for (const c of children.slice(0, 50)) {
			const child = normalizeRenderTreeNode(c, state, depth + 1)
			if (child) nextChildren.push(child)
		}
		return {
			type: 'Box',
			...flex,
			...padding,
			border,
			borderWidth,
			borderColor,
			background,
			radius,
			overflow,
			...size,
			children: nextChildren.length ? nextChildren : undefined,
		}
	}

	return null
}

export const DEFAULT_THREAD_TEMPLATE_CONFIG: ThreadTemplateConfigV1 = {
	version: 1,
	theme: {
		background: '#0b1020',
		surface: 'rgba(255,255,255,0.06)',
		border: 'rgba(255,255,255,0.10)',
		textPrimary: '#e5e7eb',
		textSecondary: 'rgba(229,231,235,0.85)',
		textMuted: 'rgba(229,231,235,0.65)',
		accent: '#22c55e',
		accentGlow: 'rgba(34, 197, 94, 0.25)',
	},
	typography: { fontPreset: 'noto', fontScale: 1 },
	layout: {},
	brand: { showWatermark: false, watermarkText: '' },
	motion: { enabled: true, intensity: 'normal' },
	scenes: DEFAULT_SCENES,
}

/**
 * Increment when the template normalization/compile logic changes in a way that might affect
 * determinism/replay of previously-saved configs.
 */
export const THREAD_TEMPLATE_COMPILE_VERSION = 17

export function normalizeThreadTemplateConfig(input: unknown): ThreadTemplateConfigV1 {
	if (!isPlainObject(input)) return DEFAULT_THREAD_TEMPLATE_CONFIG
	if (input.version !== 1) return DEFAULT_THREAD_TEMPLATE_CONFIG

	const cfg = input

	const out: ThreadTemplateConfigV1 = {
		version: 1,
		theme: { ...(DEFAULT_THREAD_TEMPLATE_CONFIG.theme ?? {}) },
		typography: { ...(DEFAULT_THREAD_TEMPLATE_CONFIG.typography ?? {}) },
		layout: { ...(DEFAULT_THREAD_TEMPLATE_CONFIG.layout ?? {}) },
		brand: { ...(DEFAULT_THREAD_TEMPLATE_CONFIG.brand ?? {}) },
		motion: { ...(DEFAULT_THREAD_TEMPLATE_CONFIG.motion ?? {}) },
		scenes: DEFAULT_SCENES,
	}

	const theme = isPlainObject(cfg.theme) ? cfg.theme : null
	if (theme) {
		for (const key of [
			'background',
			'surface',
			'border',
			'textPrimary',
			'textSecondary',
			'textMuted',
			'accent',
			'accentGlow',
		] as const) {
			const v = safeCssValue(theme[key], 200)
			if (v != null) (out.theme as any)[key] = v
		}
	}

	const typography = isPlainObject(cfg.typography) ? cfg.typography : null
	if (typography) {
		const fontPreset = typography.fontPreset
		if (
			fontPreset === 'noto' ||
			fontPreset === 'inter' ||
			fontPreset === 'system'
		) {
			out.typography = { ...(out.typography ?? {}), fontPreset }
		}
		const fontScale = clampNumber(typography.fontScale, 0.5, 2)
		if (fontScale != null) {
			out.typography = { ...(out.typography ?? {}), fontScale }
		}
	}

	const layout = isPlainObject(cfg.layout) ? cfg.layout : null
	if (layout) {
		const paddingX = clampInt(layout.paddingX, 0, 240)
		if (paddingX != null) out.layout = { ...(out.layout ?? {}), paddingX }
		const paddingY = clampInt(layout.paddingY, 0, 240)
		if (paddingY != null) out.layout = { ...(out.layout ?? {}), paddingY }
		const infoPanelWidth = clampInt(layout.infoPanelWidth, 320, 1200)
		if (infoPanelWidth != null) {
			out.layout = { ...(out.layout ?? {}), infoPanelWidth }
		}
	}

	const brand = isPlainObject(cfg.brand) ? cfg.brand : null
	if (brand) {
		const showWatermark = safeBoolean(brand.showWatermark)
		if (showWatermark != null) out.brand = { ...(out.brand ?? {}), showWatermark }
		const watermarkText = safeString(brand.watermarkText, 80)
		if (watermarkText != null) {
			out.brand = { ...(out.brand ?? {}), watermarkText }
		}
	}

	const motion = isPlainObject(cfg.motion) ? cfg.motion : null
	if (motion) {
		const enabled = safeBoolean(motion.enabled)
		if (enabled != null) out.motion = { ...(out.motion ?? {}), enabled }
		const intensity = motion.intensity
		if (intensity === 'subtle' || intensity === 'normal' || intensity === 'strong') {
			out.motion = { ...(out.motion ?? {}), intensity }
		}
	}

	const scenes = isPlainObject(cfg.scenes) ? cfg.scenes : null
	if (scenes) {
		const state: RenderTreeNormalizeState = { nodeCount: 0 }
		const cover = isPlainObject(scenes.cover) ? scenes.cover : null
		const post = isPlainObject(scenes.post) ? scenes.post : null

		const coverRoot =
			cover && 'root' in cover
				? normalizeRenderTreeNode(cover.root, state, 0)
				: null
		const postRoot =
			post && 'root' in post
				? normalizeRenderTreeNode(post.root, state, 0)
				: null

		out.scenes = {
			cover: { root: coverRoot ?? DEFAULT_SCENES.cover!.root },
			post: { root: postRoot ?? DEFAULT_SCENES.post!.root },
		}
	}

	return out
}
