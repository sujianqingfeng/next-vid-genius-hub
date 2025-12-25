import { bucketPaths } from '@app/media-domain'
import { os } from '@orpc/server'
import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { RequestContext } from '~/lib/auth/types'
import {
	deleteCloudArtifacts,
	getJobStatus,
	type JobManifest,
	putJobManifest,
	startCloudJob,
} from '~/lib/cloudflare'
import { getDb, schema } from '~/lib/db'
import { TASK_KINDS } from '~/lib/job/task'
import { logger } from '~/lib/logger'
import { MEDIA_SOURCES } from '~/lib/media/source'
import {
	listTransactionsByRef,
	summarizeTransactionsByRef,
} from '~/lib/points/service'
import { ProviderFactory } from '~/lib/providers/provider-factory'
import { resolveSuccessProxy } from '~/lib/proxy/resolve-success-proxy'
import { toProxyJobPayload } from '~/lib/proxy/utils'
import { createId } from '~/lib/utils/id'
import { CommentsTemplateConfigSchema } from '~/lib/remotion/comments-template-config'

export const list = os
	.input(
		z.object({
			page: z.number().min(1).optional().default(1),
			limit: z.number().min(1).max(100).optional().default(9),
		}),
	)
	.handler(async ({ input, context }) => {
		const { page = 1, limit = 9 } = input
		const offset = (page - 1) * limit
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id

		// Fetch paginated items with stable ordering
		const db = await getDb()
		const items = await db
			.select()
			.from(schema.media)
			.where(eq(schema.media.userId, userId))
			.orderBy(desc(schema.media.createdAt))
			.limit(limit)
			.offset(offset)

		// Get total count for pagination efficiently
		const [{ count }] = await db
			.select({ count: sql<number>`count(*)` })
			.from(schema.media)
			.where(eq(schema.media.userId, userId))

		return {
			items,
			total: Number(count ?? 0),
			page,
			limit,
		}
	})

export const byId = os
	.input(z.object({ id: z.string() }))
	.handler(async ({ input, context }) => {
		const { id } = input
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()
		const item = await db.query.media.findFirst({
			where: and(eq(schema.media.id, id), eq(schema.media.userId, userId)),
		})
		return item
	})

export const listPointTransactions = os
	.input(
		z.object({
			id: z.string().min(1),
			limit: z.number().int().min(1).max(100).default(50),
			offset: z.number().int().min(0).default(0),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()

		const media = await db.query.media.findFirst({
			where: and(
				eq(schema.media.id, input.id),
				eq(schema.media.userId, userId),
			),
			columns: { id: true },
		})
		if (!media) {
			throw new Error('Media not found')
		}

		const [summary, items] = await Promise.all([
			summarizeTransactionsByRef({ userId, refId: media.id, db }),
			listTransactionsByRef({
				userId,
				refId: media.id,
				limit: input.limit,
				offset: input.offset,
				db,
			}),
		])

		return {
			items,
			total: summary.total,
			netDelta: summary.netDelta,
			limit: input.limit,
			offset: input.offset,
		}
	})

// Refresh metadata from upstream provider via cloud downloader (no video re-download)
export const refreshMetadata = os
	.input(
		z.object({
			id: z.string(),
			proxyId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id

		const db = await getDb()
		const record = await db.query.media.findFirst({
			where: and(
				eq(schema.media.id, input.id),
				eq(schema.media.userId, userId),
			),
		})
		if (!record) {
			throw new Error('Media not found')
		}
		if (!record.url) {
			throw new Error('Media URL is missing; cannot refresh metadata')
		}

		const provider = ProviderFactory.resolveProvider(record.url)
		const source =
			provider.id === MEDIA_SOURCES.TIKTOK
				? MEDIA_SOURCES.TIKTOK
				: MEDIA_SOURCES.YOUTUBE

		logger.info(
			'media',
			`[metadata.refresh.start] media=${record.id} user=${userId} source=${source} proxyId=${input.proxyId ?? 'none'}`,
		)

		const { proxyId: effectiveProxyId, proxyRecord } =
			await resolveSuccessProxy({
				db,
				requestedProxyId: input.proxyId,
			})
		const proxyPayload = toProxyJobPayload(proxyRecord)

		const taskId = createId()
		const jobId = `job_${createId()}`
		await db.insert(schema.tasks).values({
			id: taskId,
			userId,
			kind: TASK_KINDS.METADATA_REFRESH,
			engine: 'media-downloader',
			targetType: 'media',
			targetId: record.id,
			status: 'queued',
			progress: 0,
			payload: {
				url: record.url,
				quality: record.quality || '1080p',
				source,
				proxyId: effectiveProxyId ?? null,
			},
			createdAt: new Date(),
			updatedAt: new Date(),
		})

		try {
			const manifest: JobManifest = {
				jobId,
				mediaId: record.id,
				engine: 'media-downloader',
				createdAt: Date.now(),
				inputs: {},
				optionsSnapshot: {
					task: 'metadata-only',
					url: record.url,
					quality: record.quality || '1080p',
					source,
					proxyId: effectiveProxyId ?? null,
				},
			}
			await putJobManifest(jobId, manifest)

			const job = await startCloudJob({
				jobId,
				mediaId: record.id,
				engine: 'media-downloader',
				title: record.title || undefined,
				options: {
					task: 'metadata-only',
					url: record.url,
					quality: (record.quality || '1080p') as '720p' | '1080p',
					source,
					proxy: proxyPayload,
				},
			})

			await db
				.update(schema.tasks)
				.set({
					jobId: job.jobId,
					startedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(schema.tasks.id, taskId))

			return { jobId: job.jobId, taskId }
		} catch (err) {
			const message =
				err instanceof Error ? err.message : 'Failed to refresh metadata'
			logger.error(
				'media',
				`[metadata.refresh.error] media=${record.id} user=${userId} error=${message}`,
			)
			await db
				.update(schema.tasks)
				.set({
					status: 'failed',
					error: message,
					finishedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(schema.tasks.id, taskId))
			throw err
		}
	})

export const getMetadataRefreshStatus = os
	.input(z.object({ jobId: z.string().min(1) }))
	.handler(async ({ input }) => {
		// Read-only: callback is responsible for writing projections.
		return getJobStatus(input.jobId)
	})

export const updateTitles = os
	.input(
		z.object({
			id: z.string(),
			title: z.string().optional(),
			translatedTitle: z.string().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		const { id, title, translatedTitle } = input
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id

		const updateData: Record<string, string | undefined> = {}
		if (title !== undefined) updateData.title = title
		if (translatedTitle !== undefined)
			updateData.translatedTitle = translatedTitle

		const db = await getDb()
		await db
			.update(schema.media)
			.set(updateData)
			.where(and(eq(schema.media.id, id), eq(schema.media.userId, userId)))

		const updated = await db.query.media.findFirst({
			where: and(eq(schema.media.id, id), eq(schema.media.userId, userId)),
		})
		return updated
	})

// 更新渲染相关设置（目前仅支持评论模板）
export const updateRenderSettings = os
	.input(
		z.object({
			id: z.string(),
			commentsTemplate: z.string().optional(),
			commentsTemplateConfig: z.unknown().optional().nullable(),
		}),
	)
	.handler(async ({ input, context }) => {
		const { id, commentsTemplate, commentsTemplateConfig } = input
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const updates: Record<string, unknown> = {}
		if (typeof commentsTemplate !== 'undefined')
			updates.commentsTemplate = commentsTemplate
		if (typeof commentsTemplateConfig !== 'undefined') {
			if (commentsTemplateConfig === null) {
				updates.commentsTemplateConfig = null
			} else {
				const parsed = CommentsTemplateConfigSchema.safeParse(
					commentsTemplateConfig,
				)
				if (!parsed.success) throw new Error('Invalid commentsTemplateConfig')
				updates.commentsTemplateConfig = parsed.data
			}
		}
		const db = await getDb()
		await db
			.update(schema.media)
			.set(updates)
			.where(and(eq(schema.media.id, id), eq(schema.media.userId, userId)))
		const updated = await db.query.media.findFirst({
			where: and(eq(schema.media.id, id), eq(schema.media.userId, userId)),
		})
		return updated
	})

export const deleteById = os
	.input(z.object({ id: z.string() }))
	.handler(async ({ input, context }) => {
		const { id } = input
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id

		// 1) Load record to gather cloud references (best-effort)
		const db = await getDb()
		const record = await db.query.media.findFirst({
			where: and(eq(schema.media.id, id), eq(schema.media.userId, userId)),
		})

		// 2) Best-effort cloud cleanup (remote keys + orchestrator artifacts)
		try {
			if (record) {
				const keys: string[] = []
				// Directly referenced remote objects from the record
				if (record.remoteVideoKey) keys.push(record.remoteVideoKey)
				if (record.remoteAudioKey) keys.push(record.remoteAudioKey)
				if (record.remoteAudioSourceKey) keys.push(record.remoteAudioSourceKey)
				if (record.remoteAudioProcessedKey)
					keys.push(record.remoteAudioProcessedKey)
				if (record.remoteMetadataKey) keys.push(record.remoteMetadataKey)
				// Well-known per-media objects that we materialize into the bucket
				const pathOptions = { title: record.title || undefined }
				keys.push(
					bucketPaths.inputs.subtitles(id, pathOptions),
					bucketPaths.inputs.subtitledVideo(id, pathOptions),
					bucketPaths.inputs.comments(id, pathOptions),
				)

				const artifactJobIds: string[] = []
				// videoWithSubtitlesPath or videoWithInfoPath might store remote orchestrator artifact refs: "remote:orchestrator:<jobId>"
				for (const p of [
					record.videoWithSubtitlesPath,
					record.videoWithInfoPath,
					record.filePath,
				]) {
					if (typeof p === 'string' && p.startsWith('remote:orchestrator:')) {
						const jobId = p.split(':').pop()
						if (jobId) artifactJobIds.push(jobId)
					}
				}
				// Also include the cloud download job id (if any)
				if (record.downloadJobId) artifactJobIds.push(record.downloadJobId)

				// Known per-media prefixes that may contain multiple artifacts
				const prefixes = [
					bucketPaths.outputs.byMediaPrefix(id, pathOptions),
					bucketPaths.downloads.prefix(id, pathOptions),
					bucketPaths.asr.results.prefix(id, pathOptions),
					// Also delete processed audio produced by ASR pipeline (if any)
					bucketPaths.asr.processedPrefix(id, pathOptions),
				]

				await deleteCloudArtifacts({ keys, artifactJobIds, prefixes })
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			logger.warn(
				'media',
				`[media.deleteById] cloud cleanup failed (continuing): ${msg}`,
			)
		}

		// 3) Delete DB record（仅删除当前用户的媒体）
		await db
			.delete(schema.media)
			.where(and(eq(schema.media.id, id), eq(schema.media.userId, userId)))

		return { success: true }
	})
