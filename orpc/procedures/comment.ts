import fs from 'node:fs/promises'
import path from 'node:path'
import { os } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { translateText } from '~/lib/ai'
import { OPERATIONS_DIR, PROXY_URL } from '~/lib/constants'
import { db, schema } from '~/lib/db'
import {
	renderVideoWithCanvas,
	renderVideoWithInfoAndComments,
} from '~/lib/media'
import {
	downloadYoutubeComments,
	extractVideoId,
	getYouTubeClient,
} from '~/lib/youtube'

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
		const youtube = await getYouTubeClient({
			proxy: PROXY_URL,
			cacheEnabled: false,
		})

		const videoId = extractVideoId(media.url)
		if (!videoId) {
			throw new Error('Could not extract video ID from URL')
		}

		const comments = await downloadYoutubeComments(youtube, videoId, pageCount)

		if (comments.length === 0) {
			return { success: true, count: 0 }
		}

		await db
			.update(schema.media)
			.set({
				comments,
			})
			.where(eq(schema.media.id, mediaId))

		return { success: true, count: comments.length }
	})

export const translateComments = os
	.input(
		z.object({
			mediaId: z.string(),
			model: z.string().default('openai/gpt-4o-mini'),
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
			translatedTitle = await translateText(media.title, modelId as any)
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
				const translatedContent = await translateText(
					comment.content,
					modelId as any,
				)
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

		// Define output path
		const outputPath = path.join(operationDir, 'rendered_with_info.mp4')

		// Prepare video info
		const videoInfo = {
			title: media.title,
			translatedTitle: media.translatedTitle || undefined,
			viewCount: media.viewCount || 0,
			author: media.author || undefined,
			thumbnail: media.thumbnail || undefined,
		}

		// Take first 10 comments for rendering (to keep video length reasonable)
		const commentsToRender = media.comments.slice(0, 10)

		try {
			// Render video with info and comments
			await renderVideoWithCanvas(
				media.filePath,
				outputPath,
				videoInfo,
				commentsToRender,
			)

			// Update database with rendered path
			await db
				.update(schema.media)
				.set({ renderedPath: outputPath })
				.where(eq(schema.media.id, mediaId))

			return {
				success: true,
				message: 'Video rendered with info and comments successfully',
				renderedPath: outputPath,
				commentsCount: commentsToRender.length,
			}
		} catch (error) {
			console.error('Error rendering video with info:', error)
			throw new Error(`Failed to render video: ${(error as Error).message}`)
		}
	})
