import { eq } from 'drizzle-orm'

import { NextRequest, NextResponse } from 'next/server'
import { getDb, schema } from '~/lib/db'
export const runtime = 'nodejs'
import { logger } from '~/lib/logger'
import {
  extractJobIdFromRemoteKey,
  makeOrchestratorArtifactUrl,
  resolveRemoteVideoUrl,
  tryProxyRemoteWithRange,
} from '~/lib/media/stream'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: mediaId } = await context.params

    const db = await getDb()
    const media = await db.query.media.findFirst({
      where: eq(schema.media.id, mediaId),
    })

    if (!media) return NextResponse.json({ error: 'Media not found' }, { status: 404 })

    const wantDownload = request.nextUrl.searchParams.get('download') === '1'
    const downloadName = wantDownload ? `${(media.title || 'video').replace(/\s+/g, '_')}.mp4` : null

    // Remote fallbacks only (no local filesystem access)
    // Prefer presigned remoteVideoKey; otherwise try orchestrator artifact by downloadJobId even if DB status is stale.
    if (media.remoteVideoKey) {
      try {
        const remoteUrl = await resolveRemoteVideoUrl({
          filePath: media.filePath ?? null,
          downloadJobId: null,
          remoteVideoKey: media.remoteVideoKey,
          title: media.title ?? null,
        })
        if (remoteUrl) {
          const proxied = await tryProxyRemoteWithRange(remoteUrl, request, {
            defaultCacheSeconds: 60,
            forceDownloadName: downloadName,
            fallthroughStatusCodes: [404],
          })
          if (proxied) {
            logger.info('api', `[downloaded] via remoteVideoKey media=${mediaId} download=${wantDownload ? '1' : '0'}`)
            return proxied
          }
          const jobIdFromKey = extractJobIdFromRemoteKey(media.remoteVideoKey)
          const artifactUrl = jobIdFromKey ? makeOrchestratorArtifactUrl(jobIdFromKey) : null
          if (artifactUrl) {
            const artifact = await tryProxyRemoteWithRange(artifactUrl, request, {
              defaultCacheSeconds: 60,
              forceDownloadName: downloadName,
              fallthroughStatusCodes: [404],
            })
            if (artifact) {
              logger.info('api', `[downloaded] via orchestrator keyJob=${jobIdFromKey} media=${mediaId} download=${wantDownload ? '1' : '0'}`)
              return artifact
            }
          }
        }
      } catch (e) {
        logger.warn('api', `[downloaded] presign remoteVideoKey failed: ${e instanceof Error ? e.message : String(e)}`)
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
          logger.info('api', `[downloaded] via orchestrator job=${media.downloadJobId} media=${mediaId} download=${wantDownload ? '1' : '0'}`)
          return proxied
        }
      }
    }

    logger.warn('api', `[downloaded] no video available media=${mediaId}`)
    return NextResponse.json({ error: 'No video available' }, { status: 404 })
  } catch (error) {
    logger.error('api', `Error serving downloaded video: ${error instanceof Error ? error.message : String(error)}`)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
