import { eq } from 'drizzle-orm'
import { createFileRoute } from '@tanstack/react-router'

import { getDb, schema } from '~/lib/db'
import { logger } from '~/lib/logger'
import { buildDownloadFilename } from '~/lib/media/stream'

export const Route = createFileRoute('/api/media/$id/subtitles')({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
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

					const download =
						new URL(request.url).searchParams.get('download') === '1'
					const headers: Record<string, string> = {
						'content-type': 'text/vtt',
						'cache-control': 'public, max-age=3600',
					}
					if (download) {
						headers['content-disposition'] = `attachment; filename="${buildDownloadFilename(
							media.title,
							'subtitles',
							'vtt',
						)}"`
					}

					return new Response(vttContent, {
						headers,
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
