import { eq } from 'drizzle-orm'

import { NextRequest, NextResponse } from 'next/server'
import { db, schema } from '~/lib/db'
import { serveLocalFileWithRange, proxyRemoteWithRange, resolveRemoteVideoUrl } from '~/lib/media/stream'

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

    // 1) Local file if hydrated
    if (media.filePath && !media.filePath.startsWith('remote:orchestrator:')) {
      return serveLocalFileWithRange(media.filePath, request, {
        contentType: 'video/mp4',
        cacheSeconds: 600,
      })
    }

    // 2) Remote fallbacks (orchestrator artifact or presigned R2 key)
    const remoteUrl = await resolveRemoteVideoUrl({
      filePath: media.filePath ?? null,
      downloadJobId: media.downloadJobId ?? null,
      remoteVideoKey: media.remoteVideoKey ?? null,
      title: media.title ?? null,
    })
    if (remoteUrl) {
      return proxyRemoteWithRange(remoteUrl, request, { defaultCacheSeconds: 60 })
    }

    return NextResponse.json({ error: 'Source video not found' }, { status: 404 })
  } catch (error) {
    console.error('Error serving source video:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

