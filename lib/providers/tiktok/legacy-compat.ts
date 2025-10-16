import YTDlpWrap from 'yt-dlp-wrap'
import { resolveAwemeIdViaTikwm, fetchTikwmComments, type TikwmUser, type TikwmComment } from './utils'
import type { TikTokBasicComment } from './comments'

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
	const ytdlp = new YTDlpWrap()
	try {
		const stdout = await ytdlp.execPromise([
			'-J',
			url,
			'--no-playlist',
			'--no-warnings',
		])
		const parsed = JSON.parse(stdout) as TikTokInfo
		return parsed
	} catch {
		// Return null if info cannot be fetched; caller can fallback
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
			for (const c of list) {
				const id = String(c?.cid ?? c?.comment_id ?? c?.id ?? '')
				if (!id) continue
				const user: TikwmUser =
					(c?.user as TikwmUser) ?? (c?.user_info as TikwmUser) ?? {}
				const author: string =
					user?.nickname ?? user?.unique_id ?? user?.nick_name ?? 'Unknown'
				let avatarThumb: string | undefined
				if (typeof user?.avatar_thumb === 'object') {
					avatarThumb = user.avatar_thumb.url_list?.[0]
				} else if (typeof user?.avatar_thumb === 'string') {
					avatarThumb = user.avatar_thumb
				} else if (typeof user?.avatar === 'string') {
					avatarThumb = user.avatar
				}
				const content: string = String(c?.text ?? c?.content ?? '')
				const likes: number = Number(c?.digg_count ?? c?.like_count ?? 0)
				const replyCount: number | undefined =
					c?.reply_comment_total ?? c?.reply_count ?? undefined
				results.push({
					id,
					author,
					authorThumbnail: avatarThumb,
					content,
					likes,
					replyCount,
				})
			}
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
