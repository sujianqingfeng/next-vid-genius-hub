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

	it('clamps flex on container nodes', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				cover: {
					root: {
						type: 'Stack',
						flex: 999,
						children: [
							{
								type: 'Box',
								flex: -1,
								children: [{ type: 'Text', text: 'x' }],
							},
						],
					},
				},
			},
		})

		const root = cfg.scenes!.cover!.root as any
		expect(root.type).toBe('Stack')
		expect(root.flex).toBe(100)
		expect(root.children?.[0]?.type).toBe('Box')
		expect(root.children?.[0]?.flex).toBe(0)
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
		expect(root?.type).toBe('Stack')
		expect(root.children?.[0]?.type).toBe('Stack')
		expect(root.children?.[0]?.children?.[1]?.type).toBe('Text')
		expect(root.children?.[0]?.children?.[1]?.bind).toBe('timeline.replyIndicator')
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
						highlight: {
							enabled: true,
							color: 'accent',
							thickness: 0,
							radius: 999,
							opacity: -1,
						},
						rootRoot: { type: 'Text', bind: 'root.plainText' },
						itemRoot: { type: 'Text', bind: 'post.plainText' },
					},
				},
			},
		})
		const root = cfg.scenes?.post?.root as any
		expect(root.type).toBe('Builtin')
		expect(root.kind).toBe('repliesList')
		expect(root.highlight?.enabled).toBe(true)
		expect(root.highlight?.color).toBe('accent')
		expect(root.highlight?.thickness).toBe(1)
		expect(root.highlight?.radius).toBe(48)
		expect(root.highlight?.opacity).toBe(0)
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
										gap: 999,
										highlight: {
											color: 'nope',
											thickness: 999,
											radius: -1,
											opacity: 2,
											enabled: 'nope',
										},
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
		expect(root.children?.[1]?.children?.[1]?.gap).toBe(80)
		expect(root.children?.[1]?.children?.[1]?.highlight?.color).toBeUndefined()
		expect(root.children?.[1]?.children?.[1]?.highlight?.thickness).toBe(12)
		expect(root.children?.[1]?.children?.[1]?.highlight?.radius).toBe(0)
		expect(root.children?.[1]?.children?.[1]?.highlight?.opacity).toBe(1)
		expect(root.children?.[1]?.children?.[1]?.highlight?.enabled).toBeUndefined()
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

	it('drops Image node when assetId is an external URL', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: { cover: { root: { type: 'Image', assetId: 'https://example.com/x.png' } } },
		})
		const root = cfg.scenes!.cover!.root as any
		expect(root?.type).toBe('Stack')
	})

	it('drops Video node when assetId is missing', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: { cover: { root: { type: 'Video', assetId: '   ' } } },
		})
		const root = cfg.scenes!.cover!.root as any
		expect(root?.type).toBe('Stack')
	})

	it('drops Video node when assetId is an external URL', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: { cover: { root: { type: 'Video', assetId: 'ext:https://example.com/x.mp4' } } },
		})
		const root = cfg.scenes!.cover!.root as any
		expect(root?.type).toBe('Stack')
	})

	it('keeps Watermark and Metrics nodes and clamps values', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				cover: {
					root: {
						type: 'Stack',
						children: [
							{
								type: 'Watermark',
								position: 'top-left',
								opacity: 999,
								padding: -1,
								size: 999,
								weight: 999,
							},
							{
								type: 'Metrics',
								bind: 'root.metrics.likes',
								size: 2,
								showIcon: false,
							},
						],
					},
				},
			},
		})

		const root = cfg.scenes!.cover!.root as any
		expect(root.type).toBe('Stack')
		expect(root.children?.[0]?.type).toBe('Watermark')
		expect(root.children?.[0]?.position).toBe('top-left')
		expect(root.children?.[0]?.opacity).toBe(1)
		expect(root.children?.[0]?.padding).toBe(0)
		expect(root.children?.[0]?.size).toBe(64)
		expect(root.children?.[0]?.weight).toBe(900)

		expect(root.children?.[1]?.type).toBe('Metrics')
		expect(root.children?.[1]?.bind).toBe('root.metrics.likes')
		expect(root.children?.[1]?.size).toBe(10)
		expect(root.children?.[1]?.showIcon).toBe(false)
	})

	it('keeps Text timeline bindings', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				cover: {
					root: { type: 'Text', bind: 'timeline.replyIndicator' },
				},
			},
		})
		const root = cfg.scenes!.cover!.root as any
		expect(root.type).toBe('Text')
		expect(root.bind).toBe('timeline.replyIndicator')
	})

	it('keeps Background nodes with assetId and clamps opacity/blur', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				cover: {
					root: {
						type: 'Background',
						assetId: 'asset_bg',
						opacity: -1,
						blur: 999,
					},
				},
			},
		})

		const root = cfg.scenes!.cover!.root as any
		expect(root.type).toBe('Background')
		expect(root.assetId).toBe('asset_bg')
		expect(root.opacity).toBe(0)
		expect(root.blur).toBe(80)
	})

	it('drops Background nodes when assetId is an external URL', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				cover: {
					root: {
						type: 'Background',
						assetId: 'https://example.com/bg.png',
					},
				},
			},
		})

		const root = cfg.scenes!.cover!.root as any
		expect(root?.type).toBe('Stack')
	})

	it('drops Background nodes when color contains url()', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				cover: {
					root: { type: 'Background', color: 'url(https://example.com/bg.png)' },
				},
			},
		})

		const root = cfg.scenes!.cover!.root as any
		expect(root?.type).toBe('Stack')
	})

	it('rejects url() in theme and Box background', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			theme: {
				background: 'url(https://example.com/bg.png)',
				accent: 'https://example.com/nope',
			},
			scenes: {
				cover: {
					root: {
						type: 'Box',
						background: 'url(https://example.com/bg.png)',
						children: [{ type: 'Text', text: 'x' }],
					},
				},
			},
		})

		expect(cfg.theme.background).toBe('#0b1020')
		expect(cfg.theme.accent).toBe('#22c55e')

		const root = cfg.scenes!.cover!.root as any
		expect(root.type).toBe('Box')
		expect(root.background).toBeUndefined()
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
