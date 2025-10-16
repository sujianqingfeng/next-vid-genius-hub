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
