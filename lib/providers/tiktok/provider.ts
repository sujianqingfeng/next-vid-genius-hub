import type { VideoProvider, VideoProviderContext, BasicVideoInfo } from '~/lib/types/provider.types'
import { fetchTikTokMetadata, pickTikTokThumbnail } from './metadata'
import { isTikTokUrl, extractTikTokVideoId } from './utils'
import { logger } from '~/lib/logger'
import { MEDIA_SOURCES } from '~/lib/media/source'

export const tiktokProvider: VideoProvider = {
	id: MEDIA_SOURCES.TIKTOK,
	name: 'TikTok',
	domains: ['tiktok.com', 'vm.tiktok.com', 'douyin.com', 'iesdouyin.com'],
	matches: isTikTokUrl,

    async fetchMetadata(url: string, _context: VideoProviderContext): Promise<BasicVideoInfo> {
        try {
            void _context;
            const tiktokInfo = await fetchTikTokMetadata(url)

			if (!tiktokInfo) {
				throw new Error('Failed to fetch TikTok metadata')
			}

			const thumbnail = pickTikTokThumbnail(tiktokInfo)

			return {
				title: tiktokInfo.title,
				author: tiktokInfo.uploader,
				thumbnail,
				thumbnails: tiktokInfo.thumbnails,
				viewCount: tiktokInfo.view_count,
				likeCount: tiktokInfo.like_count,
				source: MEDIA_SOURCES.TIKTOK,
				raw: tiktokInfo,
			}
        } catch (error) {
            logger.error('media', `TikTok metadata fetch error: ${error instanceof Error ? error.message : String(error)}`)
            throw new Error(`TikTok metadata fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
	},

	async validateUrl(url: string): Promise<boolean> {
		return isTikTokUrl(url)
	},

	async getVideoId(url: string): Promise<string | null> {
		return extractTikTokVideoId(url)
	},

	async getVideoUrl(videoId: string): Promise<string> {
		// TikTok URLs are more complex, we might need to fetch the actual URL
		// For now, return a placeholder
		return `https://www.tiktok.com/@unknown/video/${videoId}`
	},

	async getEmbedUrl(videoId: string): Promise<string> {
		// TikTok embed URLs
		return `https://www.tiktok.com/embed/v2/${videoId}`
	},

    async getThumbnailUrl(videoId: string, _quality: 'default' | 'medium' | 'high' = 'default'): Promise<string> {
        // TikTok thumbnails are not easily predictable from video ID
        // This is a placeholder implementation
        void _quality;
        return `https://p16-sign-va.tiktokcdn.com/obj/tos-maliva-p-0068/o${videoId}.jpeg`
    },

	// TikTok-specific methods
    async getTrendingVideos(_maxResults: number = 20): Promise<Array<{ id: string; title: string; url: string; thumbnail: string }>> {
        try {
            void _maxResults;
            // Implementation would require TikTok API or web scraping
            // This is a placeholder for future enhancement
            
            return []
        } catch (error) {
            logger.error('media', `Failed to fetch trending TikTok videos: ${error instanceof Error ? error.message : String(error)}`)
            return []
        }
    },

    async getUserVideos(username: string, _maxResults: number = 20): Promise<Array<{ id: string; title: string; url: string; thumbnail: string }>> {
        try {
            void username; void _maxResults;
            // Implementation would require TikTok API or web scraping
            // This is a placeholder for future enhancement
            
            return []
        } catch (error) {
            logger.error('media', `Failed to fetch user TikTok videos: ${error instanceof Error ? error.message : String(error)}`)
            return []
        }
    },

    async searchVideos(query: string, _maxResults: number = 20): Promise<Array<{ id: string; title: string; url: string; thumbnail: string }>> {
        try {
            void query; void _maxResults;
            // Implementation would require TikTok API or web scraping
            // This is a placeholder for future enhancement
            
            return []
        } catch (error) {
            logger.error('media', `Failed to search TikTok videos: ${error instanceof Error ? error.message : String(error)}`)
            return []
        }
    },

	async getComments(videoId: string, maxResults: number = 20): Promise<Array<{
		id: string
		text: string
		author: string
		timestamp: number
	}>> {
		try {
			const { downloadTikTokCommentsByUrl } = await import('./comments')
			// Convert videoId to URL for the comment downloader
			const url = `https://www.tiktok.com/@user/video/${videoId}`
			const comments = await downloadTikTokCommentsByUrl(url, Math.ceil(maxResults / 20)) // maxPages

			// Transform comments to match interface
			return comments.slice(0, maxResults).map(comment => ({
				id: comment.id,
				text: comment.content,
				author: comment.author,
				timestamp: Date.now() // Placeholder timestamp
			}))
        } catch (error) {
            logger.error('media', `Failed to fetch TikTok comments: ${error instanceof Error ? error.message : String(error)}`)
            return []
        }
	},

	// Cleanup method (if needed)
	cleanup(): void {
		// TikTok provider doesn't maintain a persistent client cache
	},
}
