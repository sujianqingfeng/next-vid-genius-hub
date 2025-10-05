import type { Innertube } from 'youtubei.js'
import { extractVideoId } from '~/lib/youtube/utils'
import { getYouTubeClient } from '~/lib/youtube'
import type { BasicVideoInfo } from '../types'

import type { VideoProvider, VideoProviderContext } from './types'

const clientCache = new Map<string, Promise<Innertube>>()

async function resolveYouTubeClient(
	context: VideoProviderContext,
): Promise<Innertube> {
	const cacheKey = context.proxyUrl ?? 'default'
	const existing = clientCache.get(cacheKey)
	if (existing) {
		return existing
	}
	const clientPromise = getYouTubeClient({ proxy: context.proxyUrl }).catch(
		(error) => {
			clientCache.delete(cacheKey)
			throw error
		},
	)
	clientCache.set(cacheKey, clientPromise)
	return clientPromise
}

function isYouTubeUrl(url: string): boolean {
	const id = extractVideoId(url)
	return typeof id === 'string' && id.length > 0
}

export const youtubeProvider: VideoProvider = {
	id: 'youtube',
	matches: isYouTubeUrl,
	async fetchMetadata(url, context: VideoProviderContext) {
		const resolvedContext: VideoProviderContext = context ?? {}
		const videoId = extractVideoId(url) ?? url
		const youtube = await resolveYouTubeClient(resolvedContext)
		const info = await youtube.getBasicInfo(videoId)
		const primaryThumbnail = info.basic_info?.thumbnail?.find(
			(thumb): thumb is { url: string } =>
				typeof thumb?.url === 'string' && thumb.url.length > 0,
		)?.url
		const metadata: BasicVideoInfo<typeof info> = {
			title: info.basic_info?.title,
			author: info.basic_info?.author,
			thumbnail: primaryThumbnail,
			thumbnails: info.basic_info?.thumbnail,
			viewCount: info.basic_info?.view_count,
			likeCount: info.basic_info?.like_count,
			source: 'youtube',
			raw: info,
		}
		return metadata
	},
}
