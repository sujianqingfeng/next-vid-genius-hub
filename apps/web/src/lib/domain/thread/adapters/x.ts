import { z } from 'zod'
import type {
	Thread,
	ThreadContentBlock,
	ThreadPost,
	ThreadSource,
} from '~/lib/domain/thread/types'
import { blocksToPlainText } from '~/lib/domain/thread/utils/plain-text'

const XAuthorSchema = z.object({
	displayName: z.string().catch(''),
	handle: z.string().catch(''),
	profileUrl: z.string().optional().catch(''),
})

const XMetricsSchema = z
	.object({
		replies: z.number().optional().catch(0),
		reposts: z.number().optional().catch(0),
		likes: z.number().optional().catch(0),
		bookmarks: z.number().optional().catch(0),
	})
	.catch({
		replies: 0,
		reposts: 0,
		likes: 0,
		bookmarks: 0,
	})

const XMediaSchema = z.object({
	type: z.string().catch(''),
	url: z.string().optional().catch(''),
	posterUrl: z.string().optional().catch(''),
	alt: z.string().optional().catch(''),
	m3u8Urls: z.array(z.string()).optional().catch([]),
	mp4Urls: z.array(z.string()).optional().catch([]),
})

const XMediaListSchema = z
	.preprocess(
		(value) => {
			if (value === undefined || value === null) return []
			return value
		},
		z.union([z.array(XMediaSchema), XMediaSchema.transform((x) => [x])]),
	)
	.catch([])

const XPostSchema = z.object({
	statusId: z.string(),
	url: z.string().optional().catch(''),
	author: XAuthorSchema,
	createdAt: z.string().optional().catch(''),
	text: z.string().optional().catch(''),
	metrics: XMetricsSchema.optional(),
	media: XMediaListSchema,
	isRoot: z.boolean().optional().catch(false),
})

const XThreadSchema = z.object({
	sourceUrl: z.string().optional().catch(''),
	total: z.number().optional().catch(0),
	root: XPostSchema,
	replies: z.array(XPostSchema).optional().catch([]),
	all: z.array(XPostSchema).optional().catch([]),
})

export type XThreadImportDraft = {
	source: ThreadSource
	sourceUrl: string | null
	sourceId: string | null
	title: string
	root: Omit<
		ThreadPost,
		'id' | 'threadId' | 'plainText' | 'createdAt' | 'editedAt'
	> & {
		sourcePostId: string
		createdAt: Date | null
		contentBlocks: ThreadContentBlock[]
	}
	replies: Array<
		Omit<
			ThreadPost,
			'id' | 'threadId' | 'plainText' | 'createdAt' | 'editedAt'
		> & {
			sourcePostId: string
			createdAt: Date | null
			contentBlocks: ThreadContentBlock[]
		}
	>
}

function stripLeadingAt(handle: string): string {
	return handle.replace(/^@+/, '')
}

function toDateOrNull(input: string): Date | null {
	const d = new Date(input)
	if (Number.isNaN(d.getTime())) return null
	return d
}

function makeTextBlock(text: string, id = 'text-0'): ThreadContentBlock {
	return { id, type: 'text', data: { text } }
}

function appendExternalMediaBlocks(
	blocks: ThreadContentBlock[],
	media: Array<z.infer<typeof XMediaSchema>> | null | undefined,
): ThreadContentBlock[] {
	const m = media ?? []
	let idx = 0

	function pickBestVideoUrl(item: z.infer<typeof XMediaSchema>): string {
		const direct = String(item.url || '').trim()
		if (direct) return direct

		const m3u8s = (item.m3u8Urls ?? [])
			.map((u) => String(u || '').trim())
			.filter(Boolean)

		// Twitter amplify_video "mp4" links can be init segments (hundreds of bytes)
		// referenced from HLS playlists. Prefer m3u8 when available.
		const isAmplifyVideo = (u: string) => u.includes('video.twimg.com/amplify_video/')
		if (m3u8s.length > 0 && m3u8s.some(isAmplifyVideo)) {
			const master =
				m3u8s.find((u) => u.includes('/pl/_') && u.includes('.m3u8')) ??
				m3u8s.find((u) => u.includes('variant_version=') && u.includes('.m3u8'))
			if (master) return master

			const withRes = m3u8s
				.map((u) => {
					const m = u.match(/\/pl\/avc1\/(\d+)x(\d+)\//)
					if (!m) return null
					const w = Number(m[1])
					const h = Number(m[2])
					if (!Number.isFinite(w) || !Number.isFinite(h)) return null
					return { u, score: w * h }
				})
				.filter(Boolean) as Array<{ u: string; score: number }>

			if (withRes.length > 0) {
				withRes.sort((a, b) => b.score - a.score)
				return withRes[0]!.u
			}

			return m3u8s[0]!
		}

		const mp4s = (item.mp4Urls ?? [])
			.map((u) => String(u || '').trim())
			.filter(Boolean)

		if (mp4s.length > 0) {
			const looksLikeVideo = (u: string) =>
				u.includes('/vid/') ||
				u.includes('/video/') ||
				(u.endsWith('.mp4') && !u.includes('/aud/'))
			const preferred = mp4s.find(looksLikeVideo) ?? mp4s[0]!
			return preferred
		}

		const m3u8 = m3u8s[0] ?? ''
		return String(m3u8 || '').trim()
	}

	for (const item of m) {
		const type = String(item.type || '').toLowerCase()
		if (type === 'image') {
			const url = String(item.url || item.posterUrl || '').trim()
			if (!url) continue
			blocks.push({
				id: `media-${idx++}`,
				type: 'image',
				data: { assetId: `ext:${url}`, caption: item.alt || undefined },
			})
		} else if (type === 'video') {
			const posterUrl = String(item.posterUrl || '').trim()
			const url = pickBestVideoUrl(item)
			if (url) {
				blocks.push({
					id: `media-${idx++}`,
					type: 'video',
					data: {
						assetId: `ext:${url}`,
						title: item.alt || undefined,
						posterUrl: posterUrl || undefined,
					},
				})
			} else if (posterUrl) {
				blocks.push({
					id: `media-${idx++}`,
					type: 'image',
					data: {
						assetId: `ext:${posterUrl}`,
						caption: item.alt || 'Video',
					},
				})
			}
		}
	}

	return blocks
}

export function parseXThreadImportDraft(input: unknown): XThreadImportDraft {
	const parsed = XThreadSchema.parse(input)
	const root = parsed.root

	const sourceUrl = (root.url || parsed.sourceUrl || '').trim() || null
	const sourceId = root.statusId || null
	const title = (root.text || '').trim() || sourceUrl || 'X Thread'

	const rootBlocks = appendExternalMediaBlocks(
		[makeTextBlock(String(root.text || ''))],
		root.media,
	)

	const parsedReplies = parsed.replies ?? []
	const parsedAll = parsed.all ?? []

	const replies =
		parsedReplies.length > 0
			? parsedReplies
			: parsedAll.filter((p) => p.statusId !== root.statusId && !p.isRoot)

	return {
		source: 'x',
		sourceUrl,
		sourceId,
		title: title.length > 200 ? title.slice(0, 200) : title,
		root: {
			sourcePostId: root.statusId,
			role: 'root',
			author: {
				name:
					root.author.displayName ||
					stripLeadingAt(root.author.handle) ||
					'Unknown',
				handle: root.author.handle || undefined,
				profileUrl: root.author.profileUrl || undefined,
			},
			createdAt: root.createdAt ? toDateOrNull(root.createdAt) : null,
			contentBlocks: rootBlocks,
			metrics: {
				likes: Number(root.metrics?.likes ?? 0) || 0,
				replies: Number(root.metrics?.replies ?? 0) || 0,
				reposts: Number(root.metrics?.reposts ?? 0) || 0,
				bookmarks: Number(root.metrics?.bookmarks ?? 0) || 0,
			},
			depth: 0,
			parentSourcePostId: null,
			raw: parsed.root,
		},
		replies: replies.map((p, idx) => {
			const blocks = appendExternalMediaBlocks(
				[makeTextBlock(String(p.text || ''), `text-${idx}`)],
				p.media,
			)
			return {
				sourcePostId: p.statusId,
				role: 'reply',
				author: {
					name:
						p.author.displayName ||
						stripLeadingAt(p.author.handle) ||
						'Unknown',
					handle: p.author.handle || undefined,
					profileUrl: p.author.profileUrl || undefined,
				},
				createdAt: p.createdAt ? toDateOrNull(p.createdAt) : null,
				contentBlocks: blocks,
				metrics: {
					likes: Number(p.metrics?.likes ?? 0) || 0,
					replies: Number(p.metrics?.replies ?? 0) || 0,
					reposts: Number(p.metrics?.reposts ?? 0) || 0,
					bookmarks: Number(p.metrics?.bookmarks ?? 0) || 0,
				},
				depth: 1,
				parentSourcePostId: null,
				raw: p,
			}
		}),
	}
}

export function buildThreadInsertFromDraft(input: {
	id: string
	userId: string
	now: Date
	draft: XThreadImportDraft
}): Thread {
	return {
		id: input.id,
		userId: input.userId,
		source: input.draft.source,
		sourceUrl: input.draft.sourceUrl,
		sourceId: input.draft.sourceId,
		title: input.draft.title,
		lang: null,
		templateId: null,
		templateConfig: null,
		createdAt: input.now,
		updatedAt: input.now,
	}
}

export function buildThreadPostsInsertFromDraft(input: {
	threadId: string
	draft: XThreadImportDraft
}): Array<Omit<ThreadPost, 'id'>> {
	const root: Omit<ThreadPost, 'id'> = {
		threadId: input.threadId,
		sourcePostId: input.draft.root.sourcePostId,
		role: 'root',
		author: input.draft.root.author,
		createdAt: input.draft.root.createdAt,
		editedAt: null,
		contentBlocks: input.draft.root.contentBlocks,
		plainText: blocksToPlainText(input.draft.root.contentBlocks),
		metrics: input.draft.root.metrics ?? null,
		depth: 0,
		parentSourcePostId: null,
		raw: input.draft.root.raw,
	}

	const replies = input.draft.replies.map<Omit<ThreadPost, 'id'>>((r) => ({
		threadId: input.threadId,
		sourcePostId: r.sourcePostId,
		role: 'reply',
		author: r.author,
		createdAt: r.createdAt,
		editedAt: null,
		contentBlocks: r.contentBlocks,
		plainText: blocksToPlainText(r.contentBlocks),
		metrics: r.metrics ?? null,
		depth: 1,
		parentSourcePostId: null,
		raw: r.raw,
	}))

	return [root, ...replies]
}
