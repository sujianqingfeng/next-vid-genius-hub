import { os } from '@orpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { RequestContext } from '~/lib/auth/types'
import { getJobStatus, type JobManifest } from '~/lib/cloudflare'
import { getDb, schema } from '~/lib/db'
import { enqueueCloudTask } from '~/lib/job/enqueue'
import { TASK_KINDS } from '~/lib/job/task'
import { logger } from '~/lib/logger'
import { MEDIA_SOURCES } from '~/lib/media/source'
import { ProviderFactory } from '~/lib/providers/provider-factory'
import { resolveSuccessProxy } from '~/lib/proxy/resolve-success-proxy'
import { toProxyJobPayload } from '~/lib/proxy/utils'
import { createId } from '~/lib/utils/id'

const DownloadInputSchema = z.object({
	url: z.string().url(),
	quality: z.enum(['1080p', '720p']).optional().default('1080p'),
	proxyId: z.string().optional(),
})

export const startCloudDownload = os
	.input(DownloadInputSchema)
	.handler(async ({ input, context }) => {
		const { url, quality, proxyId } = input
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id

		const provider = ProviderFactory.resolveProvider(url)
		const source =
			provider.id === MEDIA_SOURCES.TIKTOK
				? MEDIA_SOURCES.TIKTOK
				: MEDIA_SOURCES.YOUTUBE
		const now = new Date()

		const db = await getDb()
		const existing = await db.query.media.findFirst({
			where: and(eq(schema.media.url, url), eq(schema.media.userId, userId)),
		})

		let mediaId = existing?.id
		let insertedCandidateId: string | null = null
		if (!mediaId) {
			insertedCandidateId = createId()
			mediaId = insertedCandidateId
		}

		logger.info(
			'media',
			`[download.start] user=${userId} media=${mediaId} url=${url} source=${source} quality=${quality} proxyId=${proxyId ?? 'none'}`,
		)

		if (!existing) {
			await db
				.insert(schema.media)
				.values({
					id: mediaId!,
					userId,
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

			const ensured = await db.query.media.findFirst({
				where: and(eq(schema.media.url, url), eq(schema.media.userId, userId)),
			})
			if (!ensured) {
				throw new Error('Failed to create media record for download')
			}
			mediaId = ensured.id

			// If another request inserted the row first (unique by userId+url), ensure we
			// operate on the persisted id and apply the "retry" semantics.
			if (insertedCandidateId && ensured.id !== insertedCandidateId) {
				logger.warn(
					'media',
					`[download.start] media insert raced; using existing mediaId=${ensured.id} instead of candidate=${insertedCandidateId}`,
				)

				await db
					.update(schema.media)
					.set({
						downloadBackend: 'cloud',
						downloadStatus: 'queued',
						downloadError: null,
						downloadQueuedAt: now,
						downloadCompletedAt: null,
						// Keep any existing remote keys so the media stays streamable during retry.
						downloadJobId: null,
						filePath: ensured.filePath,
						audioFilePath: ensured.audioFilePath,
						rawMetadataPath: ensured.rawMetadataPath,
						rawMetadataDownloadedAt: ensured.rawMetadataDownloadedAt,
					})
					.where(eq(schema.media.id, ensured.id))
			}
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
					// 保留 remoteVideoKey/remoteAudioProcessedKey/remoteAudioSourceKey/remoteMetadataKey，不要在重试时清空
					// 新任务成功回调后会用最新 Key 覆盖
					downloadJobId: null,
					filePath: existing.filePath,
					audioFilePath: existing.audioFilePath,
					rawMetadataPath: existing.rawMetadataPath,
					rawMetadataDownloadedAt: existing.rawMetadataDownloadedAt,
				})
				.where(eq(schema.media.id, existing.id))
		}

		try {
			const { proxyId: effectiveProxyId, proxyRecord } =
				await resolveSuccessProxy({ db, requestedProxyId: proxyId })
			const proxyPayload = toProxyJobPayload(proxyRecord)

			const { taskId, jobId } = await enqueueCloudTask({
				db,
				userId,
				kind: TASK_KINDS.DOWNLOAD,
				engine: 'media-downloader',
				targetType: 'media',
				targetId: mediaId,
				mediaId,
				purpose: TASK_KINDS.DOWNLOAD,
				title: existing?.title || 'Pending download',
				payload: { url, quality, source, proxyId: effectiveProxyId ?? null },
				options: {
					url,
					quality,
					source,
					proxy: proxyPayload,
				},
				buildManifest: ({ jobId }): JobManifest => {
					// Minimal per-job manifest for downloader. Inputs live in engineOptions
					// (url/quality/source); containers/orchestrator don't need DB access.
					return {
						jobId,
						mediaId,
						purpose: TASK_KINDS.DOWNLOAD,
						engine: 'media-downloader',
						createdAt: Date.now(),
						inputs: {},
						optionsSnapshot: {
							url,
							quality,
							source,
							proxyId: effectiveProxyId ?? null,
						},
					}
				},
			})

			logger.info(
				'media',
				`[download.job] queued media=${mediaId} job=${jobId} user=${userId} source=${source} quality=${quality} requestedProxyId=${proxyId ?? 'none'} proxyId=${effectiveProxyId ?? 'none'}`,
			)

			await db
				.update(schema.media)
				.set({
					downloadJobId: jobId,
				})
				.where(eq(schema.media.id, mediaId!))

			return {
				mediaId: mediaId!,
				jobId,
				taskId,
			}
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: 'Failed to start cloud download'
			logger.error(
				'media',
				`[download.error] media=${mediaId} user=${userId} url=${url} source=${source} quality=${quality} error=${message}`,
			)
			await db
				.update(schema.media)
				.set({
					downloadStatus: 'failed',
					downloadError: message,
				})
				.where(eq(schema.media.id, mediaId!))
			throw error
		}
	})

export const getCloudDownloadStatus = os
	.input(z.object({ jobId: z.string().min(1) }))
	.handler(async ({ input }) => {
		const status = await getJobStatus(input.jobId)
		logger.debug(
			'media',
			`[download.status] job=${input.jobId} status=${status.status} progress=${typeof status.progress === 'number' ? Math.round(status.progress * 100) : 'n/a'}`,
		)
		return status
	})
