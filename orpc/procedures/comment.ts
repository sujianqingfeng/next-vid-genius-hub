import fs from 'node:fs/promises'
import path from 'node:path'
import { os } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { translateText } from '~/lib/ai'
import { type AIModelId, AIModelIds } from '~/lib/ai/models'
import {
	OPERATIONS_DIR,
	PROXY_URL,
} from '~/lib/config/app.config'
import {
	VIDEO_WITH_INFO_FILENAME,
} from '~/lib/constants/app.constants'
import { db, schema } from '~/lib/db'
import { renderVideoWithRemotion } from '~/lib/media'
import { startCloudJob, getJobStatus, presignGetByKey } from '~/lib/cloudflare'
import type { RenderProgressEvent } from '~/lib/media'
import {
	downloadYoutubeComments as coreDownloadYoutubeComments,
	downloadTikTokCommentsByUrl as coreDownloadTikTokComments,
} from '@app/media-providers'

export const downloadComments = os
	.input(
		z.object({
			mediaId: z.string(),
			pages: z.number().default(3),
		}),
	)
	.handler(async ({ input }) => {
		const { mediaId, pages: pageCount } = input

		const media = await db.query.media.findFirst({
			where: eq(schema.media.id, mediaId),
		})

		if (!media) {
			throw new Error('Media not found')
		}

        let comments: schema.Comment[] = []
        if (media.source === 'tiktok') {
            const basic = await coreDownloadTikTokComments({ url: media.url, pages: pageCount, proxy: PROXY_URL })
            comments = basic.map((c) => ({
                id: c.id,
                author: c.author,
                authorThumbnail: c.authorThumbnail,
                content: c.content,
                likes: c.likes,
                replyCount: c.replyCount,
            }))
        } else {
            const basic = await coreDownloadYoutubeComments({ url: media.url, pages: pageCount, proxy: PROXY_URL })
            comments = basic.map((c) => ({
                id: c.id,
                author: c.author,
                authorThumbnail: c.authorThumbnail,
                content: c.content,
                likes: c.likes,
                replyCount: c.replyCount,
            }))
        }

		if (comments.length === 0) {
			return { success: true, count: 0 }
		}

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

export const translateComments = os
	.input(
		z.object({
			mediaId: z.string(),
			model: z.enum(AIModelIds).default('openai/gpt-4o-mini' as AIModelId),
		}),
	)
	.handler(async ({ input }) => {
		const { mediaId, model: modelId } = input
		const media = await db.query.media.findFirst({
			where: eq(schema.media.id, mediaId),
		})

		if (!media || !media.comments) {
			throw new Error('Media or comments not found')
		}

		// 翻译标题
		let translatedTitle = media.translatedTitle
		if (media.title && !translatedTitle) {
			translatedTitle = await translateText(media.title, modelId)
		}

		// 翻译评论
		const translatedComments = await Promise.all(
			media.comments.map(async (comment) => {
				if (!comment.content) {
					return comment
				}
				// 如果评论已经有翻译内容，跳过翻译
				if (comment.translatedContent) {
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

export const renderWithInfo = os
	.input(
		z.object({
			mediaId: z.string(),
		}),
	)
	.handler(async ({ input }) => {
		const { mediaId } = input

		// Get media data
		const media = await db.query.media.findFirst({
			where: eq(schema.media.id, mediaId),
		})

		if (!media) {
			throw new Error('Media not found')
		}

		if (!media.filePath) {
			throw new Error('Media file path not found')
		}

		if (!media.comments || media.comments.length === 0) {
			throw new Error('No comments found for this media')
		}

		// Create operation directory
		const operationDir = path.join(OPERATIONS_DIR, media.id)
		await fs.mkdir(operationDir, { recursive: true })
		const progressFile = path.join(operationDir, 'render-progress.json')

		const recordProgress = (event: RenderProgressEvent) => {
			void fs
				.writeFile(
					progressFile,
					JSON.stringify(
						{
							...event,
							updatedAt: new Date().toISOString(),
						},
						null,
						2,
					),
				)
				.catch((error) => {
					console.warn('Failed to record render progress', error)
				})
		}

		// seed initial progress state
		recordProgress({ stage: 'bundle', progress: 0 })

		// Define output path
		const outputPath = path.join(operationDir, VIDEO_WITH_INFO_FILENAME)

		// Prepare video info
		const videoInfo = {
			title: media.title,
			translatedTitle: media.translatedTitle || undefined,
			viewCount: media.viewCount || 0,
			author: media.author || undefined,
			thumbnail: media.thumbnail || undefined,
			series: '外网真实评论',
		}

		try {
			// Render video with info and comments
			await renderVideoWithRemotion({
				videoPath: media.videoWithSubtitlesPath || media.filePath,
				outputPath,
				videoInfo,
				comments: media.comments,
				onProgress: recordProgress,
			})

			// Update database with rendered path
			await db
				.update(schema.media)
				.set({ videoWithInfoPath: outputPath })
				.where(eq(schema.media.id, mediaId))

			return {
				success: true,
				message: 'Video rendered with info and comments successfully',
				videoWithInfoPath: outputPath,
				commentsCount: media.comments.length,
			}
		} catch (error) {
			console.error('Error rendering video with info:', error)
			throw new Error(`Failed to render video: ${(error as Error).message}`)
		}
	})

// Cloud rendering: start job explicitly (Remotion renderer)
export const startCloudRender = os
	.input(
		z.object({
			mediaId: z.string(),
			proxyId: z.string().optional(),
		}),
	)
	.handler(async ({ input }) => {
		const { mediaId, proxyId } = input
		const where = eq(schema.media.id, mediaId)
		const media = await db.query.media.findFirst({ where })
		if (!media) throw new Error('Media not found')
		// 允许在未本地落盘（ENABLE_LOCAL_HYDRATE=false）的情况下走云端渲染。
		// 只要存在任一远端来源（videoWithSubtitlesPath 为 remote:orchestrator:*, 或 downloadJobId、remoteVideoKey）即可。
		const hasAnySource = Boolean(
			media.filePath ||
			media.videoWithSubtitlesPath ||
			media.downloadJobId ||
			media.remoteVideoKey,
		)
		if (!hasAnySource) {
			throw new Error('No source video available (neither local path nor remote job/key).')
		}
		if (!media.comments || media.comments.length === 0) {
			throw new Error('No comments found for this media')
		}

		let proxyPayload: any = undefined
		if (proxyId) {
			const proxy = await db.query.proxies.findFirst({ where: eq(schema.proxies.id, proxyId) })
			if (proxy && proxy.server && proxy.port && proxy.protocol) {
				proxyPayload = {
					id: proxy.id,
					server: proxy.server,
					port: proxy.port,
					protocol: proxy.protocol,
					username: proxy.username,
					password: proxy.password,
					nodeUrl: proxy.nodeUrl,
				}
			}
		}

		const job = await startCloudJob({
			mediaId: media.id,
			engine: 'renderer-remotion',
			options: {
				defaultProxyUrl: PROXY_URL,
				proxy: proxyPayload,
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

		let proxyPayload: any = undefined
		if (proxyId) {
			const proxy = await db.query.proxies.findFirst({ where: eq(schema.proxies.id, proxyId) })
			if (proxy && proxy.server && proxy.port && proxy.protocol) {
				proxyPayload = {
					id: proxy.id,
					server: proxy.server,
					port: proxy.port,
					protocol: proxy.protocol,
					username: proxy.username,
					password: proxy.password,
					nodeUrl: proxy.nodeUrl,
				}
			}
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
				console.warn('Failed to presign metadata URL via orchestrator', e)
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
