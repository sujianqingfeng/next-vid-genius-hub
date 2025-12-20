import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'

import { getDb, schema } from '~/lib/db'
import { logger } from '~/lib/logger'

export const Route = createFileRoute('/api/media/$id/comments-data')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				try {
					const mediaId = params.id
					const db = await getDb()
					const media = await db.query.media.findFirst({
						where: eq(schema.media.id, mediaId),
					})

					if (!media) {
						return Response.json({ error: 'Media not found' }, { status: 404 })
					}

					if (!media.comments || media.comments.length === 0) {
						return Response.json(
							{ error: 'Comments not found' },
							{ status: 404 },
						)
					}

					const videoInfo = {
						title: media.title || 'Untitled',
						translatedTitle: media.translatedTitle || undefined,
						viewCount: media.viewCount ?? 0,
						author: media.author || undefined,
						thumbnail: media.thumbnail || undefined,
						series: '外网真实评论',
					}

					const body = JSON.stringify({
						videoInfo,
						comments: media.comments,
					})

					return new Response(body, {
						headers: {
							'content-type': 'application/json',
							'cache-control': 'private, max-age=60',
						},
					})
				} catch (error) {
					logger.error(
						'api',
						`Error serving comments-data: ${error instanceof Error ? error.message : String(error)}`,
					)
					return Response.json(
						{ error: 'Internal server error' },
						{ status: 500 },
					)
				}
			},
		},
	},
})
