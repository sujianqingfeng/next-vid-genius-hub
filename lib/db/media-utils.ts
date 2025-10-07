import type { BasicVideoInfo } from '~/lib/media/types'
import type { MediaSource } from '~/lib/media/providers/types'

export interface MediaUpdateData {
	title: string
	author: string
	thumbnail: string
	viewCount: number
	likeCount: number
	filePath: string
	audioFilePath: string
	quality: '720p' | '1080p'
}

/**
 * Default values for media fields when metadata is unavailable
 */
const DEFAULT_MEDIA_VALUES: Partial<MediaUpdateData> = {
	title: 'video',
	author: '',
	thumbnail: '',
	viewCount: 0,
	likeCount: 0,
}

/**
 * Create media update data object by merging metadata, existing record, and defaults
 * @param metadata - Video metadata from provider
 * @param downloadRecord - Existing database record
 * @param videoPath - Path to video file
 * @param audioPath - Path to audio file
 * @param quality - Video quality
 * @returns Complete media update data object
 */
export function createMediaUpdateData({
	metadata,
	downloadRecord,
	videoPath,
	audioPath,
	quality,
}: {
	metadata?: BasicVideoInfo | null
	downloadRecord?: {
		title?: string | null
		author?: string | null
		thumbnail?: string | null
		viewCount?: number | null
		likeCount?: number | null
	} | null
	videoPath: string
	audioPath: string
	quality: '720p' | '1080p'
}): MediaUpdateData {
	return {
		title: metadata?.title ?? downloadRecord?.title ?? DEFAULT_MEDIA_VALUES.title!,
		author: metadata?.author ?? downloadRecord?.author ?? DEFAULT_MEDIA_VALUES.author!,
		thumbnail: metadata?.thumbnail ?? downloadRecord?.thumbnail ?? DEFAULT_MEDIA_VALUES.thumbnail!,
		viewCount: metadata?.viewCount ?? downloadRecord?.viewCount ?? DEFAULT_MEDIA_VALUES.viewCount!,
		likeCount: metadata?.likeCount ?? downloadRecord?.likeCount ?? DEFAULT_MEDIA_VALUES.likeCount!,
		filePath: videoPath,
		audioFilePath: audioPath,
		quality,
	}
}