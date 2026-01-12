'use server'

import { extractVideoId } from '@app/media-providers'
import { logger } from '~/lib/infra/logger'
import { MEDIA_SOURCES } from '~/lib/domain/media/source'
import type {
	BasicVideoInfo,
	VideoProviderContext,
} from '~/lib/shared/types/provider.types'

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

const YOUTUBE_HEADERS: Record<string, string> = {
	accept:
		'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
	'accept-language': 'en-US,en;q=0.9',
	'user-agent':
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
}

type PlayerResponseSummary = {
	videoDetails?: {
		title?: string
		author?: string
		viewCount?: string
		lengthSeconds?: string
		thumbnail?: { thumbnails?: Array<{ url?: string }> }
	}
}

async function fetchYouTubeWatchHtml(videoId: string): Promise<string> {
	const url = new URL('https://www.youtube.com/watch')
	url.searchParams.set('v', videoId)
	url.searchParams.set('hl', 'en')
	url.searchParams.set('gl', 'US')
	url.searchParams.set('has_verified', '1')

	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), 15_000)
	try {
		const res = await fetch(url.toString(), {
			method: 'GET',
			headers: YOUTUBE_HEADERS,
			cache: 'no-store',
			redirect: 'follow',
			signal: controller.signal,
		})
		if (!res.ok) {
			throw new Error(`YouTube watch fetch failed status=${res.status}`)
		}
		return await res.text()
	} finally {
		clearTimeout(timeout)
	}
}

function extractInitialPlayerResponse(html: string): PlayerResponseSummary | null {
	const marker = 'ytInitialPlayerResponse = '
	const start = html.indexOf(marker)
	if (start < 0) return null
	const jsonStart = start + marker.length
	const jsonEnd = html.indexOf(';</script>', jsonStart)
	if (jsonEnd < 0) return null
	const raw = html.slice(jsonStart, jsonEnd)
	try {
		return JSON.parse(raw) as PlayerResponseSummary
	} catch {
		return null
	}
}

function pickThumbnailUrl(
	thumbnails: Array<{ url?: string }> | undefined,
): string | undefined {
	if (!Array.isArray(thumbnails)) return undefined
	for (let i = thumbnails.length - 1; i >= 0; i--) {
		const url = thumbnails[i]?.url
		if (typeof url === 'string' && url.trim()) return url
	}
	return undefined
}

function parsePositiveInt(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
		return value
	}
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number.parseInt(value, 10)
		if (Number.isFinite(parsed) && parsed >= 0) return parsed
	}
	return undefined
}

export async function fetchYouTubeMetadata(
	url: string,
	context: VideoProviderContext = {},
): Promise<BasicVideoInfo | null> {
	try {
		const videoId = extractVideoId(url)

		if (!videoId) {
			throw new Error('Invalid YouTube URL')
		}

		// Cloudflare Workers runtime does not support Node-only YouTube clients
		// (youtubei.js / undici ProxyAgent). Use a lightweight HTML parse instead.
		// Note: `context.proxyUrl` is intentionally ignored in Workers.
		void context

		const html = await fetchYouTubeWatchHtml(videoId)
		const player = extractInitialPlayerResponse(html)
		const videoDetails = player?.videoDetails
		const duration =
			normalizeDurationSeconds(videoDetails?.lengthSeconds) ??
			(() => {
				const match = html.match(/"lengthSeconds"\s*:\s*"(\d+)"/)
				return normalizeDurationSeconds(match?.[1])
			})()

		const thumbnails = videoDetails?.thumbnail?.thumbnails
		const primaryThumbnail = pickThumbnailUrl(thumbnails)

		return {
			title: videoDetails?.title,
			author: videoDetails?.author,
			thumbnail: primaryThumbnail,
			thumbnails,
			viewCount: parsePositiveInt(videoDetails?.viewCount),
			likeCount: undefined,
			duration,
			source: MEDIA_SOURCES.YOUTUBE,
			raw: player ?? { videoId },
		}
	} catch (error) {
		logger.error(
			'media',
			`Failed to fetch YouTube metadata: ${error instanceof Error ? error.message : String(error)}`,
		)
		return null
	}
}
