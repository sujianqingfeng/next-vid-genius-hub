export const DOWNLOAD_CONFIG = {
	// 下载质量配置
	qualities: {
		'720p': {
			height: 720,
			format: 'bestvideo[height<=720]+bestaudio/best',
			label: 'HD 720p',
		},
		'1080p': {
			height: 1080,
			format: 'bestvideo[height<=1080]+bestaudio/best',
			label: 'Full HD 1080p',
		},
	},

	// 下载选项
	options: {
		mergeOutputFormat: 'mp4',
		extractAudio: true,
		audioFormat: 'mp3',
		audioBitrate: '192k',
		audioSampleRate: '44100',
		generateThumbnail: true,
		thumbnailTime: '00:00:01',
		thumbnailSize: '320x240',
	},

	// 支持的平台
	supportedPlatforms: [
		{
			name: 'YouTube',
			domains: ['youtube.com', 'youtu.be', 'm.youtube.com'],
			id: 'youtube',
		},
		{
			name: 'TikTok',
			domains: ['tiktok.com', 'vm.tiktok.com'],
			id: 'tiktok',
		},
	],

	// 重试配置
	retry: {
		maxAttempts: 3,
		backoffMs: 1000,
		maxBackoffMs: 10000,
	},

	// 超时配置
	timeout: {
		download: 30 * 60 * 1000, // 30 minutes
		metadata: 30 * 1000, // 30 seconds
		extractAudio: 10 * 60 * 1000, // 10 minutes
	},

	// 缓存配置
	cache: {
		metadata: 60 * 60 * 1000, // 1 hour
		thumbnails: 24 * 60 * 60 * 1000, // 24 hours
	},

	// 用户代理
	userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',

	// 临时文件配置
	tempFiles: {
		cleanupOnSuccess: false,
		cleanupOnError: true,
		retentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
	},
} as const

export type DownloadQuality = keyof typeof DOWNLOAD_CONFIG.qualities
export type SupportedPlatform = typeof DOWNLOAD_CONFIG.supportedPlatforms[number]