import type { BasicVideoInfo, MediaSource } from './provider.types'
import type { MediaItem } from './media.types'

export interface DownloadRequest {
	url: string
	quality: '1080p' | '720p'
	proxyId?: string
}

export interface DownloadResult {
	id: string
	videoPath: string
	audioPath: string
	title: string
	source: MediaSource
}

export interface DownloadMetadata {
	title?: string
	author?: string
	thumbnail?: string
	viewCount?: number
	likeCount?: number
	duration?: number
}

export interface DownloadContext {
	operationDir: string
	videoPath: string
	audioPath: string
	proxyUrl?: string
}

export interface DownloadProgress {
	stage: 'checking' | 'downloading' | 'extracting_audio' | 'processing_metadata' | 'completed'
	progress: number
	message?: string
	error?: string
}

export interface DownloadService {
	// 核心下载方法
	download(request: DownloadRequest): Promise<DownloadResult>

	// 辅助方法
	checkExistingFiles(context: DownloadContext): Promise<{
		videoExists: boolean
		audioExists: boolean
		downloadRecord?: MediaItem
	}>

	fetchMetadata(url: string, context: DownloadContext): Promise<BasicVideoInfo | null>

	// 错误处理和重试
	handleError(error: Error, context: DownloadContext): Promise<void>

	// 清理方法
	cleanup(context: DownloadContext): Promise<void>
}