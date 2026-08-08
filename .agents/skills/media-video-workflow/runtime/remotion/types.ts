// Vendored + trimmed from packages/remotion-project/remotion/types.ts.
// Comment / VideoInfo are vendored inline from @app/media-domain (media-types.ts).
// Thread-related types are intentionally dropped (this skill is comments-only).

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

export type CommentsTemplateConfig = {
	theme?: {
		background?: string
		surface?: string
		border?: string
		textPrimary?: string
		textSecondary?: string
		textMuted?: string
		accent?: string
		accentGlow?: string
	}
	typography?: {
		fontPreset?: 'noto' | 'inter' | 'system'
		fontScale?: number
	}
	layout?: {
		paddingX?: number
		paddingY?: number
		infoPanelWidth?: number
	}
	brand?: {
		showWatermark?: boolean
		watermarkText?: string
	}
	motion?: {
		enabled?: boolean
		intensity?: 'subtle' | 'normal' | 'strong'
	}
}

export interface CommentVideoInputProps extends Record<string, unknown> {
	videoInfo: VideoInfo
	comments: Comment[]
	coverDurationInFrames: number
	commentDurationsInFrames: number[]
	fps: number
	templateConfig?: CommentsTemplateConfig
}

export interface TimelineDurations {
	coverDurationInFrames: number
	commentDurationsInFrames: number[]
	totalDurationInFrames: number
	totalDurationSeconds: number
	coverDurationSeconds: number
}
