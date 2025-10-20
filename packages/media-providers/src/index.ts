export interface BasicComment {
  id: string
  author: string
  authorThumbnail?: string
  content: string
  likes: number
  replyCount: number
  translatedContent: string
}

export interface CommentsDownloadParams {
  url: string
  pages?: number
  proxy?: string
}

import { ProxyAgent, fetch as undiciFetch } from 'undici'
import { Innertube, UniversalCache } from 'youtubei.js'

function makeFetchWithProxy(proxyUrl?: string) {
  const agent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined
  return async (input: any, init: any = {}) => {
    try {
      let url: string
      const opts: any = { ...(init || {}) }
      if (typeof input === 'string') {
        url = input
      } else if (input instanceof URL) {
        url = input.toString()
      } else if (input && typeof input === 'object') {
        const maybeUrl = (input as any).url || (input as any).href || (input as any).toString?.()
        url = typeof maybeUrl === 'string' ? maybeUrl : String(maybeUrl)
        if ((input as any).method && !opts.method) opts.method = (input as any).method
        if ((input as any).headers && !opts.headers) opts.headers = (input as any).headers
        if ((input as any).body && !opts.body) opts.body = (input as any).body
      } else {
        url = String(input)
      }
      if (agent) opts.dispatcher = agent
      return await undiciFetch(url, opts)
    } catch {
      const opts: any = { ...(init || {}) }
      if (agent) opts.dispatcher = agent
      return undiciFetch(input as any, opts)
    }
  }
}

export function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.replace(/^\//, '') || null
    }
    if (u.searchParams.get('v')) return u.searchParams.get('v')
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[0] === 'shorts' && parts[1]) return parts[1]
    return null
  } catch {
    return null
  }
}

async function getYouTubeClient(proxyUrl?: string) {
  const cache = new UniversalCache(true)
  const fetchWithProxy = makeFetchWithProxy(proxyUrl)
  return Innertube.create({ cache, fetch: fetchWithProxy as any })
}

function cryptoRandomId() {
  try {
    // Prefer Web Crypto if available (browser/Node >= 15+ w/ --experimental-global-webcrypto, Node 19+)
    const g: any = globalThis as any
    if (g?.crypto?.randomUUID) return g.crypto.randomUUID()
  } catch {}
  return Math.random().toString(36).slice(2)
}

function mapYoutubeComment(item: any): BasicComment {
  const c = item?.comment || item || {}
  return {
    id: (c as any).id || cryptoRandomId(),
    content: ((c as any).content && (c as any).content.text) || '',
    author: ((c as any).author && (c as any).author.name) || '',
    likes: Number((c as any).like_count || 0) || 0,
    authorThumbnail: ((c as any).author && (c as any).author.thumbnails && (c as any).author.thumbnails[0]?.url) || '',
    replyCount: (c as any).reply_count || 0,
    translatedContent: '',
  }
}

export async function downloadYoutubeComments({ url, pages = 3, proxy }: CommentsDownloadParams): Promise<BasicComment[]> {
  const youtube = await getYouTubeClient(proxy)
  const videoId = extractVideoId(url)
  if (!videoId) return []
  const commentsRoot: any = await youtube.getComments(videoId)
  const initial = commentsRoot?.contents || []
  if (!initial.length) return []
  let comments = initial.map(mapYoutubeComment)
  let current = commentsRoot
  let page = 1
  while (current.has_continuation && page < pages) {
    const next = await current.getContinuation()
    const list = next?.contents || []
    if (!list.length) break
    comments = comments.concat(list.map(mapYoutubeComment))
    current = next
    page++
  }
  return comments
}

async function resolveAwemeIdViaTikwm(url: string, proxyUrl?: string): Promise<string | null> {
  try {
    const _fetch = makeFetchWithProxy(proxyUrl)
    const endpoint = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`
    const r = await _fetch(endpoint, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
        Accept: 'application/json',
      },
    })
    if (!(r as any).ok) return null
    const json = await (r as any).json()
    const data = (json && json.data) || {}
    return (data as any).aweme_id || (data as any).awemeId || null
  } catch {
    return null
  }
}

async function fetchTikwmComments(awemeId: string, cursor: number, proxyUrl?: string): Promise<any> {
  const _fetch = makeFetchWithProxy(proxyUrl)
  const endpoint = `https://www.tikwm.com/api/comment/list/?aweme_id=${encodeURIComponent(awemeId)}&count=50&cursor=${cursor}`
  const r = await _fetch(endpoint, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
      Accept: 'application/json',
      Referer: 'https://www.tikwm.com/',
    },
  })
  try {
    return await (r as any).json()
  } catch {
    return {}
  }
}

export async function downloadTikTokCommentsByUrl({ url, pages = 3, proxy }: CommentsDownloadParams): Promise<BasicComment[]> {
  const awemeId = await resolveAwemeIdViaTikwm(url, proxy)
  if (!awemeId) return []
  const results: BasicComment[] = []
  let cursor = 0
  for (let i = 0; i < pages; i++) {
    const data: any = await fetchTikwmComments(awemeId, cursor, proxy)
    const list = Array.isArray(data?.data?.comments) ? data.data.comments : []
    for (const c of list) {
      const id = String((c as any)?.cid ?? (c as any)?.comment_id ?? (c as any)?.id ?? '')
      if (!id) continue
      const user: any = (c as any)?.user || (c as any)?.user_info || {}
      const author = user?.nickname || user?.unique_id || user?.nick_name || 'Unknown'
      let avatarThumb: string | undefined
      if (user?.avatar_thumb && typeof user.avatar_thumb === 'object') {
        avatarThumb = user.avatar_thumb.url_list?.[0]
      } else if (typeof user?.avatar_thumb === 'string') {
        avatarThumb = user.avatar_thumb
      } else if (typeof user?.avatar === 'string') {
        avatarThumb = user.avatar
      }
      const content = String((c as any)?.text ?? (c as any)?.content ?? '')
      const likes = Number.parseInt(String((c as any)?.digg_count ?? (c as any)?.like_count ?? 0), 10) || 0
      const replyCount = Number.parseInt(String((c as any)?.reply_comment_total ?? (c as any)?.reply_count ?? 0), 10) || 0
      results.push({ id, author, authorThumbnail: avatarThumb, content, likes, replyCount, translatedContent: '' })
    }
    const hasMore = Boolean((data as any)?.data?.has_more)
    const nextCursor = Number.parseInt(String((data as any)?.data?.cursor ?? 0), 10) || 0
    if (hasMore) cursor = nextCursor
    else break
  }
  return results
}

export default {
  extractVideoId,
  downloadYoutubeComments,
  downloadTikTokCommentsByUrl,
}
