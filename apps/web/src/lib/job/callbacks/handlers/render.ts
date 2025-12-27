import { eq } from 'drizzle-orm'
import { getDb, schema } from '~/lib/db'
import { logger } from '~/lib/logger'
import type { CallbackPayload } from '../types'

type Db = Awaited<ReturnType<typeof getDb>>
type MediaRecord = typeof schema.media.$inferSelect

export async function handleRenderCallback(input: {
	db: Db
	media: MediaRecord
	payload: CallbackPayload
}): Promise<Response> {
	const { db, media, payload } = input

	if (payload.status === 'completed') {
		if (payload.engine === 'renderer-remotion') {
			await db
				.update(schema.media)
				.set({
					renderCommentsJobId: payload.jobId,
				})
				.where(eq(schema.media.id, media.id))
			logger.info(
				'api',
				`[cf-callback] render-info completed job=${payload.jobId} media=${payload.mediaId}`,
			)
		} else {
			await db
				.update(schema.media)
				.set({
					renderSubtitlesJobId: payload.jobId,
				})
				.where(eq(schema.media.id, media.id))
			logger.info(
				'api',
				`[cf-callback] render-subtitles completed job=${payload.jobId} media=${payload.mediaId}`,
			)
		}
	} else if (payload.status === 'failed' || payload.status === 'canceled') {
		const errorMessage =
			payload.error ||
			(payload.status === 'failed' ? 'Cloud render failed' : 'Cloud render canceled')
		const updates: Record<string, unknown> = {
			downloadError: `[${payload.engine}] ${errorMessage}`,
		}
		await db.update(schema.media).set(updates).where(eq(schema.media.id, media.id))
		logger.warn(
			'api',
			`[cf-callback] render ${payload.status} job=${payload.jobId} media=${payload.mediaId} engine=${payload.engine} error=${errorMessage}`,
		)
	}

	return Response.json({ ok: true })
}
