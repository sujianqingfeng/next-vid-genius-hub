import { eq } from 'drizzle-orm'
import { getDb, schema } from '~/lib/infra/db'
import { recordJobEvent } from '~/lib/features/job/events'
import { logger } from '~/lib/infra/logger'
import type { CallbackPayload } from '../types'

type Db = Awaited<ReturnType<typeof getDb>>

export async function handleProxyCheckCallback(input: {
	db: Db
	payload: CallbackPayload
}): Promise<Response> {
	const { db, payload } = input

	await recordJobEvent({
		db,
		source: 'callback',
		kind: 'proxy-check',
		jobId: payload.jobId,
		taskId: null,
		purpose: payload.purpose ?? null,
		status: payload.status,
		eventSeq: payload.eventSeq,
		eventId: payload.eventId ?? null,
		eventTs: payload.eventTs ?? null,
		message: payload.error ?? null,
		payload,
	})

	const proxyId =
		typeof (payload.metadata as any)?.proxyId === 'string'
			? ((payload.metadata as any).proxyId as string)
			: undefined
	const responseTimeMs =
		typeof (payload.metadata as any)?.responseTimeMs === 'number'
			? ((payload.metadata as any).responseTimeMs as number)
			: undefined
	const okFlag =
		typeof (payload.metadata as any)?.ok === 'boolean'
			? ((payload.metadata as any).ok as boolean)
			: undefined
	const errorMessage =
		typeof (payload.metadata as any)?.error === 'string'
			? ((payload.metadata as any).error as string)
			: undefined

	if (!proxyId) {
		logger.warn(
			'api',
			`[cf-callback.proxy-check] missing proxyId job=${payload.jobId}`,
		)
		return Response.json(
			{ ok: false, error: 'missing proxyId' },
			{ status: 400 },
		)
	}

	const status =
		payload.status === 'completed' && okFlag !== false ? 'success' : 'failed'

	await db
		.update(schema.proxies)
		.set({
			lastTestedAt: new Date(),
			testStatus: status,
			responseTime:
				typeof responseTimeMs === 'number' && Number.isFinite(responseTimeMs)
					? Math.max(0, Math.trunc(responseTimeMs))
					: null,
		})
		.where(eq(schema.proxies.id, proxyId))

	logger.info(
		'api',
		`[cf-callback.proxy-check] updated proxy=${proxyId} status=${status} rttMs=${responseTimeMs ?? 'n/a'} job=${payload.jobId} err=${errorMessage ?? 'n/a'}`,
	)
	return Response.json({ ok: true })
}
