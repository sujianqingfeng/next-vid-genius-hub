import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb, schema } from '~/lib/db'
import { JOB_CALLBACK_HMAC_SECRET } from '~/lib/config/app.config'
import { verifyHmacSHA256 } from '@app/job-callbacks'
import { logger } from '~/lib/logger'
import { presignGetByKey, upsertMediaManifest } from '~/lib/cloudflare'
import { chargeDownloadUsage, InsufficientPointsError } from '~/lib/points/billing'

type CallbackPayload = {
  jobId: string
  mediaId: string
  status: 'completed' | 'failed' | 'canceled'
  engine?: 'burner-ffmpeg' | 'renderer-remotion' | 'media-downloader'
  outputUrl?: string
  outputKey?: string
  durationMs?: number
  attempts?: number
  error?: string
  outputs?: {
    video?: { url?: string; key?: string }
    audio?: { url?: string; key?: string }
    metadata?: { url?: string; key?: string }
  }
  metadata?: {
    title?: string
    author?: string
    thumbnail?: string
    viewCount?: number
    likeCount?: number
    source?: 'youtube' | 'tiktok'
    quality?: '720p' | '1080p'
    commentCount?: number  // For comments-only tasks
  }
}

type MediaRecord = typeof schema.media.$inferSelect

// Container/Worker → Next: final callback to persist status and output
// Expected body expands per engine type (renderers keep remote references, downloader hydrates local files)

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get('x-signature') || ''
    const bodyText = await req.text()

    const secret = JOB_CALLBACK_HMAC_SECRET || 'replace-with-strong-secret'
    if (!verifyHmacSHA256(secret, bodyText, signature)) {
      logger.error('api', '[cf-callback] invalid signature')
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }

    const payload = JSON.parse(bodyText) as CallbackPayload

    const db = await getDb()
    try {
      const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.jobId, payload.jobId) })
      if (task) {
        await db
          .update(schema.tasks)
          .set({
            status: payload.status,
            progress: payload.status === 'completed' ? 100 : task.progress,
            error: payload.error ?? null,
            finishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.tasks.id, task.id))
      }
    } catch (err) {
      logger.warn('api', `[cf-callback] task sync skipped: ${err instanceof Error ? err.message : String(err)}`)
    }
    const media = await db.query.media.findFirst({ where: eq(schema.media.id, payload.mediaId) })
    if (!media) {
	  // Gracefully ignore callbacks that aren't tied to a media row (e.g. channel-list or comments-only tasks)
	  const outputs = payload.outputs
	  const hasMetadataOnly = Boolean(outputs?.metadata) && !outputs?.video
      if (payload.engine === 'media-downloader' && hasMetadataOnly) {
        logger.info('api', `[cf-callback] non-media job callback ignored mediaId=${payload.mediaId}`)
        return NextResponse.json({ ok: true, ignored: true })
      }
      logger.error('api', `[cf-callback] media not found: ${payload.mediaId}`)
      return NextResponse.json({ error: 'media not found' }, { status: 404 })
    }

    if (payload.engine === 'media-downloader') {
      await handleCloudDownloadCallback(media, payload as CallbackPayload & { engine: 'media-downloader' })
      return NextResponse.json({ ok: true })
    }

    if (payload.status === 'completed') {
      // 根据引擎类型更新不同产物字段
      if (payload.engine === 'renderer-remotion') {
        await db
          .update(schema.media)
          .set({ videoWithInfoPath: `remote:orchestrator:${payload.jobId}` })
          .where(eq(schema.media.id, media.id))
        // Update manifest to record rendered info artifact
        try {
          await upsertMediaManifest(payload.mediaId, { renderedInfoJobId: payload.jobId })
        } catch (err) {
          logger.warn('api', `[cf-callback] manifest (info) update skipped: ${err instanceof Error ? err.message : String(err)}`)
        }
      } else {
        await db
          .update(schema.media)
          .set({ videoWithSubtitlesPath: `remote:orchestrator:${payload.jobId}` })
          .where(eq(schema.media.id, media.id))
        // Update manifest to record rendered subtitles artifact
        try {
          await upsertMediaManifest(payload.mediaId, { renderedSubtitlesJobId: payload.jobId })
        } catch (err) {
          logger.warn('api', `[cf-callback] manifest (subtitles) update skipped: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    } else if (payload.status === 'failed' || payload.status === 'canceled') {
      // 非 downloader 引擎的失败/取消也落库，便于在媒体详情中留痕
      const errorMessage = payload.error || (payload.status === 'failed' ? 'Cloud render failed' : 'Cloud render canceled')
      const updates: Record<string, unknown> = {
        downloadError: `[${payload.engine}] ${errorMessage}`,
      }
      // 不覆盖已有产物路径；仅在需要时可清理
      await db
        .update(schema.media)
        .set(updates)
        .where(eq(schema.media.id, media.id))
      
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    logger.error('api', `[cf-callback] error: ${e instanceof Error ? e.message : String(e)}`)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}

async function handleCloudDownloadCallback(
  media: MediaRecord,
  payload: CallbackPayload & { engine: 'media-downloader' },
) {
  // Ensure a DB handle is available for all branches
  const db = await getDb()
  const where = eq(schema.media.id, payload.mediaId)

	async function remoteObjectExists({
		key,
		directUrl,
	}: {
		key?: string | null
		directUrl?: string | null
	}): Promise<boolean> {
		const checkUrl = async (url: string, { label, logOnFailure }: { label: string; logOnFailure: boolean }) => {
			const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
			const timeout = setTimeout(() => controller?.abort(), 5000)
			try {
				const res = await fetch(url, {
					method: 'GET',
					headers: { range: 'bytes=0-0' },
					signal: controller?.signal,
				})
				if (res.ok || res.status === 206) return true
				if (res.status === 404) return false
				if (logOnFailure) {
					logger.warn('api', `[cf-callback] remoteObjectExists unexpected status ${res.status} for ${label}`)
				}
				return false
			} catch (error) {
				if (logOnFailure) {
					logger.warn(
						'api',
						`[cf-callback] remoteObjectExists failed for ${label}: ${
							error instanceof Error ? error.message : String(error)
						}`,
					)
				}
				return false
			} finally {
				clearTimeout(timeout)
			}
		}

		if (directUrl) {
			const directLabel = `url=${directUrl.split('?')[0]}`
			if (await checkUrl(directUrl, { label: directLabel, logOnFailure: false })) {
				return true
			}
		}

		if (!key) return false

		try {
			const url = await presignGetByKey(key)
			return await checkUrl(url, { label: `key=${key}`, logOnFailure: true })
		} catch (error) {
			logger.warn(
				'api',
				`[cf-callback] remoteObjectExists failed for key=${key}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			)
			return false
		}
	}

	// Detect comments-only task based on outputs: metadata only, no video/audio keys.
	const rawVideoKey = payload.outputs?.video?.key ?? null
	const fallbackVideoKey = (payload as Partial<CallbackPayload>)?.outputKey ?? null
	const resolvedVideoKey = rawVideoKey ?? fallbackVideoKey ?? null
	const audioKey = payload.outputs?.audio?.key ?? null
	const metadataKey = payload.outputs?.metadata?.key ?? null
	const videoUrl = payload.outputs?.video?.url ?? null
	const audioUrl = payload.outputs?.audio?.url ?? null
	const metadataUrl = payload.outputs?.metadata?.url ?? null

	const hasMetadataOutput = Boolean(metadataUrl || metadataKey)
	const hasVideoKey = Boolean(resolvedVideoKey)
	const hasAudioKey = Boolean(audioKey)
	const isCommentsOnly = hasMetadataOutput && !hasVideoKey && !hasAudioKey

	const videoExists = await remoteObjectExists({ key: resolvedVideoKey, directUrl: videoUrl })
	const audioExists = await remoteObjectExists({ key: audioKey, directUrl: audioUrl })
	const metadataExistsWithSource = await remoteObjectExists({ key: metadataKey, directUrl: metadataUrl })

  

  if (payload.status !== 'completed') {
    await db
      .update(schema.media)
      .set({
        downloadBackend: 'cloud',
        downloadStatus: payload.status,
        downloadError: payload.error ?? 'Cloud download failed',
        downloadJobId: payload.jobId,
      })
      .where(where)
    return
  }

  // For comments-only tasks, skip video download logic
  if (isCommentsOnly) {
    
    return
  }

  

  // Accept either a presigned URL (preferred) or just the key when persisting remote-only downloads.
  // Some orchestrator/container versions may omit outputs.video in progress payloads
  // but still provide the final outputKey.
  if (!videoUrl && !resolvedVideoKey) {
    await db
      .update(schema.media)
      .set({
        downloadBackend: 'cloud',
        downloadStatus: 'failed',
        downloadError: 'Missing video output from cloud download',
        downloadJobId: payload.jobId,
      })
      .where(where)
    return
  }

  const audioExistsWithSource = audioExists

  const updates: Record<string, unknown> = {
    downloadBackend: 'cloud',
    downloadStatus: 'completed',
    downloadError: null,
    downloadJobId: payload.jobId,
    downloadCompletedAt: new Date(),
    // Prefer outputs.video.key; fall back to outputKey for backward compatibility
    remoteVideoKey: videoExists ? (resolvedVideoKey ?? media.remoteVideoKey ?? null) : media.remoteVideoKey ?? null,
    remoteAudioKey: audioExistsWithSource ? (audioKey ?? media.remoteAudioKey ?? null) : media.remoteAudioKey ?? null,
    remoteMetadataKey: metadataExistsWithSource ? (metadataKey ?? media.remoteMetadataKey ?? null) : media.remoteMetadataKey ?? null,
  }

  const metadataFromPayload = payload.metadata
  const title = metadataFromPayload?.title
  const author = metadataFromPayload?.author
  const thumbnail = metadataFromPayload?.thumbnail
  const viewCount = metadataFromPayload?.viewCount
  const likeCount = metadataFromPayload?.likeCount

  if (title) updates.title = title
  if (author) updates.author = author
  if (thumbnail) updates.thumbnail = thumbnail
  if (viewCount !== undefined) updates.viewCount = viewCount
  if (likeCount !== undefined) updates.likeCount = likeCount
  if (metadataFromPayload?.quality) updates.quality = metadataFromPayload.quality
  if (metadataFromPayload?.source) updates.source = metadataFromPayload.source

  await db.update(schema.media).set(updates).where(where)

  // Update manifest with remote object keys (best-effort)
  const manifestPatch: Parameters<typeof upsertMediaManifest>[1] = {}
  const manifestVideoKey = rawVideoKey ?? resolvedVideoKey ?? null
  if (videoExists && manifestVideoKey) {
    manifestPatch.remoteVideoKey = manifestVideoKey
  }
  if (audioExistsWithSource && audioKey) {
    manifestPatch.remoteAudioKey = audioKey
  }
  if (metadataExistsWithSource && metadataKey) {
    manifestPatch.remoteMetadataKey = metadataKey
  }
  if (Object.keys(manifestPatch).length > 0) {
    try {
      await upsertMediaManifest(payload.mediaId, manifestPatch)
    } catch (err) {
      logger.warn('api', `[cf-callback] manifest update skipped: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const durationSeconds =
    typeof payload.durationMs === 'number'
      ? payload.durationMs / 1000
      : typeof metadataFromPayload?.durationSeconds === 'number'
        ? metadataFromPayload.durationSeconds
        : typeof metadataFromPayload?.duration === 'number'
          ? metadataFromPayload.duration
          : typeof (metadataFromPayload as any)?.lengthSeconds === 'number'
            ? (metadataFromPayload as any).lengthSeconds
            : 0

  const roundedDuration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? Math.round(durationSeconds) : null
  if (roundedDuration) {
    updates.duration = roundedDuration
  }

  if (media.userId && durationSeconds > 0) {
    try {
      await chargeDownloadUsage({
        userId: media.userId,
        durationSeconds,
        refType: 'download',
        refId: media.id,
        remark: `download dur=${durationSeconds.toFixed(1)}s`,
      })
    } catch (error) {
      if (error instanceof InsufficientPointsError) {
        logger.warn('api', `[cf-callback] download charge skipped (insufficient points) media=${media.id}`)
      } else {
        logger.warn(
          'api',
          `[cf-callback] download charge failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }
}
