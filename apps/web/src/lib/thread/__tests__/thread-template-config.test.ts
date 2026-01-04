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
	if (node.type === 'Repeat') {
		return 1 + countNodes(node.itemRoot)
	}
	return 1
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function containsType(value: unknown, type: string, depth = 0): boolean {
	if (depth > 50) return false
	if (Array.isArray(value))
		return value.some((v) => containsType(v, type, depth + 1))
	if (!isPlainObject(value)) return false
	if (value.type === type) return true
	for (const v of Object.values(value)) {
		if (containsType(v, type, depth + 1)) return true
	}
	return false
}

describe('normalizeThreadTemplateConfig', () => {
	it('supports legacy configs without version by mapping theme/typography/motion', () => {
		const cfg = normalizeThreadTemplateConfig({
			theme: { background: '#111111' },
			typography: { fontPreset: 'system', fontScale: 1.5 },
			motion: { enabled: false, intensity: 'strong' },
		})

		expect(cfg.version).toBe(1)
		expect(cfg.theme.background).toBe('#111111')
		expect(cfg.typography.fontPreset).toBe('system')
		expect(cfg.typography.fontScale).toBe(1.5)
		expect(cfg.motion.enabled).toBe(false)
		expect(cfg.motion.intensity).toBe('strong')
		expect(cfg.scenes?.cover?.root?.type).toBeTruthy()
	})

	it('does not include legacy node types in defaults', () => {
		const cfg = normalizeThreadTemplateConfig(undefined)
		const legacyType = 'B' + 'uiltin'
		expect(containsType(cfg, legacyType)).toBe(false)
	})

	it('supports configs without version but with scenes', () => {
		const cfg = normalizeThreadTemplateConfig({
			scenes: { cover: { root: { type: 'Text', text: 'hi' } } },
		})

		const root = cfg.scenes!.cover!.root as any
		expect(cfg.version).toBe(1)
		expect(root.type).toBe('Text')
		expect(root.text).toBe('hi')
	})

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
						border: true,
						borderWidth: 999,
						borderColor: 'border',
						background: 'rgba(255,255,255,0.05)',
						radius: 999,
						overflow: 'hidden',
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
		expect(root.border).toBe(true)
		expect(root.borderWidth).toBe(12)
		expect(root.borderColor).toBe('border')
		expect(root.background).toBe('rgba(255,255,255,0.05)')
		expect(root.radius).toBe(120)
		expect(root.overflow).toBe('hidden')
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
						overflow: 'hidden',
						children: [
							{
								type: 'Box',
								flex: -1,
								overflow: 'hidden',
								border: true,
								borderWidth: 999,
								borderColor: 'accent',
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
		expect(root.overflow).toBe('hidden')
		expect(root.children?.[0]?.type).toBe('Box')
		expect(root.children?.[0]?.flex).toBe(0)
		expect(root.children?.[0]?.border).toBe(true)
		expect(root.children?.[0]?.borderWidth).toBe(12)
		expect(root.children?.[0]?.borderColor).toBe('accent')
		expect(root.children?.[0]?.overflow).toBe('hidden')
	})

	it('clamps opacity on container nodes', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				cover: {
					root: {
						type: 'Stack',
						opacity: 2,
						children: [
							{
								type: 'Grid',
								columns: 2,
								opacity: -1,
								children: [
									{
										type: 'Box',
										opacity: 1.5,
										children: [
											{
												type: 'Absolute',
												opacity: -2,
												children: [{ type: 'Text', text: 'x' }],
											},
										],
									},
								],
							},
						],
					},
				},
			},
		})

		const root = cfg.scenes!.cover!.root as any
		expect(root.type).toBe('Stack')
		expect(root.opacity).toBe(1)
		expect(root.children?.[0]?.type).toBe('Grid')
		expect(root.children?.[0]?.opacity).toBe(0)
		expect(root.children?.[0]?.children?.[0]?.type).toBe('Box')
		expect(root.children?.[0]?.children?.[0]?.opacity).toBe(1)
		expect(root.children?.[0]?.children?.[0]?.children?.[0]?.type).toBe(
			'Absolute',
		)
		expect(root.children?.[0]?.children?.[0]?.children?.[0]?.opacity).toBe(0)
	})

	it('clamps opacity on Text nodes', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				cover: { root: { type: 'Text', text: 'hi', opacity: -1 } },
				post: { root: { type: 'Text', text: 'hi', opacity: 2 } },
			},
		})
		expect((cfg.scenes!.cover!.root as any).opacity).toBe(0)
		expect((cfg.scenes!.post!.root as any).opacity).toBe(1)
	})

	it('clamps opacity on Avatar/Metrics/ContentBlocks nodes', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				cover: {
					root: {
						type: 'Stack',
						children: [
							{
								type: 'Avatar',
								bind: 'root.author.avatarAssetId',
								opacity: -1,
							},
							{
								type: 'Metrics',
								bind: 'post.metrics.likes',
								opacity: 2,
							},
							{
								type: 'ContentBlocks',
								bind: 'root.contentBlocks',
								opacity: 1.5,
							},
						],
					},
				},
			},
		})

		const root = cfg.scenes!.cover!.root as any
		expect(root.type).toBe('Stack')
		expect(root.children?.[0]?.type).toBe('Avatar')
		expect(root.children?.[0]?.opacity).toBe(0)
		expect(root.children?.[1]?.type).toBe('Metrics')
		expect(root.children?.[1]?.opacity).toBe(1)
		expect(root.children?.[2]?.type).toBe('ContentBlocks')
		expect(root.children?.[2]?.opacity).toBe(1)
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
		expect(root.children?.[0]?.children?.[1]?.bind).toBe(
			'timeline.replyIndicator',
		)
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

	it('falls back to default scene root on legacy node type', () => {
		const legacyType = ('B' + 'uiltin') as any
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				post: {
					root: {
						type: legacyType,
						kind: 'repliesList',
					},
				},
			},
		})
		const root = cfg.scenes?.post?.root as any
		expect(root.type).toBe('Stack')
		expect(root.children?.[0]?.type).toBe('Stack')
	})

	it('drops legacy nodes inside containers', () => {
		const legacyType = ('B' + 'uiltin') as any
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				post: {
					root: {
						type: 'Stack',
						children: [
							{ type: legacyType, kind: 'repliesListHeader' },
							{
								type: 'Grid',
								columns: 2,
								children: [
									{
										type: legacyType,
										kind: 'repliesListRootPost',
										wrapRootRoot: true,
										rootRoot: { type: 'Text', bind: 'root.plainText' },
									},
									{
										type: legacyType,
										kind: 'repliesListReplies',
										gap: 999,
										wrapItemRoot: true,
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
							{ type: 'Text', text: 'ok' },
						],
					},
				},
			},
		})

		const root = cfg.scenes?.post?.root as any
		expect(root.type).toBe('Stack')
		expect(root.children?.length).toBe(2)
		expect(root.children?.[0]?.type).toBe('Grid')
		expect((root.children?.[0]?.children ?? []).length).toBe(0)
		expect(root.children?.[1]?.type).toBe('Text')
	})

	it('keeps Repeat(replies) and clamps options', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				post: {
					root: {
						type: 'Repeat',
						source: 'replies',
						maxItems: 999,
						gap: -1,
						wrapItemRoot: true,
						scroll: false,
						highlight: {
							thickness: 0,
							radius: 999,
							opacity: -1,
							enabled: true,
						},
						itemRoot: { type: 'Text', bind: 'post.plainText' },
					},
				},
			},
		})

		const root = cfg.scenes?.post?.root as any
		expect(root.type).toBe('Repeat')
		expect(root.source).toBe('replies')
		expect(root.maxItems).toBe(100)
		expect(root.gap).toBe(0)
		expect(root.wrapItemRoot).toBe(true)
		expect(root.scroll).toBe(false)
		expect(root.highlight?.thickness).toBe(1)
		expect(root.highlight?.radius).toBe(48)
		expect(root.highlight?.opacity).toBe(0)
		expect(root.itemRoot?.type).toBe('Text')
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
						position: '50% 25%',
						opacity: 999,
						blur: 999,
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
		expect(root.position).toBe('50% 25%')
		expect(root.opacity).toBe(1)
		expect(root.blur).toBe(80)
		expect(root.width).toBe(16)
		expect(root.height).toBe(1600)
	})

	it('clamps Image blur to 0..80', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				cover: { root: { type: 'Image', assetId: 'asset_1', blur: -1 } },
				post: { root: { type: 'Image', assetId: 'asset_1', blur: 999 } },
			},
		})

		const cover = cfg.scenes?.cover?.root as any
		expect(cover.type).toBe('Image')
		expect(cover.blur).toBe(0)

		const post = cfg.scenes?.post?.root as any
		expect(post.type).toBe('Image')
		expect(post.blur).toBe(80)
	})

	it('drops Image node when assetId is an external URL', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				cover: {
					root: { type: 'Image', assetId: 'https://example.com/x.png' },
				},
			},
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
			scenes: {
				cover: {
					root: { type: 'Video', assetId: 'ext:https://example.com/x.mp4' },
				},
			},
		})
		const root = cfg.scenes!.cover!.root as any
		expect(root?.type).toBe('Stack')
	})

	it('clamps Video blur to 0..80', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				cover: { root: { type: 'Video', assetId: 'asset_1', blur: -1 } },
				post: { root: { type: 'Video', assetId: 'asset_1', blur: 999 } },
			},
		})

		const cover = cfg.scenes?.cover?.root as any
		expect(cover.type).toBe('Video')
		expect(cover.blur).toBe(0)

		const post = cfg.scenes?.post?.root as any
		expect(post.type).toBe('Video')
		expect(post.blur).toBe(80)
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
					root: {
						type: 'Text',
						bind: 'timeline.replyIndicator',
						uppercase: true,
						letterSpacing: 999,
						lineHeight: 0.1,
					},
				},
			},
		})
		const root = cfg.scenes!.cover!.root as any
		expect(root.type).toBe('Text')
		expect(root.bind).toBe('timeline.replyIndicator')
		expect(root.uppercase).toBe(true)
		expect(root.letterSpacing).toBe(1)
		expect(root.lineHeight).toBe(0.8)
	})

	it('keeps Text translation bindings', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				cover: {
					root: { type: 'Text', bind: 'root.translations.zh-CN.plainText' },
				},
				post: {
					root: { type: 'Text', bind: 'post.translations.zh-CN.plainText' },
				},
			},
		})

		expect((cfg.scenes!.cover!.root as any).bind).toBe(
			'root.translations.zh-CN.plainText',
		)
		expect((cfg.scenes!.post!.root as any).bind).toBe(
			'post.translations.zh-CN.plainText',
		)
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
					root: {
						type: 'Background',
						color: 'url(https://example.com/bg.png)',
					},
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
						zIndex: 999,
						pointerEvents: false,
						rotate: 999,
						scale: 0,
						origin: 'top-left',
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
		expect(root.zIndex).toBe(100)
		expect(root.pointerEvents).toBe(false)
		expect(root.rotate).toBe(180)
		expect(root.scale).toBe(0.1)
		expect(root.origin).toBe('top-left')
		expect(root.children?.[0]?.type).toBe('Text')
	})

	it('drops Absolute origin when invalid', () => {
		const cfg = normalizeThreadTemplateConfig({
			version: 1,
			scenes: {
				cover: { root: { type: 'Absolute', origin: 'nope', children: [] } },
			},
		})

		const root = cfg.scenes!.cover!.root as any
		expect(root.type).toBe('Absolute')
		expect(root.origin).toBeUndefined()
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
						border: true,
						borderWidth: 0,
						borderColor: 'accent',
						background: 'rgba(255,255,255,0.01)',
						radius: 999,
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
		expect(root.border).toBe(true)
		expect(root.borderWidth).toBe(1)
		expect(root.borderColor).toBe('accent')
		expect(root.background).toBe('rgba(255,255,255,0.01)')
		expect(root.radius).toBe(120)
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
						position: 'left top',
						opacity: -1,
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
		expect(root.position).toBe('left top')
		expect(root.opacity).toBe(0)
		expect(root.width).toBe(16)
		expect(root.height).toBe(1600)
	})
})
