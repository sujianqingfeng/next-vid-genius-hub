export interface BasicVideoInfo<T = unknown> {
	title?: string
	author?: string
	thumbnail?: string
	thumbnails?: Array<{ url?: string }>
	viewCount?: number
	likeCount?: number
	source?: 'youtube' | 'tiktok'
	raw?: T
}

export interface VideoInfo {
	title: string
	translatedTitle?: string
	viewCount: number
	author?: string
	thumbnail?: string
	series?: string
	seriesEpisode?: number
}

export interface Comment {
	id: string
	author: string
	authorThumbnail?: string
	content: string
	translatedContent?: string
	likes: number
	replyCount?: number
	source?: 'youtube' | 'tiktok' | 'twitter' | 'instagram' | 'weibo'
	platform?: string
}

// App-facing media entity (UI & ORPC friendly)
export interface MediaItem {
	id: string
	url: string
	source: 'youtube' | 'tiktok'
	title: string
	translatedTitle?: string | null
	author?: string | null
	thumbnail?: string | null
	duration?: number | null
	viewCount?: number | null
	likeCount?: number | null
	commentCount?: number | null
	filePath?: string | null
	audioFilePath?: string | null
	rawMetadataPath?: string | null
	transcription?: string | null
	optimizedTranscription?: string | null
	transcriptionWords?: Array<{
		word: string
		start: number
		end: number
	}> | null
	translation?: string | null
	videoWithSubtitlesPath?: string | null
	videoWithInfoPath?: string | null
	comments?: Comment[] | null
	commentsDownloadedAt?: Date | null
	downloadBackend?: 'local' | 'cloud'
	downloadJobId?: string | null
	downloadStatus?:
		| 'queued'
		| 'fetching_metadata'
		| 'preparing'
		| 'downloading'
		| 'extracting_audio'
		| 'uploading'
		| 'completed'
		| 'failed'
		| 'canceled'
		| null
	downloadError?: string | null
	remoteVideoKey?: string | null
	remoteAudioKey?: string | null
	remoteMetadataKey?: string | null
	downloadVideoBytes?: number | null
	downloadAudioBytes?: number | null
	downloadQueuedAt?: Date | null
	downloadCompletedAt?: Date | null
	rawMetadataDownloadedAt?: Date | null
	quality: '720p' | '1080p'
	createdAt: Date
}
