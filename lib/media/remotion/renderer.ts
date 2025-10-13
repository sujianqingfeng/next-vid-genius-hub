import { mkdtemp, rm } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { bundle } from '@remotion/bundler'
import { getCompositions, renderMedia } from '@remotion/renderer'
import { execa } from 'execa'
import type { Comment, VideoInfo } from '../types'
import { PROXY_URL, CF_ORCHESTRATOR_URL } from '~/lib/constants'
import {
  layoutConstants,
  buildCommentTimeline,
  REMOTION_FPS,
  inlineRemoteImage as inlineRemoteImageFromPkg,
  buildComposeArgs,
} from '@app/media-comments'

async function getVideoResolution(videoPath: string): Promise<{ width: number; height: number }> {
  try {
    const { stdout } = await execa('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'csv=p=0',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      videoPath
    ])
    const [width, height] = stdout.split(',').map(Number)
    return { width, height }
  } catch (error) {
    console.warn('Failed to get video resolution, assuming 1920x1080:', error)
    return { width: 1920, height: 1080 }
  }
}

export type RenderProgressStage = 'bundle' | 'render' | 'compose' | 'complete' | 'failed'

export interface RenderProgressEvent {
	stage: RenderProgressStage
	progress?: number
	meta?: Record<string, unknown>
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
    if (!url) return undefined
    if (!/^https?:\/\//i.test(url)) return url
    if (inlineCache.has(url)) return inlineCache.get(url)
    const dataUrl = await inlineRemoteImageFromPkg(url, { proxyUrl: PROXY_URL ?? undefined })
    if (dataUrl) inlineCache.set(url, dataUrl)
    else console.warn('Failed to inline remote image for Remotion render:', url)
    return dataUrl
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
    buildCommentTimeline(preparedComments, REMOTION_FPS)

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
      fps: REMOTION_FPS,
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
        fps: REMOTION_FPS,
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

    const localSourcePath = await materializeSourceVideo(videoPath, tempDir)

    await composeWithSourceVideo({
      overlayPath,
      sourceVideoPath: localSourcePath,
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

async function materializeSourceVideo(sourcePath: string, tempDir: string): Promise<string> {
  if (!sourcePath || typeof sourcePath !== 'string') return sourcePath
  if (!sourcePath.startsWith('remote:orchestrator:')) return sourcePath

  const jobId = sourcePath.split(':').pop() || ''
  const base = (CF_ORCHESTRATOR_URL || '').replace(/\/$/, '')
  if (!base || !jobId) {
    throw new Error('Remote source requires CF_ORCHESTRATOR_URL and jobId')
  }

  const target = `${base}/artifacts/${encodeURIComponent(jobId)}`
  const outPath = path.join(tempDir, `${randomUUID()}-source.mp4`)
  const r = await fetch(target)
  if (!r.ok || !r.body) {
    throw new Error(`Failed to fetch remote source video: ${r.status || 'no_body'}`)
  }
  await pipeline(Readable.fromWeb(r.body as unknown as ReadableStream<Uint8Array>), createWriteStream(outPath))
  return outPath
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

  // Defensive check to ensure video properties exist
  if (!video || video.width === undefined || video.height === undefined || video.x === undefined || video.y === undefined) {
    throw new Error('Video layout constants are not properly defined. Missing width, height, x, or y properties.')
  }

  onProgress?.({ stage: 'compose', progress: 0 })

  // 获取原始视频分辨率用于调试
  const sourceResolution = await getVideoResolution(sourceVideoPath)

  // Remotion 输出固定为 1920x1080，这里直接使用布局常量对齐占位区域
  const remotionBaseWidth = 1920
  const remotionBaseHeight = 1080

  const actualX = Math.round(video.x)
  const actualY = Math.round(video.y)
  const actualWidth = Math.round(video.width)
  const actualHeight = Math.round(video.height)

  // 添加调试信息
  console.log('Video composition debug info:')
  console.log('- Source video resolution:', sourceResolution.width, 'x', sourceResolution.height)
  console.log('- Remotion base resolution:', remotionBaseWidth, 'x', remotionBaseHeight)
  console.log('- Original layout size:', video.width, 'x', video.height)
  console.log('- Original layout position:', video.x, ',', video.y)
  console.log('- Applied layout size:', actualWidth, 'x', actualHeight)
  console.log('- Applied layout position:', actualX, ',', actualY)
  console.log('- Cover duration:', coverDurationSeconds, 'seconds')
  console.log('- Total duration:', totalDurationSeconds, 'seconds')

  const ffmpegArgs = buildComposeArgs({
    overlayPath,
    sourceVideoPath,
    outputPath,
    fps: REMOTION_FPS,
    coverDurationSeconds,
    totalDurationSeconds,
    layout: { x: actualX, y: actualY, width: actualWidth, height: actualHeight },
  })

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
