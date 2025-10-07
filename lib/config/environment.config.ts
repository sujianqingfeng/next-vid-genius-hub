/**
 * Environment-specific configuration
 */

// Environment types
export type Environment = 'development' | 'staging' | 'production' | 'test'

// Get current environment
export const NODE_ENV: Environment = (process.env.NODE_ENV as Environment) || 'development'

// Environment-specific settings
export const ENVIRONMENT_CONFIG = {
	development: {
		name: 'Development',
		apiBaseUrl: 'http://localhost:3000',
		databaseUrl: process.env.DATABASE_URL || 'file:./local.db',
		logLevel: 'debug' as const,
		enableDebugMode: true,
		enableMockData: true,
		enableHotReload: true,
		corsOrigins: ['http://localhost:3000', 'http://localhost:3001'],
		enableApiDocs: true,
		sentryDsn: undefined,
		analyticsEnabled: false,
		enableFeatureFlags: true,
		enableConsoleLogs: true,
	},

	staging: {
		name: 'Staging',
		apiBaseUrl: process.env.NEXT_PUBLIC_API_URL || 'https://staging-api.example.com',
		databaseUrl: process.env.DATABASE_URL,
		logLevel: 'info' as const,
		enableDebugMode: true,
		enableMockData: false,
		enableHotReload: false,
		corsOrigins: ['https://staging.example.com'],
		enableApiDocs: true,
		sentryDsn: process.env.SENTRY_DSN,
		analyticsEnabled: true,
		enableFeatureFlags: true,
		enableConsoleLogs: true,
	},

	production: {
		name: 'Production',
		apiBaseUrl: process.env.NEXT_PUBLIC_API_URL || 'https://api.example.com',
		databaseUrl: process.env.DATABASE_URL,
		logLevel: 'warn' as const,
		enableDebugMode: false,
		enableMockData: false,
		enableHotReload: false,
		corsOrigins: ['https://example.com'],
		enableApiDocs: false,
		sentryDsn: process.env.SENTRY_DSN,
		analyticsEnabled: true,
		enableFeatureFlags: false,
		enableConsoleLogs: false,
	},

	test: {
		name: 'Test',
		apiBaseUrl: 'http://localhost:3001',
		databaseUrl: 'file:./test.db',
		logLevel: 'error' as const,
		enableDebugMode: true,
		enableMockData: true,
		enableHotReload: false,
		corsOrigins: ['http://localhost:3001'],
		enableApiDocs: false,
		sentryDsn: undefined,
		analyticsEnabled: false,
		enableFeatureFlags: true,
		enableConsoleLogs: false,
	},
} as const

// Get current environment config
export const CONFIG = ENVIRONMENT_CONFIG[NODE_ENV]

// Feature flags
export const FEATURE_FLAGS = {
	enableNewUI: process.env.NEXT_PUBLIC_ENABLE_NEW_UI === 'true',
	enableBetaFeatures: process.env.NEXT_PUBLIC_ENABLE_BETA === 'true',
	enableAdvancedProcessing: process.env.NEXT_PUBLIC_ENABLE_ADVANCED === 'true',
	enableAnalytics: CONFIG.analyticsEnabled,
	enableAIOptimizations: process.env.NEXT_PUBLIC_ENABLE_AI_OPTIMIZATIONS === 'true',
	enableRealTimeUpdates: process.env.NEXT_PUBLIC_ENABLE_REALTIME === 'true',
	enableOfflineMode: process.env.NEXT_PUBLIC_ENABLE_OFFLINE === 'true',
	enableDarkMode: process.env.NEXT_PUBLIC_ENABLE_DARK_MODE === 'true',
	enableNotifications: process.env.NEXT_PUBLIC_ENABLE_NOTIFICATIONS === 'true',
	enableExperimentalFeatures: process.env.NEXT_PUBLIC_ENABLE_EXPERIMENTAL === 'true',
} as const

// Runtime configuration
export const RUNTIME_CONFIG = {
	// App settings
	appName: 'Video Genius Hub',
	appVersion: process.env.npm_package_version || '1.0.0',
	appDescription: 'AI-powered video processing platform',

	// API settings
	apiTimeout: parseInt(process.env.API_TIMEOUT || '30000'),
	apiRetries: parseInt(process.env.API_RETRIES || '3'),
	apiRetryDelay: parseInt(process.env.API_RETRY_DELAY || '1000'),

	// File upload settings
	maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '524288000'), // 500MB
	maxConcurrentUploads: parseInt(process.env.MAX_CONCURRENT_UPLOADS || '3'),
	uploadTimeout: parseInt(process.env.UPLOAD_TIMEOUT || '300000'), // 5 minutes

	// Database settings
	dbConnectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),
	dbMaxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '10'),
	dbIdleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),

	// Cache settings
	cacheTtl: parseInt(process.env.CACHE_TTL || '3600'), // 1 hour
	cacheMaxSize: parseInt(process.env.CACHE_MAX_SIZE || '1000'),
	cacheCheckPeriod: parseInt(process.env.CACHE_CHECK_PERIOD || '600'), // 10 minutes

	// Security settings
	csrfProtection: process.env.CSRF_PROTECTION !== 'false',
	rateLimiting: process.env.RATE_LIMITING !== 'false',
	maxRequestsPerMinute: parseInt(process.env.MAX_REQUESTS_PER_MINUTE || '60'),
	sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '3600'), // 1 hour

	// Performance settings
	enableCompression: process.env.ENABLE_COMPRESSION !== 'false',
	enableStaticOptimization: process.env.ENABLE_STATIC_OPTIMIZATION !== 'false',
	imageOptimizationQuality: parseInt(process.env.IMAGE_OPTIMIZATION_QUALITY || '75'),
	bundleAnalyzer: CONFIG.enableDebugMode,

	// Monitoring settings
	enableMetrics: process.env.ENABLE_METRICS === 'true',
	enableHealthChecks: process.env.ENABLE_HEALTH_CHECKS !== 'false',
	metricsPort: parseInt(process.env.METRICS_PORT || '9090'),
	healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'), // 30 seconds

	// External services
	redisUrl: process.env.REDIS_URL,
	smtpHost: process.env.SMTP_HOST,
	smtpPort: parseInt(process.env.SMTP_PORT || '587'),
	smtpUser: process.env.SMTP_USER,
	sentryDsn: CONFIG.sentryDsn,
	googleAnalyticsId: process.env.GA_ID,

	// Development settings
	enableSourceMaps: CONFIG.enableDebugMode,
	enableHotReloading: CONFIG.enableHotReload,
	enableFastRefresh: CONFIG.enableDebugMode,
	enableConsoleLogging: CONFIG.enableConsoleLogs,
	logLevel: CONFIG.logLevel,
} as const

// Helper functions
export function isDevelopment(): boolean {
	return NODE_ENV === 'development'
}

export function isStaging(): boolean {
	return NODE_ENV === 'staging'
}

export function isProduction(): boolean {
	return NODE_ENV === 'production'
}

export function isTest(): boolean {
	return NODE_ENV === 'test'
}

export function isServer(): boolean {
	return typeof window === 'undefined'
}

export function isClient(): boolean {
	return typeof window !== 'undefined'
}

export function getEnvironmentUrl(): string {
	if (isDevelopment()) return 'http://localhost:3000'
	if (isStaging()) return 'https://staging.example.com'
	return 'https://example.com'
}

export function getApiUrl(): string {
	return CONFIG.apiBaseUrl
}

export function getDatabaseUrl(): string {
	return CONFIG.databaseUrl || 'file:./local.db'
}

export function isFeatureEnabled(feature: keyof typeof FEATURE_FLAGS): boolean {
	return FEATURE_FLAGS[feature]
}

export function getLogLevel(): string {
	return RUNTIME_CONFIG.logLevel
}

export function shouldEnableDebugMode(): boolean {
	return CONFIG.enableDebugMode
}

// Validation helpers
export function validateEnvironment(): {
	isValid: boolean
	errors: string[]
	warnings: string[]
} {
	const errors: string[] = []
	const warnings: string[] = []

	// Check required environment variables
	if (!CONFIG.databaseUrl) {
		errors.push('DATABASE_URL is required')
	}

	if (!RUNTIME_CONFIG.apiTimeout || RUNTIME_CONFIG.apiTimeout < 1000) {
		warnings.push('API_TIMEOUT should be at least 1000ms')
	}

	if (!RUNTIME_CONFIG.maxFileSize || RUNTIME_CONFIG.maxFileSize > 1073741824) { // 1GB
		warnings.push('MAX_FILE_SIZE should not exceed 1GB for performance reasons')
	}

	// Check security settings in production
	if (isProduction()) {
		if (!RUNTIME_CONFIG.csrfProtection) {
			errors.push('CSRF protection should be enabled in production')
		}

		if (!RUNTIME_CONFIG.rateLimiting) {
			errors.push('Rate limiting should be enabled in production')
		}

		if (CONFIG.enableDebugMode) {
			warnings.push('Debug mode should be disabled in production')
		}

		if (CONFIG.enableConsoleLogs) {
			warnings.push('Console logging should be disabled in production')
		}
	}

	// Check external services
	if (isProduction() && !CONFIG.sentryDsn) {
		warnings.push('Sentry DSN should be configured in production')
	}

	return {
		isValid: errors.length === 0,
		errors,
		warnings,
	}
}

// Export commonly used values
export const {
	apiTimeout,
	maxFileSize,
	enableCompression,
	enableSourceMaps,
	sentryDsn
} = RUNTIME_CONFIG