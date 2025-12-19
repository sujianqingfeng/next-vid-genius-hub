import { eq } from 'drizzle-orm'
import { createFileRoute } from '@tanstack/react-router'

import { getDb, schema } from '~/lib/db'
import { logger } from '~/lib/logger'

export const Route = createFileRoute('/api/media/$id/subtitles')({
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

					if (!media.translation) {
						return Response.json({ error: 'Subtitles not found' }, { status: 404 })
					}

					const vttContent = `WEBVTT\n\n${media.translation}`

					return new Response(vttContent, {
						headers: {
							'content-type': 'text/vtt',
							'cache-control': 'public, max-age=3600',
						},
					})
				} catch (error) {
					logger.error(
						'api',
						`Error serving subtitles: ${error instanceof Error ? error.message : String(error)}`,
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

