import { extractVideoId } from '@app/media-providers'
import type { Innertube } from 'youtubei.js'
import { logger } from '~/lib/infra/logger'
import { MEDIA_SOURCES } from '~/lib/domain/media/source'
import type {
	BasicVideoInfo,
	VideoProvider,
	VideoProviderContext,
} from '~/lib/shared/types/provider.types'
import { fetchYouTubeMetadata } from './metadata'

const clientCache = new Map<string, Promise<Innertube>>()

// Note: Client cache + factory kept for future use. The inline
// resolveYouTubeClient helper was unused – removing to keep file clean.

function isYouTubeUrl(url: string): boolean {
	const id = extractVideoId(url)
	return typeof id === 'string' && id.length > 0
}

export const youtubeProvider: VideoProvider = {
	id: MEDIA_SOURCES.YOUTUBE,
	name: 'YouTube',
	domains: ['youtube.com', 'youtu.be', 'm.youtube.com'],
	matches: isYouTubeUrl,

	async fetchMetadata(
		url: string,
		context: VideoProviderContext,
	): Promise<BasicVideoInfo> {
		try {
			const metadata = await fetchYouTubeMetadata(url, context)
			if (!metadata) {
				throw new Error('Failed to fetch YouTube metadata')
			}
			return metadata
		} catch (error) {
			logger.error(
				'media',
				`YouTube metadata fetch error: ${error instanceof Error ? error.message : String(error)}`,
			)
			throw new Error(
				`YouTube metadata fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			)
		}
	},

	async validateUrl(url: string): Promise<boolean> {
		return isYouTubeUrl(url)
	},

	async getVideoId(url: string): Promise<string | null> {
		const id = extractVideoId(url)
		return id || null
	},

	async getVideoUrl(videoId: string): Promise<string> {
		return `https://www.youtube.com/watch?v=${videoId}`
	},

	async getEmbedUrl(videoId: string): Promise<string> {
		return `https://www.youtube.com/embed/${videoId}`
	},

	async getThumbnailUrl(
		videoId: string,
		quality: 'default' | 'medium' | 'high' | 'maxres' = 'default',
	): Promise<string> {
		const qualityMap = {
			default: `https://img.youtube.com/vi/${videoId}/default.jpg`,
			medium: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
			high: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
			maxres: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
		}
		return qualityMap[quality]
	},

	// Additional YouTube-specific methods
	async getChannelVideos(
		channelId: string,
		_maxResults: number = 50,
	): Promise<Array<{ id: string; title: string; url: string }>> {
		try {
			void channelId
			void _maxResults
			// Implementation would require YouTube API client
			// This is a placeholder for future enhancement

			return []
		} catch (error) {
			logger.error(
				'media',
				`Failed to fetch channel videos: ${error instanceof Error ? error.message : String(error)}`,
			)
			return []
		}
	},

	async searchVideos(
		query: string,
		_maxResults: number = 20,
	): Promise<
		Array<{ id: string; title: string; url: string; thumbnail: string }>
	> {
		try {
			void query
			void _maxResults
			// Implementation would require YouTube API client
			// This is a placeholder for future enhancement

			return []
		} catch (error) {
			logger.error(
				'media',
				`Failed to search videos: ${error instanceof Error ? error.message : String(error)}`,
			)
			return []
		}
	},

	// Cleanup method
	cleanup(): void {
		clientCache.clear()
	},
}
