import { eq } from 'drizzle-orm'
import { getDb, schema } from '~/lib/db'
import { logger } from '~/lib/logger'
import {
	chargeAsrUsage,
	InsufficientPointsError,
} from '~/lib/points/billing'
import { persistAsrResultFromBucket } from '~/lib/subtitle/server/asr-result'
import type { CallbackPayload } from '../types'

type Db = Awaited<ReturnType<typeof getDb>>
type MediaRecord = typeof schema.media.$inferSelect

export async function handleAsrCallback(input: {
	db: Db
	media: MediaRecord
	payload: CallbackPayload
}): Promise<Response> {
	const { db, media, payload } = input

	if (payload.status === 'completed') {
		const vttKey = payload.outputs?.vtt?.key
		if (!vttKey) {
			logger.error(
				'api',
				`[cf-callback] asr-pipeline missing vtt output job=${payload.jobId}`,
			)
			return Response.json({ error: 'missing vtt output' }, { status: 400 })
		}

		try {
			await persistAsrResultFromBucket({
				mediaId: payload.mediaId,
				vttKey,
				wordsKey: payload.outputs?.words?.key,
				vttUrl: payload.outputs?.vtt?.url,
				wordsUrl: payload.outputs?.words?.url,
				title: media.title,
			})
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			logger.error(
				'api',
				`[cf-callback] asr persist failed job=${payload.jobId} media=${payload.mediaId} error=${msg}`,
			)
			return Response.json({ error: msg }, { status: 500 })
		}

		try {
			const durationSeconds =
				typeof media.duration === 'number' && media.duration > 0 ? media.duration : 0
			const modelId =
				typeof payload.metadata?.model === 'string' ? payload.metadata.model : undefined
			if (durationSeconds > 0 && modelId && media.userId) {
				await chargeAsrUsage({
					userId: media.userId,
					modelId,
					durationSeconds,
					refType: 'asr',
					refId: payload.jobId,
					remark: `asr ${modelId} ${durationSeconds.toFixed(1)}s`,
				})
			}
		} catch (error) {
			if (error instanceof InsufficientPointsError) {
				logger.warn(
					'api',
					`[cf-callback] asr charge skipped (insufficient points) media=${media.id}`,
				)
			} else {
				logger.warn(
					'api',
					`[cf-callback] asr charge failed: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		}

		logger.info(
			'api',
			`[cf-callback] asr completed job=${payload.jobId} media=${payload.mediaId}`,
		)
	} else if (payload.status === 'failed' || payload.status === 'canceled') {
		await db
			.update(schema.media)
			.set({
				downloadError: `[asr-pipeline] ${payload.error ?? payload.status}`,
			})
			.where(eq(schema.media.id, media.id))
		logger.warn(
			'api',
			`[cf-callback] asr ${payload.status} job=${payload.jobId} media=${payload.mediaId} error=${payload.error ?? 'n/a'}`,
		)
	}

	return Response.json({ ok: true })
}

