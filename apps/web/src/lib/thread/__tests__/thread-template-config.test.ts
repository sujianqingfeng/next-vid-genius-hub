import { describe, expect, it } from 'vitest'
import { normalizeThreadTemplateConfig } from '@app/remotion-project/thread-template-config'
import type { ThreadRenderTreeNode } from '@app/remotion-project/types'

function countNodes(node: ThreadRenderTreeNode | undefined): number {
	if (!node) return 0
	if (
		node.type === 'Stack' ||
		node.type === 'Box' ||
		node.type === 'Grid' ||
		node.type === 'Absolute'
	) {
		const children = node.children ?? []
		return 1 + children.reduce((sum, c) => sum + countNodes(c), 0)
	}
	if (node.type === 'Builtin' && node.kind === 'repliesList') {
		return 1 + countNodes(node.rootRoot) + countNodes(node.itemRoot)
	}
	return 1
}

describe('normalizeThreadTemplateConfig', () => {
	it('keeps Grid nodes and clamps columns', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				cover: {
					root: {
						type: 'Grid',
						columns: 999,
						align: 'center',
						justify: 'end',
						gap: -1,
						padding: 999,
						children: [{ type: 'Text', text: 'x' }],
					},
				},
			},
		})

		const root = cfg.scenes?.cover?.root as any
		expect(root.type).toBe('Grid')
		expect(root.columns).toBe(12)
		expect(root.align).toBe('center')
		expect(root.justify).toBe('end')
		expect(root.gap).toBe(0)
		expect(root.padding).toBe(240)
		expect(root.children?.[0]?.type).toBe('Text')
	})

	it('keeps Spacer nodes (axis+size)', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: { cover: { root: { type: 'Spacer', axis: 'y', size: 24 } } },
		})

		const root = cfg.scenes!.cover!.root as any
		expect(root?.type).toBe('Spacer')
		expect(root.axis).toBe('y')
		expect(root.size).toBe(24)
	})

	it('clamps Divider thickness when provided', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: { cover: { root: { type: 'Divider', thickness: 0 } } },
		})
		const root = cfg.scenes!.cover!.root as any
		expect(root?.type).toBe('Divider')
		expect(root.thickness).toBe(1)
	})

	it('falls back to default scene root on unknown node', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: { post: { root: { type: 'Nope', foo: 1 } } },
		})
		const root = cfg.scenes!.post!.root as any
		expect(root?.type).toBe('Builtin')
		expect(root.kind).toBe('repliesList')
	})

	it('enforces RenderTree node limit', () => {
		const many = {
			type: 'Stack',
			children: Array.from({ length: 50 }).map(() => ({
				type: 'Stack',
				children: Array.from({ length: 50 }).map(() => ({
					type: 'Text',
					text: 'x',
				})),
			})),
		}
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: { cover: { root: many } },
		})
		const root = cfg.scenes?.cover?.root as any
		expect(root?.type).toBe('Stack')
		expect(countNodes(root)).toBeLessThanOrEqual(200)
	})

	it('keeps Builtin(repliesList) rootRoot and itemRoot', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				post: {
					root: {
						type: 'Builtin',
						kind: 'repliesList',
						rootRoot: { type: 'Text', bind: 'root.plainText' },
						itemRoot: { type: 'Text', bind: 'post.plainText' },
					},
				},
			},
		})
		const root = cfg.scenes?.post?.root as any
		expect(root.type).toBe('Builtin')
		expect(root.kind).toBe('repliesList')
		expect(root.rootRoot?.type).toBe('Text')
		expect(root.itemRoot?.type).toBe('Text')
	})

	it('keeps Builtin(repliesListHeader/repliesListRootPost/repliesListReplies)', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				post: {
					root: {
						type: 'Stack',
						children: [
							{ type: 'Builtin', kind: 'repliesListHeader' },
							{
								type: 'Grid',
								columns: 2,
								children: [
									{
										type: 'Builtin',
										kind: 'repliesListRootPost',
										rootRoot: { type: 'Text', bind: 'root.plainText' },
									},
									{
										type: 'Builtin',
										kind: 'repliesListReplies',
										itemRoot: { type: 'Text', bind: 'post.plainText' },
									},
								],
							},
						],
					},
				},
			},
		})

		const root = cfg.scenes?.post?.root as any
		expect(root.type).toBe('Stack')
		expect(root.children?.[0]?.kind).toBe('repliesListHeader')
		expect(root.children?.[1]?.type).toBe('Grid')
		expect(root.children?.[1]?.children?.[0]?.kind).toBe('repliesListRootPost')
		expect(root.children?.[1]?.children?.[0]?.rootRoot?.type).toBe('Text')
		expect(root.children?.[1]?.children?.[1]?.kind).toBe('repliesListReplies')
		expect(root.children?.[1]?.children?.[1]?.itemRoot?.type).toBe('Text')
	})

	it('drops Image node when assetId is missing', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: { cover: { root: { type: 'Image', assetId: '' } } },
		})
		const root = cfg.scenes!.cover!.root as any
		expect(root?.type).toBe('Stack')
	})

	it('normalizes Image fit and clamps dimensions', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				cover: {
					root: {
						type: 'Image',
						assetId: 'asset_1',
						fit: 'stretch',
						width: 1,
						height: 99999,
					},
				},
			},
		})

		const root = cfg.scenes?.cover?.root as any
		expect(root.type).toBe('Image')
		expect(root.assetId).toBe('asset_1')
		expect(root.fit).toBeUndefined()
		expect(root.width).toBe(16)
		expect(root.height).toBe(1600)
	})

	it('drops Video node when assetId is missing', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: { cover: { root: { type: 'Video', assetId: '   ' } } },
		})
		const root = cfg.scenes!.cover!.root as any
		expect(root?.type).toBe('Stack')
	})

	it('keeps Absolute nodes and clamps geometry', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				cover: {
					root: {
						type: 'Absolute',
						x: -99999,
						y: 99999,
						width: -10,
						height: 99999,
						children: [{ type: 'Text', text: 'x' }],
					},
				},
			},
		})

		const root = cfg.scenes!.cover!.root as any
		expect(root.type).toBe('Absolute')
		expect(root.x).toBe(-2000)
		expect(root.y).toBe(2000)
		expect(root.width).toBe(0)
		expect(root.height).toBe(2000)
		expect(root.children?.[0]?.type).toBe('Text')
	})

	it('clamps Stack size props', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				cover: {
					root: {
						type: 'Stack',
						width: -1,
						height: 99999,
						maxWidth: 99999,
						maxHeight: -1,
						children: [{ type: 'Text', text: 'x' }],
					},
				},
			},
		})

		const root = cfg.scenes!.cover!.root as any
		expect(root.type).toBe('Stack')
		expect(root.width).toBe(0)
		expect(root.height).toBe(2000)
		expect(root.maxWidth).toBe(2000)
		expect(root.maxHeight).toBe(0)
	})

	it('clamps Grid gapX/gapY and paddingX/paddingY', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				cover: {
					root: {
						type: 'Grid',
						columns: 2,
						gapX: -1,
						gapY: 999,
						paddingX: 999,
						paddingY: -1,
						children: [{ type: 'Text', text: 'x' }],
					},
				},
			},
		})

		const root = cfg.scenes!.cover!.root as any
		expect(root.type).toBe('Grid')
		expect(root.gapX).toBe(0)
		expect(root.gapY).toBe(240)
		expect(root.paddingX).toBe(240)
		expect(root.paddingY).toBe(0)
	})

	it('normalizes Video fit and clamps dimensions', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				cover: {
					root: {
						type: 'Video',
						assetId: 'asset_2',
						fit: 'nope',
						width: -10,
						height: 100000,
					},
				},
			},
		})

		const root = cfg.scenes?.cover?.root as any
		expect(root.type).toBe('Video')
		expect(root.assetId).toBe('asset_2')
		expect(root.fit).toBeUndefined()
		expect(root.width).toBe(16)
		expect(root.height).toBe(1600)
	})
})
