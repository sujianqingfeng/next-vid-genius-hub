'use server'

import type { TikTokInfo } from './types'

/**
 * Fetches metadata for a TikTok/Douyin video using a lightweight HTTP endpoint.
 *
 * Notes:
 * - Cloudflare Workers (nodejs_compat) does not support spawning `yt-dlp`.
 * - This implementation prefers fetch-only metadata so it works in the Worker runtime.
 */
export async function fetchTikTokMetadata(
	url: string,
): Promise<TikTokInfo | null> {
	try {
		const endpoint = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`
		const res = await fetch(endpoint, {
			method: 'GET',
			headers: {
				Accept: 'application/json',
				'User-Agent':
					'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
				Referer: 'https://www.tikwm.com/',
			},
		})
		if (!res.ok) return null
		const json: any = await res.json().catch(() => null)
		const data: any = json?.data
		if (!data || typeof data !== 'object') return null

		const asString = (v: unknown): string | undefined =>
			typeof v === 'string' && v.trim() ? v : undefined
		const asNumber = (v: unknown): number | undefined => {
			if (typeof v === 'number' && Number.isFinite(v)) return v
			if (typeof v === 'string' && v.trim()) {
				const n = Number.parseFloat(v)
				if (Number.isFinite(n)) return n
			}
			return undefined
		}

		const thumbnail =
			asString(data.cover) ??
			asString(data.origin_cover) ??
			asString(data.dynamic_cover) ??
			asString(data.thumbnail)

		const uploader =
			asString(data.author?.nickname) ??
			asString(data.author?.unique_id) ??
			asString(data.author?.id) ??
			asString(data.author) ??
			asString(data.uploader)

		const durationRaw =
			asNumber(data.duration) ??
			asNumber(data.durationSeconds) ??
			asNumber(data.duration_seconds) ??
			asNumber(data.durationMs) ??
			asNumber(data.duration_ms)
		const duration =
			typeof durationRaw === 'number' && Number.isFinite(durationRaw)
				? durationRaw > 1000
					? Math.round(durationRaw / 1000)
					: durationRaw
				: undefined

		const viewCount =
			asNumber(data.play_count) ??
			asNumber(data.playCount) ??
			asNumber(data.view_count) ??
			asNumber(data.viewCount)

		const likeCount =
			asNumber(data.digg_count) ??
			asNumber(data.like_count) ??
			asNumber(data.likeCount)

		const info: TikTokInfo = {
			title: asString(data.title) ?? asString(data.desc),
			uploader,
			thumbnail,
			thumbnails: thumbnail ? [{ url: thumbnail }] : undefined,
			view_count: viewCount,
			like_count: likeCount,
			duration: typeof duration === 'number' && duration > 0 ? duration : undefined,
		}
		return info
	} catch {
		return null
	}
}
