import { describe, expect, it } from 'vitest'
import { normalizeThreadTemplateConfig } from '@app/remotion-project/thread-template-config'
import { collectThreadTemplateAssetIds } from '~/lib/thread/template-assets'

describe('collectThreadTemplateAssetIds', () => {
	it('collects Background/Image/Video assetId references', () => {
		const resolved = normalizeThreadTemplateConfig({
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
		})

		const ids = collectThreadTemplateAssetIds(resolved)
		expect([...ids].sort()).toEqual(['asset_bg', 'asset_img', 'asset_vid'])
	})

	it('ignores placeholders and external urls', () => {
		const resolved = normalizeThreadTemplateConfig({
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
		})

		expect([...collectThreadTemplateAssetIds(resolved)]).toEqual([])
	})
})

