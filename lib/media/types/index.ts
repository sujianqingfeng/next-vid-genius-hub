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

export interface TimeSegmentEffect {
	id: string
	startTime: number // 开始时间（秒）
	endTime: number   // 结束时间（秒）
	muteAudio: boolean    // 是否消音
	blackScreen: boolean  // 是否黑屏
	description?: string  // 可选描述
}

export interface SubtitleRenderConfig {
	fontSize: number
	textColor: string
	backgroundColor: string
	backgroundOpacity: number
	outlineColor: string
	timeSegmentEffects: TimeSegmentEffect[] // 时间段效果配置
}

export const defaultSubtitleRenderConfig: SubtitleRenderConfig = {
	fontSize: 34,
	textColor: '#ffffff',
	backgroundColor: '#000000',
	backgroundOpacity: 0.65,
	outlineColor: '#000000',
	timeSegmentEffects: [],
}

export interface SubtitleRenderPreset {
	id: 'default' | 'contrast' | 'minimal' | 'bold';
	label: string
	description: string
	config: SubtitleRenderConfig
}

export const subtitleRenderPresets: readonly SubtitleRenderPreset[] = [
	{
		id: 'default',
		label: '标准',
		description: '白色字幕，65% 黑底，通用场景。',
		config: {
			fontSize: defaultSubtitleRenderConfig.fontSize,
			textColor: defaultSubtitleRenderConfig.textColor,
			backgroundColor: defaultSubtitleRenderConfig.backgroundColor,
			backgroundOpacity: defaultSubtitleRenderConfig.backgroundOpacity,
			outlineColor: defaultSubtitleRenderConfig.outlineColor,
			timeSegmentEffects: [],
		},
	},
	{
		id: 'contrast',
		label: '高对比',
		description: '金黄色字幕 + 80% 深色底，适合复杂背景。',
		config: {
			fontSize: 36,
			textColor: '#ffd54f',
			backgroundColor: '#0f172a',
			backgroundOpacity: 0.8,
			outlineColor: '#000000',
			timeSegmentEffects: [],
		},
	},
	{
		id: 'minimal',
		label: '轻量',
		description: '透明底 + 白色文字，适合简洁风格。',
		config: {
			fontSize: 34,
			textColor: '#f8fafc',
			backgroundColor: '#0f172a',
			backgroundOpacity: 0.2,
			outlineColor: '#111827',
			timeSegmentEffects: [],
		},
	},
	{
		id: 'bold',
		label: '大字幕',
		description: '48px 字号 + 70% 底色，移动端更清晰。',
		config: {
			fontSize: 48,
			textColor: '#ffffff',
			backgroundColor: '#020617',
			backgroundOpacity: 0.7,
			outlineColor: '#020617',
			timeSegmentEffects: [],
		},
	},
] as const
