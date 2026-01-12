import { eq } from 'drizzle-orm'
import { getDb, schema } from '~/lib/infra/db'
import { logger } from '~/lib/infra/logger'
import { addPointsOnce, getTransactionByTypeRef } from '~/lib/domain/points/service'
import { persistAsrResultFromBucket } from '~/lib/features/subtitle/server/asr-result'
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

		if (media.userId) {
			try {
				const prefunded = await getTransactionByTypeRef({
					userId: media.userId,
					type: 'asr_usage',
					refId: payload.jobId,
					db,
				})
				if (!prefunded) {
					logger.error(
						'api',
						`[cf-callback] asr completed but missing prefund tx user=${media.userId} job=${payload.jobId} media=${payload.mediaId}`,
					)
				}
			} catch (error) {
				logger.warn(
					'api',
					`[cf-callback] asr prefund lookup failed: ${error instanceof Error ? error.message : String(error)}`,
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

		if (media.userId) {
			try {
				const tx = await getTransactionByTypeRef({
					userId: media.userId,
					type: 'asr_usage',
					refId: payload.jobId,
					db,
				})
				const amount = typeof tx?.delta === 'number' ? -tx.delta : 0
				if (amount > 0) {
					await addPointsOnce({
						userId: media.userId,
						amount,
						type: 'refund',
						refType: 'asr',
						refId: payload.jobId,
						remark: `refund asr ${payload.status} job=${payload.jobId}`,
						metadata: {
							purpose: 'asr',
							originalType: 'asr_usage',
							reason: payload.status,
						},
					})
				}
			} catch (error) {
				logger.warn(
					'api',
					`[cf-callback] asr refund failed: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		}
	}

	return Response.json({ ok: true })
}
