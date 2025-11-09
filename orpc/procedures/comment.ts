import { os } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { translateText } from '~/lib/ai/translate'
import { type AIModelId, AIModelIds } from '~/lib/ai/models'
import { PROXY_URL } from '~/lib/config/app.config'
import { db, schema } from '~/lib/db'
import { startCloudJob, getJobStatus, presignGetByKey, upsertMediaManifest, type MediaManifestPatch } from '~/lib/cloudflare'
import { buildCommentsSnapshot } from '~/lib/media/comments-snapshot'
import { toProxyJobPayload } from '~/lib/proxy/utils'
import { logger } from '~/lib/logger'
import { generateObject } from '~/lib/ai/chat'
import { createId } from '@paralleldrive/cuid2'

export const translateComments = os
	.input(
		z.object({
			mediaId: z.string(),
			model: z.enum(AIModelIds).default('openai/gpt-4o-mini' as AIModelId),
			force: z.boolean().optional().default(false),
		}),
	)
	.handler(async ({ input }) => {
		const { mediaId, model: modelId, force } = input
		const media = await db.query.media.findFirst({
			where: eq(schema.media.id, mediaId),
		})

		if (!media || !media.comments) {
			throw new Error('Media or comments not found')
		}

		// 翻译标题
		let translatedTitle = media.translatedTitle
		if (media.title && (force || !translatedTitle)) {
			translatedTitle = await translateText(media.title, modelId)
		}

		// 翻译评论
		const translatedComments = await Promise.all(
			media.comments.map(async (comment) => {
				if (!comment.content) {
					return comment
				}
				// 如果评论已经有翻译内容，跳过翻译
				if (comment.translatedContent && !force) {
					return comment
				}
				const translatedContent = await translateText(comment.content, modelId)
				return {
					...comment,
					translatedContent,
				}
			}),
		)

		await db
			.update(schema.media)
			.set({
				comments: translatedComments,
				translatedTitle,
				commentCount: translatedComments.length,
			})
			.where(eq(schema.media.id, mediaId))

		return { success: true }
	})

export const deleteComment = os
	.input(
		z.object({
			mediaId: z.string(),
			commentId: z.string(),
		}),
	)
	.handler(async ({ input }) => {
		const { mediaId, commentId } = input

		const media = await db.query.media.findFirst({
			where: eq(schema.media.id, mediaId),
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
			.where(eq(schema.media.id, mediaId))

		return { success: true }
	})

// Cloud rendering: start job explicitly (Remotion renderer)
export const startCloudRender = os
    .input(
        z.object({
            mediaId: z.string(),
            proxyId: z.string().optional(),
            sourcePolicy: z.enum(['auto', 'original', 'subtitles']).optional().default('auto'),
            templateId: z.string().optional(),
        }),
    )
    .handler(async ({ input }) => {
        const { mediaId, proxyId } = input
		const where = eq(schema.media.id, mediaId)
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
			throw new Error('No source video available (need local file, rendered artifact, remote key, or a completed cloud download).')
		}
		if (!media.comments || media.comments.length === 0) {
			throw new Error('No comments found for this media')
		}

	const comments = media.comments

	// Ensure manifest references latest remote assets before kicking off render
	const manifestPatch: MediaManifestPatch = {}
	if (media.remoteVideoKey) manifestPatch.remoteVideoKey = media.remoteVideoKey
	if (media.remoteAudioKey) manifestPatch.remoteAudioKey = media.remoteAudioKey
	if (media.remoteMetadataKey) manifestPatch.remoteMetadataKey = media.remoteMetadataKey
	if (Object.keys(manifestPatch).length > 0) {
		try {
			await upsertMediaManifest(media.id, manifestPatch)
		} catch (err) {
			logger.warn(
				'comments',
				`[startCloudRender] manifest sync skipped: ${err instanceof Error ? err.message : String(err)}`,
			)
		}
	}

		let snapshotKey: string | undefined
		try {
			const snapshot = await buildCommentsSnapshot(media, { comments })
			snapshotKey = snapshot.key
			logger.info('comments', `comments-data materialized (render-cloud): ${snapshotKey}`)
		} catch (error) {
			logger.error(
				'comments',
				`Failed to materialize comments-data before cloud render: ${error instanceof Error ? error.message : String(error)}`,
			)
			throw new Error('Failed to prepare comments metadata for cloud render')
		}

		let proxyPayload = undefined
		if (proxyId) {
			const proxy = await db.query.proxies.findFirst({ where: eq(schema.proxies.id, proxyId) })
			proxyPayload = toProxyJobPayload(proxy)
		}

        const job = await startCloudJob({
            mediaId: media.id,
            engine: 'renderer-remotion',
            options: {
                defaultProxyUrl: PROXY_URL,
                proxy: proxyPayload,
                sourcePolicy: input.sourcePolicy || 'auto',
                templateId: input.templateId || media.commentsTemplate || 'comments-default',
            },
        })
        return { jobId: job.jobId }
    })

// Cloud rendering: get status
export const getRenderStatus = os
	.input(z.object({ jobId: z.string().min(1) }))
	.handler(async ({ input }) => {
		const status = await getJobStatus(input.jobId)
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
	.handler(async ({ input }) => {
		const { mediaId, pages, proxyId } = input
		const where = eq(schema.media.id, mediaId)
		const media = await db.query.media.findFirst({ where })
		if (!media) throw new Error('Media not found')
		if (!media.url) throw new Error('Media URL missing')

		let proxyPayload = undefined
		if (proxyId) {
			const proxy = await db.query.proxies.findFirst({ where: eq(schema.proxies.id, proxyId) })
			proxyPayload = toProxyJobPayload(proxy)
		}

		const job = await startCloudJob({
			mediaId,
			engine: 'media-downloader',
			options: {
				url: media.url,
				source: media.source,
				task: 'comments',
				commentsPages: pages,
				defaultProxyUrl: PROXY_URL,
				proxy: proxyPayload,
			},
		})

		return { jobId: job.jobId }
	})

export const getCloudCommentsStatus = os
	.input(z.object({ jobId: z.string().min(1) }))
	.handler(async ({ input }) => {
		return getJobStatus(input.jobId)
	})

export const finalizeCloudCommentsDownload = os
	.input(z.object({ mediaId: z.string(), jobId: z.string().min(1) }))
	.handler(async ({ input }) => {
		const { mediaId, jobId } = input
		const status = await getJobStatus(jobId)
		if (status.status !== 'completed') {
			throw new Error(`Job not completed: ${status.status}`)
		}

		// Prefer presigned URL from status; otherwise fall back to metadata key and presign via orchestrator
		const urlFromStatus = status.outputs?.metadata?.url
		const keyFromStatus = status.outputs?.metadata?.key ?? status.outputMetadataKey

    let metadataUrl = urlFromStatus
    if (!metadataUrl && keyFromStatus) {
        try {
            metadataUrl = await presignGetByKey(keyFromStatus)
        } catch (e) {
            logger.warn('api', `Failed to presign metadata URL via orchestrator: ${e instanceof Error ? e.message : String(e)}`)
        }
    }

		if (!metadataUrl) throw new Error('No comments metadata location (url or key) from job')
		const r = await fetch(metadataUrl)
		if (!r.ok) throw new Error(`Fetch comments failed: ${r.status}`)
		const data = (await r.json()) as any
    const list = Array.isArray(data?.comments) ? (data.comments as any[]) : []
    const comments: schema.Comment[] = list.map((c: any) => ({
        id: String(c?.id || ''),
        author: String(c?.author || ''),
        authorThumbnail: c?.authorThumbnail || undefined,
        content: String(c?.content || ''),
        translatedContent: typeof c?.translatedContent === 'string' ? c.translatedContent : '',
        likes: Number(c?.likes ?? 0) || 0,
        replyCount: Number(c?.replyCount ?? 0) || 0,
    }))

		await db
			.update(schema.media)
			.set({
				comments,
				commentCount: comments.length,
				commentsDownloadedAt: new Date(),
			})
			.where(eq(schema.media.id, mediaId))
		return { success: true, count: comments.length }
	})

// ============ AI Moderation ============
const moderationResultSchema = z.object({
  flagged: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        commentId: z.string().min(1),
        labels: z.array(z.string().min(1)).min(1),
        severity: z.enum(['low', 'medium', 'high']),
        reason: z.string().min(3).max(500),
      }),
    )
    .default([]),
  total: z.number().int().optional(),
})

const MODERATION_LABEL_LIST = [
  'politics',
  'pornography',
  'nudity',
  'violence',
  'abuse',
  'hate',
  'discrimination',
  'self_harm',
  'drugs',
  'weapon',
  'scam_fraud',
  'gambling',
  'privacy',
  'copyright',
  'spam',
  'other',
] as const

function buildModerationSystemPrompt() {
  return [
    '你是内容审核助手，需严格依据中国大陆主流平台的审核标准判断评论是否需要拦截或谨慎展示。',
    '仅按要求输出 JSON，不要输出多余文本、代码块或 markdown。',
    '审核维度包括但不限于：涉政、色情/裸露、暴力、辱骂、仇恨/歧视、自残/自杀、毒品、武器、诈骗/引流、赌博、隐私泄露、版权侵权、垃圾信息等。',
    `标签可从以下集合中选择：${MODERATION_LABEL_LIST.join(', ')}。`,
    '判定为需标记时，给出最贴切的 1-3 个标签，标注严重度（low/medium/high）并简述理由（不超过 300 字）。',
    '输出格式（严格）：{"flagged":[{"index":0,"commentId":"id","labels":["spam"],"severity":"medium","reason":"..."}],"total":N}',
  ].join('\n')
}

function buildChunkPrompt(items: Array<{ index: number; commentId: string; text: string; translatedText?: string }>) {
  const header = [
    '任务：对以下评论进行审核。仅返回 JSON，且必须匹配给定 schema。',
    '输入为数组，每项包含 index、commentId、text、translatedText(可选)。',
    '请仅返回需要标记的评论，未命中的不要出现在结果中。',
  ].join('\n')

  const body = JSON.stringify(
    items.map((it) => ({ index: it.index, commentId: it.commentId, text: it.text, translatedText: it.translatedText })),
  )

  const tail = [
    '严格输出 JSON：{"flagged":[{"index":number,"commentId":"string","labels":["string"],"severity":"low|medium|high","reason":"string"}],"total":number}',
  ].join('\n')

  return [header, '评论列表(JSON)：', body, tail].join('\n')
}

export const moderateComments = os
  .input(
    z.object({
      mediaId: z.string(),
      model: z.enum(AIModelIds).default('openai/gpt-4.1-mini' as AIModelId),
      overwrite: z.boolean().optional().default(false),
    }),
  )
  .handler(async ({ input }) => {
    const { mediaId, model: modelId, overwrite } = input

    const media = await db.query.media.findFirst({ where: eq(schema.media.id, mediaId) })
    if (!media) throw new Error('Media not found')
    const comments = media.comments || []
    if (!comments || comments.length === 0) throw new Error('No comments to moderate')

    const runId = createId()
    const nowIso = new Date().toISOString()

    // Build chunks
    const CHUNK_SIZE = 120
    const chunks: Array<{ start: number; end: number; items: Array<{ index: number; commentId: string; text: string; translatedText?: string }> }> = []
    for (let i = 0; i < comments.length; i += CHUNK_SIZE) {
      const slice = comments.slice(i, i + CHUNK_SIZE)
      const items = slice.map((c, idx) => ({
        index: idx,
        commentId: c.id,
        text: c.content || '',
        translatedText: c.translatedContent || undefined,
      }))
      chunks.push({ start: i, end: i + slice.length, items })
    }

    const system = buildModerationSystemPrompt()
    const idToIndex = new Map(comments.map((c, i) => [c.id, i]))

    const flaggedGlobal: Array<{ index: number; labels: string[]; severity: 'low' | 'medium' | 'high'; reason: string }> = []

    for (const ch of chunks) {
      const prompt = buildChunkPrompt(ch.items)
      try {
        const { object } = await generateObject({ model: modelId, system, prompt, schema: moderationResultSchema })
        const parsed = moderationResultSchema.parse(object)
        for (const item of parsed.flagged) {
          // Prefer commentId mapping; fallback to offset+index
          let idx = idToIndex.get(item.commentId)
          if (typeof idx !== 'number') idx = ch.start + item.index
          if (Number.isNaN(idx) || idx == null || idx < 0 || idx >= comments.length) continue
          flaggedGlobal.push({ index: idx, labels: item.labels.slice(0, 3), severity: item.severity, reason: item.reason })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.warn('comments', `[moderateComments] chunk failed, skipping: ${msg}`)
      }
    }

    if (flaggedGlobal.length === 0) {
      // Still update summary timestamps to indicate run happened
      await db
        .update(schema.media)
        .set({
          commentsModeratedAt: new Date(),
          commentsModerationModel: modelId,
          commentsFlaggedCount: 0,
          commentsModerationSummary: {},
        })
        .where(eq(schema.media.id, mediaId))
      return { success: true, flaggedCount: 0, total: comments.length }
    }

    // Apply to comment list
    const touched = new Set<number>()
    const updated: schema.Comment[] = comments.map((c) => ({ ...c }))
    const summary = new Map<string, number>()

    for (const f of flaggedGlobal) {
      if (touched.has(f.index)) continue
      const current = updated[f.index]
      if (!current) continue
      if (current.moderation && !overwrite) continue
      current.moderation = {
        flagged: true,
        labels: f.labels,
        severity: f.severity,
        reason: f.reason,
        runId,
        modelId,
        moderatedAt: nowIso,
      }
      touched.add(f.index)
      for (const label of f.labels) summary.set(label, (summary.get(label) || 0) + 1)
    }

    let flaggedCount = 0
    for (const c of updated) {
      if (c?.moderation?.flagged) flaggedCount++
    }

    await db
      .update(schema.media)
      .set({
        comments: updated,
        commentsModeratedAt: new Date(),
        commentsModerationModel: modelId,
        commentsFlaggedCount: flaggedCount,
        commentsModerationSummary: Object.fromEntries(summary.entries()),
      })
      .where(eq(schema.media.id, mediaId))

    return { success: true, flaggedCount, total: comments.length }
  })
