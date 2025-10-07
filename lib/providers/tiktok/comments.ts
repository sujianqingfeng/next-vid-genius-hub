'use server'

export interface TikTokBasicComment {
	id: string
	author: string
	authorThumbnail?: string
	content: string
	likes: number
	replyCount?: number
}

async function resolveAwemeIdViaTikwm(url: string): Promise<string | null> {
	try {
		const res = await fetch(
			`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`,
			{
				headers: {
					'User-Agent':
						'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
					Accept: 'application/json',
				},
			},
		)
		if (!res.ok) return null

		type TikwmResolveResp = { data?: { aweme_id?: string; awemeId?: string } }
		const jsonUnknown = (await res.json()) as unknown
		const json = (jsonUnknown ?? {}) as TikwmResolveResp
		const awemeId: string | undefined =
			json.data?.aweme_id || json.data?.awemeId
		return awemeId ?? null
	} catch {
		return null
	}
}

type TikwmUser = {
	nickname?: string
	unique_id?: string
	nick_name?: string
	avatar_thumb?: { url_list?: string[] } | string
	avatar?: string
}

type TikwmComment = {
	cid?: string | number
	comment_id?: string | number
	id?: string | number
	user?: TikwmUser
	user_info?: TikwmUser
	text?: string
	content?: string
	digg_count?: number
	like_count?: number
	reply_comment_total?: number
	reply_count?: number
}

type TikwmCommentResp = {
	data?: {
		comments?: TikwmComment[]
		has_more?: boolean
		cursor?: number
	}
}

async function fetchTikwmComments(
	awemeId: string,
	cursor: number,
): Promise<TikwmCommentResp> {
	const url = `https://www.tikwm.com/api/comment/list/?aweme_id=${encodeURIComponent(
		awemeId,
	)}&count=50&cursor=${cursor}`

	const res = await fetch(url, {
		headers: {
			'User-Agent':
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
			Accept: 'application/json',
			Referer: 'https://www.tikwm.com/',
		},
	})

	const jsonUnknown = (await res.json()) as unknown
	const json: TikwmCommentResp = (jsonUnknown ?? {}) as TikwmCommentResp
	return json
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