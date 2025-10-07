import type { Innertube } from 'youtubei.js'
import type { VideoProvider, VideoProviderContext } from '~/lib/types/provider.types'
import type { BasicVideoInfo } from '~/lib/types/provider.types'
import { fetchYouTubeMetadata } from './metadata'
import { extractVideoId } from './utils'
import { getYouTubeClient } from './client'

const clientCache = new Map<string, Promise<Innertube>>()

async function resolveYouTubeClient(context: VideoProviderContext): Promise<Innertube> {
	const cacheKey = context.proxyUrl ?? 'default'
	const existing = clientCache.get(cacheKey)
	if (existing) {
		return existing
	}

	const clientPromise = getYouTubeClient({ proxy: context.proxyUrl }).catch((error) => {
		clientCache.delete(cacheKey)
		throw error
	})
	clientCache.set(cacheKey, clientPromise)
	return clientPromise
}

function isYouTubeUrl(url: string): boolean {
	const id = extractVideoId(url)
	return typeof id === 'string' && id.length > 0
}

export const youtubeProvider: VideoProvider = {
	id: 'youtube',
	name: 'YouTube',
	domains: ['youtube.com', 'youtu.be', 'm.youtube.com'],
	matches: isYouTubeUrl,

	async fetchMetadata(url: string, context: VideoProviderContext): Promise<BasicVideoInfo> {
		try {
			const metadata = await fetchYouTubeMetadata(url, context)
			if (!metadata) {
				throw new Error('Failed to fetch YouTube metadata')
			}
			return metadata
		} catch (error) {
			console.error('YouTube metadata fetch error:', error)
			throw new Error(`YouTube metadata fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
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

	async getThumbnailUrl(videoId: string, quality: 'default' | 'medium' | 'high' | 'maxres' = 'default'): Promise<string> {
		const qualityMap = {
			default: `https://img.youtube.com/vi/${videoId}/default.jpg`,
			medium: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
			high: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
			maxres: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
		}
		return qualityMap[quality]
	},

	// Additional YouTube-specific methods
	async getChannelVideos(channelId: string, _maxResults: number = 50): Promise<Array<{ id: string; title: string; url: string }>> {
		try {
			// Implementation would require YouTube API client
			// This is a placeholder for future enhancement
			console.log('Channel videos fetching not yet implemented')
			return []
		} catch (error) {
			console.error('Failed to fetch channel videos:', error)
			return []
		}
	},

	async searchVideos(query: string, _maxResults: number = 20): Promise<Array<{ id: string; title: string; url: string; thumbnail: string }>> {
		try {
			// Implementation would require YouTube API client
			// This is a placeholder for future enhancement
			console.log('Video search not yet implemented')
			return []
		} catch (error) {
			console.error('Failed to search videos:', error)
			return []
		}
	},

	// Cleanup method
	cleanup(): void {
		clientCache.clear()
	},
}