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

export type VideoDownloader = (url: string, quality: Quality, outputPath: string) => Promise<void | { rawMetadata?: unknown }>
export type AudioExtractor = (videoPath: string, audioPath: string) => Promise<void>
export interface ArtifactStore {
  uploadVideo?: (videoPath: string) => Promise<void>
  uploadAudio?: (audioPath: string) => Promise<void>
  uploadMetadata?: (metadata: unknown) => Promise<void>
}
export type CommentsDownloader = (input: CommentsPipelineRequest) => Promise<unknown[]>
export type ProgressReporter = (event: ProgressEvent) => void

export interface MetadataSummary {
  title?: string
  author?: string
  thumbnail?: string
  viewCount?: number
  likeCount?: number
}

export interface ProxyRecord {
  id?: string
  name?: string | null
  server?: string | null
  port?: number | string | null
  protocol?: string | null
  username?: string | null
  password?: string | null
  nodeUrl?: string | null
}

export interface EngineProxyOptions {
  proxy?: ProxyRecord | null
}

export interface MihomoStartOptions {
  logger?: { log?: (...args: any[]) => any; warn?: (...args: any[]) => any; error?: (...args: any[]) => any }
  mihomoBin?: string
  configDir?: string
  providerDir?: string
  port?: number
  socksPort?: number
  mode?: string
  subscriptionUrl?: string | null
  rawConfig?: string | null
}

export interface MihomoController {
  proxyUrl: string
  cleanup(): Promise<void> | void
}

export type BuildForwardProxyArgs = {
  protocol: 'http' | 'https' | 'socks4' | 'socks5'
  server: string
  port: number | string
  username?: string
  password?: string
}

