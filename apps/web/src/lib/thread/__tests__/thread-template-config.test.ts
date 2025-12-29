import { describe, expect, it } from 'vitest'
import { normalizeThreadTemplateConfig } from '@app/remotion-project/thread-template-config'
import type { ThreadRenderTreeNode } from '@app/remotion-project/types'

function countNodes(node: ThreadRenderTreeNode | undefined): number {
	if (!node) return 0
	if (node.type === 'Stack' || node.type === 'Box') {
		const children = node.children ?? []
		return 1 + children.reduce((sum, c) => sum + countNodes(c), 0)
	}
	if (node.type === 'Builtin' && node.kind === 'repliesList') {
		return 1 + countNodes(node.itemRoot)
	}
	return 1
}

describe('normalizeThreadTemplateConfig', () => {
	it('keeps Spacer nodes (axis+size)', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: { cover: { root: { type: 'Spacer', axis: 'y', size: 24 } } },
		})

		expect(cfg.scenes?.cover?.root?.type).toBe('Spacer')
		expect((cfg.scenes?.cover?.root as any).axis).toBe('y')
		expect((cfg.scenes?.cover?.root as any).size).toBe(24)
	})

	it('clamps Divider thickness when provided', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: { cover: { root: { type: 'Divider', thickness: 0 } } },
		})
		expect(cfg.scenes?.cover?.root?.type).toBe('Divider')
		expect((cfg.scenes?.cover?.root as any).thickness).toBe(1)
	})

	it('falls back to default scene root on unknown node', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: { post: { root: { type: 'Nope', foo: 1 } } },
		})
		expect(cfg.scenes?.post?.root?.type).toBe('Builtin')
		expect((cfg.scenes?.post?.root as any).kind).toBe('repliesList')
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

	it('drops Image node when assetId is missing', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: { cover: { root: { type: 'Image', assetId: '' } } },
		})
		expect(cfg.scenes?.cover?.root?.type).toBe('Builtin')
		expect((cfg.scenes?.cover?.root as any).kind).toBe('cover')
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
		expect(cfg.scenes?.cover?.root?.type).toBe('Builtin')
		expect((cfg.scenes?.cover?.root as any).kind).toBe('cover')
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
