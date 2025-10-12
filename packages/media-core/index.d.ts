export type Quality = '1080p' | '720p'

export interface DownloadPipelineRequest {
  url: string
  quality: Quality
}

export interface DownloadPipelineEnv {
  ensureDir?: (dir: string) => Promise<void>
  resolvePaths: () => Promise<{ videoPath: string; audioPath: string; metadataPath?: string }>
  downloader?: (url: string, quality: Quality, outputPath: string) => Promise<void | { rawMetadata?: unknown }>
  audioExtractor?: (videoPath: string, audioPath: string) => Promise<void>
  persistRawMetadata?: (data: unknown) => Promise<void>
  artifactStore?: {
    uploadVideo?: (videoPath: string) => Promise<void>
    uploadAudio?: (audioPath: string) => Promise<void>
    uploadMetadata?: (metadata: unknown) => Promise<void>
  }
}

export interface ProgressEvent {
  stage: string
  progress: number
  message?: string
}

export declare function downloadVideo(
  url: string,
  quality: Quality,
  outputPath: string,
  options?: { proxy?: string; captureJson?: boolean }
): Promise<{ rawMetadata?: unknown }>

export declare function extractAudio(videoPath: string, audioPath: string): Promise<void>

export declare function runDownloadPipeline(
  req: DownloadPipelineRequest,
  env: DownloadPipelineEnv,
  progress?: (e: ProgressEvent) => void
): Promise<{ videoPath: string; audioPath: string; metadataPath?: string; rawMetadata?: unknown }>

declare const _default: {
  downloadVideo: typeof downloadVideo
  extractAudio: typeof extractAudio
  runDownloadPipeline: typeof runDownloadPipeline
}

export default _default

export interface BasicComment {
  id: string
  author: string
  authorThumbnail?: string
  content: string
  likes: number
  replyCount: number
  translatedContent: string
}

export declare function downloadYoutubeComments(input: { url: string; pages?: number; proxy?: string }): Promise<BasicComment[]>
export declare function downloadTikTokCommentsByUrl(input: { url: string; pages?: number; proxy?: string }): Promise<BasicComment[]>
export declare function extractVideoId(url: string): string | null

export interface CommentsPipelineRequest {
  url: string
  source: 'youtube' | 'tiktok'
  pages?: number
  proxy?: string
}

export interface CommentsPipelineEnv {
  artifactStore?: {
    uploadMetadata?: (comments: BasicComment[]) => Promise<void>
  }
}

export declare function runCommentsPipeline(
  req: CommentsPipelineRequest,
  env?: CommentsPipelineEnv,
  progress?: (e: ProgressEvent) => void
): Promise<{ count: number; comments?: BasicComment[] }>

// Optional explicit port types
export interface VideoDownloader {
  download: (url: string, quality: Quality, outputPath: string) => Promise<void | { rawMetadata?: unknown }>
}
export interface AudioExtractor {
  extract: (videoPath: string, audioPath: string) => Promise<void>
}
export interface ArtifactStore {
  uploadVideo?: (videoPath: string) => Promise<void>
  uploadAudio?: (audioPath: string) => Promise<void>
  uploadMetadata?: (metadata: unknown) => Promise<void>
}
export interface ProgressReporter {
  emit: (e: ProgressEvent) => void
}
