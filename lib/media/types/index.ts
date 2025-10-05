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
