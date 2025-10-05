import type { BasicVideoInfo } from '../types'

export type VideoProviderId = 'youtube' | 'tiktok' | (string & {})

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
