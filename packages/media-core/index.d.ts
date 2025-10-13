export type Quality = '1080p' | '720p'

export interface DownloadPipelineRequest {
  url: string
  quality: Quality
}

export interface DownloadPipelineEnv {
  ensureDir?: (dir: string) => Promise<void>
  resolvePaths: () => Promise<{ videoPath: string; audioPath?: string; metadataPath?: string }>
  downloader: (url: string, quality: Quality, outputPath: string) => Promise<void | { rawMetadata?: unknown }>
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

export declare function runDownloadPipeline(
  req: DownloadPipelineRequest,
  env: DownloadPipelineEnv,
  progress?: (e: ProgressEvent) => void
): Promise<{ videoPath: string; audioPath?: string; metadataPath?: string; rawMetadata?: unknown }>

declare const _default: {
  runDownloadPipeline: typeof runDownloadPipeline
  runCommentsPipeline: typeof runCommentsPipeline
  summariseMetadata: typeof summariseMetadata
  readMetadataSummary: typeof readMetadataSummary
  isForwardProxyProtocolSupported: typeof isForwardProxyProtocolSupported
  buildForwardProxyUrl: typeof buildForwardProxyUrl
  resolveForwardProxy: typeof resolveForwardProxy
}

export default _default

export interface CommentsPipelineRequest {
  url: string
  source: string
  pages?: number
  proxy?: string
}

export interface CommentsPipelineEnv {
  commentsDownloader: (input: CommentsPipelineRequest) => Promise<unknown[]>
  artifactStore?: {
    uploadMetadata?: (comments: unknown[]) => Promise<void>
  }
}

export declare function runCommentsPipeline(
  req: CommentsPipelineRequest,
  env: CommentsPipelineEnv,
  progress?: (e: ProgressEvent) => void
): Promise<{ count: number; comments: unknown[] }>

export type VideoDownloader = (url: string, quality: Quality, outputPath: string) => Promise<void | { rawMetadata?: unknown }>
export type AudioExtractor = (videoPath: string, audioPath: string) => Promise<void>
export interface ArtifactStore {
  uploadVideo?: (videoPath: string) => Promise<void>
  uploadAudio?: (audioPath: string) => Promise<void>
  uploadMetadata?: (metadata: unknown) => Promise<void>
}
export type CommentsDownloader = (input: CommentsPipelineRequest) => Promise<unknown[]>
export type ProgressReporter = (event: ProgressEvent) => void

// Metadata helpers
export interface MetadataSummary {
  title?: string
  author?: string
  thumbnail?: string
  viewCount?: number
  likeCount?: number
}
export declare function summariseMetadata(raw: Record<string, unknown> | null | undefined): MetadataSummary
export declare function readMetadataSummary(metadataPath: string): Promise<MetadataSummary | null>

// Proxy helpers
export declare function isForwardProxyProtocolSupported(protocol: string): boolean
export declare function buildForwardProxyUrl(args: { protocol: 'http' | 'https' | 'socks4' | 'socks5'; server: string; port: number | string; username?: string; password?: string }): string
export declare function resolveForwardProxy(args?: { proxy?: { protocol: string; server: string; port: number | string; username?: string; password?: string }; defaultProxyUrl?: string; logger?: { warn?: (...args: any[]) => any; info?: (...args: any[]) => any; log?: (...args: any[]) => any } }): string | undefined
