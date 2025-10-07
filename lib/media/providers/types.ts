import type { BasicVideoInfo } from '../types'

export type VideoProviderId = 'youtube' | 'tiktok' | (string & {})
export type MediaSource = 'youtube' | 'tiktok'

/**
 * Mapping from VideoProviderId to MediaSource
 * Provides type-safe conversion between provider IDs and database source values
 */
export const PROVIDER_TO_SOURCE_MAP: Record<VideoProviderId, MediaSource> = {
	youtube: 'youtube',
	tiktok: 'tiktok',
} as const

/**
 * Utility function to convert provider ID to media source
 * @param providerId - The video provider ID
 * @returns The corresponding media source for database storage
 */
export function providerToSource(providerId: VideoProviderId): MediaSource {
	return PROVIDER_TO_SOURCE_MAP[providerId] ?? 'youtube'
}

export interface VideoProviderContext {
	proxyUrl?: string
}

export interface VideoProvider {
	id: VideoProviderId
	matches(url: string): boolean
	fetchMetadata(
		url: string,
		context: VideoProviderContext,
	): Promise<BasicVideoInfo>
}
