export type SafeComment = {
	id: string
	author: string
	content: string
	translatedContent?: string
	likes?: number
	replyCount?: number
}

export type VideoInfo = {
	title: string
	translatedTitle?: string
	author?: string
	viewCount?: number
}

export type CommentsVideoProps = {
	videoInfo: VideoInfo
	comments: SafeComment[]
	coverDurationInFrames: number
	commentDurationsInFrames: number[]
	fps: number
	orientation: 'landscape' | 'portrait'
}
