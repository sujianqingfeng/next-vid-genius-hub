export type MediaSource = 'youtube' | 'tiktok' | 'unknown'

export interface BasicVideoInfo<T = any> {
	title?: string
	author?: string
	thumbnail?: string
	thumbnails?: T[]
	viewCount?: number
	likeCount?: number
	duration?: number
	source: MediaSource
	raw: T
}

export interface VideoProvider {
	id: string
	name?: string
	domains?: string[]
	matches(url: string): boolean
	validateUrl?(url: string): boolean | Promise<boolean>
	getVideoId?(url: string): string | Promise<string | null>
	getVideoUrl?(videoId: string): string | Promise<string | null>
	getEmbedUrl?(videoId: string): string | Promise<string | null>
	getThumbnailUrl?(videoId: string, quality?: any): string | Promise<string | null>
	fetchMetadata(url: string, context: VideoProviderContext): Promise<BasicVideoInfo>
	cleanup?(): void

	// Platform-specific methods (optional)
	getTrendingVideos?(maxResults?: number): Promise<Array<{ id: string; title: string; url: string; thumbnail: string }>>
	getUserVideos?(username: string, maxResults?: number): Promise<Array<{ id: string; title: string; url: string; thumbnail: string }>>
	getChannelVideos?(channelId: string, maxResults?: number): Promise<Array<{ id: string; title: string; url: string }>>
	searchVideos?(query: string, maxResults?: number): Promise<Array<{ id: string; title: string; url: string; thumbnail: string }>>
	getComments?(videoId: string, maxResults?: number): Promise<Array<{ id: string; text: string; author: string; timestamp: number }>>
}

export interface VideoProviderContext {
	proxyUrl?: string
	[key: string]: any
}