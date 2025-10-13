import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '~/lib/db'
import { JOB_CALLBACK_HMAC_SECRET } from '~/lib/constants'
import { OPERATIONS_DIR } from '~/lib/config/app.config'
import { verifyHmacSHA256 } from '~/lib/security/hmac'
import { promises as fs, createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { readMetadataSummary } from '@app/media-core'

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
      console.error('[cf-callback] invalid signature')
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }

    const payload = JSON.parse(bodyText) as CallbackPayload

    const media = await db.query.media.findFirst({ where: eq(schema.media.id, payload.mediaId) })
    if (!media) {
      console.error('[cf-callback] media not found', payload.mediaId)
      return NextResponse.json({ error: 'media not found' }, { status: 404 })
    }

    if (payload.engine === 'media-downloader') {
      await handleCloudDownloadCallback(media, payload)
      return NextResponse.json({ ok: true })
    }

    if (payload.status === 'completed') {
      // 根据引擎类型更新不同产物字段
      if (payload.engine === 'renderer-remotion') {
        await db
          .update(schema.media)
          .set({ videoWithInfoPath: `remote:orchestrator:${payload.jobId}` })
          .where(eq(schema.media.id, media.id))
        console.log('[cf-callback] recorded remote info artifact for job', payload.jobId)
      } else {
        await db
          .update(schema.media)
          .set({ videoWithSubtitlesPath: `remote:orchestrator:${payload.jobId}` })
          .where(eq(schema.media.id, media.id))
        console.log('[cf-callback] recorded remote subtitles artifact for job', payload.jobId)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[cf-callback] error', e)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}

async function handleCloudDownloadCallback(
  media: MediaRecord,
  payload: CallbackPayload & { engine: 'media-downloader' },
) {
  const where = eq(schema.media.id, payload.mediaId)

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

  const videoUrl = payload.outputs?.video?.url
  if (!videoUrl) {
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

  const operationDir = path.join(OPERATIONS_DIR, payload.mediaId)
  await fs.mkdir(operationDir, { recursive: true })

  const videoPath = path.join(operationDir, `${payload.mediaId}.mp4`)
  const audioUrl = payload.outputs?.audio?.url
  const audioPath = audioUrl ? path.join(operationDir, `${payload.mediaId}.mp3`) : null
  const metadataUrl = payload.outputs?.metadata?.url
  const metadataKey = payload.outputs?.metadata?.key ?? null
  const metadataPath = path.join(operationDir, 'metadata.json')
  let metadataDownloaded = false

  try {
    await downloadArtifact(videoUrl, videoPath)
    if (audioUrl && audioPath) {
      await downloadArtifact(audioUrl, audioPath)
    }
    if (metadataUrl) {
      await downloadArtifact(metadataUrl, metadataPath)
      metadataDownloaded = true
    }
  } catch (error) {
    console.error('[cf-callback] failed to persist cloud download', error)
    await db
      .update(schema.media)
      .set({
        downloadBackend: 'cloud',
        downloadStatus: 'failed',
        downloadError: error instanceof Error ? error.message : 'Failed to persist cloud artifacts',
        downloadJobId: payload.jobId,
      })
      .where(where)
    return
  }

  const updates: Record<string, unknown> = {
    downloadBackend: 'cloud',
    downloadStatus: 'completed',
    downloadError: null,
    downloadJobId: payload.jobId,
    downloadCompletedAt: new Date(),
    remoteVideoKey: payload.outputs?.video?.key ?? null,
    remoteAudioKey: payload.outputs?.audio?.key ?? null,
    remoteMetadataKey: metadataKey ?? media.remoteMetadataKey ?? null,
    filePath: videoPath,
    audioFilePath: audioPath ?? null,
    rawMetadataPath: metadataDownloaded ? metadataPath : media.rawMetadataPath ?? null,
    rawMetadataDownloadedAt: metadataDownloaded
      ? new Date()
      : media.rawMetadataDownloadedAt ?? null,
  }

  const metadataFromPayload = payload.metadata
  const metadataFromFile = metadataDownloaded ? await readMetadataSummary(metadataPath) : null

  const title = metadataFromPayload?.title ?? metadataFromFile?.title
  const author = metadataFromPayload?.author ?? metadataFromFile?.author
  const thumbnail = metadataFromPayload?.thumbnail ?? metadataFromFile?.thumbnail
  const viewCount =
    metadataFromPayload?.viewCount ??
    (metadataFromFile?.viewCount ?? undefined)
  const likeCount =
    metadataFromPayload?.likeCount ??
    (metadataFromFile?.likeCount ?? undefined)

  if (title) updates.title = title
  if (author) updates.author = author
  if (thumbnail) updates.thumbnail = thumbnail
  if (viewCount !== undefined) updates.viewCount = viewCount
  if (likeCount !== undefined) updates.likeCount = likeCount
  if (metadataFromPayload?.quality) updates.quality = metadataFromPayload.quality
  if (metadataFromPayload?.source) updates.source = metadataFromPayload.source

  await db.update(schema.media).set(updates).where(where)
}

async function downloadArtifact(url: string, filePath: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download artifact: ${response.status} ${response.statusText}`)
  }
  const body = response.body
  if (!body) {
    throw new Error('Failed to download artifact: response body is empty')
  }

  const fileStream = createWriteStream(filePath)
  try {
    // Stream directly to disk to avoid buffering large artifacts in memory
    await pipeline(Readable.fromWeb(body as ReadableStream<Uint8Array>), fileStream)
  } catch (error) {
    fileStream.destroy()
    await fs.rm(filePath, { force: true }).catch(() => {})
    if (error instanceof Error) throw error
    throw new Error('Failed to stream artifact to disk')
  }
}

// summariseMetadata is provided by @app/media-core and used internally by readMetadataSummary
