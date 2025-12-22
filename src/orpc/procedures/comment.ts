import { TERMINAL_JOB_STATUSES } from '@app/media-domain'
import { os } from '@orpc/server'
import { DEFAULT_TEMPLATE_ID } from '@remotion/templates'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDefaultAiModel, isEnabledModel } from '~/lib/ai/config/service'
import {
	translateTextsWithUsage,
	translateTextWithUsage,
} from '~/lib/ai/translate'
import type { RequestContext } from '~/lib/auth/types'
import {
	getJobStatus,
	type JobManifest,
	presignGetByKey,
	putJobManifest,
	startCloudJob,
} from '~/lib/cloudflare'
import { TRANSLATE_CONCURRENCY } from '~/lib/config/env'
import { getDb, schema } from '~/lib/db'
import { TASK_KINDS } from '~/lib/job/task'
import { logger } from '~/lib/logger'
import { buildCommentsSnapshot } from '~/lib/media/comments-snapshot'
import { resolveCloudVideoKey } from '~/lib/media/resolve-cloud-video-key'
import { throwInsufficientPointsError } from '~/lib/orpc/errors'
import { chargeLlmUsage, InsufficientPointsError } from '~/lib/points/billing'
import { resolveProxyWithDefault } from '~/lib/proxy/default-proxy'
import { toProxyJobPayload } from '~/lib/proxy/utils'
import { mapWithConcurrency } from '~/lib/utils/concurrency'
import { createId } from '~/lib/utils/id'

export const translateComments = os
	.input(
		z.object({
			mediaId: z.string(),
			model: z.string().trim().min(1).optional(),
			force: z.boolean().optional().default(false),
		}),
	)
	.handler(async ({ input, context }) => {
		const { mediaId, force } = input
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()
		const defaultModel = await getDefaultAiModel('llm', db)
		const modelId = input.model ?? defaultModel?.id
		if (!modelId || !(await isEnabledModel('llm', modelId, db))) {
			throw new Error('LLM model is not enabled')
		}
		const media = await db.query.media.findFirst({
			where: and(eq(schema.media.id, mediaId), eq(schema.media.userId, userId)),
		})

		if (!media || !media.comments) {
			throw new Error('Media or comments not found')
		}

		const comments = media.comments

		// 翻译标题
		let translatedTitle = media.translatedTitle
		let totalInputTokens = 0
		let totalOutputTokens = 0
		if (media.title && (force || !translatedTitle)) {
			const res = await translateTextWithUsage(media.title, modelId)
			translatedTitle = res.translation
			totalInputTokens += res.usage.inputTokens
			totalOutputTokens += res.usage.outputTokens
		}

		// 翻译评论
		const translatedComments = [...comments]
		const pendingIndices: number[] = []
		for (let i = 0; i < comments.length; i++) {
			const comment = comments[i]
			if (!comment?.content) continue
			if (comment.translatedContent && !force) continue
			pendingIndices.push(i)
		}

		// Cloudflare Workers has a strict subrequest limit per invocation.
		// A naive per-comment translation quickly exceeds it. Batch translations
		// to keep the number of outbound requests bounded.
		const MAX_BATCH_ITEMS = 20
		const MAX_BATCH_CHARS = 6000
		const MAX_BATCHES_PER_REQUEST = 20

		const batches: number[][] = []
		let current: number[] = []
		let currentChars = 0

		const pushCurrent = () => {
			if (current.length === 0) return
			batches.push(current)
			current = []
			currentChars = 0
		}

		for (const idx of pendingIndices) {
			if (batches.length >= MAX_BATCHES_PER_REQUEST) break
			const text = String(comments[idx]?.content ?? '')
			const textChars = text.length
			const wouldOverflow =
				current.length >= MAX_BATCH_ITEMS ||
				(current.length > 0 && currentChars + textChars > MAX_BATCH_CHARS)

			if (wouldOverflow) pushCurrent()
			if (batches.length >= MAX_BATCHES_PER_REQUEST) break

			current.push(idx)
			currentChars += textChars
		}
		pushCurrent()

		let translatedCount = 0
		const batchConcurrency = Math.min(TRANSLATE_CONCURRENCY, 3)
		const batchResults = await mapWithConcurrency(
			batches,
			Math.max(1, batchConcurrency),
			async (batch) => {
				const texts = batch.map((i) => String(comments[i]?.content ?? ''))
				return translateTextsWithUsage(texts, modelId)
			},
		)

		for (let i = 0; i < batches.length; i++) {
			const batch = batches[i]
			const res = batchResults[i]
			totalInputTokens += res.usage.inputTokens
			totalOutputTokens += res.usage.outputTokens
			for (let j = 0; j < batch.length; j++) {
				const idx = batch[j]
				const existing = comments[idx]
				translatedComments[idx] = {
					...existing,
					translatedContent: res.translations[j],
				}
				translatedCount++
			}
		}

		// Charge once for all LLM translation calls
		try {
			await chargeLlmUsage({
				userId,
				modelId,
				inputTokens: totalInputTokens,
				outputTokens: totalOutputTokens,
				refType: 'comments-translate',
				refId: mediaId,
				remark: `comments translate tokens=${totalInputTokens + totalOutputTokens}`,
			})
		} catch (err) {
			if (err instanceof InsufficientPointsError) {
				throwInsufficientPointsError('积分不足，评论翻译失败，请先充值。')
			}
			throw err
		}

		await db
			.update(schema.media)
			.set({
				comments: translatedComments,
				translatedTitle,
				commentCount: translatedComments.length,
			})
			.where(and(eq(schema.media.id, mediaId), eq(schema.media.userId, userId)))

		return {
			success: true,
			translatedCount,
			remainingCount: Math.max(0, pendingIndices.length - translatedCount),
			batches: batches.length,
			concurrency: Math.min(batchConcurrency, batches.length || 1),
		}
	})

export const deleteComment = os
	.input(
		z.object({
			mediaId: z.string(),
			commentId: z.string(),
		}),
	)
	.handler(async ({ input, context }) => {
		const { mediaId, commentId } = input
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id

		const db = await getDb()
		const media = await db.query.media.findFirst({
			where: and(eq(schema.media.id, mediaId), eq(schema.media.userId, userId)),
		})

		if (!media || !media.comments) {
			throw new Error('Media or comments not found')
		}

		// Filter out the comment to delete
		const updatedComments = media.comments.filter(
			(comment) => comment.id !== commentId,
		)

		await db
			.update(schema.media)
			.set({
				comments: updatedComments,
				commentCount: updatedComments.length,
			})
			.where(and(eq(schema.media.id, mediaId), eq(schema.media.userId, userId)))

		return { success: true }
	})

export const deleteComments = os
	.input(
		z.object({
			mediaId: z.string(),
			commentIds: z.array(z.string()).min(1),
		}),
	)
	.handler(async ({ input, context }) => {
		const { mediaId, commentIds } = input
		const ids = new Set(commentIds)
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id

		const db = await getDb()
		const media = await db.query.media.findFirst({
			where: and(eq(schema.media.id, mediaId), eq(schema.media.userId, userId)),
		})

		if (!media || !media.comments) {
			throw new Error('Media or comments not found')
		}

		const updatedComments = media.comments.filter(
			(comment) => !ids.has(comment.id),
		)
		const deletedCount = media.comments.length - updatedComments.length

		await db
			.update(schema.media)
			.set({
				comments: updatedComments,
				commentCount: updatedComments.length,
			})
			.where(and(eq(schema.media.id, mediaId), eq(schema.media.userId, userId)))

		return { success: true, deleted: deletedCount }
	})

// Cloud rendering: start job explicitly (Remotion renderer)
export const startCloudRender = os
	.input(
		z.object({
			mediaId: z.string(),
			proxyId: z.string().optional(),
			sourcePolicy: z
				.enum(['auto', 'original', 'subtitles'])
				.optional()
				.default('auto'),
			templateId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		const { mediaId, proxyId } = input
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()
		const where = and(
			eq(schema.media.id, mediaId),
			eq(schema.media.userId, userId),
		)
		const media = await db.query.media.findFirst({ where })
		if (!media) throw new Error('Media not found')
		// 允许在未本地落盘的情况下走云端渲染。
		// 需要存在一个可用的源：本地文件、已完成的云下载（downloadStatus=completed）、已存在的远端 key，或已有渲染成品。
		const hasAnySource = Boolean(
			media.filePath ||
			media.videoWithSubtitlesPath ||
			media.remoteVideoKey ||
			(media.downloadJobId && media.downloadStatus === 'completed'),
		)
		if (!hasAnySource) {
			throw new Error(
				'No source video available (need local file, rendered artifact, remote key, or a completed cloud download).',
			)
		}
		if (!media.comments || media.comments.length === 0) {
			throw new Error('No comments found for this media')
		}

		const resolvedVideoKey = await resolveCloudVideoKey({
			sourcePolicy: input.sourcePolicy,
			remoteVideoKey: media.remoteVideoKey ?? null,
			downloadJobId: media.downloadJobId ?? null,
			filePath: media.filePath ?? null,
			videoWithSubtitlesPath: media.videoWithSubtitlesPath ?? null,
		})
		if (!resolvedVideoKey) {
			throw new Error(
				'Source video not found in cloud storage. Re-run cloud download for this media and retry.',
			)
		}

		const comments = media.comments

		logger.info(
			'rendering',
			`[render.start] media=${mediaId} user=${userId} comments=${comments.length} sourcePolicy=${input.sourcePolicy ?? 'auto'} templateId=${input.templateId ?? media.commentsTemplate ?? DEFAULT_TEMPLATE_ID} proxyId=${proxyId ?? 'auto'}`,
		)

		let snapshotKey: string | undefined
		try {
			const snapshot = await buildCommentsSnapshot(media, { comments })
			snapshotKey = snapshot.key
			logger.info(
				'comments',
				`comments-data materialized (render-cloud): ${snapshotKey}`,
			)
		} catch (error) {
			logger.error(
				'comments',
				`Failed to materialize comments-data before cloud render: ${error instanceof Error ? error.message : String(error)}`,
			)
			throw new Error('Failed to prepare comments metadata for cloud render')
		}

		const { proxyId: effectiveProxyId, proxyRecord } =
			await resolveProxyWithDefault({ db, proxyId })
		const proxyPayload = toProxyJobPayload(proxyRecord)

		const taskId = createId()
		const jobId = `job_${createId()}`
		await db.insert(schema.tasks).values({
			id: taskId,
			userId,
			kind: TASK_KINDS.RENDER_COMMENTS,
			engine: 'renderer-remotion',
			targetType: 'media',
			targetId: media.id,
			status: 'queued',
			progress: 0,
			payload: {
				templateId:
					input.templateId || media.commentsTemplate || DEFAULT_TEMPLATE_ID,
				sourcePolicy: input.sourcePolicy || 'auto',
				proxyId: effectiveProxyId ?? null,
			},
			createdAt: new Date(),
			updatedAt: new Date(),
		})

		try {
			// Per-job manifest for comments render. We use the canonical remote
			// video as source and the freshly materialized comments snapshot.
			const manifest: JobManifest = {
				jobId,
				mediaId: media.id,
				engine: 'renderer-remotion',
				createdAt: Date.now(),
				inputs: {
					videoKey: resolvedVideoKey,
					commentsKey: snapshotKey ?? null,
					sourcePolicy: (input.sourcePolicy || 'auto') as any,
				},
				optionsSnapshot: {
					proxyId: effectiveProxyId ?? null,
					sourcePolicy: input.sourcePolicy || 'auto',
					templateId:
						input.templateId || media.commentsTemplate || DEFAULT_TEMPLATE_ID,
				},
			}
			await putJobManifest(jobId, manifest)

			const job = await startCloudJob({
				jobId,
				mediaId: media.id,
				engine: 'renderer-remotion',
				title: media.title || undefined,
				options: {
					proxy: proxyPayload,
					sourcePolicy: input.sourcePolicy || 'auto',
					templateId:
						input.templateId || media.commentsTemplate || DEFAULT_TEMPLATE_ID,
				},
			})

			logger.info(
				'rendering',
				`[render.job] queued media=${media.id} user=${userId} task=${taskId} job=${job.jobId} proxyId=${effectiveProxyId ?? 'none'}`,
			)

			await db
				.update(schema.tasks)
				.set({
					jobId: job.jobId,
					startedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(schema.tasks.id, taskId))
			return { jobId: job.jobId, taskId }
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to start render task'
			logger.error(
				'rendering',
				`[render.error] media=${mediaId} user=${userId} task=${taskId} error=${message}`,
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
			throw error
		}
	})

// Cloud rendering: get status
export const getRenderStatus = os
	.input(z.object({ jobId: z.string().min(1) }))
	.handler(async ({ input }) => {
		const status = await getJobStatus(input.jobId)
		logger.debug(
			'comments',
			`[render.status] job=${input.jobId} status=${status.status} progress=${typeof status.progress === 'number' ? Math.round(status.progress * 100) : 'n/a'}`,
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
			}
		} catch {
			// best-effort
		}
		return status
	})

// ============ Cloud Comments Download ============
export const startCloudCommentsDownload = os
	.input(
		z.object({
			mediaId: z.string(),
			pages: z.number().min(1).max(50).default(3),
			proxyId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		const { mediaId, pages, proxyId } = input
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()
		const where = and(
			eq(schema.media.id, mediaId),
			eq(schema.media.userId, userId),
		)
		const media = await db.query.media.findFirst({ where })
		if (!media) throw new Error('Media not found')
		if (!media.url) throw new Error('Media URL missing')

		const { proxyId: effectiveProxyId, proxyRecord } =
			await resolveProxyWithDefault({ db, proxyId })
		const proxyPayload = toProxyJobPayload(proxyRecord)

		logger.info(
			'comments',
			`[comments.download.start] media=${mediaId} user=${userId} pages=${pages} source=${media.source} proxyId=${proxyId ?? 'auto'}`,
		)

		const taskId = createId()
		const jobId = `job_${createId()}`
		await db.insert(schema.tasks).values({
			id: taskId,
			userId,
			kind: TASK_KINDS.COMMENTS_DOWNLOAD,
			engine: 'media-downloader',
			targetType: 'media',
			targetId: mediaId,
			status: 'queued',
			progress: 0,
			payload: {
				pages,
				proxyId: effectiveProxyId ?? null,
				source: media.source,
			},
			createdAt: new Date(),
			updatedAt: new Date(),
		})

		try {
			const manifest: JobManifest = {
				jobId,
				mediaId,
				engine: 'media-downloader',
				createdAt: Date.now(),
				inputs: {},
				optionsSnapshot: {
					url: media.url,
					source: media.source,
					task: 'comments',
					commentsPages: pages,
					proxyId: effectiveProxyId ?? null,
				},
			}
			await putJobManifest(jobId, manifest)

			const job = await startCloudJob({
				jobId,
				mediaId,
				engine: 'media-downloader',
				title: media.title || undefined,
				options: {
					url: media.url,
					source: media.source,
					task: 'comments',
					commentsPages: pages,
					proxy: proxyPayload,
				},
			})

			logger.info(
				'comments',
				`[comments.download.job] queued media=${mediaId} user=${userId} task=${taskId} job=${job.jobId} pages=${pages} proxyId=${effectiveProxyId ?? 'none'}`,
			)

			await db
				.update(schema.tasks)
				.set({
					jobId: job.jobId,
					startedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(schema.tasks.id, taskId))

			return { jobId: job.jobId, taskId }
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: 'Failed to start comments download'
			logger.error(
				'comments',
				`[comments.download.error] media=${mediaId} user=${userId} task=${taskId} pages=${pages} error=${message}`,
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
			throw error
		}
	})

export const getCloudCommentsStatus = os
	.input(z.object({ jobId: z.string().min(1) }))
	.handler(async ({ input }) => {
		const status = await getJobStatus(input.jobId)
		logger.debug(
			'comments',
			`[comments.download.status] job=${input.jobId} status=${status.status} progress=${typeof status.progress === 'number' ? Math.round(status.progress * 100) : 'n/a'}`,
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
			}
		} catch {
			// best-effort
		}
		return status
	})

const commentsMetadataSchema = z.object({
	comments: z
		.array(
			z
				.object({
					id: z.union([z.string(), z.number()]).optional(),
					author: z.string().optional(),
					authorThumbnail: z.string().optional(),
					content: z.string().optional(),
					translatedContent: z.string().optional(),
					likes: z.union([z.number(), z.string()]).optional(),
					replyCount: z.union([z.number(), z.string()]).optional(),
				})
				.passthrough(),
		)
		.default([]),
})

export const finalizeCloudCommentsDownload = os
	.input(z.object({ mediaId: z.string(), jobId: z.string().min(1) }))
	.handler(async ({ input, context }) => {
		const { mediaId, jobId } = input
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()
		const status = await getJobStatus(jobId)

		if (status.status !== 'completed') {
			throw new Error(`Job not completed: ${status.status}`)
		}

		// Prefer presigned URL from status; otherwise fall back to metadata key and presign via orchestrator
		const urlFromStatus = status.outputs?.metadata?.url
		const keyFromStatus =
			status.outputs?.metadata?.key ?? status.outputMetadataKey

		let metadataUrl = urlFromStatus
		if (!metadataUrl && keyFromStatus) {
			try {
				metadataUrl = await presignGetByKey(keyFromStatus)
			} catch (e) {
				logger.warn(
					'api',
					`Failed to presign metadata URL via orchestrator: ${
						e instanceof Error ? e.message : String(e)
					}`,
				)
			}
		}

		if (!metadataUrl) {
			throw new Error('No comments metadata location (url or key) from job')
		}

		const r = await fetch(metadataUrl)
		if (!r.ok) throw new Error(`Fetch comments failed: ${r.status}`)

		const { comments: rawComments } = commentsMetadataSchema.parse(
			await r.json(),
		)

		const comments: schema.Comment[] = rawComments.map((c) => ({
			id: String(c.id ?? ''),
			author: String(c.author ?? ''),
			authorThumbnail: c.authorThumbnail || undefined,
			content: String(c.content ?? ''),
			translatedContent:
				typeof c.translatedContent === 'string' ? c.translatedContent : '',
			likes: Number(c.likes ?? 0) || 0,
			replyCount: Number(c.replyCount ?? 0) || 0,
		}))

		await db
			.update(schema.media)
			.set({
				comments,
				commentCount: comments.length,
				commentsDownloadedAt: new Date(),
			})
			.where(and(eq(schema.media.id, mediaId), eq(schema.media.userId, userId)))
		return { success: true, count: comments.length }
	})
