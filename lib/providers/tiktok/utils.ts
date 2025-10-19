import type { TikTokBasicComment } from './types'

export function extractTikTokVideoId(url: string): string | null {
	const patterns = [
		/tiktok\.com\/@[\w.-]+\/video\/(\d+)/,
		/tiktok\.com\/t\/(\w+)/,
		/vm\.tiktok\.com\/(\w+)/,
		/douyin\.com\/video\/(\d+)/,
		/iesdouyin\.com\/share\/video\/(\d+)/,
	]

	for (const pattern of patterns) {
		const match = url.match(pattern)
		if (match && match[1]) {
			return match[1]
		}
	}

	return null
}

export function isTikTokUrl(url: string): boolean {
	const tiktokPatterns = [
		/tiktok\.com\/@[\w.-]+\/video\/[\d]+/,
		/tiktok\.com\/t\/[\w]+/,
		/vm\.tiktok\.com\/[\w]+/,
		/douyin\.com\/video\/[\d]+/,
		/iesdouyin\.com\/share\/video\/[\d]+/,
	]

	return tiktokPatterns.some(pattern => pattern.test(url))
}

// ---------- Shared TikWM helpers/types (used by comments & legacy-compat) ----------

export type TikwmUser = {
  nickname?: string
  unique_id?: string
  nick_name?: string
  avatar_thumb?: { url_list?: string[] } | string
  avatar?: string
}

export type TikwmComment = {
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

export type TikwmCommentResp = {
  data?: {
    comments?: TikwmComment[]
    has_more?: boolean
    cursor?: number
  }
}

export async function resolveAwemeIdViaTikwm(url: string): Promise<string | null> {
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
    const jsonUnknown = (await res.json()) as unknown
    const json = (jsonUnknown ?? {}) as { data?: { aweme_id?: string; awemeId?: string } }
    return json.data?.aweme_id || json.data?.awemeId || null
  } catch {
    return null
  }
}

export async function fetchTikwmComments(
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
  return (jsonUnknown ?? {}) as TikwmCommentResp
}

export function normalizeTikwmComment(comment: TikwmComment): TikTokBasicComment | null {
  const id = String(comment?.cid ?? comment?.comment_id ?? comment?.id ?? '')
  if (!id) return null

  const user: TikwmUser =
    (comment?.user as TikwmUser) ?? (comment?.user_info as TikwmUser) ?? {}

  const author =
    user?.nickname ?? user?.unique_id ?? user?.nick_name ?? 'Unknown'

  let avatarThumb: string | undefined
  if (typeof user?.avatar_thumb === 'object') {
    avatarThumb = user.avatar_thumb.url_list?.[0]
  } else if (typeof user?.avatar_thumb === 'string') {
    avatarThumb = user.avatar_thumb
  } else if (typeof user?.avatar === 'string') {
    avatarThumb = user.avatar
  }

  const content: string = String(comment?.text ?? comment?.content ?? '')
  const likes: number = Number(comment?.digg_count ?? comment?.like_count ?? 0)
  const replyCount: number | undefined =
    comment?.reply_comment_total ?? comment?.reply_count ?? undefined

  return {
    id,
    author,
    authorThumbnail: avatarThumb,
    content,
    likes,
    replyCount,
  }
}

export function mapTikwmCommentsToBasic(list: TikwmComment[]): TikTokBasicComment[] {
  const normalized: TikTokBasicComment[] = []
  for (const comment of list) {
    const basic = normalizeTikwmComment(comment)
    if (basic) normalized.push(basic)
  }
  return normalized
}
