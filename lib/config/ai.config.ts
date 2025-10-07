import type { AIModelId } from '~/lib/ai/models'

export const AI_CONFIG = {
	// OpenAI 配置
	openai: {
		apiKey: process.env.OPENAI_API_KEY,
		baseUrl: process.env.OPENAI_BASE_URL,
		organization: process.env.OPENAI_ORGANIZATION,
	},

	// DeepSeek 配置
	deepseek: {
		apiKey: process.env.DEEPSEEK_API_KEY,
		baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
	},

	// Whisper/转录配置
	whisper: {
		// 转录提供商类型
		provider: 'openai' as 'local' | 'cloudflare',

		// 支持的模型
		models: {
			'whisper-large': {
				id: 'whisper-large',
				label: 'Whisper Large',
				description: 'Best quality, slower processing',
				languages: 'multilingual',
				duration: 'unlimited',
			},
			'whisper-medium': {
				id: 'whisper-medium',
				label: 'Whisper Medium',
				description: 'Balanced quality and speed',
				languages: 'multilingual',
				duration: 'unlimited',
			},
			'whisper-tiny-en': {
				id: 'whisper-tiny-en',
				label: 'Whisper Tiny (EN)',
				description: 'Fast, English only',
				languages: 'english',
				duration: '30min',
			},
			'whisper-large-v3-turbo': {
				id: 'whisper-large-v3-turbo',
				label: 'Whisper Large v3 Turbo',
				description: 'High quality, faster processing',
				languages: 'multilingual',
				duration: 'unlimited',
			},
		},
		defaultModel: 'whisper-1',
	},

	// 默认模型配置
	defaultModels: {
		translation: 'gpt-4o-mini' as AIModelId,
		transcription: 'whisper-1',
		chat: 'gpt-4o-mini' as AIModelId,
	},

	// 翻译配置
	translation: {
		maxTextLength: 5000,
		batchSize: 10,
		timeout: 30 * 1000, // 30 seconds
		retryAttempts: 3,
		supportedLanguages: [
			{ code: 'en', name: 'English' },
			{ code: 'zh', name: 'Chinese (Simplified)' },
			{ code: 'zh-TW', name: 'Chinese (Traditional)' },
			{ code: 'ja', name: 'Japanese' },
			{ code: 'ko', name: 'Korean' },
			{ code: 'es', name: 'Spanish' },
			{ code: 'fr', name: 'French' },
			{ code: 'de', name: 'German' },
			{ code: 'it', name: 'Italian' },
			{ code: 'pt', name: 'Portuguese' },
			{ code: 'ru', name: 'Russian' },
			{ code: 'ar', name: 'Arabic' },
			{ code: 'hi', name: 'Hindi' },
		],
	},

	// 转录配置
	transcription: {
		maxAudioSize: 25 * 1024 * 1024, // 25MB
		supportedFormats: [
			'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'
		],
		languageDetection: true,
		defaultLanguage: 'auto',
		outputFormats: ['json', 'text', 'srt', 'vtt'],
		segmentOptions: {
			maxLineLength: 42,
			maxDuration: 7, // seconds
			mergeThreshold: 0.5, // seconds
		},
	},

	// 缓存配置
	cache: {
		translations: 60 * 60 * 1000, // 1 hour
		transcriptions: 24 * 60 * 60 * 1000, // 24 hours
		detections: 30 * 60 * 1000, // 30 minutes
	},

	// 限流配置
	rateLimit: {
		requestsPerMinute: 60,
		tokensPerMinute: 100000,
	},

	// 错误处理
	errorHandling: {
		maxRetries: 3,
		retryDelay: 1000, // milliseconds
		exponentialBackoff: true,
	},

	// 质量控制
	quality: {
		minTranslationConfidence: 0.7,
		validateTranslations: true,
		logQualityMetrics: process.env.NODE_ENV === 'development',
	},
} as const

export type AIProvider = 'openai' | 'deepseek'
export type TranslationLanguage = typeof AI_CONFIG.translation.supportedLanguages[number]['code']
export type TranscriptionFormat = typeof AI_CONFIG.transcription.outputFormats[number]