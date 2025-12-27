import { eq } from 'drizzle-orm'
import { getDb, schema } from '~/lib/db'
import { logger } from '~/lib/logger'
import {
	makeOrchestratorArtifactUrl,
	resolveRemoteVideoUrl,
	tryProxyRemoteWithRange,
} from '~/lib/media/stream'

export async function handleMediaSourceRequest(
	request: Request,
	mediaId: string,
): Promise<Response> {
	try {
		const db = await getDb()
		const media = await db.query.media.findFirst({
			where: eq(schema.media.id, mediaId),
		})

		if (!media) {
			return Response.json({ error: 'Media not found' }, { status: 404 })
		}

		const variant = new URL(request.url).searchParams.get('variant') || 'auto'
		logger.debug('api', `[source] request media=${mediaId} variant=${variant}`)

		if (variant === 'original') {
			if (media.remoteVideoKey) {
				try {
					const url = await resolveRemoteVideoUrl({
						filePath: media.filePath ?? null,
						downloadJobId: null,
						remoteVideoKey: media.remoteVideoKey,
						title: media.title ?? null,
					})
					if (url) {
						const proxied = await tryProxyRemoteWithRange(url, request, {
							defaultCacheSeconds: 60,
							fallthroughStatusCodes: [404],
						})
						if (proxied) {
							logger.info(
								'api',
								`[source] original via remoteVideoKey media=${mediaId}`,
							)
							return proxied
						}
					}
				} catch (e) {
					logger.warn(
						'api',
						`[source] original variant: presign remoteVideoKey failed: ${
							e instanceof Error ? e.message : String(e)
						}`,
					)
				}
			}

			if (media.downloadJobId) {
				const remoteUrl = makeOrchestratorArtifactUrl(media.downloadJobId)
				if (remoteUrl) {
					const proxied = await tryProxyRemoteWithRange(remoteUrl, request, {
						defaultCacheSeconds: 60,
						fallthroughStatusCodes: [404],
					})
					if (proxied) {
						logger.info(
							'api',
							`[source] original via orchestrator job=${media.downloadJobId} media=${mediaId}`,
						)
						return proxied
					}
				}
			}

			return Response.json(
				{ error: 'Original source not found' },
				{ status: 404 },
			)
		}

		if (variant === 'subtitles') {
			const renderJobId = media.renderSubtitlesJobId
			if (!renderJobId) {
				return Response.json(
					{ error: 'Subtitled source not available' },
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
			const proxied = await tryProxyRemoteWithRange(remoteUrl, request, {
				defaultCacheSeconds: 60,
			})
			if (proxied) {
				logger.info('api', `[source] subtitles via orchestrator media=${mediaId}`)
				return proxied
			}

			return Response.json(
				{ error: 'Subtitled source not available' },
				{ status: 404 },
			)
		}

		// variant=auto: prefer subtitles (if available), otherwise fall back to original source.
		if (variant === 'auto') {
			const renderJobId = media.renderSubtitlesJobId
			if (renderJobId) {
				const remoteUrl = makeOrchestratorArtifactUrl(renderJobId)
				if (remoteUrl) {
					const proxied = await tryProxyRemoteWithRange(remoteUrl, request, {
						defaultCacheSeconds: 60,
						fallthroughStatusCodes: [404],
					})
					if (proxied) {
						logger.info(
							'api',
							`[source] auto via subtitles orchestrator job=${renderJobId} media=${mediaId}`,
						)
						return proxied
					}
				} else {
					logger.warn(
						'api',
						`[source] auto: subtitles job set but orchestrator URL not configured media=${mediaId}`,
					)
				}
			}
		}

		if (media.remoteVideoKey) {
			try {
				const url = await resolveRemoteVideoUrl({
					filePath: media.filePath ?? null,
					downloadJobId: null,
					remoteVideoKey: media.remoteVideoKey,
					title: media.title ?? null,
				})
				if (url) {
					const proxied = await tryProxyRemoteWithRange(url, request, {
						defaultCacheSeconds: 60,
						fallthroughStatusCodes: [404],
					})
					if (proxied) {
						logger.info(
							'api',
							`[source] auto via remoteVideoKey media=${mediaId}`,
						)
						return proxied
					}
				}
			} catch (e) {
				logger.warn(
					'api',
					`[source] presign remoteVideoKey failed: ${
						e instanceof Error ? e.message : String(e)
					}`,
				)
			}
		}

		if (media.downloadJobId) {
			const remoteUrl = makeOrchestratorArtifactUrl(media.downloadJobId)
			if (remoteUrl) {
				const proxied = await tryProxyRemoteWithRange(remoteUrl, request, {
					defaultCacheSeconds: 60,
					fallthroughStatusCodes: [404],
				})
				if (proxied) {
					logger.info(
						'api',
						`[source] auto via orchestrator job=${media.downloadJobId} media=${mediaId}`,
					)
					return proxied
				}
			}
		}

		logger.warn('api', `[source] source video not found media=${mediaId}`)
		return Response.json({ error: 'Source video not found' }, { status: 404 })
	} catch (error) {
		logger.error(
			'api',
			`Error serving source video: ${
				error instanceof Error ? error.message : String(error)
			}`,
		)
		return Response.json({ error: 'Internal server error' }, { status: 500 })
	}
}
