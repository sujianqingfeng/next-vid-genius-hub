import { randomUUID } from 'node:crypto'
import { ProxyAgent, fetch as undiciFetch } from 'undici'
import { Innertube, UniversalCache } from 'youtubei.js'

function makeFetchWithProxy(proxyUrl) {
	const agent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined
	return async (input, init = {}) => {
		try {
			let url
			const opts = { ...(init || {}) }
			if (typeof input === 'string') {
				url = input
			} else if (input instanceof URL) {
				url = input.toString()
			} else if (input && typeof input === 'object') {
				const maybeUrl = input.url || input.href || input.toString?.()
				url = typeof maybeUrl === 'string' ? maybeUrl : String(maybeUrl)
				if (input.method && !opts.method) opts.method = input.method
				if (input.headers && !opts.headers) opts.headers = input.headers
				if (input.body && !opts.body) opts.body = input.body
			} else {
				url = String(input)
			}
			if (agent) opts.dispatcher = agent
			return await undiciFetch(url, opts)
		} catch {
			const opts = { ...(init || {}) }
			if (agent) opts.dispatcher = agent
			return undiciFetch(input, opts)
		}
	}
}

export function extractVideoId(url) {
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

async function getYouTubeClient(proxyUrl) {
	const cache = new UniversalCache(true)
	const fetchWithProxy = makeFetchWithProxy(proxyUrl)
	return Innertube.create({ cache, fetch: fetchWithProxy })
}

function cryptoRandomId() {
	try {
		return randomUUID()
	} catch {
		return Math.random().toString(36).slice(2)
	}
}

function mapYoutubeComment(item) {
	const c = item?.comment || item || {}
	return {
		id: c.id || cryptoRandomId(),
		content: (c.content && c.content.text) || '',
		author: (c.author && c.author.name) || '',
		likes: Number(c.like_count || 0) || 0,
		authorThumbnail: (c.author && c.author.thumbnails && c.author.thumbnails[0]?.url) || '',
		replyCount: c.reply_count || 0,
		translatedContent: '',
	}
}

export async function downloadYoutubeComments({ url, pages = 3, proxy }) {
	const youtube = await getYouTubeClient(proxy)
	const videoId = extractVideoId(url)
	if (!videoId) return []
	const commentsRoot = await youtube.getComments(videoId)
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

async function resolveAwemeIdViaTikwm(url, proxyUrl) {
	try {
		const _fetch = makeFetchWithProxy(proxyUrl)
		const endpoint = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`
		const r = await _fetch(endpoint, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
				Accept: 'application/json',
			},
		})
		if (!r.ok) return null
		const json = await r.json()
		const data = (json && json.data) || {}
		return data.aweme_id || data.awemeId || null
	} catch {
		return null
	}
}

async function fetchTikwmComments(awemeId, cursor, proxyUrl) {
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
		return await r.json()
	} catch {
		return {}
	}
}

export async function downloadTikTokCommentsByUrl({ url, pages = 3, proxy }) {
	const awemeId = await resolveAwemeIdViaTikwm(url, proxy)
	if (!awemeId) return []
	const results = []
	let cursor = 0
	for (let i = 0; i < pages; i++) {
		const data = await fetchTikwmComments(awemeId, cursor, proxy)
		const list = Array.isArray(data?.data?.comments) ? data.data.comments : []
		for (const c of list) {
			const id = String(c?.cid ?? c?.comment_id ?? c?.id ?? '')
			if (!id) continue
			const user = (c?.user || c?.user_info || {})
			const author = user?.nickname || user?.unique_id || user?.nick_name || 'Unknown'
			let avatarThumb
			if (user?.avatar_thumb && typeof user.avatar_thumb === 'object') {
				avatarThumb = user.avatar_thumb.url_list?.[0]
			} else if (typeof user?.avatar_thumb === 'string') {
				avatarThumb = user.avatar_thumb
			} else if (typeof user?.avatar === 'string') {
				avatarThumb = user.avatar
			}
			const content = String(c?.text ?? c?.content ?? '')
			const likes = Number.parseInt(String(c?.digg_count ?? c?.like_count ?? 0), 10) || 0
			const replyCount = Number.parseInt(String(c?.reply_comment_total ?? c?.reply_count ?? 0), 10) || 0
			results.push({ id, author, authorThumbnail: avatarThumb, content, likes, replyCount, translatedContent: '' })
		}
		const hasMore = Boolean(data?.data?.has_more)
		const nextCursor = Number.parseInt(String(data?.data?.cursor ?? 0), 10) || 0
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
