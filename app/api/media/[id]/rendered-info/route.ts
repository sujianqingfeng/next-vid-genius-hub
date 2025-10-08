import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { eq } from 'drizzle-orm'

import { NextRequest, NextResponse } from 'next/server'
import { db, schema } from '~/lib/db'
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

    if (!media.videoWithInfoPath) {
      return NextResponse.json(
        { error: 'Rendered info video not found' },
        { status: 404 },
      )
    }

    // Remote artifact via orchestrator
    if (media.videoWithInfoPath.startsWith('remote:orchestrator:')) {
      const jobId = media.videoWithInfoPath.split(':').pop()!
      const base = (CF_ORCHESTRATOR_URL || '').replace(/\/$/, '')
      if (!base) {
        return NextResponse.json({ error: 'Orchestrator URL not configured' }, { status: 500 })
      }
      const target = `${base}/artifacts/${encodeURIComponent(jobId)}`
      const range = request.headers.get('range')
      const headers: Record<string, string> = {}
      if (range) headers['range'] = range
      const r = await fetch(target, { headers })
      const respHeaders = new Headers()
      const copy = ['content-type','accept-ranges','content-length','content-range','cache-control','etag','last-modified']
      for (const h of copy) {
        const v = r.headers.get(h)
        if (v) respHeaders.set(h, v)
      }
      if (!respHeaders.has('cache-control')) respHeaders.set('cache-control','private, max-age=60')
      return new NextResponse(r.body as unknown as ReadableStream, { status: r.status, headers: respHeaders })
    }

    // Local file fallback
    const stats = await stat(media.videoWithInfoPath)
    const fileSize = stats.size
    const lastModified = stats.mtime.toUTCString()
    const etag = `W/"${fileSize}-${Math.floor(stats.mtimeMs)}"`

    const ifNoneMatch = request.headers.get('if-none-match')
    const ifModifiedSince = request.headers.get('if-modified-since')
    const isNotModified =
      (ifNoneMatch && ifNoneMatch === etag) ||
      (ifModifiedSince &&
        !Number.isNaN(Date.parse(ifModifiedSince)) &&
        new Date(ifModifiedSince).getTime() >= stats.mtime.getTime())
    if (isNotModified) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Last-Modified': lastModified,
          'Cache-Control': 'public, max-age=3600',
        },
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
      if (!match) {
        return NextResponse.json({ error: 'Invalid Range' }, { status: 400 })
      }
      let start: number
      let end: number
      const startStr = match[1]
      const endStr = match[2]
      if (startStr === '' && endStr !== '') {
        const suffixLength = parseInt(endStr, 10)
        if (Number.isNaN(suffixLength) || suffixLength <= 0) {
          return NextResponse.json({ error: 'Invalid Range' }, { status: 400 })
        }
        start = Math.max(fileSize - suffixLength, 0)
        end = fileSize - 1
      } else {
        start = parseInt(startStr, 10)
        end = endStr ? parseInt(endStr, 10) : fileSize - 1
      }
      if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < 0) {
        return NextResponse.json({ error: 'Invalid Range' }, { status: 400 })
      }
      if (start >= fileSize) {
        return new NextResponse(null, {
          status: 416,
          headers: { ...baseHeaders, 'Content-Range': `bytes */${fileSize}` },
        })
      }
      if (end >= fileSize) end = fileSize - 1
      if (end < start) {
        return new NextResponse(null, {
          status: 416,
          headers: { ...baseHeaders, 'Content-Range': `bytes */${fileSize}` },
        })
      }
      const chunkSize = end - start + 1
      const stream = createReadStream(media.videoWithInfoPath, { start, end })
      return new NextResponse(stream as unknown as ReadableStream, {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Content-Length': chunkSize.toString(),
          ...(download
            ? { 'Content-Disposition': `attachment; filename="${(media.title || 'video-info').replace(/\s+/g, '_')}.mp4"` }
            : {}),
        },
      })
    }

    const stream = createReadStream(media.videoWithInfoPath)
    return new NextResponse(stream as unknown as ReadableStream, {
      headers: {
        ...baseHeaders,
        'Content-Length': fileSize.toString(),
        ...(download
          ? { 'Content-Disposition': `attachment; filename="${(media.title || 'video-info').replace(/\s+/g, '_')}.mp4"` }
          : {}),
      },
    })
  } catch (error) {
    console.error('Error serving rendered info video:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

