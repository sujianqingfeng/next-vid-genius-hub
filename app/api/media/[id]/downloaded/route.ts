import { eq } from 'drizzle-orm'

import { NextRequest, NextResponse } from 'next/server'
import { db, schema } from '~/lib/db'
import { proxyRemoteWithRange, resolveRemoteVideoUrl, serveLocalFileWithRange } from '~/lib/media/stream'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: mediaId } = await context.params

    const media = await db.query.media.findFirst({
      where: eq(schema.media.id, mediaId),
    })

    if (!media) return NextResponse.json({ error: 'Media not found' }, { status: 404 })

    const wantDownload = request.nextUrl.searchParams.get('download') === '1'
    const downloadName = wantDownload ? `${(media.title || 'video').replace(/\s+/g, '_')}.mp4` : null

    // 1) Local file directly
    if (media.filePath && !media.filePath.startsWith('remote:orchestrator:')) {
      return serveLocalFileWithRange(media.filePath, request, {
        contentType: 'video/mp4',
        cacheSeconds: 3600,
        downloadName,
      })
    }

    // 2) Remote fallbacks
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
          return proxyRemoteWithRange(remoteUrl, request, {
            defaultCacheSeconds: 60,
            forceDownloadName: downloadName,
          })
        }
      } catch (e) {
        console.warn('[downloaded] presign remoteVideoKey failed', e)
      }
    }
    if (media.downloadJobId) {
      const base = (process.env.CF_ORCHESTRATOR_URL || '').replace(/\/$/, '')
      if (base) {
        const url = `${base}/artifacts/${encodeURIComponent(media.downloadJobId)}`
        return proxyRemoteWithRange(url, request, {
          defaultCacheSeconds: 60,
          forceDownloadName: downloadName,
        })
      }
    }

    return NextResponse.json({ error: 'No video available' }, { status: 404 })
  } catch (error) {
    console.error('Error serving downloaded video:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
