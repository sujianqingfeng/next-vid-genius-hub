// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CanvasContext = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EmojiImage = any

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

export interface LikeIconOptions {
	size?: number
	color?: string
	strokeWidth?: number
	filled?: boolean // Whether to render filled or outlined icon
}
