'use server'

import {
  resolveAwemeIdViaTikwm,
  fetchTikwmComments,
  type TikwmUser,
  type TikwmComment,
} from './utils'

export interface TikTokBasicComment {
	id: string
	author: string
	authorThumbnail?: string
	content: string
	likes: number
	replyCount?: number
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
