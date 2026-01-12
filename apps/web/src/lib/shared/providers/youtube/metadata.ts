'use server'

import { extractVideoId } from '@app/media-providers'
import { logger } from '~/lib/infra/logger'
import { MEDIA_SOURCES } from '~/lib/domain/media/source'
import type {
	BasicVideoInfo,
	VideoProviderContext,
} from '~/lib/shared/types/provider.types'
import { getYouTubeClient } from './client'

function parseHmsToSeconds(value: string): number | null {
	const raw = value.trim()
	if (!raw) return null
	if (!/^\d{1,2}(:\d{1,2}){1,2}$/.test(raw)) return null
	const parts = raw.split(':').map((p) => Number.parseInt(p, 10))
	if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null
	if (parts.length === 2) return parts[0] * 60 + parts[1]
	if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
	return null
}

function normalizeDurationSeconds(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
		return value
	}
	if (typeof value === 'string') {
		const asInt = Number.parseInt(value, 10)
		if (Number.isFinite(asInt) && asInt > 0) return asInt
		const hms = parseHmsToSeconds(value)
		if (typeof hms === 'number' && Number.isFinite(hms) && hms > 0) return hms
	}
	if (value && typeof value === 'object') {
		const obj = value as Record<string, unknown>
		const seconds = obj.seconds ?? obj.second ?? obj.sec
		const nested = normalizeDurationSeconds(seconds)
		if (nested) return nested
	}
	return undefined
}

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
		const duration =
			normalizeDurationSeconds((info as any)?.basic_info?.duration) ??
			normalizeDurationSeconds((info as any)?.basic_info?.duration_seconds) ??
			normalizeDurationSeconds((info as any)?.basic_info?.length_seconds) ??
			normalizeDurationSeconds((info as any)?.video_details?.durationSeconds) ??
			normalizeDurationSeconds((info as any)?.video_details?.lengthSeconds) ??
			normalizeDurationSeconds((info as any)?.video_details?.length_seconds)
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
			duration,
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
