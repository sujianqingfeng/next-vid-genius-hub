'use server'

import type { BasicVideoInfo } from '~/lib/types/provider.types'
import { logger } from '~/lib/logger'
import type { VideoProviderContext } from '~/lib/types/provider.types'
import { getYouTubeClient } from './client'
import { extractVideoId } from '@app/media-providers'

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
        logger.error('media', `Failed to fetch YouTube metadata: ${error instanceof Error ? error.message : String(error)}`)
        return null
    }
}
