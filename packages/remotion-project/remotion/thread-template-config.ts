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

function safeBoolean(value: unknown): boolean | null {
	return typeof value === 'boolean' ? value : null
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
			],
		},
	},
	post: { root: { type: 'Builtin', kind: 'repliesList' } },
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
			return rootRoot ? { type: 'Builtin', kind, rootRoot } : { type: 'Builtin', kind }
		}
		if (kind === 'repliesListReplies') {
			return itemRoot ? { type: 'Builtin', kind, itemRoot } : { type: 'Builtin', kind }
		}
		if (kind === 'repliesList') {
			return rootRoot || itemRoot
				? {
						type: 'Builtin',
						kind,
						...(rootRoot ? { rootRoot } : {}),
						...(itemRoot ? { itemRoot } : {}),
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
			maxLines,
		}
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
		const background = safeString(input.background, 200) ?? undefined

		state.nodeCount += 1
		return { type: 'Avatar', bind: bindAllowed, size, radius, border, background }
	}

	if (type === 'ContentBlocks') {
		const bind = input.bind
		const bindAllowed =
			bind === 'root.contentBlocks' || bind === 'post.contentBlocks'
					? bind
					: undefined
			if (!bindAllowed) return null
		const gap = clampInt(input.gap, 0, 80) ?? undefined
		const maxHeight = clampInt(input.maxHeight, 100, 1200) ?? undefined

		state.nodeCount += 1
		return { type: 'ContentBlocks', bind: bindAllowed, gap, maxHeight }
	}

	if (type === 'Image') {
		const assetId = safeString(input.assetId, 240) ?? undefined
		if (!assetId) return null
		const fit = input.fit === 'cover' || input.fit === 'contain' ? input.fit : undefined
		const width = clampInt(input.width, 16, 1600) ?? undefined
		const height = clampInt(input.height, 16, 1600) ?? undefined
		const radius = clampInt(input.radius, 0, 999) ?? undefined
		const border = safeBoolean(input.border) ?? undefined
		const background = safeString(input.background, 200) ?? undefined

		state.nodeCount += 1
		return { type: 'Image', assetId, fit, width, height, radius, border, background }
	}

	if (type === 'Video') {
		const assetId = safeString(input.assetId, 240) ?? undefined
		if (!assetId) return null
		const fit = input.fit === 'cover' || input.fit === 'contain' ? input.fit : undefined
		const width = clampInt(input.width, 16, 1600) ?? undefined
		const height = clampInt(input.height, 16, 1600) ?? undefined
		const radius = clampInt(input.radius, 0, 999) ?? undefined
		const border = safeBoolean(input.border) ?? undefined
		const background = safeString(input.background, 200) ?? undefined

		state.nodeCount += 1
		return { type: 'Video', assetId, fit, width, height, radius, border, background }
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
		const gap = normalizeGap(input)
		const padding = normalizeBoxPadding(input)
		const size = normalizeBoxSize(input)
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
			...gap,
			...padding,
			...size,
			children: nextChildren.length ? nextChildren : undefined,
		}
	}

	if (type === 'Absolute') {
		const x = clampInt(input.x, -2000, 2000) ?? undefined
		const y = clampInt(input.y, -2000, 2000) ?? undefined
		const width = clampInt(input.width, 0, 2000) ?? undefined
		const height = clampInt(input.height, 0, 2000) ?? undefined
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
		const gap = normalizeGap(input)
		const padding = normalizeBoxPadding(input)
		const size = normalizeBoxSize(input)
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
			...gap,
			...padding,
			...size,
			children: nextChildren.length ? nextChildren : undefined,
		}
	}

	if (type === 'Box') {
		const padding = normalizeBoxPadding(input)
		const radius = clampInt(input.radius, 0, 120) ?? undefined
		const border = safeBoolean(input.border) ?? undefined
		const background = safeString(input.background, 200) ?? undefined
		const size = normalizeBoxSize(input)
		const children = Array.isArray(input.children) ? input.children : []
		state.nodeCount += 1
		const nextChildren: ThreadRenderTreeNode[] = []
		for (const c of children.slice(0, 50)) {
			const child = normalizeRenderTreeNode(c, state, depth + 1)
			if (child) nextChildren.push(child)
		}
		return {
			type: 'Box',
			...padding,
			border,
			background,
			radius,
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
export const THREAD_TEMPLATE_COMPILE_VERSION = 2

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
			const v = safeString(theme[key], 200)
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
