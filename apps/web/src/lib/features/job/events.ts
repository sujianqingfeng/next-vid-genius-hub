import { getDb, schema } from '~/lib/infra/db'
import { logger } from '~/lib/infra/logger'

type Db = Awaited<ReturnType<typeof getDb>>

function toFiniteInt(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return Math.max(0, Math.trunc(value))
	}
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number.parseInt(value, 10)
		if (Number.isFinite(parsed)) return Math.max(0, parsed)
	}
	return null
}

function toDateOrNull(value: unknown): Date | null {
	if (!value) return null
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value
	}
	if (typeof value === 'number' && Number.isFinite(value)) {
		const d = new Date(value)
		return Number.isNaN(d.getTime()) ? null : d
	}
	if (typeof value === 'string' && value.trim()) {
		const d = new Date(value)
		return Number.isNaN(d.getTime()) ? null : d
	}
	return null
}

function truncate(value: string, maxLen: number): string {
	if (value.length <= maxLen) return value
	return value.slice(0, maxLen)
}

function safeJsonStringify(value: unknown, maxLen: number): string | null {
	if (value == null) return null
	try {
		const text = JSON.stringify(value)
		return truncate(text, maxLen)
	} catch {
		return null
	}
}

export async function recordJobEvent(input: {
	db?: Db
	eventKey?: string
	source: 'callback' | 'reconciler'
	kind: string
	jobId: string
	taskId?: string | null
	purpose?: string | null
	status?: string | null
	eventSeq?: unknown
	eventId?: string | null
	eventTs?: unknown
	message?: string | null
	payload?: unknown
}): Promise<void> {
	const db = input.db ?? (await getDb())

	const eventSeq = toFiniteInt(input.eventSeq)
	const eventId =
		typeof input.eventId === 'string' && input.eventId.trim()
			? input.eventId.trim()
			: null
	const eventTs = toDateOrNull(input.eventTs)

	const baseKey = `${input.source}:${input.kind}:${input.jobId}`
	const stableKey =
		typeof input.eventKey === 'string' && input.eventKey.trim()
			? input.eventKey.trim()
			: input.source === 'callback' && eventSeq != null
				? `${baseKey}:seq:${eventSeq}`
				: input.source === 'callback' && eventId
					? `${baseKey}:id:${eventId}`
					: `${baseKey}:ts:${Date.now()}`

	const payloadText = safeJsonStringify(input.payload, 50_000)
	const message =
		typeof input.message === 'string' && input.message.trim()
			? truncate(input.message.trim(), 500)
			: null

	try {
		await db.insert(schema.jobEvents).values({
			eventKey: stableKey,
			kind: input.kind,
			jobId: input.jobId,
			taskId: input.taskId ?? null,
			purpose: input.purpose ?? null,
			status: input.status ?? null,
			source: input.source,
			eventSeq: eventSeq ?? null,
			eventId,
			eventTs,
			message,
			payload: payloadText,
			createdAt: new Date(),
		})
	} catch (e) {
		// Best-effort audit logging: ignore duplicates / transient DB errors.
		logger.debug(
			'api',
			`[job-events] insert skipped key=${stableKey} err=${
				e instanceof Error ? e.message : String(e)
			}`,
		)
	}
}
