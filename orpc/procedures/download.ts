import { createId } from '@paralleldrive/cuid2'
import { os } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '~/lib/db'
import { ProviderFactory } from '~/lib/providers/provider-factory'
import { startCloudJob, getJobStatus } from '~/lib/cloudflare'
import { PROXY_URL } from '~/lib/config/app.config'
import { toProxyJobPayload } from '~/lib/proxy/utils'

const DownloadInputSchema = z.object({
	url: z.string().url(),
	quality: z.enum(['1080p', '720p']).optional().default('1080p'),
	proxyId: z.string().optional(),
})

export const startCloudDownload = os
	.input(DownloadInputSchema)
	.handler(async ({ input }) => {
		const { url, quality, proxyId } = input

		const provider = ProviderFactory.resolveProvider(url)
		const source = provider.id === 'tiktok' ? 'tiktok' : 'youtube'
		const now = new Date()

		const db = await getDb()
		const existing = await db.query.media.findFirst({
			where: eq(schema.media.url, url),
		})

		const mediaId = existing?.id ?? createId()

		if (!existing) {
			await db
				.insert(schema.media)
				.values({
					id: mediaId,
					url,
					source: source as 'youtube' | 'tiktok',
					title: 'Pending download',
					quality,
					downloadBackend: 'cloud',
					downloadStatus: 'queued',
					downloadQueuedAt: now,
					rawMetadataPath: null,
					rawMetadataDownloadedAt: null,
					remoteMetadataKey: null,
				})
				.onConflictDoNothing()
		} else {
			// 保留现有远端 Key，确保在新任务排队/执行期间仍可通过 /api/media/:id/source 提供可播放源
			await db
				.update(schema.media)
				.set({
					downloadBackend: 'cloud',
					downloadStatus: 'queued',
					downloadError: null,
					downloadQueuedAt: now,
					downloadCompletedAt: null,
					// 保留 remoteVideoKey/remoteAudioKey/remoteMetadataKey，不要在重试时清空
					// 新任务成功回调后会用最新 Key 覆盖
					downloadJobId: null,
					filePath: existing.filePath,
					audioFilePath: existing.audioFilePath,
					rawMetadataPath: existing.rawMetadataPath,
					rawMetadataDownloadedAt: existing.rawMetadataDownloadedAt,
				})
				.where(eq(schema.media.id, existing.id))
		}

		const proxyConfig = proxyId
			? await db.query.proxies.findFirst({
					where: eq(schema.proxies.id, proxyId),
				})
			: null
		const proxyPayload = toProxyJobPayload(proxyConfig)

		try {
			const job = await startCloudJob({
				mediaId,
				engine: 'media-downloader',
				options: {
					url,
					quality,
					source,
					proxy: proxyPayload,
					defaultProxyUrl: PROXY_URL,
				},
			})

			await db
				.update(schema.media)
				.set({
					downloadJobId: job.jobId,
				})
				.where(eq(schema.media.id, mediaId))

			return {
				mediaId,
				jobId: job.jobId,
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to start cloud download'
			await db
				.update(schema.media)
				.set({
					downloadStatus: 'failed',
					downloadError: message,
				})
				.where(eq(schema.media.id, mediaId))
			throw error
		}
	})

export const getCloudDownloadStatus = os
	.input(z.object({ jobId: z.string().min(1) }))
	.handler(async ({ input }) => {
		const status = await getJobStatus(input.jobId)
		return status
	})
