import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'

import { getDb, schema } from '~/lib/db'
import { logger } from '~/lib/logger'
import {
	makeOrchestratorArtifactUrl,
	resolveRemoteVideoUrl,
	tryProxyRemoteWithRange,
} from '~/lib/media/stream'

export const Route = createFileRoute('/api/media/$id/downloaded')({
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

					const wantDownload =
						new URL(request.url).searchParams.get('download') === '1'
					const downloadName = wantDownload
						? `${(media.title || 'video').replace(/\s+/g, '_')}.mp4`
						: null

					if (media.remoteVideoKey) {
						try {
							const remoteUrl = await resolveRemoteVideoUrl({
								filePath: media.filePath ?? null,
								downloadJobId: null,
								remoteVideoKey: media.remoteVideoKey,
								title: media.title ?? null,
							})

							if (remoteUrl) {
								const proxied = await tryProxyRemoteWithRange(
									remoteUrl,
									request,
									{
										defaultCacheSeconds: 60,
										forceDownloadName: downloadName,
										fallthroughStatusCodes: [404],
									},
								)
								if (proxied) {
									logger.info(
										'api',
										`[downloaded] via remoteVideoKey media=${mediaId} download=${wantDownload ? '1' : '0'}`,
									)
									return proxied
								}
							}
						} catch (e) {
							logger.warn(
								'api',
								`[downloaded] presign remoteVideoKey failed: ${e instanceof Error ? e.message : String(e)}`,
							)
						}
					}

					if (media.downloadJobId) {
						const url = makeOrchestratorArtifactUrl(media.downloadJobId)
						if (url) {
							const proxied = await tryProxyRemoteWithRange(url, request, {
								defaultCacheSeconds: 60,
								forceDownloadName: downloadName,
								fallthroughStatusCodes: [404],
							})
							if (proxied) {
								logger.info(
									'api',
									`[downloaded] via orchestrator job=${media.downloadJobId} media=${mediaId} download=${wantDownload ? '1' : '0'}`,
								)
								return proxied
							}
						}
					}

					logger.warn('api', `[downloaded] no video available media=${mediaId}`)
					return Response.json({ error: 'No video available' }, { status: 404 })
				} catch (error) {
					logger.error(
						'api',
						`Error serving downloaded video: ${error instanceof Error ? error.message : String(error)}`,
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
