'use server'

import {
  resolveAwemeIdViaTikwm,
  fetchTikwmComments,
  type TikwmComment,
  mapTikwmCommentsToBasic,
} from './utils'
import type { TikTokBasicComment } from './types'

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
