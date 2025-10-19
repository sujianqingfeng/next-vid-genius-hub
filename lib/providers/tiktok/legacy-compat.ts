import { spawn } from 'node:child_process'
import { resolveAwemeIdViaTikwm, fetchTikwmComments, mapTikwmCommentsToBasic, type TikwmComment } from './utils'
import type { TikTokBasicComment } from './types'

export interface TikTokInfo {
	title?: string
	uploader?: string
	uploader_id?: string
	thumbnails?: Array<{ url?: string }>
	thumbnail?: string
	view_count?: number
	like_count?: number
}

/**
 * Fetches metadata for a TikTok/Douyin video using yt-dlp.
 * Works for domains like tiktok.com, douyin.com, iesdouyin.com, v.douyin.com.
 */
export async function getTikTokInfo(url: string): Promise<TikTokInfo | null> {
	try {
		const stdout = await new Promise<string>((resolve, reject) => {
			const args = ['-J', url, '--no-playlist', '--no-warnings']
			const p = spawn('yt-dlp', args)
			let out = ''
			let err = ''
			p.stdout.on('data', (d) => (out += d.toString()))
			p.stderr.on('data', (d) => (err += d.toString()))
			p.on('close', (code) => {
				if (code === 0) resolve(out)
				else reject(new Error(err || `yt-dlp exit ${code}`))
			})
			p.on('error', reject)
		})
		const parsed = JSON.parse(stdout) as TikTokInfo
		return parsed
	} catch {
		return null
	}
}

export function pickTikTokThumbnail(
	info: TikTokInfo | null,
): string | undefined {
	if (!info) return undefined
	if (typeof info.thumbnail === 'string' && info.thumbnail.length > 0) {
		return info.thumbnail
	}
	const first = info.thumbnails?.find(
		(t) => typeof t.url === 'string' && t.url.length > 0,
	)
	return first?.url
}


export async function downloadTikTokCommentsByUrl(
	videoUrl: string,
	pages: number = 3,
): Promise<TikTokBasicComment[]> {
	const awemeId = await resolveAwemeIdViaTikwm(videoUrl)
	if (!awemeId) return []

	const results: TikTokBasicComment[] = []
	let cursor = 0
	for (let i = 0; i < pages; i++) {
		try {
			const data = await fetchTikwmComments(awemeId, cursor)
			const list: TikwmComment[] = Array.isArray(data?.data?.comments)
				? (data!.data!.comments as TikwmComment[])
				: []
			results.push(...mapTikwmCommentsToBasic(list))
			const hasMore = Boolean(data?.data?.has_more)
			const nextCursor = Number(data?.data?.cursor ?? 0)
			if (hasMore) {
				cursor = nextCursor
			} else {
				break
			}
		} catch {
			break
		}
	}
	return results
}
