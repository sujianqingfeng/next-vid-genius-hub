import type { BasicVideoInfo } from '~/lib/types/provider.types'
import type { VideoProviderContext } from '~/lib/media/providers'
import { getYouTubeClient } from './client'

export async function fetchYouTubeMetadata(
	url: string,
	context: VideoProviderContext = {}
): Promise<BasicVideoInfo | null> {
	try {
		const youtube = await getYouTubeClient({ proxy: context.proxyUrl })
		const videoId = extractVideoId(url)

		if (!videoId) {
			throw new Error('Invalid YouTube URL')
		}

		const info = await youtube.getBasicInfo(videoId)
		const primaryThumbnail = info.basic_info?.thumbnail?.find(
			(thumb) => typeof thumb?.url === 'string' && thumb.url.length > 0
		)?.url

		return {
			title: info.basic_info?.title,
			author: info.basic_info?.author,
			thumbnail: primaryThumbnail,
			thumbnails: info.basic_info?.thumbnail,
			viewCount: info.basic_info?.view_count,
			likeCount: info.basic_info?.like_count,
			source: 'youtube',
			raw: info,
		}
	} catch (error) {
		console.error('Failed to fetch YouTube metadata:', error)
		return null
	}
}

export function extractVideoId(url: string): string | null {
	// YouTube URL patterns
	const patterns = [
		/youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
		/youtu\.be\/([a-zA-Z0-9_-]{11})/,
		/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
	]

	for (const pattern of patterns) {
		const match = url.match(pattern)
		if (match && match[1]) {
			return match[1]
		}
	}

	return null
}