import { os } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { translateText } from '~/lib/ai'
import { PROXY_URL } from '~/lib/constants'
import { db, schema } from '~/lib/db'
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

export const renderWithInfo = os
	.input(
		z.object({
			mediaId: z.string(),
		}),
	)
	.handler(async ({ input }) => {
		// TODO: Implement video rendering, attaching video info and comments
		console.log(`Rendering video for mediaId: ${input.mediaId}`)
		return {
			message: 'Rendering with info and comments started',
		}
	})
