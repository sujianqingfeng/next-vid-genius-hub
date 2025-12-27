import { eq } from 'drizzle-orm'
import { getDb, schema } from '~/lib/db'
import { logger } from '~/lib/logger'
import type { CallbackPayload } from '../types'

type Db = Awaited<ReturnType<typeof getDb>>

export async function handleRenderThreadCallback(input: {
	db: Db
	payload: CallbackPayload
}): Promise<Response> {
	const { db, payload } = input

	const outputVideoKey = payload.outputs?.video?.key ?? null
	try {
		await db
			.update(schema.threadRenders)
			.set({
				status: payload.status,
				outputVideoKey,
				error: payload.error ?? null,
				updatedAt: new Date(),
			})
			.where(eq(schema.threadRenders.jobId, payload.jobId))
	} catch (e) {
		logger.warn(
			'api',
			`[cf-callback.thread] update failed job=${payload.jobId} err=${
				e instanceof Error ? e.message : String(e)
			}`,
		)
	}

	return Response.json({ ok: true })
}
