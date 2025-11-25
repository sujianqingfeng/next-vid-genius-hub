import fs from 'node:fs/promises'
import path from 'node:path'
import { os } from '@orpc/server'
import { desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { OPERATIONS_DIR, PROXY_URL } from '~/lib/config/app.config'
import { deleteCloudArtifacts, getJobStatus, startCloudJob } from '~/lib/cloudflare'
import { getDb, schema } from '~/lib/db'
import { logger } from '~/lib/logger'
import { generatePublishTitles } from '~/lib/ai/titles'
import { AIModelIds, type AIModelId } from '~/lib/ai/models'
import { ProviderFactory } from '~/lib/providers/provider-factory'
import { toProxyJobPayload } from '~/lib/proxy/utils'
import { bucketPaths } from '~/lib/storage/bucket-paths'

export const list = os
	.input(
		z.object({
			page: z.number().min(1).optional().default(1),
			limit: z.number().min(1).max(100).optional().default(9),
		}),
	)
	.handler(async ({ input }) => {
		const { page = 1, limit = 9 } = input
		const offset = (page - 1) * limit

		// Fetch paginated items with stable ordering
		const db = await getDb()
		const items = await db
			.select()
			.from(schema.media)
			.orderBy(desc(schema.media.createdAt))
			.limit(limit)
			.offset(offset)

		// Get total count for pagination efficiently
		const [{ count }] = await db
			.select({ count: sql<number>`count(*)` })
			.from(schema.media)

		return {
			items,
			total: Number(count ?? 0),
			page,
			limit,
		}
	})

export const byId = os
	.input(z.object({ id: z.string() }))
	.handler(async ({ input }) => {
		const { id } = input
		const db = await getDb()
		const item = await db.query.media.findFirst({
			where: eq(schema.media.id, id),
		})
		return item
	})

// Refresh metadata from upstream provider via cloud downloader (no video re-download)
export const refreshMetadata = os
	.input(
		z.object({
			id: z.string(),
			proxyId: z.string().optional(),
		}),
	)
	.handler(async ({ input }) => {
		const db = await getDb()
		const record = await db.query.media.findFirst({
			where: eq(schema.media.id, input.id),
		})
		if (!record) {
			throw new Error('Media not found')
		}
		if (!record.url) {
			throw new Error('Media URL is missing; cannot refresh metadata')
		}

		const provider = ProviderFactory.resolveProvider(record.url)
		const source = provider.id === 'tiktok' ? 'tiktok' : 'youtube'

		const proxyRecord =
			input.proxyId && input.proxyId !== 'none'
				? await db.query.proxies.findFirst({
						where: eq(schema.proxies.id, input.proxyId),
					})
				: null

		const proxyPayload = toProxyJobPayload(proxyRecord)

		const job = await startCloudJob({
			mediaId: record.id,
			engine: 'media-downloader',
			options: {
				task: 'metadata-only',
				url: record.url,
				quality: (record.quality || '1080p') as '720p' | '1080p',
				source,
				proxy: proxyPayload,
				defaultProxyUrl: PROXY_URL,
			},
		})

		const terminal = new Set(['completed', 'failed', 'canceled'] as const)
		const startedAt = Date.now()
		let lastStatus = await getJobStatus(job.jobId)

		while (!terminal.has(lastStatus.status)) {
			if (Date.now() - startedAt > 60_000) {
				throw new Error(`Metadata refresh timed out: ${lastStatus.status}`)
			}
			await new Promise((resolve) => setTimeout(resolve, 1500))
			lastStatus = await getJobStatus(job.jobId)
		}

		if (lastStatus.status !== 'completed') {
			const msg = lastStatus.message || `Metadata job not completed: ${lastStatus.status}`
			throw new Error(msg)
		}

		const meta = (lastStatus.metadata ?? {}) as Record<string, unknown>
		const updates: Record<string, unknown> = {}

		const title = typeof meta.title === 'string' ? meta.title : undefined
		const author = typeof meta.author === 'string' ? meta.author : undefined
		const thumbnail = typeof meta.thumbnail === 'string' ? meta.thumbnail : undefined
		const viewCount = typeof meta.viewCount === 'number' ? meta.viewCount : undefined
		const likeCount = typeof meta.likeCount === 'number' ? meta.likeCount : undefined

		if (title) updates.title = title
		if (author) updates.author = author
		if (thumbnail) updates.thumbnail = thumbnail
		if (typeof viewCount === 'number') updates.viewCount = viewCount
		if (typeof likeCount === 'number') updates.likeCount = likeCount

		if (Object.keys(updates).length === 0) {
			return record
		}

		await db.update(schema.media).set(updates).where(eq(schema.media.id, input.id))
		const updated = await db.query.media.findFirst({
			where: eq(schema.media.id, input.id),
		})
		return updated
	})

export const updateTitles = os
	.input(
		z.object({
			id: z.string(),
			title: z.string().optional(),
			translatedTitle: z.string().optional(),
		}),
	)
	.handler(async ({ input }) => {
		const { id, title, translatedTitle } = input

		const updateData: Record<string, string | undefined> = {}
		if (title !== undefined) updateData.title = title
		if (translatedTitle !== undefined) updateData.translatedTitle = translatedTitle

		const db = await getDb()
		await db.update(schema.media).set(updateData).where(eq(schema.media.id, id))

        const updated = await db.query.media.findFirst({
            where: eq(schema.media.id, id),
        })
        return updated
    })

// 更新渲染相关设置（目前仅支持评论模板）
export const updateRenderSettings = os
  .input(
    z.object({
      id: z.string(),
      commentsTemplate: z.string().optional(),
    }),
  )
  .handler(async ({ input }) => {
    const { id, commentsTemplate } = input
    const updates: Record<string, unknown> = {}
    if (typeof commentsTemplate !== 'undefined') updates.commentsTemplate = commentsTemplate
    const db = await getDb()
    await db.update(schema.media).set(updates).where(eq(schema.media.id, id))
    const updated = await db.query.media.findFirst({ where: eq(schema.media.id, id) })
    return updated
  })

// 生成吸睛发布标题（基于原标题/字幕/评论；字幕可为空时自动降级）
export const generatePublishTitle = os
  .input(
    z.object({
      mediaId: z.string(),
      model: z.enum(AIModelIds).optional().default('openai/gpt-4.1-mini' as AIModelId),
      count: z.number().min(3).max(5).optional().default(5),
      maxTranscriptChars: z.number().min(500).max(6000).optional().default(2000),
      maxComments: z.number().min(5).max(100).optional().default(30),
    }),
  )
  .handler(async ({ input }) => {
    const { mediaId, model, count, maxTranscriptChars, maxComments } = input
    const db = await getDb()
    const record = await db.query.media.findFirst({ where: eq(schema.media.id, mediaId) })
    if (!record) throw new Error('Media not found')

    const candidates = await generatePublishTitles({
      model,
      title: record.title ?? undefined,
      translatedTitle: record.translatedTitle ?? undefined,
      transcript: record.optimizedTranscription || record.transcription || undefined,
      comments: record.comments || [],
      count,
      maxTranscriptChars,
      maxComments,
    })
    return { candidates }
  })

// 保存选中的发布标题
export const updatePublishTitle = os
  .input(
    z.object({
      id: z.string(),
      publishTitle: z.string().min(3).max(120),
    }),
  )
  .handler(async ({ input }) => {
    const { id, publishTitle } = input
    const db = await getDb()
    await db.update(schema.media).set({ publishTitle }).where(eq(schema.media.id, id))
    const updated = await db.query.media.findFirst({ where: eq(schema.media.id, id) })
    return updated
  })

export const deleteById = os
	.input(z.object({ id: z.string() }))
	.handler(async ({ input }) => {
		const { id } = input

		// 1) Load record to gather cloud references (best-effort)
		const db = await getDb()
		const record = await db.query.media.findFirst({ where: eq(schema.media.id, id) })

		// 2) Best-effort cloud cleanup (remote keys + orchestrator artifacts)
		try {
			if (record) {
				const keys: string[] = []
				// Directly referenced remote objects from the record
				if (record.remoteVideoKey) keys.push(record.remoteVideoKey)
				if (record.remoteAudioKey) keys.push(record.remoteAudioKey)
				if (record.remoteMetadataKey) keys.push(record.remoteMetadataKey)
				// Well-known per-media objects that we materialize into the bucket
				keys.push(
					bucketPaths.manifests.media(id),
					bucketPaths.inputs.subtitles(id),
					bucketPaths.inputs.subtitledVideo(id),
					bucketPaths.inputs.video(id),
					bucketPaths.inputs.rawVideo(id),
					bucketPaths.inputs.comments(id),
				)

				const artifactJobIds: string[] = []
				// videoWithSubtitlesPath or videoWithInfoPath might store remote orchestrator artifact refs: "remote:orchestrator:<jobId>"
				for (const p of [record.videoWithSubtitlesPath, record.videoWithInfoPath, record.filePath]) {
					if (typeof p === 'string' && p.startsWith('remote:orchestrator:')) {
						const jobId = p.split(':').pop()
						if (jobId) artifactJobIds.push(jobId)
					}
				}
				// Also include the cloud download job id (if any)
				if (record.downloadJobId) artifactJobIds.push(record.downloadJobId)

				// Known per-media prefixes that may contain multiple artifacts
				const prefixes = [
					bucketPaths.outputs.byMediaPrefix(id),
					bucketPaths.downloads.prefix(id),
					bucketPaths.asr.results.prefix(id),
					// Also delete audio produced by audio-transcoder/ASR pipeline
					bucketPaths.asr.processedPrefix(id),
				]

				await deleteCloudArtifacts({ keys, artifactJobIds, prefixes })
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			logger.warn('media', `[media.deleteById] cloud cleanup failed (continuing): ${msg}`)
		}

		// 3) Delete DB record
		await db.delete(schema.media).where(eq(schema.media.id, id))

		// 4) Remove local operation directory
		const operationDir = path.join(OPERATIONS_DIR, id)
		await fs.rm(operationDir, { recursive: true, force: true })

		return { success: true }
	})
