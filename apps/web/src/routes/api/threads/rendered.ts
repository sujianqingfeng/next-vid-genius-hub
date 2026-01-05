import { createFileRoute } from '@tanstack/react-router'
import { logger } from '~/lib/infra/logger'
import {
	buildDownloadFilename,
	makeOrchestratorArtifactUrl,
	proxyRemoteWithRange,
} from '~/lib/domain/media/stream'

export const Route = createFileRoute('/api/threads/rendered')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					const url = new URL(request.url)
					const jobId = url.searchParams.get('jobId')?.trim()
					if (!jobId) {
						return Response.json({ error: 'jobId required' }, { status: 400 })
					}

					const download = url.searchParams.get('download') === '1'
					const downloadName = download
						? buildDownloadFilename('thread-render', 'thread', 'mp4')
						: null

					const remoteUrl = makeOrchestratorArtifactUrl(jobId)
					if (!remoteUrl) {
						return Response.json(
							{ error: 'Orchestrator URL not configured' },
							{ status: 500 },
						)
					}

					logger.info(
						'api',
						`[threads.rendered] via orchestrator job=${jobId} download=${download ? '1' : '0'}`,
					)
					return proxyRemoteWithRange(remoteUrl, request, {
						defaultCacheSeconds: 60,
						forceDownloadName: downloadName,
					})
				} catch (error) {
					logger.error(
						'api',
						`Error serving thread rendered video: ${error instanceof Error ? error.message : String(error)}`,
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
