import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import ffmpeg from 'fluent-ffmpeg'
import { bundle } from '@remotion/bundler'
import { RenderInternals, getCompositions, renderMedia } from '@remotion/renderer'
import type { Comment, VideoInfo } from '../types'
import type { TimelineDurations } from '../../../remotion/types'
import { layoutConstants } from '../../../remotion/CommentsVideo'

const FPS = 30
const COVER_DURATION_SECONDS = 3
const MAX_COMMENT_DURATION_SECONDS = 8
const MIN_COMMENT_DURATION_SECONDS = 3

export type RenderProgressStage = 'bundle' | 'render' | 'compose' | 'complete' | 'failed'

export interface RenderProgressEvent {
	stage: RenderProgressStage
	progress?: number
	meta?: Record<string, unknown>
}

type DownloadMap = ReturnType<typeof RenderInternals.makeDownloadMap>

function estimateCommentDurationSeconds(comment: Comment): number {
  const baseSeconds = 2.8
  const englishLength = comment.content?.length ?? 0
  const translatedLength = comment.translatedContent?.length ?? 0
  const weightedChars = englishLength + translatedLength * 1.2
  const additionalSeconds = weightedChars / 90
  const estimated = baseSeconds + additionalSeconds
  return Math.min(
    MAX_COMMENT_DURATION_SECONDS,
    Math.max(MIN_COMMENT_DURATION_SECONDS, estimated),
  )
}

function buildTimeline(comments: Comment[]): TimelineDurations {
  const coverDurationInFrames = Math.round(COVER_DURATION_SECONDS * FPS)
  const commentDurationsInFrames = comments.map((comment) => {
    const seconds = estimateCommentDurationSeconds(comment)
    return Math.round(seconds * FPS)
  })
  const totalDurationInFrames =
    coverDurationInFrames + commentDurationsInFrames.reduce((sum, frames) => sum + frames, 0)
  const totalDurationSeconds = totalDurationInFrames / FPS
  return {
    coverDurationInFrames,
    commentDurationsInFrames,
    totalDurationInFrames,
    totalDurationSeconds,
    coverDurationSeconds: COVER_DURATION_SECONDS,
  }
}

export interface RenderWithRemotionOptions {
  videoPath: string
  outputPath: string
  videoInfo: VideoInfo
  comments: Comment[]
  onProgress?: (event: RenderProgressEvent) => void
}

export async function renderVideoWithRemotion({
  videoPath,
  outputPath,
  videoInfo,
  comments,
  onProgress,
}: RenderWithRemotionOptions): Promise<void> {
  if (comments.length === 0) {
    throw new Error('No comments supplied for rendering')
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), 'remotion-render-'))
  const bundleOutDir = path.join(tempDir, 'bundle')
  const overlayPath = path.join(tempDir, `${randomUUID()}-overlay.mp4`)
  const entryPoint = path.join(process.cwd(), 'remotion', 'index.ts')
  const publicDir = path.join(process.cwd(), 'public')

  const { coverDurationInFrames, commentDurationsInFrames, totalDurationInFrames, totalDurationSeconds, coverDurationSeconds } =
    buildTimeline(comments)

  const downloadMap = RenderInternals.makeDownloadMap()

  try {
    onProgress?.({ stage: 'bundle', progress: 0 })
    const serveUrl = await bundle({
      entryPoint,
      outDir: bundleOutDir,
      publicDir,
      cacheEnabled: true,
      minify: false,
      enableCaching: true,
    })
    onProgress?.({ stage: 'bundle', progress: 1 })

    const inputProps = {
      videoInfo,
      comments,
      coverDurationInFrames,
      commentDurationsInFrames,
      fps: FPS,
    }

    const compositions = await getCompositions(serveUrl, {
      inputProps,
      downloadMap,
    })

    const composition = compositions.find((c) => c.id === 'CommentsVideo')

    if (!composition) {
      throw new Error('Remotion composition "CommentsVideo" not found')
    }

    await renderMedia({
      composition: {
        ...composition,
        durationInFrames: totalDurationInFrames,
        fps: FPS,
      },
      serveUrl,
      codec: 'h264',
      audioCodec: 'aac',
      outputLocation: overlayPath,
      inputProps,
      downloadMap,
      chromiumOptions: {
        ignoreCertificateErrors: true,
        gl: 'angle',
      },
      envVariables: {
        REMOTION_DISABLE_CHROMIUM_PROVIDED_HEADLESS_WARNING: 'true',
      },
      onProgress: ({ progress, framesEncoded, totalFrames }) => {
        onProgress?.({
          stage: 'render',
          progress,
          meta: {
            framesEncoded,
            totalFrames,
          },
        })
      },
    })
    onProgress?.({ stage: 'render', progress: 1 })

    await composeWithSourceVideo({
      overlayPath,
      sourceVideoPath: videoPath,
      outputPath,
      coverDurationSeconds,
      totalDurationSeconds,
      onProgress,
    })

    onProgress?.({ stage: 'complete', progress: 1 })
  } catch (error) {
    onProgress?.({
      stage: 'failed',
      meta: {
        message: (error as Error).message,
      },
    })
    throw error
  } finally {
    cleanupDownloadMap(downloadMap)
    await rm(tempDir, { recursive: true, force: true })
  }
}

async function composeWithSourceVideo({
  overlayPath,
  sourceVideoPath,
  outputPath,
  coverDurationSeconds,
  totalDurationSeconds,
  onProgress,
}: {
  overlayPath: string
  sourceVideoPath: string
  outputPath: string
  coverDurationSeconds: number
  totalDurationSeconds: number
  onProgress?: (event: RenderProgressEvent) => void
}): Promise<void> {
  const video = layoutConstants.video
  onProgress?.({ stage: 'compose', progress: 0 })
  const overlay = ffmpeg()
    .input(overlayPath)
    .input(sourceVideoPath)
    .complexFilter([
      `[1:v]fps=${FPS},setpts=PTS-STARTPTS,scale=${video.width}:${video.height}:flags=lanczos,setsar=1[scaled_video]`,
      `[0:v][scaled_video]overlay=${video.x}:${video.y}:enable='between(t,${coverDurationSeconds},${totalDurationSeconds})'[composited]`,
      `[1:a]adelay=${Math.round(coverDurationSeconds * 1000)}|${Math.round(
        coverDurationSeconds * 1000,
      )},apad[delayed_audio]`,
    ])
    .outputOptions([
      '-map',
      '[composited]',
      '-map',
      '[delayed_audio]?',
      '-vsync',
      'cfr',
      '-r',
      String(FPS),
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-shortest',
    ])
    .output(outputPath)

  overlay.on('progress', (info) => {
    const ratio = info.percent ? Math.min(Math.max(info.percent / 100, 0), 1) : undefined
    onProgress?.({
      stage: 'compose',
      progress: ratio,
      meta: {
        timemark: info.timemark,
      },
    })
  })

  await new Promise<void>((resolve, reject) => {
    overlay
      .on('end', () => resolve())
      .on('error', (error) => reject(error))
      .run()
  })

  onProgress?.({ stage: 'compose', progress: 1 })
}

function cleanupDownloadMap(downloadMap: DownloadMap): void {
  if (downloadMap.isPreventedFromCleanup()) {
    return
  }

  RenderInternals.deleteDirectory(downloadMap.downloadDir)
  RenderInternals.deleteDirectory(downloadMap.complexFilter)
  RenderInternals.deleteDirectory(downloadMap.compositingDir)
  downloadMap.inlineAudioMixing.cleanup()
  RenderInternals.deleteDirectory(downloadMap.assetDir)
}
