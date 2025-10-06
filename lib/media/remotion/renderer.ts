import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { bundle } from '@remotion/bundler'
import { getCompositions, renderMedia } from '@remotion/renderer'
import { ProxyAgent, fetch as undiciFetch } from 'undici'
import { execa } from 'execa'
import type { Comment, VideoInfo } from '../types'
import type { TimelineDurations } from '../../../remotion/types'
import { layoutConstants } from '../../../remotion/CommentsVideo'
import { PROXY_URL } from '~/lib/constants'

const FPS = 30
const COVER_DURATION_SECONDS = 3
const MAX_COMMENT_DURATION_SECONDS = 8
const MIN_COMMENT_DURATION_SECONDS = 3

const proxyAgent = PROXY_URL ? new ProxyAgent(PROXY_URL) : undefined

function inferContentTypeFromUrl(url: string): string | undefined {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase()
    switch (ext) {
      case '.png':
        return 'image/png'
      case '.webp':
        return 'image/webp'
      case '.gif':
        return 'image/gif'
      case '.bmp':
        return 'image/bmp'
      case '.svg':
        return 'image/svg+xml'
      case '.jpeg':
      case '.jpg':
        return 'image/jpeg'
      default:
        return undefined
    }
  } catch {
    return undefined
  }
}

export type RenderProgressStage = 'bundle' | 'render' | 'compose' | 'complete' | 'failed'

export interface RenderProgressEvent {
	stage: RenderProgressStage
	progress?: number
	meta?: Record<string, unknown>
}

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
  const inlineCache = new Map<string, string>()

  const inlineRemoteImage = async (url?: string | null): Promise<string | undefined> => {
    if (!url) {
      return undefined
    }

    const isRemote = /^https?:\/\//i.test(url)
    if (!isRemote) {
      return url
    }

    if (inlineCache.has(url)) {
      return inlineCache.get(url)
    }

    try {
      const response = await undiciFetch(url, {
        signal: AbortSignal.timeout(15_000),
        dispatcher: proxyAgent,
      })
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const contentType =
        response.headers.get('content-type') || inferContentTypeFromUrl(url) || 'image/jpeg'
      const dataUrl = `data:${contentType};base64,${buffer.toString('base64')}`
      inlineCache.set(url, dataUrl)
      return dataUrl
    } catch (error) {
      console.warn('Failed to inline remote image for Remotion render:', url, error)
      return undefined
    }
  }

  const preparedVideoInfo: VideoInfo = {
    ...videoInfo,
    thumbnail: await inlineRemoteImage(videoInfo.thumbnail),
  }

  const preparedComments: Comment[] = await Promise.all(
    comments.map(async (comment) => ({
      ...comment,
      authorThumbnail: await inlineRemoteImage(comment.authorThumbnail),
    })),
  )

  const { coverDurationInFrames, commentDurationsInFrames, totalDurationInFrames, totalDurationSeconds, coverDurationSeconds } =
    buildTimeline(preparedComments)

  try {
    onProgress?.({ stage: 'bundle', progress: 0 })
    const serveUrl = await bundle({
      entryPoint,
      outDir: bundleOutDir,
      publicDir,
      enableCaching: true,
    })
    onProgress?.({ stage: 'bundle', progress: 1 })

    const inputProps = {
      videoInfo: preparedVideoInfo,
      comments: preparedComments,
      coverDurationInFrames,
      commentDurationsInFrames,
      fps: FPS,
    }

    const compositions = await getCompositions(serveUrl, {
      inputProps,
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
      chromiumOptions: {
        ignoreCertificateErrors: true,
        gl: 'angle',
      },
      envVariables: {
        REMOTION_DISABLE_CHROMIUM_PROVIDED_HEADLESS_WARNING: 'true',
      },
      onProgress: ({ progress, renderedFrames, encodedFrames }) => {
        onProgress?.({
          stage: 'render',
          progress,
          meta: {
            renderedFrames,
            encodedFrames,
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

  const delayMs = Math.round(coverDurationSeconds * 1000)
  const filterGraph = [
    `[1:v]fps=${FPS},setpts=PTS-STARTPTS,scale=${video.width}:${video.height}:flags=lanczos,setsar=1[scaled_video]`,
    `[0:v][scaled_video]overlay=${video.x}:${video.y}:enable='between(t,${coverDurationSeconds},${totalDurationSeconds})'[composited]`,
    `[1:a]adelay=${delayMs}|${delayMs},apad[delayed_audio]`,
  ].join(';')

  const ffmpegArgs = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-progress',
    'pipe:2',
    '-i',
    overlayPath,
    '-i',
    sourceVideoPath,
    '-filter_complex',
    filterGraph,
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
    outputPath,
  ]

  const totalMicroseconds = totalDurationSeconds * 1_000_000
  const child = execa('ffmpeg', ffmpegArgs, {
    stdout: 'ignore',
    stderr: 'pipe',
  })

  if (child.stderr) {
    let buffer = ''
    child.stderr.on('data', (chunk) => {
      buffer += chunk.toString()
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (line.startsWith('out_time_us=')) {
          const microseconds = Number(line.split('=')[1])
          if (!Number.isNaN(microseconds) && totalMicroseconds > 0) {
            const ratio = Math.min(
              Math.max(microseconds / totalMicroseconds, 0),
              1,
            )
            onProgress?.({
              stage: 'compose',
              progress: ratio,
              meta: {
                outTimeUs: microseconds,
              },
            })
          }
        }
        if (line.startsWith('out_time=')) {
          onProgress?.({
            stage: 'compose',
            meta: {
              timemark: line.split('=')[1],
            },
          })
        }
        newlineIndex = buffer.indexOf('\n')
      }
    })
  }

  try {
    await child
    onProgress?.({ stage: 'compose', progress: 1 })
  } catch (error) {
    throw error
  }
}
