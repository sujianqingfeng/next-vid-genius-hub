import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { eq } from 'drizzle-orm'

import { NextRequest, NextResponse } from 'next/server'
import { db, schema } from '~/lib/db'
import { CF_ORCHESTRATOR_URL } from '~/lib/constants'
import { presignGetByKey } from '~/lib/cloudflare'

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

    // 1) Local file directly
    if (media.filePath && !media.filePath.startsWith('remote:orchestrator:')) {
      const stats = await stat(media.filePath)
      const fileSize = stats.size
      const lastModified = stats.mtime.toUTCString()
      const etag = `W/"${fileSize}-${Math.floor(stats.mtimeMs)}"`

      const ifNoneMatch = request.headers.get('if-none-match')
      const ifModifiedSince = request.headers.get('if-modified-since')
      const isNotModified =
        (ifNoneMatch && ifNoneMatch === etag) ||
        (ifModifiedSince && !Number.isNaN(Date.parse(ifModifiedSince)) && new Date(ifModifiedSince).getTime() >= stats.mtime.getTime())
      if (isNotModified) {
        return new NextResponse(null, {
          status: 304,
          headers: { ETag: etag, 'Last-Modified': lastModified, 'Cache-Control': 'public, max-age=3600' },
        })
      }

      const baseHeaders = {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
        ETag: etag,
        'Last-Modified': lastModified,
      } as const

      const range = request.headers.get('range')
      const download = request.nextUrl.searchParams.get('download') === '1'
      if (range) {
        const match = range.match(/bytes=(\d*)-(\d*)/)
        if (!match) return NextResponse.json({ error: 'Invalid Range' }, { status: 400 })
        let start: number
        let end: number
        const startStr = match[1]
        const endStr = match[2]
        if (startStr === '' && endStr !== '') {
          const suffixLength = parseInt(endStr, 10)
          if (Number.isNaN(suffixLength) || suffixLength <= 0) return NextResponse.json({ error: 'Invalid Range' }, { status: 400 })
          start = Math.max(fileSize - suffixLength, 0)
          end = fileSize - 1
        } else {
          start = parseInt(startStr, 10)
          end = endStr ? parseInt(endStr, 10) : fileSize - 1
        }
        if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < 0) return NextResponse.json({ error: 'Invalid Range' }, { status: 400 })
        if (start >= fileSize)
          return new NextResponse(null, { status: 416, headers: { ...baseHeaders, 'Content-Range': `bytes */${fileSize}` } })
        if (end >= fileSize) end = fileSize - 1
        if (end < start)
          return new NextResponse(null, { status: 416, headers: { ...baseHeaders, 'Content-Range': `bytes */${fileSize}` } })

        const chunkSize = end - start + 1
        const stream = createReadStream(media.filePath, { start, end })
        return new NextResponse(stream as unknown as ReadableStream, {
          status: 206,
          headers: {
            ...baseHeaders,
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Content-Length': chunkSize.toString(),
            ...(download ? { 'Content-Disposition': `attachment; filename="${(media.title || 'video').replace(/\s+/g, '_')}.mp4"` } : {}),
          },
        })
      }
      const stream = createReadStream(media.filePath)
      return new NextResponse(stream as unknown as ReadableStream, {
        headers: {
          ...baseHeaders,
          'Content-Length': fileSize.toString(),
          ...(download ? { 'Content-Disposition': `attachment; filename="${(media.title || 'video').replace(/\s+/g, '_')}.mp4"` } : {}),
        },
      })
    }

    // 2) Remote via orchestrator job id (preferred when available)
    const base = (CF_ORCHESTRATOR_URL || '').replace(/\/$/, '')
    const range = request.headers.get('range')
    const passHeaders: Record<string, string> = {}
    if (range) passHeaders['range'] = range

    let remoteUrl: string | null = null
    if (media.filePath && media.filePath.startsWith('remote:orchestrator:')) {
      const jobId = media.filePath.split(':').pop()!
      remoteUrl = `${base}/artifacts/${encodeURIComponent(jobId)}`
    } else if (media.downloadJobId) {
      remoteUrl = `${base}/artifacts/${encodeURIComponent(media.downloadJobId)}`
    } else if (media.remoteVideoKey) {
      // 3) As a fallback, presign by object key
      try {
        remoteUrl = await presignGetByKey(media.remoteVideoKey)
      } catch (e) {
        console.error('[downloaded] presign by key failed', e)
      }
    }

    if (remoteUrl) {
      const r = await fetch(remoteUrl, { headers: passHeaders })
      const respHeaders = new Headers()
      const copy = ['content-type','accept-ranges','content-length','content-range','cache-control','etag','last-modified']
      for (const h of copy) {
        const v = r.headers.get(h)
        if (v) respHeaders.set(h, v)
      }
      if (!respHeaders.has('cache-control')) respHeaders.set('cache-control', 'private, max-age=60')
      return new NextResponse(r.body as unknown as ReadableStream, { status: r.status, headers: respHeaders })
    }

    return NextResponse.json({ error: 'No video available' }, { status: 404 })
  } catch (error) {
    console.error('Error serving downloaded video:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

