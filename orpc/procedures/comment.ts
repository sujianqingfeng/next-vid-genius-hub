import { os } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { PROXY_URL } from '~/lib/constants'
import { db, schema } from '~/lib/db'
import { extractVideoId, getYouTubeClient } from '~/lib/youtube'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const mapYoutubeComment = (item: any) => {
	// The actual comment data can be nested inside a 'comment' property
	const comment = item.comment || item
	return {
		id: comment.id,
		content: comment.content?.text ?? '',
		author: comment.author?.name ?? '',
		likes: Number(comment.like_count || 0),
		authorThumbnail: comment.author?.thumbnails?.[0]?.url ?? '',
		replyCount: comment.reply_count ?? 0,
		translatedContent: '', // Placeholder
	}
}

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

		const youtubeComments = await youtube.getComments(videoId)

		if (!youtubeComments.contents || youtubeComments.contents.length === 0) {
			return { success: true, count: 0 }
		}

		let comments = youtubeComments.contents.map(mapYoutubeComment)
		let currentPage = 1
		let continuation = youtubeComments

		while (continuation.has_continuation && currentPage < pageCount) {
			await sleep(1000)
			const nextPage = await continuation.getContinuation()
			if (nextPage && nextPage.contents) {
				comments = comments.concat(nextPage.contents.map(mapYoutubeComment))
				continuation = nextPage
				currentPage++
			} else {
				break
			}
		}

		console.log('🚀 ~ comments:', comments)
		await db
			.update(schema.media)
			.set({
				comments,
			})
			.where(eq(schema.media.id, mediaId))

		return { success: true, count: comments.length }
	})
