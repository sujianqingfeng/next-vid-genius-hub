import type { Innertube } from 'youtubei.js'
import type { BasicVideoInfo } from '../types'

export type VideoProviderId = 'youtube' | 'tiktok' | (string & {})

export interface VideoProviderContext {
	youtubeProxy?: string
	youtubeClient?: Innertube
}

export interface VideoProvider {
	id: VideoProviderId
	matches(url: string): boolean
	fetchMetadata(
		url: string,
		context: VideoProviderContext,
	): Promise<BasicVideoInfo>
}
