import { os } from '@orpc/server'
import { z } from 'zod'
import { downloadService } from '~/lib/services/download'

export const download = os
	.input(
		z.object({
			url: z.string().url(),
			quality: z.enum(['1080p', '720p']).optional().default('1080p'),
			proxyId: z.string().optional(),
		}),
	)
	.handler(async ({ input }) => {
		const { url, quality, proxyId } = input

		try {
			// 使用新的下载服务
			const result = await downloadService.download({ url, quality, proxyId })

			return {
				id: result.id,
				videoPath: result.videoPath,
				audioPath: result.audioPath,
				title: result.title,
				source: result.source,
			}
		} catch (error) {
			console.error('Download failed:', error)
			throw new Error(
				`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			)
		}
	})
