import type { AIModelId } from '~/lib/ai/models'

/**
 * Subtitle configuration and presets
 */

export const SUBTITLE_CONFIG = {
	// Default rendering settings
	defaultRender: {
		fontSize: 24,
		fontFamily: 'Arial, sans-serif',
		fontColor: '#FFFFFF',
		backgroundColor: 'rgba(0, 0, 0, 0.8)',
		position: 'bottom',
		maxWidth: 80,
		padding: 8,
		borderRadius: 4,
		strokeColor: '#000000',
		strokeWidth: 1,
	},

	// Video processing settings
	processing: {
		maxLineLength: 42,
		maxDuration: 7, // seconds per subtitle
		mergeThreshold: 0.5, // seconds
		minGap: 0.1, // seconds between subtitles
		maxWordsPerLine: 10,
		readingSpeed: 180, // words per minute
	},

	// AI translation settings
	translation: {
		defaultModel: 'gpt-4o-mini' as AIModelId,
		maxTextLength: 5000,
		batchSize: 10,
		preserveFormatting: true,
		qualityThreshold: 0.7,
	},

	// Transcription settings
	transcription: {
		defaultLanguage: 'auto',
		outputFormat: 'vtt',
		enableTimestamps: true,
		enableConfidence: false,
		enableWordTimestamps: false,
	},

	// Export settings
	export: {
		supportedFormats: ['vtt', 'srt', 'txt', 'json'],
		defaultFormat: 'vtt',
		includeMetadata: true,
		encoding: 'utf-8',
	},

	// UI settings
	ui: {
		editor: {
			theme: 'dark',
			showLineNumbers: true,
			showTimestamps: true,
			autosave: true,
			autosaveInterval: 30000, // 30 seconds
		},
		player: {
			defaultVolume: 0.8,
			defaultPlaybackRate: 1.0,
			showControls: true,
			autoHideControls: true,
			controlsHideDelay: 3000,
		},
	},
} as const

// Render presets for different use cases
export const SUBTITLE_RENDER_PRESETS = {
	// YouTube-style subtitle
	youtube: {
		fontSize: 24,
		fontFamily: 'Arial, sans-serif',
		fontColor: '#FFFFFF',
		backgroundColor: 'rgba(0, 0, 0, 0.8)',
		position: 'bottom',
		maxWidth: 80,
		padding: 8,
		borderRadius: 4,
		strokeColor: '#000000',
		strokeWidth: 1,
	},

	// Netflix-style subtitle
	netflix: {
		fontSize: 28,
		fontFamily: 'Helvetica Neue, Arial, sans-serif',
		fontColor: '#FFFFFF',
		backgroundColor: 'rgba(0, 0, 0, 0.9)',
		position: 'bottom-center',
		maxWidth: 70,
		padding: 12,
		borderRadius: 8,
		strokeColor: '#000000',
		strokeWidth: 2,
	},

	// Minimal subtitle
	minimal: {
		fontSize: 20,
		fontFamily: 'Arial, sans-serif',
		fontColor: '#FFFFFF',
		backgroundColor: 'transparent',
		position: 'bottom',
		maxWidth: 85,
		padding: 4,
		borderRadius: 0,
		strokeColor: '#000000',
		strokeWidth: 2,
	},

	// Cinema-style subtitle
	cinema: {
		fontSize: 32,
		fontFamily: 'Georgia, serif',
		fontColor: '#FFFF00',
		backgroundColor: 'rgba(0, 0, 0, 0.7)',
		position: 'bottom-center',
		maxWidth: 60,
		padding: 16,
		borderRadius: 12,
		strokeColor: '#000000',
		strokeWidth: 3,
	},

	// High contrast subtitle
	highContrast: {
		fontSize: 26,
		fontFamily: 'Arial Black, sans-serif',
		fontColor: '#FFFFFF',
		backgroundColor: '#000000',
		position: 'bottom',
		maxWidth: 75,
		padding: 10,
		borderRadius: 6,
		strokeColor: '#FFFFFF',
		strokeWidth: 1,
	},

	// Elegant subtitle
	elegant: {
		fontSize: 22,
		fontFamily: 'Georgia, serif',
		fontColor: '#F0F0F0',
		backgroundColor: 'rgba(20, 20, 20, 0.8)',
		position: 'bottom',
		maxWidth: 80,
		padding: 10,
		borderRadius: 8,
		strokeColor: '#000000',
		strokeWidth: 1,
	},
} as const

// Position presets
export const SUBTITLE_POSITIONS = {
	top: { vertical: 'top', horizontal: 'center' },
	topLeft: { vertical: 'top', horizontal: 'left' },
	topRight: { vertical: 'top', horizontal: 'right' },
	center: { vertical: 'center', horizontal: 'center' },
	centerLeft: { vertical: 'center', horizontal: 'left' },
	centerRight: { vertical: 'center', horizontal: 'right' },
	bottom: { vertical: 'bottom', horizontal: 'center' },
	bottomLeft: { vertical: 'bottom', horizontal: 'left' },
	bottomRight: { vertical: 'bottom', horizontal: 'right' },
	bottomCenter: { vertical: 'bottom', horizontal: 'center' },
} as const

// Color themes for subtitles
export const SUBTITLE_COLOR_THEMES = {
	light: {
		fontColor: '#000000',
		backgroundColor: 'rgba(255, 255, 255, 0.9)',
		strokeColor: '#FFFFFF',
	},
	dark: {
		fontColor: '#FFFFFF',
		backgroundColor: 'rgba(0, 0, 0, 0.8)',
		strokeColor: '#000000',
	},
	blue: {
		fontColor: '#FFFFFF',
		backgroundColor: 'rgba(0, 100, 200, 0.8)',
		strokeColor: '#000033',
	},
	green: {
		fontColor: '#FFFFFF',
		backgroundColor: 'rgba(0, 150, 0, 0.8)',
		strokeColor: '#003300',
	},
	red: {
		fontColor: '#FFFFFF',
		backgroundColor: 'rgba(200, 0, 0, 0.8)',
		strokeColor: '#330000',
	},
	purple: {
		fontColor: '#FFFFFF',
		backgroundColor: 'rgba(128, 0, 128, 0.8)',
		strokeColor: '#330033',
	},
	orange: {
		fontColor: '#000000',
		backgroundColor: 'rgba(255, 165, 0, 0.9)',
		strokeColor: '#FFFF00',
	},
	pink: {
		fontColor: '#000000',
		backgroundColor: 'rgba(255, 192, 203, 0.9)',
		strokeColor: '#FFFFFF',
	},
} as const

// Font families
export const SUBTITLE_FONTS = {
	arial: 'Arial, sans-serif',
	helvetica: 'Helvetica, Arial, sans-serif',
	times: 'Times New Roman, Times, serif',
	georgia: 'Georgia, Times, serif',
	verdana: 'Verdana, Arial, sans-serif',
	comic: 'Comic Sans MS, cursive',
	impact: 'Impact, Arial Black, sans-serif',
	openDyslexic: 'OpenDyslexic, Arial, sans-serif',
} as const

// Language-specific settings
export const SUBTITLE_LANGUAGE_SETTINGS = {
	arabic: {
		textDirection: 'rtl',
		fontFamily: 'Arial, sans-serif',
		fontSize: 28,
	},
	chinese: {
		textDirection: 'ltr',
		fontFamily: 'Microsoft YaHei, SimHei, sans-serif',
		fontSize: 26,
	},
	japanese: {
		textDirection: 'ltr',
		fontFamily: 'Hiragino Kaku Gothic Pro, Meiryo, sans-serif',
		fontSize: 24,
	},
	korean: {
		textDirection: 'ltr',
		fontFamily: 'Malgun Gothic, Apple SD Gothic Neo, sans-serif',
		fontSize: 24,
	},
	thai: {
		textDirection: 'ltr',
		fontFamily: 'Tahoma, sans-serif',
		fontSize: 26,
	},
	hindi: {
		textDirection: 'ltr',
		fontFamily: 'Noto Sans Devanagari, sans-serif',
		fontSize: 24,
	},
} as const

// Quality settings
export const SUBTITLE_QUALITY_SETTINGS = {
	draft: {
		maxDuration: 10,
		maxLineLength: 50,
		mergeThreshold: 0.8,
		quality: 'low' as const,
	},
	standard: {
		maxDuration: 7,
		maxLineLength: 42,
		mergeThreshold: 0.5,
		quality: 'medium' as const,
	},
	high: {
		maxDuration: 5,
		maxLineLength: 35,
		mergeThreshold: 0.3,
		quality: 'high' as const,
	},
	cinema: {
		maxDuration: 4,
		maxLineLength: 30,
		mergeThreshold: 0.2,
		quality: 'cinema' as const,
	},
} as const

// Accessibility settings
export const SUBTITLE_ACCESSIBILITY_SETTINGS = {
	visual: {
		highContrast: false,
		largeText: false,
		simplifiedLanguage: false,
		minimalAnimations: false,
		colorBlindFriendly: false,
	},
	hearing: {
		soundEffects: false,
		speakerLabels: true,
		musicDescriptions: false,
		importantSounds: true,
	},
	cognitive: {
		simpleLanguage: false,
		slowPacing: false,
		clearBreaks: true,
		consistentFormatting: true,
	},
} as const

// Export types for TypeScript users
export interface SubtitleRenderConfig {
	fontSize: number
	fontFamily: string
	fontColor: string
	backgroundColor: string
	position: 'top' | 'center' | 'bottom' | 'bottom-center'
	maxWidth: number
	padding: number
	borderRadius: number
	strokeColor: string
	strokeWidth: number
	// Additional fields for compatibility
	textColor?: string
	backgroundOpacity?: number
	outlineColor?: string
	timeSegmentEffects?: boolean
}
export type SubtitlePreset = keyof typeof SUBTITLE_RENDER_PRESETS
export type SubtitlePosition = keyof typeof SUBTITLE_POSITIONS
export type SubtitleColorTheme = keyof typeof SUBTITLE_COLOR_THEMES
export type SubtitleFont = keyof typeof SUBTITLE_FONTS
export type SubtitleQuality = keyof typeof SUBTITLE_QUALITY_SETTINGS