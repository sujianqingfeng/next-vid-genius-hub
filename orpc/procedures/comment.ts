import { os } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
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
