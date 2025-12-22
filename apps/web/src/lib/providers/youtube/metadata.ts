'use server'

import { extractVideoId } from '@app/media-providers'
import { logger } from '~/lib/logger'
import { MEDIA_SOURCES } from '~/lib/media/source'
import type {
	BasicVideoInfo,
	VideoProviderContext,
} from '~/lib/types/provider.types'
import { getYouTubeClient } from './client'

export async function fetchYouTubeMetadata(
	url: string,
	context: VideoProviderContext = {},
): Promise<BasicVideoInfo | null> {
	try {
		const youtube = await getYouTubeClient({ proxy: context.proxyUrl })
		const videoId = extractVideoId(url)

		if (!videoId) {
			throw new Error('Invalid YouTube URL')
		}

		const info = await youtube.getBasicInfo(videoId)
		const primaryThumbnail = info.basic_info?.thumbnail?.find(
			(thumb) => typeof thumb?.url === 'string' && thumb.url.length > 0,
		)?.url

		return {
			title: info.basic_info?.title,
			author: info.basic_info?.author,
			thumbnail: primaryThumbnail,
			thumbnails: info.basic_info?.thumbnail,
			viewCount: info.basic_info?.view_count,
			likeCount: info.basic_info?.like_count,
			source: MEDIA_SOURCES.YOUTUBE,
			raw: info,
		}
	} catch (error) {
		logger.error(
			'media',
			`Failed to fetch YouTube metadata: ${error instanceof Error ? error.message : String(error)}`,
		)
		return null
	}
}
