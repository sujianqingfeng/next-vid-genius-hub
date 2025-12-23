import { TERMINAL_JOB_STATUSES } from '@app/media-domain'
import { os } from '@orpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { RequestContext } from '~/lib/auth/types'
import {
	getJobStatus,
	type JobManifest,
	putJobManifest,
	startCloudJob,
} from '~/lib/cloudflare'
import { getDb, schema } from '~/lib/db'
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

		const mediaId = existing?.id ?? createId()

		logger.info(
			'media',
			`[download.start] user=${userId} media=${mediaId} url=${url} source=${source} quality=${quality} proxyId=${proxyId ?? 'none'}`,
		)

		if (!existing) {
			await db
				.insert(schema.media)
				.values({
					id: mediaId,
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

		const taskId = createId()
		// Generate a stable jobId so we can create a per-job manifest before
		// calling the orchestrator.
		const jobId = `job_${createId()}`

		try {
			const { proxyId: effectiveProxyId, proxyRecord } =
				await resolveSuccessProxy({ db, requestedProxyId: proxyId })
			const proxyPayload = toProxyJobPayload(proxyRecord)

			await db.insert(schema.tasks).values({
				id: taskId,
				userId,
				kind: TASK_KINDS.DOWNLOAD,
				engine: 'media-downloader',
				targetType: 'media',
				targetId: mediaId,
				status: 'queued',
				progress: 0,
				payload: { url, quality, source, proxyId: effectiveProxyId ?? null },
				createdAt: now,
				updatedAt: now,
			})

			// Minimal per-job manifest for downloader. Inputs live in engineOptions
			// (url/quality/source); containers/orchestrator don't need DB access.
			const manifest: JobManifest = {
				jobId,
				mediaId,
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
			await putJobManifest(jobId, manifest)

			const job = await startCloudJob({
				jobId,
				mediaId,
				engine: 'media-downloader',
				title: existing?.title || 'Pending download',
				options: {
					url,
					quality,
					source,
					proxy: proxyPayload,
				},
			})

			logger.info(
				'media',
				`[download.job] queued media=${mediaId} job=${job.jobId} user=${userId} source=${source} quality=${quality} requestedProxyId=${proxyId ?? 'none'} proxyId=${effectiveProxyId ?? 'none'}`,
			)

			await db
				.update(schema.media)
				.set({
					downloadJobId: job.jobId,
				})
				.where(eq(schema.media.id, mediaId))

			await db
				.update(schema.tasks)
				.set({
					jobId: job.jobId,
					status: 'queued',
					startedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(schema.tasks.id, taskId))

			return {
				mediaId,
				jobId: job.jobId,
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
				.where(eq(schema.media.id, mediaId))
			await db
				.update(schema.tasks)
				.set({
					status: 'failed',
					error: message,
					finishedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(schema.tasks.id, taskId))
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
		try {
			const db = await getDb()
			const task = await db.query.tasks.findFirst({
				where: eq(schema.tasks.jobId, input.jobId),
			})
			if (task) {
				await db
					.update(schema.tasks)
					.set({
						status: status.status,
						progress:
							typeof status.progress === 'number'
								? Math.round(status.progress * 100)
								: null,
						jobStatusSnapshot: status,
						updatedAt: new Date(),
						finishedAt: TERMINAL_JOB_STATUSES.includes(status.status)
							? new Date()
							: task.finishedAt,
					})
					.where(eq(schema.tasks.id, task.id))

				// Best-effort reconciliation: sometimes the downloader callback arrives before
				// large artifacts are readable and the media row misses remote keys/sizes.
				// If clients poll status, heal the media record from orchestrator job state.
				if (
					task.targetType === 'media' &&
					task.targetId &&
					status.status === 'completed'
				) {
					const mediaId = task.targetId
					const media = await db.query.media.findFirst({
						where: eq(schema.media.id, mediaId),
					})
					if (media) {
						const videoKey =
							status.outputs?.video?.key ?? status.outputKey ?? null
						const audioProcessedKey =
							status.outputs?.audioProcessed?.key ??
							status.outputs?.audio?.key ??
							status.outputAudioKey ??
							null
						const audioSourceKey = status.outputs?.audioSource?.key ?? null
						const metadataKey =
							status.outputs?.metadata?.key ?? status.outputMetadataKey ?? null

						const metadata = (status.metadata || {}) as Record<string, unknown>
						const updates: Record<string, unknown> = {}

						if (videoKey && !media.remoteVideoKey)
							updates.remoteVideoKey = videoKey
						if (audioProcessedKey && !media.remoteAudioKey)
							updates.remoteAudioKey = audioProcessedKey
						if (audioProcessedKey && !media.remoteAudioProcessedKey)
							updates.remoteAudioProcessedKey = audioProcessedKey
						if (audioSourceKey && !media.remoteAudioSourceKey)
							updates.remoteAudioSourceKey = audioSourceKey
						if (metadataKey && !media.remoteMetadataKey)
							updates.remoteMetadataKey = metadataKey

						const title =
							typeof metadata.title === 'string' && metadata.title.trim()
								? metadata.title.trim()
								: null
						if (title && (media.title === 'Pending download' || !media.title))
							updates.title = title

						const videoBytes =
							typeof metadata.videoBytes === 'number' &&
							Number.isFinite(metadata.videoBytes)
								? metadata.videoBytes
								: null
						const audioBytes =
							typeof metadata.audioBytes === 'number' &&
							Number.isFinite(metadata.audioBytes)
								? metadata.audioBytes
								: null
						if (
							videoBytes !== null &&
							(media.downloadVideoBytes == null ||
								media.downloadVideoBytes <= 0)
						) {
							updates.downloadVideoBytes = videoBytes
						}
						if (
							audioBytes !== null &&
							(media.downloadAudioBytes == null ||
								media.downloadAudioBytes <= 0)
						) {
							updates.downloadAudioBytes = audioBytes
						}

						if (Object.keys(updates).length > 0) {
							await db
								.update(schema.media)
								.set(updates)
								.where(eq(schema.media.id, mediaId))
						}
					}
				}
			}
		} catch {
			// Best-effort; ignore task sync errors
		}
		return status
	})
