// 媒体相关常量

export const MEDIA_CONSTANTS = {
	// 支持的视频格式
	supportedVideoFormats: [
		'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v'
	],

	// 支持的音频格式
	supportedAudioFormats: [
		'mp3', 'wav', 'aac', 'flac', 'ogg', 'wma', 'm4a'
	],

	// 支持的图片格式（缩略图）
	supportedImageFormats: [
		'jpg', 'jpeg', 'png', 'webp', 'gif'
	],

	// 视频质量选项
	videoQualities: {
		'360p': { height: 360, width: 640, bitrate: '1000k' },
		'480p': { height: 480, width: 854, bitrate: '2000k' },
		'720p': { height: 720, width: 1280, bitrate: '4000k' },
		'1080p': { height: 1080, width: 1920, bitrate: '8000k' },
	},

	// 音频质量选项
	audioQualities: {
		'64k': { bitrate: '64k', sampleRate: 22050 },
		'128k': { bitrate: '128k', sampleRate: 44100 },
		'192k': { bitrate: '192k', sampleRate: 44100 },
		'256k': { bitrate: '256k', sampleRate: 48000 },
		'320k': { bitrate: '320k', sampleRate: 48000 },
	},

	// 默认编码器
	defaultEncoders: {
		video: 'libx264',
		audio: 'aac',
		image: 'libpng',
	},

	// 媒体处理选项
	processingOptions: {
		thumbnailTime: '00:00:01',
		thumbnailSize: '320x240',
		maxDuration: 2 * 60 * 60, // 2 hours
		maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB
		concurrentJobs: 2,
	},

	// 平台特定配置
	platformConfigs: {
		youtube: {
			maxDuration: 12 * 60 * 60, // 12 hours
			maxFileSize: 128 * 1024 * 1024 * 1024, // 128GB
		},
		tiktok: {
			maxDuration: 10 * 60, // 10 minutes
			maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB
		},
	},
} as const

export type VideoQuality = keyof typeof MEDIA_CONSTANTS.videoQualities
export type AudioQuality = keyof typeof MEDIA_CONSTANTS.audioQualities
export type MediaFormat = string
export type MediaType = 'video' | 'audio' | 'image'