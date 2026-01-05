import { and, eq, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm'
import { getJobStatus } from '~/lib/infra/cloudflare'
import { getDb, schema } from '~/lib/infra/db'
import { logger } from '~/lib/infra/logger'
import { recordJobEvent } from '~/lib/features/job/events'
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
		},
	}
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
					TASK_KINDS.RENDER_THREAD,
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
					typeof status.progress === 'number' &&
					Number.isFinite(status.progress)
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
				logger.warn(
					'api',
					`[reconciler] run=${runId} job=${jobId} task=${task.id} ${msg}`,
				)
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
			`[reconciler] run=${runId} tookMs=${tookMs} scanned=${scanned} wroteTasks=${wroteTasks} statusChanges=${statusChanges} terminalized=${terminalized} failures=${failures}`,
		)
	}
}
