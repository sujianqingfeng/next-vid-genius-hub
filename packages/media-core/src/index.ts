import path from 'node:path'
import { summariseMetadata, readMetadataSummary } from './metadata'
import { isForwardProxyProtocolSupported, buildForwardProxyUrl, resolveForwardProxy } from './proxy'
import { createClashProxyFromDb, buildClashConfig, startMihomo } from './clash'
import type {
  CommentsPipelineEnv,
  CommentsPipelineRequest,
  DownloadPipelineEnv,
  DownloadPipelineRequest,
  ProgressEvent,
} from './types'

const safeReport = (progress: ((e: ProgressEvent) => void) | undefined, payload: ProgressEvent) => {
  if (typeof progress !== 'function') return
  try {
    progress(payload)
  } catch {
    // Swallow listener errors to keep pipelines resilient
  }
}

/**
 * Environment-agnostic download pipeline that orchestrates injected adapters.
 */
export async function runDownloadPipeline(
  req: DownloadPipelineRequest,
  env: DownloadPipelineEnv,
  progress?: (e: ProgressEvent) => void,
): Promise<{ videoPath: string; audioPath?: string; metadataPath?: string; rawMetadata?: unknown }> {
  if (!env || typeof env.resolvePaths !== 'function') {
    throw new Error('runDownloadPipeline requires env.resolvePaths()')
  }
  if (typeof env.downloader !== 'function') {
    throw new Error('runDownloadPipeline requires env.downloader(url, quality, outputPath)')
  }

  safeReport(progress, { stage: 'preparing', progress: 0.05 })
  const { videoPath, audioPath, metadataPath } = await env.resolvePaths()
  if (!videoPath) throw new Error('resolvePaths() must provide a videoPath')

  if (env.ensureDir) {
    await env.ensureDir(path.dirname(videoPath))
  }

  safeReport(progress, { stage: 'downloading', progress: 0.4 })
  const downloadResult = await env.downloader(req.url, req.quality, videoPath)
  const rawMetadata = (downloadResult as any)?.rawMetadata

  if (rawMetadata !== undefined && typeof env.persistRawMetadata === 'function') {
    try {
      await env.persistRawMetadata(rawMetadata)
    } catch {
      // Allow pipeline to continue if persistence fails
    }
  }

  if (typeof env.audioExtractor === 'function' && audioPath) {
    safeReport(progress, { stage: 'extracting_audio', progress: 0.7 })
    await env.audioExtractor(videoPath, audioPath)
  } else {
    // Emit the stage so progress remains monotonic even without audio extraction
    safeReport(progress, { stage: 'extracting_audio', progress: 0.7 })
  }

  if (env.artifactStore) {
    safeReport(progress, { stage: 'uploading', progress: 0.9 })
    const { artifactStore } = env
    if (artifactStore.uploadMetadata && rawMetadata !== undefined) {
      try {
        await artifactStore.uploadMetadata(rawMetadata)
      } catch {}
    }
    if (artifactStore.uploadVideo) {
      try {
        await artifactStore.uploadVideo(videoPath)
      } catch {}
    }
    if (artifactStore.uploadAudio && audioPath) {
      try {
        await artifactStore.uploadAudio(audioPath)
      } catch {}
    }
    safeReport(progress, { stage: 'uploading', progress: 0.95 })
  }

  safeReport(progress, { stage: 'completed', progress: 1 })
  return { videoPath, audioPath, metadataPath, rawMetadata }
}

/**
 * Minimal comments pipeline that relies on an injected comments adapter.
 */
export async function runCommentsPipeline(
  req: CommentsPipelineRequest,
  env: CommentsPipelineEnv = {} as CommentsPipelineEnv,
  progress?: (e: ProgressEvent) => void,
): Promise<{ count: number; comments: unknown[] }> {
  if (!env || typeof env.commentsDownloader !== 'function') {
    throw new Error('runCommentsPipeline requires env.commentsDownloader(req)')
  }

  safeReport(progress, { stage: 'preparing', progress: 0.05 })
  safeReport(progress, { stage: 'fetching_metadata', progress: 0.1 })

  const comments = await env.commentsDownloader({
    url: req.url,
    source: req.source,
    pages: req.pages,
    proxy: req.proxy,
  })

  safeReport(progress, { stage: 'downloading', progress: 0.6 })
  if (env.artifactStore?.uploadMetadata) {
    safeReport(progress, { stage: 'uploading', progress: 0.9 })
    try {
      await env.artifactStore.uploadMetadata(Array.isArray(comments) ? comments : [])
    } catch {}
    safeReport(progress, { stage: 'uploading', progress: 0.95 })
  }

  safeReport(progress, { stage: 'completed', progress: 1 })
  const normalizedComments = Array.isArray(comments) ? comments : []
  return { count: normalizedComments.length, comments: normalizedComments }
}

export default {
  runDownloadPipeline,
  runCommentsPipeline,
  summariseMetadata,
  readMetadataSummary,
  isForwardProxyProtocolSupported,
  buildForwardProxyUrl,
  resolveForwardProxy,
  createClashProxyFromDb,
  buildClashConfig,
  startMihomo,
}

export type { 
  DownloadPipelineRequest,
  DownloadPipelineEnv,
  CommentsPipelineRequest,
  CommentsPipelineEnv,
  ProgressEvent,
} from './types'

export {
  summariseMetadata,
  readMetadataSummary,
  isForwardProxyProtocolSupported,
  buildForwardProxyUrl,
  resolveForwardProxy,
  createClashProxyFromDb,
  buildClashConfig,
  startMihomo,
}
