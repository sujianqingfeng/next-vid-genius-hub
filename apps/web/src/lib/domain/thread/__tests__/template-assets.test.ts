import { describe, expect, it } from 'vitest'
import { collectThreadTemplateAssetIds } from '~/lib/domain/thread/template-assets'

describe('collectThreadTemplateAssetIds', () => {
	it('collects Background/Image/Video assetId references', () => {
		const resolved = {
			version: 1,
			scenes: {
				cover: { root: { type: 'Background', assetId: 'asset_bg' } },
				post: {
					root: {
						type: 'Stack',
						children: [
							{ type: 'Image', assetId: 'asset_img' },
							{ type: 'Video', assetId: 'asset_vid' },
						],
					},
				},
			},
		} as any

		const ids = collectThreadTemplateAssetIds(resolved)
		expect([...ids].sort()).toEqual(['asset_bg', 'asset_img', 'asset_vid'])
	})

	it('collects assetId references from Repeat(replies)', () => {
		const resolved = {
			version: 1,
			scenes: {
				post: {
					root: {
						type: 'Repeat',
						itemRoot: {
							type: 'Stack',
							children: [{ type: 'Image', assetId: 'asset_repeat_img' }],
						},
					},
				},
			},
		} as any

		expect([...collectThreadTemplateAssetIds(resolved)].sort()).toEqual([
			'asset_repeat_img',
		])
	})

	it('ignores placeholders and external urls', () => {
		const resolved = {
			version: 1,
			scenes: {
				cover: {
					root: {
						type: 'Stack',
						children: [
							{ type: 'Image', assetId: '__IMAGE_ASSET_ID__' },
							{ type: 'Video', assetId: 'https://example.com/x.mp4' },
						],
					},
				},
			},
		} as any

		expect([...collectThreadTemplateAssetIds(resolved)]).toEqual([])
	})
})
