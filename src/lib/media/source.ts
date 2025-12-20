// Shared media source constants to avoid scattering 'youtube' / 'tiktok' literals.

export const MEDIA_SOURCES = {
	YOUTUBE: 'youtube',
	TIKTOK: 'tiktok',
	UNKNOWN: 'unknown',
} as const

export type MediaSourceId = (typeof MEDIA_SOURCES)[keyof typeof MEDIA_SOURCES]
