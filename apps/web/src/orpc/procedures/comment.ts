import { os } from '@orpc/server'
import { DEFAULT_TEMPLATE_ID } from '@app/remotion-project/templates'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDefaultAiModel, isEnabledModel } from '~/lib/ai/config/service'
import {
	translateTextsWithUsage,
	translateTextWithUsage,
} from '~/lib/ai/translate'
import type { RequestContext } from '~/lib/auth/types'
import { getJobStatus, type JobManifest } from '~/lib/cloudflare'
import { TRANSLATE_CONCURRENCY } from '~/lib/config/env'
import { getDb, schema } from '~/lib/db'
import { enqueueCloudTask } from '~/lib/job/enqueue'
import { TASK_KINDS } from '~/lib/job/task'
import { logger } from '~/lib/logger'
import { buildCommentsSnapshot } from '~/lib/media/comments-snapshot'
import { resolveCloudVideoKey } from '~/lib/media/resolve-cloud-video-key'
import { throwInsufficientPointsError } from '~/lib/orpc/errors'
import { chargeLlmUsage, InsufficientPointsError } from '~/lib/points/billing'
import { resolveSuccessProxy } from '~/lib/proxy/resolve-success-proxy'
import { toProxyJobPayload } from '~/lib/proxy/utils'
import { CommentsTemplateConfigSchema } from '~/lib/remotion/comments-template-config'
import { mapWithConcurrency } from '~/lib/utils/concurrency'

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
				throwInsufficientPointsError()
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
			templateConfig: z.unknown().optional().nullable(),
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
			media.renderSubtitlesJobId ||
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
			renderSubtitlesJobId: media.renderSubtitlesJobId ?? null,
		})
		if (!resolvedVideoKey) {
			throw new Error(
				'Source video not found in cloud storage. Re-run cloud download for this media and retry.',
			)
		}

		const comments = media.comments
		const resolvedTemplateConfig =
			typeof input.templateConfig !== 'undefined'
				? input.templateConfig === null
					? null
					: (() => {
							const parsed = CommentsTemplateConfigSchema.safeParse(
								input.templateConfig,
							)
							if (!parsed.success) {
								throw new Error('Invalid templateConfig')
							}
							return parsed.data
						})()
				: (media.commentsTemplateConfig ?? null)

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
			await resolveSuccessProxy({
				db,
				requestedProxyId: proxyId,
			})
		const proxyPayload = toProxyJobPayload(proxyRecord)

		try {
			const templateId =
				input.templateId || media.commentsTemplate || DEFAULT_TEMPLATE_ID

			// Per-job manifest for comments render. We use the canonical remote
			// video as source and the freshly materialized comments snapshot.
			const { taskId, jobId } = await enqueueCloudTask({
				db,
				userId,
				kind: TASK_KINDS.RENDER_COMMENTS,
				engine: 'renderer-remotion',
				targetType: 'media',
				targetId: media.id,
				mediaId: media.id,
				purpose: TASK_KINDS.RENDER_COMMENTS,
				title: media.title || undefined,
				payload: {
					templateId,
					templateConfig: resolvedTemplateConfig,
					sourcePolicy: input.sourcePolicy || 'auto',
					proxyId: effectiveProxyId ?? null,
				},
				options: {
					proxy: proxyPayload,
					sourcePolicy: input.sourcePolicy || 'auto',
					templateId,
					templateConfig: resolvedTemplateConfig,
				},
				buildManifest: ({ jobId }): JobManifest => {
					return {
						jobId,
						mediaId: media.id,
						purpose: TASK_KINDS.RENDER_COMMENTS,
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
							templateId,
							templateConfig: resolvedTemplateConfig,
						},
					}
				},
			})

			logger.info(
				'rendering',
				`[render.job] queued media=${media.id} user=${userId} task=${taskId} job=${jobId} proxyId=${effectiveProxyId ?? 'none'}`,
			)
			return { jobId, taskId }
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to start render task'
			logger.error(
				'rendering',
				`[render.error] media=${mediaId} user=${userId} error=${message}`,
			)
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
			await resolveSuccessProxy({
				db,
				requestedProxyId: proxyId,
			})
		const proxyPayload = toProxyJobPayload(proxyRecord)

		logger.info(
			'comments',
			`[comments.download.start] media=${mediaId} user=${userId} pages=${pages} source=${media.source} proxyId=${proxyId ?? 'auto'}`,
		)

		try {
			const { taskId, jobId } = await enqueueCloudTask({
				db,
				userId,
				kind: TASK_KINDS.COMMENTS_DOWNLOAD,
				engine: 'media-downloader',
				targetType: 'media',
				targetId: mediaId,
				mediaId,
				purpose: TASK_KINDS.COMMENTS_DOWNLOAD,
				title: media.title || undefined,
				payload: {
					pages,
					proxyId: effectiveProxyId ?? null,
					source: media.source,
				},
				options: {
					url: media.url,
					source: media.source,
					task: 'comments',
					commentsPages: pages,
					proxy: proxyPayload,
				},
				buildManifest: ({ jobId }): JobManifest => {
					return {
						jobId,
						mediaId,
						purpose: TASK_KINDS.COMMENTS_DOWNLOAD,
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
				},
			})

			logger.info(
				'comments',
				`[comments.download.job] queued media=${mediaId} user=${userId} task=${taskId} job=${jobId} pages=${pages} proxyId=${effectiveProxyId ?? 'none'}`,
			)
			return { jobId, taskId }
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: 'Failed to start comments download'
			logger.error(
				'comments',
				`[comments.download.error] media=${mediaId} user=${userId} pages=${pages} error=${message}`,
			)
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
		return status
	})
