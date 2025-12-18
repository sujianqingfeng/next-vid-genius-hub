import { eq } from 'drizzle-orm'

import { NextRequest, NextResponse } from 'next/server'
import { getDb, schema } from '~/lib/db'
export const runtime = 'nodejs'
import { logger } from '~/lib/logger'
import {
  resolveRemoteVideoUrl,
  createProxyResponse,
  extractOrchestratorUrlFromPath,
  makeOrchestratorArtifactUrl,
  extractJobIdFromRemoteKey,
  tryProxyRemoteWithRange,
} from '~/lib/media/stream'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const db = await getDb()
    const { id: mediaId } = await context.params

    const media = await db.query.media.findFirst({
      where: eq(schema.media.id, mediaId),
    })

    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    const variant = new URL(request.url).searchParams.get('variant') || 'auto'

    logger.debug('api', `[source] request media=${mediaId} variant=${variant}`)

    // Variant-specific handling
    if (variant === 'original') {
      // Prefer presigned remote original
      if (media.remoteVideoKey) {
        try {
          const url = await resolveRemoteVideoUrl({
            filePath: media.filePath ?? null,
            downloadJobId: null,
            remoteVideoKey: media.remoteVideoKey,
            title: media.title ?? null,
          })
          if (url) {
            const proxied = await tryProxyRemoteWithRange(url, request, {
              defaultCacheSeconds: 60,
              fallthroughStatusCodes: [404],
            })
            if (proxied) {
              logger.info('api', `[source] original via remoteVideoKey media=${mediaId}`)
              return proxied
            }
            const jobIdFromKey = extractJobIdFromRemoteKey(media.remoteVideoKey)
            const artifactUrl = jobIdFromKey ? makeOrchestratorArtifactUrl(jobIdFromKey) : null
            if (artifactUrl) {
              const artifact = await tryProxyRemoteWithRange(artifactUrl, request, {
                defaultCacheSeconds: 60,
                fallthroughStatusCodes: [404],
              })
              if (artifact) {
                logger.info('api', `[source] original via orchestrator keyJob=${jobIdFromKey} media=${mediaId}`)
                return artifact
              }
            }
          }
        } catch (e) {
          logger.warn('api', `[source] original variant: presign remoteVideoKey failed: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      // Fallback to download job artifact if available
      if (media.downloadJobId) {
        const remoteUrl = makeOrchestratorArtifactUrl(media.downloadJobId)
        if (remoteUrl) {
          const proxied = await tryProxyRemoteWithRange(remoteUrl, request, {
            defaultCacheSeconds: 60,
            fallthroughStatusCodes: [404],
          })
          if (proxied) {
            logger.info('api', `[source] original via orchestrator job=${media.downloadJobId} media=${mediaId}`)
            return proxied
          }
        }
      }
      return NextResponse.json({ error: 'Original source not found' }, { status: 404 })
    }

    if (variant === 'subtitles') {
      const renderedPath = media.videoWithSubtitlesPath
      if (!renderedPath) {
        return NextResponse.json({ error: 'Subtitled source not available' }, { status: 404 })
      }
      if (renderedPath.startsWith('remote:orchestrator:')) {
        const remoteUrl = extractOrchestratorUrlFromPath(renderedPath)
        if (!remoteUrl) return NextResponse.json({ error: 'Orchestrator URL not configured' }, { status: 500 })
        const proxied = await tryProxyRemoteWithRange(remoteUrl, request, { defaultCacheSeconds: 60 })
        if (proxied) {
          logger.info('api', `[source] subtitles via orchestrator media=${mediaId}`)
          return proxied
        }
      }
      // No remote-rendered subtitles available
      return NextResponse.json({ error: 'Subtitled source not available' }, { status: 404 })
    }

    // === variant === 'auto' (default behavior) ===

    // Prefer remote-rendered artifact as source when available.
    // This keeps pure cloud flows working even when artifacts never hydrate locally.
    // Prefer "with info" > "with subtitles" if available.
    const preferRendered = media.videoWithSubtitlesPath || media.videoWithInfoPath
    if (preferRendered) {
      const renderedPath = preferRendered
      // Remote artifact stored in orchestrator
      if (renderedPath.startsWith('remote:orchestrator:')) {
        const remoteUrl = extractOrchestratorUrlFromPath(renderedPath)
        if (!remoteUrl) {
          return NextResponse.json(
            { error: 'Orchestrator URL not configured' },
            { status: 500 },
          )
        }
        // Try remote artifact first; if missing (404), fall through to other remote fallbacks below
        const range = request.headers.get('range')
        const passHeaders: Record<string, string> = {}
        if (range) passHeaders['range'] = range
        const r = await fetch(remoteUrl, { headers: passHeaders })
        if (r.ok) {
          logger.info('api', `[source] auto via rendered orchestrator media=${mediaId}`)
          return createProxyResponse(r, { defaultCacheSeconds: 60 })
        }
        // If remote artifact responded non-OK (e.g., 404), continue to generic remote resolution below
      }
    }

    // 2) Remote fallbacks
    // Prefer presigned remoteVideoKey (if DB has one), otherwise try orchestrator artifact by downloadJobId.
    // This also recovers stale DB states where downloadStatus isn't updated but artifact exists in R2.
    // 2.1) Try remoteVideoKey via orchestrator presign helper
    if (media.remoteVideoKey) {
      try {
        const url = await resolveRemoteVideoUrl({
          filePath: media.filePath ?? null,
          downloadJobId: null,
          remoteVideoKey: media.remoteVideoKey,
          title: media.title ?? null,
        })
        if (url) {
          const proxied = await tryProxyRemoteWithRange(url, request, {
            defaultCacheSeconds: 60,
            fallthroughStatusCodes: [404],
          })
          if (proxied) {
            logger.info('api', `[source] auto via remoteVideoKey media=${mediaId}`)
            return proxied
          }
          const jobIdFromKey = extractJobIdFromRemoteKey(media.remoteVideoKey)
          const artifactUrl = jobIdFromKey ? makeOrchestratorArtifactUrl(jobIdFromKey) : null
          if (artifactUrl) {
            const artifact = await tryProxyRemoteWithRange(artifactUrl, request, {
              defaultCacheSeconds: 60,
              fallthroughStatusCodes: [404],
            })
            if (artifact) {
              logger.info('api', `[source] auto via orchestrator keyJob=${jobIdFromKey} media=${mediaId}`)
              return artifact
            }
          }
        }
      } catch (e) {
        logger.warn('api', `[source] presign remoteVideoKey failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    // 2.2) Try orchestrator artifact by downloadJobId (regardless of local downloadStatus)
    if (media.downloadJobId) {
      const remoteUrl = makeOrchestratorArtifactUrl(media.downloadJobId)
      if (remoteUrl) {
        const proxied = await tryProxyRemoteWithRange(remoteUrl, request, {
          defaultCacheSeconds: 60,
          fallthroughStatusCodes: [404],
        })
        if (proxied) {
          logger.info('api', `[source] auto via orchestrator job=${media.downloadJobId} media=${mediaId}`)
          return proxied
        }
      }
    }

    logger.warn('api', `[source] source video not found media=${mediaId}`)
    return NextResponse.json({ error: 'Source video not found' }, { status: 404 })
  } catch (error) {
    logger.error('api', `Error serving source video: ${error instanceof Error ? error.message : String(error)}`)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
