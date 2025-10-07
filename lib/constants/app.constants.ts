// 应用级常量

export const APP_CONSTANTS = {
	// 应用信息
	app: {
		name: 'Video Genius Hub',
		version: '1.0.0',
		description: 'AI-powered video processing and analysis platform',
		author: 'Video Genius Team',
	},

	// 环境配置
	environments: {
		development: 'development',
		production: 'production',
		test: 'test',
	},

	// API 配置
	api: {
		version: 'v1',
		basePath: '/api',
		timeout: 30000, // 30 seconds
	},

	// 分页配置
	pagination: {
		defaultPageSize: 20,
		maxPageSize: 100,
		minPageSize: 1,
	},

	// 缓存配置
	cache: {
		defaultTTL: 60 * 60 * 1000, // 1 hour
		maxSize: 1000, // maximum items
		cleanupInterval: 60 * 60 * 1000, // 1 hour
	},

	// 日志级别
	logLevels: {
		error: 0,
		warn: 1,
		info: 2,
		debug: 3,
		trace: 4,
	},

	// 文件路径常量
	paths: {
		uploads: './uploads',
		temp: './temp',
		cache: './cache',
		logs: './logs',
		exports: './exports',
	},

	// 文件大小限制
	fileSizes: {
		maxUploadSize: 5 * 1024 * 1024 * 1024, // 5GB
		maxImageSize: 10 * 1024 * 1024, // 10MB
		maxAudioSize: 100 * 1024 * 1024, // 100MB
		maxVideoSize: 2 * 1024 * 1024 * 1024, // 2GB
	},

	// 时间常量
	time: {
		second: 1000,
		minute: 60 * 1000,
		hour: 60 * 60 * 1000,
		day: 24 * 60 * 60 * 1000,
		week: 7 * 24 * 60 * 60 * 1000,
		month: 30 * 24 * 60 * 60 * 1000,
	},

	// 正则表达式
	patterns: {
		email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
		url: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
		youtubeUrl: /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
		tiktokUrl: /^(https?:\/\/)?(www\.)?(tiktok\.com\/@[\w.-]+\/video\/[\d]+|vm\.tiktok\.com\/[\w]+)/,
	},

	// 错误代码
	errorCodes: {
		VALIDATION_ERROR: 'VALIDATION_ERROR',
		AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
		AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
		NOT_FOUND: 'NOT_FOUND',
		INTERNAL_ERROR: 'INTERNAL_ERROR',
		SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
		RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
		FILE_TOO_LARGE: 'FILE_TOO_LARGE',
		UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
		NETWORK_ERROR: 'NETWORK_ERROR',
		TIMEOUT_ERROR: 'TIMEOUT_ERROR',
	},

	// 状态码
	statusCodes: {
		OK: 200,
		CREATED: 201,
		BAD_REQUEST: 400,
		UNAUTHORIZED: 401,
		FORBIDDEN: 403,
		NOT_FOUND: 404,
		CONFLICT: 409,
		UNPROCESSABLE_ENTITY: 422,
		TOO_MANY_REQUESTS: 429,
		INTERNAL_SERVER_ERROR: 500,
		SERVICE_UNAVAILABLE: 503,
	},

	// 默认值
	defaults: {
		language: 'en',
		timezone: 'UTC',
		theme: 'light',
		pageSize: 20,
		quality: '1080p',
		format: 'mp4',
	},
} as const

export type LogLevel = keyof typeof APP_CONSTANTS.logLevels
export type Environment = keyof typeof APP_CONSTANTS.environments
export type ErrorCode = keyof typeof APP_CONSTANTS.errorCodes
export type StatusCode = keyof typeof APP_CONSTANTS.statusCodes