import { and, eq, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm'
import { getJobStatus, presignGetByKey } from '~/lib/cloudflare'
import { getDb, schema } from '~/lib/db'
import { logger } from '~/lib/logger'
import { recordJobEvent } from '~/lib/job/events'
import { TASK_KINDS } from './task'

type JsonRecord = Record<string, unknown>

const TERMINAL_STATUSES = ['completed', 'failed', 'canceled'] as const
type TerminalStatus = (typeof TERMINAL_STATUSES)[number]

const DEFAULT_MAX_TASKS_PER_RUN = 25
const DEFAULT_MIN_TASK_AGE_MS = 60_000
const DEFAULT_MIN_LAST_UPDATE_AGE_MS = 30_000
const DEFAULT_FETCH_TIMEOUT_MS = 15_000

function isTerminalStatus(status: unknown): status is TerminalStatus {
	return (
		typeof status === 'string' &&
		(TERMINAL_STATUSES as readonly string[]).includes(status)
	)
}

function parseJsonish(value: unknown): unknown {
	if (!value) return null
	if (typeof value === 'object') return value
	if (typeof value === 'string') {
		try {
			return JSON.parse(value)
		} catch {
			return null
		}
	}
	return null
}

function mergeReconcilerSnapshot(
	task: { jobStatusSnapshot?: unknown },
	patch: {
		runId?: string
		checkedAt: number
		status?: string
		progress?: number | null
		error?: string | null
		phase?: string | null
		compensations?: Array<{ kind: string; at: number; ok: boolean; msg?: string }>
	},
): JsonRecord {
	const current = parseJsonish(task.jobStatusSnapshot)
	const root =
		current && typeof current === 'object'
			? (current as JsonRecord)
			: ({} as JsonRecord)
	const rec =
		root.reconciler && typeof root.reconciler === 'object'
			? (root.reconciler as JsonRecord)
			: {}
	const prevComps = Array.isArray((rec as any).compensations)
		? (((rec as any).compensations as unknown[]) || []).filter(
				(x) => x && typeof x === 'object',
			)
		: []

	return {
		...root,
		reconciler: {
			...rec,
			lastRunId: patch.runId ?? rec.lastRunId ?? null,
			lastCheckedAt: patch.checkedAt,
			lastStatus: patch.status ?? rec.lastStatus ?? null,
			lastProgress: patch.progress ?? rec.lastProgress ?? null,
			lastError: patch.error ?? rec.lastError ?? null,
			lastPhase: patch.phase ?? rec.lastPhase ?? null,
			compensations:
				patch.compensations && patch.compensations.length > 0
					? [...prevComps, ...patch.compensations]
					: prevComps,
		},
	}
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number) {
	const controller =
		typeof AbortController !== 'undefined' ? new AbortController() : null
	const timeout = setTimeout(() => controller?.abort(), timeoutMs)
	try {
		const res = await fetch(url, { signal: controller?.signal, cache: 'no-store' })
		if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
		return (await res.json()) as unknown
	} finally {
		clearTimeout(timeout)
	}
}

function parseChannelSyncMetadata(raw: unknown): {
	channel?: { title?: string; thumbnail?: string }
	videos: Array<Record<string, unknown>>
} {
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
		? (obj.videos as unknown[]).filter((v) => v && typeof v === 'object')
		: []

	return { channel, videos: videos as Array<Record<string, unknown>> }
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
		.map((c) =>
			c && typeof c === 'object' ? (c as Record<string, unknown>) : {},
		)
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
	if (typeof value === 'string') {
		const d = new Date(value)
		return Number.isNaN(d.getTime()) ? undefined : d
	}
	if (typeof value === 'object') {
		const obj = value as { [key: string]: unknown }
		const ts = obj.timestamp ?? obj.seconds ?? obj.ms
		if (typeof ts === 'number') {
			const d = new Date(ts < 1e12 ? ts * 1000 : ts)
			return Number.isNaN(d.getTime()) ? undefined : d
		}
	}
	return undefined
}

async function resolveMetadataUrlFromStatus(status: {
	outputs?: { metadata?: { url?: string; key?: string } }
	outputMetadataKey?: string
}): Promise<string | null> {
	const urlFromStatus = status.outputs?.metadata?.url
	if (urlFromStatus) return urlFromStatus
	const keyFromStatus = status.outputs?.metadata?.key ?? status.outputMetadataKey
	if (!keyFromStatus) return null
	try {
		return await presignGetByKey(keyFromStatus)
	} catch {
		return null
	}
}

async function compensateChannelSync(opts: {
	task: typeof schema.tasks.$inferSelect
	status: Awaited<ReturnType<typeof getJobStatus>>
	timeoutMs: number
}): Promise<{ ok: boolean; msg?: string }> {
	const { task, status, timeoutMs } = opts
	const channelId = task.targetId
	const db = await getDb()
	const channel = await db.query.channels.findFirst({
		where: eq(schema.channels.id, channelId),
	})
	if (!channel) return { ok: false, msg: 'channel_not_found' }

	// Avoid applying stale results if a newer job has been started and already completed.
	if (channel.lastJobId && channel.lastJobId !== task.jobId) {
		return { ok: true, msg: 'skipped_newer_job_present' }
	}

	if (status.status === 'failed' || status.status === 'canceled') {
		await db
			.update(schema.channels)
			.set({ lastSyncStatus: 'failed', updatedAt: new Date() })
			.where(eq(schema.channels.id, channelId))
		return { ok: true, msg: 'marked_failed' }
	}

	if (status.status !== 'completed') return { ok: false, msg: 'not_completed' }

	const metadataUrl = await resolveMetadataUrlFromStatus(status)
	if (!metadataUrl) return { ok: false, msg: 'missing_metadata_output' }

	const json = await fetchJsonWithTimeout(metadataUrl, timeoutMs)
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

		const publishedRaw = v.publishedAt ?? v.published ?? v.date ?? v.publishedTimeText
		const publishedAt = toDateOrUndefined(publishedRaw)

		const thumb: string | undefined =
			typeof v.thumbnail === 'string'
				? v.thumbnail
				: Array.isArray((v as any).thumbnails) &&
					  typeof (v as any).thumbnails?.[0]?.url === 'string'
					? String((v as any).thumbnails[0].url)
					: undefined

		const viewCount =
			typeof v.viewCount === 'number' ? (v.viewCount as number) : undefined
		const likeCount =
			typeof v.likeCount === 'number' ? (v.likeCount as number) : undefined

		await db
			.insert(schema.channelVideos)
			.values({
				channelId,
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
	const nextTitle =
		typeof metadata.channel?.title === 'string' ? metadata.channel.title.trim() : ''
	if (nextTitle) updates.title = nextTitle
	const nextThumb =
		typeof metadata.channel?.thumbnail === 'string'
			? metadata.channel.thumbnail.trim()
			: ''
	if (nextThumb) updates.thumbnail = nextThumb

	await db.update(schema.channels).set(updates).where(eq(schema.channels.id, channelId))
	return { ok: true }
}

async function compensateCommentsDownload(opts: {
	task: typeof schema.tasks.$inferSelect
	status: Awaited<ReturnType<typeof getJobStatus>>
	timeoutMs: number
}): Promise<{ ok: boolean; msg?: string }> {
	const { task, status, timeoutMs } = opts
	if (status.status !== 'completed') return { ok: false, msg: 'not_completed' }
	const metadataUrl = await resolveMetadataUrlFromStatus(status)
	if (!metadataUrl) return { ok: false, msg: 'missing_metadata_output' }

	const db = await getDb()
	const mediaId = task.targetId
	const media = await db.query.media.findFirst({ where: eq(schema.media.id, mediaId) })
	if (!media) return { ok: false, msg: 'media_not_found' }

	// Skip if the media already has a newer commentsDownloadedAt than this task.
	if (
		media.commentsDownloadedAt &&
		task.updatedAt &&
		media.commentsDownloadedAt.getTime() >= task.updatedAt.getTime()
	) {
		return { ok: true, msg: 'skipped_already_applied' }
	}

	const json = await fetchJsonWithTimeout(metadataUrl, timeoutMs)
	const comments = parseCommentsMetadata(json)
	await db
		.update(schema.media)
		.set({
			comments,
			commentCount: comments.length,
			commentsDownloadedAt: new Date(),
		})
		.where(eq(schema.media.id, mediaId))
	return { ok: true }
}

export async function runScheduledTaskReconciler(opts?: {
	maxTasksPerRun?: number
	minTaskAgeMs?: number
	minLastUpdateAgeMs?: number
	fetchTimeoutMs?: number
}): Promise<void> {
	const startedAt = Date.now()
	const runId = `recon_${startedAt}_${Math.random().toString(36).slice(2, 8)}`

	let scanned = 0
	let wroteTasks = 0
	let statusChanges = 0
	let terminalized = 0
	let compensationAttempts = 0
	let compensationOk = 0
	let failures = 0

	try {
		const maxTasks = opts?.maxTasksPerRun ?? DEFAULT_MAX_TASKS_PER_RUN
		const minTaskAgeMs = opts?.minTaskAgeMs ?? DEFAULT_MIN_TASK_AGE_MS
		const minLastUpdateAgeMs =
			opts?.minLastUpdateAgeMs ?? DEFAULT_MIN_LAST_UPDATE_AGE_MS
		const fetchTimeoutMs = opts?.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS

		const db = await getDb()
		const now = Date.now()
		const createdCutoff = new Date(now - minTaskAgeMs)
		const updatedCutoff = new Date(now - minLastUpdateAgeMs)

		const candidates = await db.query.tasks.findMany({
			where: and(
				isNotNull(schema.tasks.jobId),
				isNull(schema.tasks.finishedAt),
				or(
					isNull(schema.tasks.createdAt),
					lt(schema.tasks.createdAt, createdCutoff),
				),
				or(
					isNull(schema.tasks.updatedAt),
					lt(schema.tasks.updatedAt, updatedCutoff),
				),
				inArray(schema.tasks.kind, [
					TASK_KINDS.DOWNLOAD,
					TASK_KINDS.METADATA_REFRESH,
					TASK_KINDS.COMMENTS_DOWNLOAD,
					TASK_KINDS.RENDER_COMMENTS,
					TASK_KINDS.RENDER_SUBTITLES,
					TASK_KINDS.CHANNEL_SYNC,
					TASK_KINDS.ASR,
				]),
			),
			limit: maxTasks,
			orderBy: (t, { desc }) => [desc(t.createdAt)],
		})

		if (candidates.length === 0) return

		for (const task of candidates) {
			const jobId = task.jobId
			if (!jobId) continue
			scanned += 1

			try {
				const controller =
					typeof AbortController !== 'undefined' ? new AbortController() : null
				const timeout = setTimeout(() => controller?.abort(), fetchTimeoutMs)
				let status: Awaited<ReturnType<typeof getJobStatus>>
				try {
					status = await getJobStatus(jobId, { signal: controller?.signal })
				} finally {
					clearTimeout(timeout)
				}

				const progressPct =
					typeof status.progress === 'number' && Number.isFinite(status.progress)
						? Math.round(
								Math.max(0, Math.min(1, status.progress as number)) * 100,
							)
						: null

				const checkedAt = Date.now()
				const nextSnapshot = mergeReconcilerSnapshot(task, {
					runId,
					checkedAt,
					status: status.status,
					progress: progressPct,
					error: status.message ?? null,
					phase: status.phase ?? null,
				})

				const nextStatus = status.status
				const terminal = isTerminalStatus(nextStatus)

				wroteTasks += 1
				if (task.status !== nextStatus) statusChanges += 1

				const updates: Record<string, unknown> = {
					status: nextStatus,
					updatedAt: new Date(),
					jobStatusSnapshot: nextSnapshot,
				}

				if (terminal) {
					terminalized += 1
					updates.finishedAt = new Date()
					updates.progress = nextStatus === 'completed' ? 100 : task.progress
					if (typeof status.message === 'string' && status.message.trim()) {
						updates.error = status.message.trim()
					}
				} else if (progressPct != null) {
					updates.progress = progressPct
				}

				await db
					.update(schema.tasks)
					.set(updates)
					.where(eq(schema.tasks.id, task.id))

				await recordJobEvent({
					db,
					source: 'reconciler',
					kind: 'status-check',
					eventKey: `reconciler:${runId}:${task.id}:status`,
					jobId,
					taskId: task.id,
					purpose: task.kind,
					status: nextStatus,
					eventTs: Date.now(),
					message: status.message ?? null,
					payload: {
						runId,
						taskId: task.id,
						kind: task.kind,
						prevStatus: task.status ?? null,
						nextStatus,
						phase: status.phase ?? null,
						progress: status.progress ?? null,
					},
				})

				if (terminal && task.kind === TASK_KINDS.CHANNEL_SYNC) {
					compensationAttempts += 1
					let comp: { ok: boolean; msg?: string } = { ok: false }
					try {
						comp = await compensateChannelSync({
							task,
							status,
							timeoutMs: fetchTimeoutMs,
						})
					} catch (e) {
						comp = { ok: false, msg: e instanceof Error ? e.message : String(e) }
					}
					if (comp.ok) compensationOk += 1

					const compSnapshot = mergeReconcilerSnapshot(
						{ jobStatusSnapshot: nextSnapshot },
						{
							runId,
							checkedAt: Date.now(),
							compensations: [
								{
									kind: 'channel-sync',
									at: Date.now(),
									ok: comp.ok,
									msg: comp.msg,
								},
							],
						},
					)
					await db
						.update(schema.tasks)
						.set({
							jobStatusSnapshot: compSnapshot,
							updatedAt: new Date(),
						})
						.where(eq(schema.tasks.id, task.id))

					await recordJobEvent({
						db,
						source: 'reconciler',
						kind: 'compensate-channel-sync',
						eventKey: `reconciler:${runId}:${task.id}:comp:channel-sync`,
						jobId,
						taskId: task.id,
						purpose: task.kind,
						status: nextStatus,
						eventTs: Date.now(),
						message: comp.msg ?? null,
						payload: { runId, ok: comp.ok, msg: comp.msg ?? null },
					})
				}

				if (terminal && task.kind === TASK_KINDS.COMMENTS_DOWNLOAD) {
					compensationAttempts += 1
					let comp: { ok: boolean; msg?: string } = { ok: false }
					try {
						comp = await compensateCommentsDownload({
							task,
							status,
							timeoutMs: fetchTimeoutMs,
						})
					} catch (e) {
						comp = { ok: false, msg: e instanceof Error ? e.message : String(e) }
					}
					if (comp.ok) compensationOk += 1

					const compSnapshot = mergeReconcilerSnapshot(
						{ jobStatusSnapshot: nextSnapshot },
						{
							runId,
							checkedAt: Date.now(),
							compensations: [
								{
									kind: 'comments-download',
									at: Date.now(),
									ok: comp.ok,
									msg: comp.msg,
								},
							],
						},
					)
					await db
						.update(schema.tasks)
						.set({
							jobStatusSnapshot: compSnapshot,
							updatedAt: new Date(),
						})
						.where(eq(schema.tasks.id, task.id))

					await recordJobEvent({
						db,
						source: 'reconciler',
						kind: 'compensate-comments-download',
						eventKey: `reconciler:${runId}:${task.id}:comp:comments-download`,
						jobId,
						taskId: task.id,
						purpose: task.kind,
						status: nextStatus,
						eventTs: Date.now(),
						message: comp.msg ?? null,
						payload: { runId, ok: comp.ok, msg: comp.msg ?? null },
					})
				}
			} catch (e) {
				failures += 1
				const msg = e instanceof Error ? e.message : String(e)
				try {
					await recordJobEvent({
						db,
						source: 'reconciler',
						kind: 'error',
						eventKey: `reconciler:${runId}:${task.id}:error`,
						jobId,
						taskId: task.id,
						purpose: task.kind,
						status: task.status ?? null,
						eventTs: Date.now(),
						message: msg,
						payload: { runId },
					})
				} catch {}
				logger.warn('api', `[reconciler] run=${runId} job=${jobId} task=${task.id} ${msg}`)
			}
		}
	} catch (e) {
		failures += 1
		const msg = e instanceof Error ? e.message : String(e)
		logger.error('api', `[reconciler] run=${runId} fatal ${msg}`)
	} finally {
		const tookMs = Date.now() - startedAt
		logger.info(
			'api',
			`[reconciler] run=${runId} tookMs=${tookMs} scanned=${scanned} wroteTasks=${wroteTasks} statusChanges=${statusChanges} terminalized=${terminalized} compAttempts=${compensationAttempts} compOk=${compensationOk} failures=${failures}`,
		)
	}
}
