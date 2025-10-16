import { eq } from 'drizzle-orm'

import { NextRequest, NextResponse } from 'next/server'
import { db, schema } from '~/lib/db'
import {
  serveLocalFileWithRange,
  proxyRemoteWithRange,
  resolveRemoteVideoUrl,
} from '~/lib/media/stream'
import { CF_ORCHESTRATOR_URL } from '~/lib/config/app.config'

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

    const variant = new URL(request.url).searchParams.get('variant') || 'auto'

    console.log('[source] resolving video source', {
      mediaId,
      variant,
      hasFilePath: Boolean(media.filePath),
      hasRemoteVideoKey: Boolean(media.remoteVideoKey),
      hasDownloadJobId: Boolean(media.downloadJobId),
      downloadStatus: media.downloadStatus,
      hasRenderedPath: Boolean(media.videoWithSubtitlesPath || media.videoWithInfoPath),
    })

    // Variant-specific handling
    if (variant === 'original') {
      // Prefer local original file when present
      if (media.filePath && !media.filePath.startsWith('remote:orchestrator:')) {
        return serveLocalFileWithRange(media.filePath, request, {
          contentType: 'video/mp4',
          cacheSeconds: 600,
        })
      }
      // Try presigned remote original
      if (media.remoteVideoKey) {
        try {
          const url = await resolveRemoteVideoUrl({
            filePath: media.filePath ?? null,
            downloadJobId: null,
            remoteVideoKey: media.remoteVideoKey,
            title: media.title ?? null,
          })
          if (url) return proxyRemoteWithRange(url, request, { defaultCacheSeconds: 60 })
        } catch (e) {
          console.warn('[source] original variant: presign remoteVideoKey failed', e)
        }
      }
      // Fallback to download job artifact if available
      if (media.downloadJobId && CF_ORCHESTRATOR_URL) {
        const base = CF_ORCHESTRATOR_URL.replace(/\/$/, '')
        const url = `${base}/artifacts/${encodeURIComponent(media.downloadJobId)}`
        return proxyRemoteWithRange(url, request, { defaultCacheSeconds: 60 })
      }
      return NextResponse.json({ error: 'Original source not found' }, { status: 404 })
    }

    if (variant === 'subtitles') {
      const renderedPath = media.videoWithSubtitlesPath
      if (!renderedPath) {
        return NextResponse.json({ error: 'Subtitled source not available' }, { status: 404 })
      }
      if (renderedPath.startsWith('remote:orchestrator:')) {
        const jobId = renderedPath.split(':').pop()!
        const base = (CF_ORCHESTRATOR_URL || '').replace(/\/$/, '')
        if (!base) return NextResponse.json({ error: 'Orchestrator URL not configured' }, { status: 500 })
        const remoteUrl = `${base}/artifacts/${encodeURIComponent(jobId)}`
        return proxyRemoteWithRange(remoteUrl, request, { defaultCacheSeconds: 60 })
      }
      return serveLocalFileWithRange(renderedPath, request, {
        contentType: 'video/mp4',
        cacheSeconds: 600,
      })
    }

    // === variant === 'auto' (default behavior) ===

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
        // Try remote artifact first; if missing (404), fall through to other remote fallbacks below
        const range = request.headers.get('range')
        const passHeaders: Record<string, string> = {}
        if (range) passHeaders['range'] = range
        const r = await fetch(remoteUrl, { headers: passHeaders })
        if (r.ok) {
          const respHeaders = new Headers()
          const copy = ['content-type', 'accept-ranges', 'content-length', 'content-range', 'cache-control', 'etag', 'last-modified']
          for (const h of copy) {
            const v = r.headers.get(h)
            if (v) respHeaders.set(h, v)
          }
          if (!respHeaders.has('cache-control')) respHeaders.set('cache-control', 'private, max-age=60')
          return new NextResponse(r.body as unknown as ReadableStream, { status: r.status, headers: respHeaders })
        }
        // If remote artifact responded non-OK (e.g., 404), continue to generic remote resolution below
      } else {
        // Local rendered file
        return serveLocalFileWithRange(renderedPath, request, {
          contentType: 'video/mp4',
          cacheSeconds: 600,
        })
      }
    }

    // 2) Remote fallbacks
    // Prefer presigned remoteVideoKey (if DB has one), otherwise try orchestrator artifact by downloadJobId.
    // This also recovers stale DB states where downloadStatus isn't updated but artifact exists in R2.
    const base = (CF_ORCHESTRATOR_URL || '').replace(/\/$/, '')
    // 2.1) Try remoteVideoKey via orchestrator presign helper
    if (media.remoteVideoKey) {
      try {
        const url = await resolveRemoteVideoUrl({
          filePath: media.filePath ?? null,
          downloadJobId: null,
          remoteVideoKey: media.remoteVideoKey,
          title: media.title ?? null,
        })
        if (url) return proxyRemoteWithRange(url, request, { defaultCacheSeconds: 60 })
      } catch (e) {
        console.warn('[source] presign remoteVideoKey failed', e)
      }
    }
    // 2.2) Try orchestrator artifact by downloadJobId (regardless of local downloadStatus)
    if (media.downloadJobId && base) {
      const url = `${base}/artifacts/${encodeURIComponent(media.downloadJobId)}`
      return proxyRemoteWithRange(url, request, { defaultCacheSeconds: 60 })
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
