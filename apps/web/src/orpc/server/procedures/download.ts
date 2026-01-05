import { os } from '@orpc/server'
import { z } from 'zod'
import type { RequestContext } from '~/lib/features/auth/types'
import {
	getCloudDownloadStatus as getCloudDownloadStatusFn,
	startCloudDownload as startCloudDownloadUseCase,
} from '~/lib/domain/media/server/download'

const DownloadInputSchema = z.object({
	url: z.string().url(),
	quality: z.enum(['1080p', '720p']).optional().default('1080p'),
	proxyId: z.string().optional(),
})

export const startCloudDownload = os
	.input(DownloadInputSchema)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		return startCloudDownloadUseCase({
			userId: ctx.auth.user!.id,
			url: input.url,
			quality: input.quality,
			proxyId: input.proxyId ?? null,
		})
	})

export const getCloudDownloadStatus = os
	.input(z.object({ jobId: z.string().min(1) }))
	.handler(async ({ input }) => {
		return getCloudDownloadStatusFn(input)
	})
