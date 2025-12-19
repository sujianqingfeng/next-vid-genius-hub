import { eq } from 'drizzle-orm'
import { createFileRoute } from '@tanstack/react-router'

import { getDb, schema } from '~/lib/db'
import { logger } from '~/lib/logger'
import {
	createProxyResponse,
	extractJobIdFromRemoteKey,
	extractOrchestratorUrlFromPath,
	makeOrchestratorArtifactUrl,
	resolveRemoteVideoUrl,
	tryProxyRemoteWithRange,
} from '~/lib/media/stream'

export const Route = createFileRoute('/api/media/$id/source')({
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
									const jobIdFromKey = extractJobIdFromRemoteKey(media.remoteVideoKey)
									const artifactUrl = jobIdFromKey
										? makeOrchestratorArtifactUrl(jobIdFromKey)
										: null
									if (artifactUrl) {
										const artifact = await tryProxyRemoteWithRange(artifactUrl, request, {
											defaultCacheSeconds: 60,
											fallthroughStatusCodes: [404],
										})
										if (artifact) {
											logger.info(
												'api',
												`[source] original via orchestrator keyJob=${jobIdFromKey} media=${mediaId}`,
											)
											return artifact
										}
									}
								}
							} catch (e) {
								logger.warn(
									'api',
									`[source] original variant: presign remoteVideoKey failed: ${e instanceof Error ? e.message : String(e)}`,
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

						return Response.json({ error: 'Original source not found' }, { status: 404 })
					}

					if (variant === 'subtitles') {
						const renderedPath = media.videoWithSubtitlesPath
						if (!renderedPath) {
							return Response.json(
								{ error: 'Subtitled source not available' },
								{ status: 404 },
							)
						}
						if (renderedPath.startsWith('remote:orchestrator:')) {
							const remoteUrl = extractOrchestratorUrlFromPath(renderedPath)
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
								logger.info(
									'api',
									`[source] subtitles via orchestrator media=${mediaId}`,
								)
								return proxied
							}
						}

						return Response.json(
							{ error: 'Subtitled source not available' },
							{ status: 404 },
						)
					}

					const preferRendered = media.videoWithSubtitlesPath || media.videoWithInfoPath
					if (preferRendered) {
						const renderedPath = preferRendered
						if (renderedPath.startsWith('remote:orchestrator:')) {
							const remoteUrl = extractOrchestratorUrlFromPath(renderedPath)
							if (!remoteUrl) {
								return Response.json(
									{ error: 'Orchestrator URL not configured' },
									{ status: 500 },
								)
							}

							const range = request.headers.get('range')
							const passHeaders: Record<string, string> = {}
							if (range) passHeaders.range = range
							const r = await fetch(remoteUrl, { headers: passHeaders })
							if (r.ok) {
								logger.info(
									'api',
									`[source] auto via rendered orchestrator media=${mediaId}`,
								)
								return createProxyResponse(r, { defaultCacheSeconds: 60 })
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
									logger.info('api', `[source] auto via remoteVideoKey media=${mediaId}`)
									return proxied
								}

								const jobIdFromKey = extractJobIdFromRemoteKey(media.remoteVideoKey)
								const artifactUrl = jobIdFromKey
									? makeOrchestratorArtifactUrl(jobIdFromKey)
									: null
								if (artifactUrl) {
									const artifact = await tryProxyRemoteWithRange(artifactUrl, request, {
										defaultCacheSeconds: 60,
										fallthroughStatusCodes: [404],
									})
									if (artifact) {
										logger.info(
											'api',
											`[source] auto via orchestrator keyJob=${jobIdFromKey} media=${mediaId}`,
										)
										return artifact
									}
								}
							}
						} catch (e) {
							logger.warn(
								'api',
								`[source] presign remoteVideoKey failed: ${e instanceof Error ? e.message : String(e)}`,
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
						`Error serving source video: ${error instanceof Error ? error.message : String(error)}`,
					)
					return Response.json({ error: 'Internal server error' }, { status: 500 })
				}
			},
		},
	},
})

