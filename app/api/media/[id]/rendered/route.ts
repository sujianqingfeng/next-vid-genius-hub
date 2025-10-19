import { eq } from 'drizzle-orm'

import { NextRequest, NextResponse } from 'next/server'
import { db, schema } from '~/lib/db'
import { logger } from '~/lib/logger'
import {
	buildDownloadFilename,
	extractOrchestratorUrlFromPath,
	proxyRemoteWithRange,
	serveLocalFileWithRange,
} from '~/lib/media/stream'

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ id: string }> },
) {
	try {
		const { id: mediaId } = await context.params

		const media = await db.query.media.findFirst({
			where: eq(schema.media.id, mediaId),
		})

		if (!media) {
			return NextResponse.json({ error: 'Media not found' }, { status: 404 })
		}

		const download = request.nextUrl.searchParams.get('download') === '1'

		const downloadName = download
			? buildDownloadFilename(media.title, 'video', 'mp4')
			: null

		if (!media.videoWithSubtitlesPath) {
			return NextResponse.json(
				{ error: 'Rendered video not found' },
				{ status: 404 },
			)
		}

		const remoteUrl = extractOrchestratorUrlFromPath(media.videoWithSubtitlesPath)
		if (remoteUrl) {
			return proxyRemoteWithRange(remoteUrl, request, {
				defaultCacheSeconds: 60,
				forceDownloadName: downloadName,
			})
		}

		return serveLocalFileWithRange(media.videoWithSubtitlesPath, request, {
			contentType: 'video/mp4',
			cacheSeconds: 3600,
			downloadName,
		})
  } catch (error) {
    logger.error('api', `Error serving rendered video: ${error instanceof Error ? error.message : String(error)}`)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
