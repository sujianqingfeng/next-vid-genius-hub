import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { NextRequest, NextResponse } from 'next/server'
import { CF_ORCHESTRATOR_URL } from '~/lib/config/app.config'
import { presignGetByKey } from '~/lib/cloudflare'

export interface MinimalMediaLike {
  filePath: string | null
  downloadJobId: string | null
  remoteVideoKey: string | null
  title?: string | null
}

type LocalServeOptions = {
  contentType?: string
  cacheSeconds?: number
  downloadName?: string | null
}

const DEFAULT_HEADERS = {
  contentType: 'video/mp4',
  cacheSeconds: 600,
} satisfies LocalServeOptions

const PROXY_HEADER_KEYS = ['content-type', 'accept-ranges', 'content-length', 'content-range', 'cache-control', 'etag', 'last-modified'] as const

export function buildDownloadFilename(
  title: string | null | undefined,
  fallbackBase: string,
  extension: string,
): string {
  const base = (title && title.trim().length > 0 ? title : fallbackBase).replace(/\s+/g, '_')
  const normalizedExt = extension.replace(/^\./, '')
  return `${base}.${normalizedExt}`
}

export async function serveLocalFileWithRange(
  filePath: string,
  request: NextRequest,
  options: LocalServeOptions = {},
): Promise<NextResponse> {
  const { contentType, cacheSeconds, downloadName } = {
    ...DEFAULT_HEADERS,
    ...options,
  }

  const stats = await stat(filePath)
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
      headers: {
        ETag: etag,
        'Last-Modified': lastModified,
        'Cache-Control': `public, max-age=${cacheSeconds}`,
      },
    })
  }

  const baseHeaders: Record<string, string> = {
    'Content-Type': contentType || 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': `public, max-age=${cacheSeconds}`,
    ETag: etag,
    'Last-Modified': lastModified,
  }

  const range = request.headers.get('range')
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
    if (start >= fileSize) return new NextResponse(null, { status: 416, headers: { ...baseHeaders, 'Content-Range': `bytes */${fileSize}` } })
    if (end >= fileSize) end = fileSize - 1
    if (end < start) return new NextResponse(null, { status: 416, headers: { ...baseHeaders, 'Content-Range': `bytes */${fileSize}` } })

    const chunkSize = end - start + 1
    const stream = createReadStream(filePath, { start, end })
    const headers: Record<string, string> = {
      ...baseHeaders,
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Content-Length': chunkSize.toString(),
    }
    if (downloadName) headers['Content-Disposition'] = `attachment; filename="${downloadName}"`
    return new NextResponse(stream as unknown as ReadableStream, { status: 206, headers })
  }

  const stream = createReadStream(filePath)
  const headers: Record<string, string> = {
    ...baseHeaders,
    'Content-Length': fileSize.toString(),
  }
  if (downloadName) headers['Content-Disposition'] = `attachment; filename="${downloadName}"`
  return new NextResponse(stream as unknown as ReadableStream, { headers })
}

export function createProxyResponse(
  upstream: Response,
  options?: { defaultCacheSeconds?: number; forceDownloadName?: string | null },
): NextResponse {
  const respHeaders = new Headers()
  for (const key of PROXY_HEADER_KEYS) {
    const v = upstream.headers.get(key)
    if (v) respHeaders.set(key, v)
  }
  if (!respHeaders.has('cache-control')) {
    respHeaders.set('cache-control', `private, max-age=${options?.defaultCacheSeconds ?? 60}`)
  }
  if (options?.forceDownloadName) {
    respHeaders.set('Content-Disposition', `attachment; filename="${options.forceDownloadName}"`)
  }
  const body = upstream.body ?? null
  return new NextResponse(body as unknown as BodyInit | null, {
    status: upstream.status,
    headers: respHeaders,
  })
}

export async function proxyRemoteWithRange(
  remoteUrl: string,
  request: NextRequest,
  options?: { defaultCacheSeconds?: number; forceDownloadName?: string | null },
): Promise<NextResponse> {
  const range = request.headers.get('range')
  const passHeaders: Record<string, string> = {}
  if (range) passHeaders['range'] = range
  const r = await fetch(remoteUrl, { headers: passHeaders })
  return createProxyResponse(r, options)
}

export async function resolveRemoteVideoUrl(media: MinimalMediaLike): Promise<string | null> {
  const base = (CF_ORCHESTRATOR_URL || '').replace(/\/$/, '')
  if (!media) return null
  if (media.filePath && media.filePath.startsWith('remote:orchestrator:')) {
    const jobId = media.filePath.split(':').pop()!
    return `${base}/artifacts/${encodeURIComponent(jobId)}`
  }
  if (media.downloadJobId) {
    return `${base}/artifacts/${encodeURIComponent(media.downloadJobId)}`
  }
  if (media.remoteVideoKey) {
    try {
      return await presignGetByKey(media.remoteVideoKey)
    } catch (e) {
      console.error('[stream] presign by key failed', e)
      return null
    }
  }
  return null
}

export function makeOrchestratorArtifactUrl(jobId: string): string | null {
  const base = (CF_ORCHESTRATOR_URL || '').replace(/\/$/, '')
  if (!base) return null
  return `${base}/artifacts/${encodeURIComponent(jobId)}`
}

export function extractOrchestratorUrlFromPath(path: string | null | undefined): string | null {
  if (!path || !path.startsWith('remote:orchestrator:')) return null
  const jobId = path.split(':').pop()
  if (!jobId) return null
  return makeOrchestratorArtifactUrl(jobId)
}
