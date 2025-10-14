import { eq } from 'drizzle-orm'

import { NextRequest, NextResponse } from 'next/server'
import { db, schema } from '~/lib/db'
import {
  serveLocalFileWithRange,
  proxyRemoteWithRange,
  resolveRemoteVideoUrl,
} from '~/lib/media/stream'
import { CF_ORCHESTRATOR_URL } from '~/lib/constants'

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

    // 1.5) If no local source, but a rendered artifact exists, serve it as source.
    // This keeps cloud-only flows working when ENABLE_LOCAL_HYDRATE=false.
    // Prefer "with info" > "with subtitles" if available.
    // 优先使用“带字幕”的渲染产物作为回退源；避免对“已含信息/评论叠加”的成品再次叠加。
    const preferRendered = media.videoWithSubtitlesPath || media.videoWithInfoPath
    if (preferRendered) {
      const renderedPath = preferRendered
      // Remote artifact stored in orchestrator
      if (renderedPath.startsWith('remote:orchestrator:')) {
        const jobId = renderedPath.split(':').pop()!
        const base = (CF_ORCHESTRATOR_URL || '').replace(/\/$/, '')
        if (!base) {
          return NextResponse.json(
            { error: 'Orchestrator URL not configured' },
            { status: 500 },
          )
        }
        const remoteUrl = `${base}/artifacts/${encodeURIComponent(jobId)}`
        return proxyRemoteWithRange(remoteUrl, request, { defaultCacheSeconds: 60 })
      }
      // Local rendered file
      return serveLocalFileWithRange(renderedPath, request, {
        contentType: 'video/mp4',
        cacheSeconds: 600,
      })
    }

    // 2) Remote fallbacks (orchestrator artifact by downloadJobId, or presigned R2 key)
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
