import { verifyHmacSHA256 } from '@app/job-callbacks'
import { eq } from 'drizzle-orm'
import { JOB_CALLBACK_HMAC_SECRET } from '~/lib/config/env'
import { getDb, schema } from '~/lib/db'
import { recordJobEvent } from '~/lib/job/events'
import { logger } from '~/lib/logger'
import { handleProxyCheckCallback } from './handlers/proxy-check'
import { dispatchCfCallback } from './router'
import {
	getLastCallbackEventSeq,
	mergeCallbackSnapshot,
	mergeCallbackValidationSnapshot,
	normaliseEventSeq,
} from './snapshot'
import type { CallbackPayload } from './types'
import {
	isProxyCheckPayload,
	OrchestratorCallbackV2Schema,
	ProxyCheckCallbackSchema,
} from './validate'

export async function handleCfCallbackRequest(request: Request): Promise<Response> {
	try {
		const signature = request.headers.get('x-signature') || ''
		const bodyText = await request.text()

		const secret = JOB_CALLBACK_HMAC_SECRET
		if (!secret) {
			logger.error('api', '[cf-callback] JOB_CALLBACK_HMAC_SECRET is not configured')
			return Response.json({ error: 'server misconfigured' }, { status: 500 })
		}
		if (!verifyHmacSHA256(secret, bodyText, signature)) {
			logger.error('api', '[cf-callback] invalid signature')
			return Response.json({ error: 'invalid signature' }, { status: 401 })
		}

		let payload: CallbackPayload
		try {
			payload = JSON.parse(bodyText) as CallbackPayload
		} catch (e) {
			logger.warn(
				'api',
				`[cf-callback] invalid json err=${e instanceof Error ? e.message : String(e)}`,
			)
			// Warn-only: avoid orchestrator retry storms on malformed payloads.
			return Response.json({ ok: false, ignored: true, error: 'invalid json' })
		}

		const db = await getDb()

		const raw = payload as unknown
		const payloadSchema = isProxyCheckPayload(raw)
			? ProxyCheckCallbackSchema
			: OrchestratorCallbackV2Schema

		const parsed = payloadSchema.safeParse(raw)
		if (!parsed.success) {
			const maybeJobId =
				typeof (raw as any)?.jobId === 'string' ? String((raw as any).jobId) : ''
			const maybeStatus =
				typeof (raw as any)?.status === 'string'
					? String((raw as any).status)
					: null
			const maybePurpose =
				typeof (raw as any)?.purpose === 'string'
					? String((raw as any).purpose)
					: null
			logger.warn(
				'api',
				`[cf-callback] invalid payload schema (ignored) job=${maybeJobId || 'n/a'}`,
			)
			if (maybeJobId.trim()) {
				const maybeSchemaVersion =
					typeof (raw as any)?.schemaVersion === 'number' &&
					Number.isFinite((raw as any).schemaVersion)
						? Math.trunc((raw as any).schemaVersion)
						: null

				// Strict policy: mark the task with an explicit error so it shows up in UI,
				// while still returning 200 to avoid orchestrator retry storms on a permanently invalid payload.
				if (maybeSchemaVersion != null && maybeSchemaVersion >= 2) {
					const task = await db.query.tasks.findFirst({
						where: eq(schema.tasks.jobId, maybeJobId.trim()),
					})
					if (task) {
						const nextSnapshot = mergeCallbackValidationSnapshot(task, {
							schemaVersion: maybeSchemaVersion,
							issues: parsed.error.issues,
						})
						const msg =
							'callback payload schema validation failed (v2)'
						try {
							await db
								.update(schema.tasks)
								.set({
									status: 'failed',
									error: msg,
									finishedAt: new Date(),
									updatedAt: new Date(),
									jobStatusSnapshot: nextSnapshot,
								})
								.where(eq(schema.tasks.id, task.id))
						} catch {
							// best-effort
						}
					}
				}

				await recordJobEvent({
					db,
					source: 'callback',
					kind: 'ignored-invalid-v2',
					jobId: maybeJobId.trim(),
					taskId: null,
					purpose: maybePurpose,
					status: maybeStatus,
					eventTs: Date.now(),
					message: 'callback payload schema validation failed',
					payload: {
						issues: parsed.error.issues,
						raw,
						schemaVersion: maybeSchemaVersion,
					},
				})
			}
			return Response.json({ ok: false, ignored: true, error: 'invalid payload' })
		}

		payload = parsed.data as CallbackPayload

		if (payload.metadata?.kind === 'proxy-check') {
			return await handleProxyCheckCallback({ db, payload })
		}
		const eventSeq = normaliseEventSeq(payload.eventSeq)

		logger.info(
			'api',
			`[cf-callback] received job=${payload.jobId} media=${payload.mediaId} engine=${payload.engine ?? 'unknown'} purpose=${payload.purpose ?? 'n/a'} status=${payload.status} eventSeq=${eventSeq ?? 'n/a'}`,
		)

		const task = await db.query.tasks.findFirst({
			where: eq(schema.tasks.jobId, payload.jobId),
		})

		await recordJobEvent({
			db,
			source: 'callback',
			kind: 'received',
			jobId: payload.jobId,
			taskId: task?.id ?? null,
			purpose: payload.purpose ?? task?.kind ?? null,
			status: payload.status,
			eventSeq: payload.eventSeq,
			eventId: payload.eventId ?? null,
			eventTs: payload.eventTs ?? null,
			message: payload.error ?? null,
			payload,
		})

		if (task && task.status === 'canceled') {
			return Response.json({ ok: true, ignored: true, reason: 'task_canceled' })
		}

		// Callbacks are retried by the orchestrator when eventSeq is present; dedupe by eventSeq.
		if (task && eventSeq != null) {
			const lastSeq = getLastCallbackEventSeq(task)
			if (typeof lastSeq === 'number' && lastSeq >= eventSeq) {
				return Response.json({ ok: true, deduped: true })
			}
		}

		try {
			if (task && task.status !== 'canceled') {
				await db
					.update(schema.tasks)
					.set({
						status: payload.status,
						progress: payload.status === 'completed' ? 100 : task.progress,
						error: payload.error ?? null,
						finishedAt: new Date(),
						updatedAt: new Date(),
					})
					.where(eq(schema.tasks.id, task.id))
			}
		} catch (err) {
			logger.warn(
				'api',
				`[cf-callback] task sync skipped: ${err instanceof Error ? err.message : String(err)}`,
			)
		}

		const effectiveKind =
			typeof payload.purpose === 'string' && payload.purpose.trim()
				? payload.purpose.trim()
				: task?.kind

		const { response, shouldUpdateSnapshot } = await dispatchCfCallback({
			db,
			payload,
			task: task as any,
			effectiveKind,
			eventSeq,
		})

		if (shouldUpdateSnapshot && task && eventSeq != null) {
			try {
				const nextSnapshot = mergeCallbackSnapshot(task, {
					eventSeq,
					eventId: payload.eventId,
					eventTs: payload.eventTs,
				})
				await db
					.update(schema.tasks)
					.set({
						jobStatusSnapshot: nextSnapshot,
						updatedAt: new Date(),
					})
					.where(eq(schema.tasks.id, task.id))
			} catch {
				// best-effort
			}
		}

		return response
	} catch (e) {
		logger.error(
			'api',
			`[cf-callback] error: ${e instanceof Error ? e.message : String(e)}`,
		)
		return Response.json({ error: 'internal error' }, { status: 500 })
	}
}
