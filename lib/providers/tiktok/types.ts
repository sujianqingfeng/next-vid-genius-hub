export interface TikTokInfo {
	title?: string
	uploader?: string
	uploader_id?: string
	thumbnails?: Array<{ url?: string }>
	thumbnail?: string
	view_count?: number
	like_count?: number
	duration?: number
	description?: string
	upload_date?: string
}

export interface TikTokBasicComment {
	id: string
	author: string
	authorThumbnail?: string
	content: string
	likes: number
	replyCount?: number
}