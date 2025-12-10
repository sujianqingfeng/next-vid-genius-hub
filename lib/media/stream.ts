import { NextRequest, NextResponse } from 'next/server'
import { CF_ORCHESTRATOR_URL } from '~/lib/config/env'
import { presignGetByKey } from '~/lib/cloudflare'
import { logger } from '~/lib/logger'

export interface MinimalMediaLike {
  filePath: string | null
  downloadJobId: string | null
  remoteVideoKey: string | null
  title?: string | null
}

const PROXY_HEADER_KEYS = ['content-type', 'accept-ranges', 'content-length', 'content-range', 'cache-control', 'etag', 'last-modified'] as const
const DEFAULT_DOWNLOAD_FALLBACK_NAME = 'download'

function encodeRFC5987Value(value: string): string {
  return encodeURIComponent(value)
    .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A')
    .replace(/%(7C|60|5E)/g, '%25$1')
}

function buildAttachmentDisposition(filename: string): string {
  const asciiFallback =
    filename
      .normalize('NFKD')
      .replace(/[^\x20-\x7E]+/g, '_')
      .replace(/["\\]/g, '')
      .trim() || DEFAULT_DOWNLOAD_FALLBACK_NAME
  const encoded = encodeRFC5987Value(filename)
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`
}

export function buildDownloadFilename(
  title: string | null | undefined,
  fallbackBase: string,
  extension: string,
): string {
  const base = (title && title.trim().length > 0 ? title : fallbackBase).replace(/\s+/g, '_')
  const normalizedExt = extension.replace(/^\./, '')
  return `${base}.${normalizedExt}`
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
    respHeaders.set('Content-Disposition', buildAttachmentDisposition(options.forceDownloadName))
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
      logger.error('media', `[stream] presign by key failed: ${e instanceof Error ? e.message : String(e)}`)
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
