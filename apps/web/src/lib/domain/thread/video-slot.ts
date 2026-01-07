import type {
	ThreadRenderTreeNode,
	ThreadTemplateConfigV1,
} from '@app/remotion-project/types'

export type ThreadComposeVideoSlot = {
	x: number
	y: number
	width: number
	height: number
	radius: number
	fit: 'cover' | 'contain'
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

type AbsoluteCtx = { x: number; y: number; width?: number; height?: number }

function normalizeNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value
	return null
}

function normalizeSlotFromAbsoluteAndVideo(
	absolute: AbsoluteCtx,
	video: Extract<ThreadRenderTreeNode, { type: 'Video' }>,
): ThreadComposeVideoSlot | null {
	const width = normalizeNumber(absolute.width) ?? normalizeNumber(video.width)
	const height = normalizeNumber(absolute.height) ?? normalizeNumber(video.height)
	if (width == null || height == null) return null

	const fit = video.fit === 'contain' ? 'contain' : 'cover'
	const radius = normalizeNumber(video.radius) ?? 0
	return {
		x: absolute.x,
		y: absolute.y,
		width,
		height,
		radius: Math.max(0, radius),
		fit,
	}
}

function findAbsoluteVideoSlot(
	node: ThreadRenderTreeNode | undefined,
	ctx: AbsoluteCtx | null,
): ThreadComposeVideoSlot | null {
	if (!node) return null

	if (node.type === 'Absolute') {
		const x = normalizeNumber(node.x)
		const y = normalizeNumber(node.y)
		const width = normalizeNumber(node.width)
		const height = normalizeNumber(node.height)
		const nextCtx =
			x == null || y == null
				? null
				: ({
						x,
						y,
						width: width ?? undefined,
						height: height ?? undefined,
					} satisfies AbsoluteCtx)

		for (const c of node.children ?? []) {
			const hit = findAbsoluteVideoSlot(c, nextCtx)
			if (hit) return hit
		}
		return null
	}

	if (node.type === 'Video') {
		if (!ctx) return null
		return normalizeSlotFromAbsoluteAndVideo(ctx, node)
	}

	if (node.type === 'Repeat') return findAbsoluteVideoSlot(node.itemRoot, ctx)

	if (
		node.type === 'Stack' ||
		node.type === 'Grid' ||
		node.type === 'Box'
	) {
		for (const c of node.children ?? []) {
			const hit = findAbsoluteVideoSlot(c, ctx)
			if (hit) return hit
		}
	}

	return null
}

export function extractThreadComposeVideoSlot(
	templateConfig: unknown,
): ThreadComposeVideoSlot | null {
	if (!isPlainObject(templateConfig)) return null
	const cfg = templateConfig as ThreadTemplateConfigV1
	if (!cfg?.scenes) return null

	const postRoot = cfg.scenes.post?.root
	const coverRoot = cfg.scenes.cover?.root

	return (
		findAbsoluteVideoSlot(postRoot, null) ??
		findAbsoluteVideoSlot(coverRoot, null)
	)
}

