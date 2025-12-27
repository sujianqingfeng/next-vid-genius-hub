import { eq } from 'drizzle-orm'
import { presignGetByKey } from '~/lib/cloudflare'
import { getDb, schema } from '~/lib/db'
import { TASK_KINDS } from '~/lib/job/task'
import { logger } from '~/lib/logger'
import type { CallbackPayload } from '../types'

type Db = Awaited<ReturnType<typeof getDb>>
type TaskLike = { id: string; targetId: string; kind: string } | null

type ChannelSyncMetadata = {
	channel?: { title?: string; thumbnail?: string }
	videos: Array<Record<string, unknown>>
}

function parseCommentsMetadata(raw: unknown): schema.Comment[] {
	if (!raw || typeof raw !== 'object') return []
	const obj = raw as Record<string, unknown>
	const rawComments = Array.isArray(obj.comments) ? obj.comments : []

	const toNumber = (value: unknown): number => {
		if (typeof value === 'number' && Number.isFinite(value)) return value
		if (typeof value === 'string' && value.trim()) {
			const parsed = Number(value)
			if (Number.isFinite(parsed)) return parsed
		}
		return 0
	}

	return rawComments
		.map((c) => (c && typeof c === 'object' ? (c as Record<string, unknown>) : {}))
		.map((c): schema.Comment => {
			return {
				id: String(c.id ?? ''),
				author: String(c.author ?? ''),
				authorThumbnail:
					typeof c.authorThumbnail === 'string' ? c.authorThumbnail : undefined,
				content: String(c.content ?? ''),
				translatedContent:
					typeof c.translatedContent === 'string' ? c.translatedContent : '',
				likes: toNumber(c.likes),
				replyCount: toNumber(c.replyCount),
			}
		})
}

function parseChannelSyncMetadata(raw: unknown): ChannelSyncMetadata {
	if (!raw || typeof raw !== 'object') return { videos: [] }
	const obj = raw as Record<string, unknown>

	const channelRaw = obj.channel
	const channel =
		channelRaw && typeof channelRaw === 'object'
			? {
					title:
						typeof (channelRaw as any).title === 'string'
							? String((channelRaw as any).title)
							: undefined,
					thumbnail:
						typeof (channelRaw as any).thumbnail === 'string'
							? String((channelRaw as any).thumbnail)
							: undefined,
				}
			: undefined

	const videos = Array.isArray(obj.videos)
		? (obj.videos as Array<unknown>)
				.filter((v) => v && typeof v === 'object')
				.map((v) => v as Record<string, unknown>)
		: []

	return { channel, videos }
}

function toDateOrUndefined(value: unknown): Date | undefined {
	if (value == null) return undefined
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? undefined : value
	}
	if (typeof value === 'number') {
		const ms = value < 1e12 ? value * 1000 : value
		const d = new Date(ms)
		return Number.isNaN(d.getTime()) ? undefined : d
	}
	if (typeof value === 'string' && value.trim()) {
		const d = new Date(value)
		return Number.isNaN(d.getTime()) ? undefined : d
	}
	return undefined
}

async function resolveMetadataUrlFromPayload(
	payload: CallbackPayload,
): Promise<string | null> {
	const urlFromStatus = payload.outputs?.metadata?.url
	if (urlFromStatus) return urlFromStatus

	const keyFromStatus = payload.outputs?.metadata?.key ?? null
	if (!keyFromStatus) return null

	try {
		return await presignGetByKey(keyFromStatus)
	} catch {
		return null
	}
}

export async function handleMediaDownloaderNonDownloadCallback(input: {
	db: Db
	payload: CallbackPayload & { engine: 'media-downloader' }
	task: TaskLike
	effectiveKind: string
}): Promise<Response> {
	const { db, payload, task, effectiveKind } = input

	if (effectiveKind === TASK_KINDS.COMMENTS_DOWNLOAD) {
		if (payload.status === 'completed') {
			const metadataUrl = await resolveMetadataUrlFromPayload(payload)
			if (!metadataUrl) {
				throw new Error(
					`comments-download missing metadata output job=${payload.jobId}`,
				)
			}
			const r = await fetch(metadataUrl)
			if (!r.ok) throw new Error(`Fetch comments failed: ${r.status}`)
			const json = (await r.json()) as unknown
			const comments = parseCommentsMetadata(json)
			const targetMediaId = task?.targetId || payload.mediaId
			await db
				.update(schema.media)
				.set({
					comments,
					commentCount: comments.length,
					commentsDownloadedAt: new Date(),
				})
				.where(eq(schema.media.id, targetMediaId))
		}

		return Response.json({ ok: true })
	}

	if (effectiveKind === TASK_KINDS.CHANNEL_SYNC) {
		if (!task?.targetId) {
			logger.warn(
				'api',
				`[cf-callback] channel-sync callback missing task targetId job=${payload.jobId}`,
			)
			return Response.json({ ok: true, ignored: true })
		}
		const where = eq(schema.channels.id, task.targetId)

		if (payload.status === 'completed') {
			const channel = await db.query.channels.findFirst({ where })

			const metadataUrl = await resolveMetadataUrlFromPayload(payload)
			if (!metadataUrl) {
				throw new Error(
					`channel-sync missing metadata output job=${payload.jobId}`,
				)
			}
			const r = await fetch(metadataUrl)
			if (!r.ok) throw new Error(`Fetch channel videos failed: ${r.status}`)
			const json = (await r.json()) as unknown
			const metadata = parseChannelSyncMetadata(json)
			const videos = metadata.videos

			for (const v of videos) {
				const vid: string = String(v.id ?? '')
				if (!vid) continue

				const title: string = String(v.title ?? '')
				const url: string =
					typeof v.url === 'string' && v.url.trim()
						? v.url
						: `https://www.youtube.com/watch?v=${vid}`

				const publishedRaw =
					v.publishedAt ?? v.published ?? v.date ?? v.publishedTimeText
				const publishedAt = toDateOrUndefined(publishedRaw)

				const thumb: string | undefined =
					typeof v.thumbnail === 'string'
						? v.thumbnail
						: Array.isArray(v.thumbnails) &&
							  typeof v.thumbnails[0]?.url === 'string'
							? String(v.thumbnails[0].url)
							: undefined

				const viewCount = typeof v.viewCount === 'number' ? v.viewCount : undefined
				const likeCount = typeof v.likeCount === 'number' ? v.likeCount : undefined

				await db
					.insert(schema.channelVideos)
					.values({
						channelId: task.targetId,
						videoId: vid,
						title,
						url,
						thumbnail: thumb ?? null,
						publishedAt: publishedAt ?? undefined,
						viewCount: viewCount ?? undefined,
						likeCount: likeCount ?? undefined,
						raw: v ? JSON.stringify(v) : undefined,
					})
					.onConflictDoNothing()
			}

			const updates: Record<string, unknown> = {
				lastSyncedAt: new Date(),
				lastSyncStatus: 'completed',
				updatedAt: new Date(),
			}
			const title =
				typeof metadata.channel?.title === 'string'
					? metadata.channel.title.trim()
					: ''
			if (title) updates.title = title
			const thumbnail =
				typeof metadata.channel?.thumbnail === 'string'
					? metadata.channel.thumbnail.trim()
					: ''
			if (thumbnail) updates.thumbnail = thumbnail
			// Preserve existing values when metadata is missing.
			if (!title && channel?.title) updates.title = channel.title
			if (!thumbnail && channel?.thumbnail) updates.thumbnail = channel.thumbnail

			await db.update(schema.channels).set(updates).where(where)
		} else if (payload.status === 'failed' || payload.status === 'canceled') {
			await db
				.update(schema.channels)
				.set({
					lastSyncStatus: 'failed',
					updatedAt: new Date(),
				})
				.where(where)
		}

		return Response.json({ ok: true })
	}

	if (effectiveKind === TASK_KINDS.METADATA_REFRESH) {
		if (payload.status === 'completed') {
			const meta = (payload.metadata ?? {}) as Record<string, unknown>
			const updates: Record<string, unknown> = {}

			const title = typeof meta.title === 'string' ? meta.title.trim() : ''
			const author = typeof meta.author === 'string' ? meta.author.trim() : ''
			const thumbnail =
				typeof meta.thumbnail === 'string' ? meta.thumbnail.trim() : ''
			const viewCount = typeof meta.viewCount === 'number' ? meta.viewCount : undefined
			const likeCount = typeof meta.likeCount === 'number' ? meta.likeCount : undefined

			if (title) updates.title = title
			if (author) updates.author = author
			if (thumbnail) updates.thumbnail = thumbnail
			if (typeof viewCount === 'number') updates.viewCount = viewCount
			if (typeof likeCount === 'number') updates.likeCount = likeCount

			const metadataKey = payload.outputs?.metadata?.key
			if (typeof metadataKey === 'string' && metadataKey.trim()) {
				updates.remoteMetadataKey = metadataKey.trim()
				updates.rawMetadataDownloadedAt = new Date()
			}

			const targetMediaId = task?.targetId || payload.mediaId
			if (Object.keys(updates).length > 0) {
				await db.update(schema.media).set(updates).where(eq(schema.media.id, targetMediaId))
			}
		}

		return Response.json({ ok: true })
	}

	logger.info(
		'api',
		`[cf-callback] non-download media-downloader job ignored job=${payload.jobId} kind=${effectiveKind}`,
	)
	return Response.json({ ok: true, ignored: true })
}
