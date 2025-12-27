import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'

import { getDb, schema } from '~/lib/db'
import { logger } from '~/lib/logger'
import {
	buildDownloadFilename,
	makeOrchestratorArtifactUrl,
	proxyRemoteWithRange,
} from '~/lib/media/stream'

export const Route = createFileRoute('/api/media/$id/rendered')({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				try {
					const db = await getDb()
					const mediaId = params.id
					const media = await db.query.media.findFirst({
						where: eq(schema.media.id, mediaId),
					})

					if (!media) {
						return Response.json({ error: 'Media not found' }, { status: 404 })
					}

					const download =
						new URL(request.url).searchParams.get('download') === '1'
					const downloadName = download
						? buildDownloadFilename(media.title, 'video', 'mp4')
						: null

					const renderJobId = media.renderSubtitlesJobId
					if (!renderJobId) {
						return Response.json(
							{ error: 'Rendered video not found' },
							{ status: 404 },
						)
					}

					const remoteUrl = makeOrchestratorArtifactUrl(renderJobId)
					if (!remoteUrl) {
						return Response.json(
							{ error: 'Orchestrator URL not configured' },
							{ status: 500 },
						)
					}

					logger.info(
						'api',
						`[rendered] via orchestrator media=${mediaId} download=${download ? '1' : '0'}`,
					)
					return proxyRemoteWithRange(remoteUrl, request, {
						defaultCacheSeconds: 60,
						forceDownloadName: downloadName,
					})
				} catch (error) {
					logger.error(
						'api',
						`Error serving rendered video: ${error instanceof Error ? error.message : String(error)}`,
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
