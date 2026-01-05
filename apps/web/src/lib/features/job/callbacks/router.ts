import { eq } from 'drizzle-orm'
import { getDb, schema } from '~/lib/infra/db'
import { TASK_KINDS } from '~/lib/features/job/task'
import { logger } from '~/lib/infra/logger'
import type { CallbackPayload } from './types'
import { handleAsrCallback } from './handlers/asr'
import { handleDownloadCallback } from './handlers/download'
import { handleMediaDownloaderNonDownloadCallback } from './handlers/media-downloader-non-download'
import { handleRenderCallback } from './handlers/render'
import { handleRenderThreadCallback } from './handlers/render-thread'

type Db = Awaited<ReturnType<typeof getDb>>

type TaskLike = {
	id: string
	kind: string
	targetId: string
	progress: number | null
	jobStatusSnapshot?: unknown
}

export async function dispatchCfCallback(input: {
	db: Db
	payload: CallbackPayload
	task: TaskLike | null
	effectiveKind: string | null | undefined
	eventSeq: number | null
}): Promise<{ response: Response; shouldUpdateSnapshot: boolean }> {
	const { db, payload, task, effectiveKind } = input

	// Thread rendering (media-independent). We reuse the orchestrator's `mediaId`
	// field to carry the threadId, and dispatch by purpose.
	if (effectiveKind === TASK_KINDS.RENDER_THREAD) {
		return {
			response: await handleRenderThreadCallback({ db, payload }),
			shouldUpdateSnapshot: Boolean(task),
		}
	}

	// media-downloader is also used for non-download tasks (comments-only, metadata refresh, channel sync).
	// Those jobs should not mutate the media's download fields.
	if (payload.engine === 'media-downloader' && effectiveKind) {
		if (effectiveKind !== TASK_KINDS.DOWNLOAD) {
			return {
				response: await handleMediaDownloaderNonDownloadCallback({
					db,
					payload: payload as CallbackPayload & { engine: 'media-downloader' },
					task,
					effectiveKind,
				}),
				shouldUpdateSnapshot: true,
			}
		}
	}

	const media = await db.query.media.findFirst({
		where: eq(schema.media.id, payload.mediaId),
	})

	if (!media) {
		const outputs = payload.outputs
		const hasMetadataOnly = Boolean(outputs?.metadata) && !outputs?.video
		if (payload.engine === 'media-downloader' && hasMetadataOnly) {
			logger.info(
				'api',
				`[cf-callback] non-media job callback ignored mediaId=${payload.mediaId}`,
			)
			return {
				response: Response.json({ ok: true, ignored: true }),
				shouldUpdateSnapshot: true,
			}
		}
		logger.error('api', `[cf-callback] media not found: ${payload.mediaId}`)
		return {
			response: Response.json({ error: 'media not found' }, { status: 404 }),
			shouldUpdateSnapshot: true,
		}
	}

	if (payload.engine === 'media-downloader') {
		await handleDownloadCallback({
			db,
			media,
			payload: payload as CallbackPayload & { engine: 'media-downloader' },
		})
		logger.info(
			'api',
			`[cf-callback] handled downloader callback job=${payload.jobId} media=${payload.mediaId} status=${payload.status}`,
		)
		return {
			response: Response.json({ ok: true }),
			shouldUpdateSnapshot: true,
		}
	}

	if (payload.engine === 'asr-pipeline') {
		return {
			response: await handleAsrCallback({ db, media, payload }),
			shouldUpdateSnapshot: true,
		}
	}

	return {
		response: await handleRenderCallback({ db, media, payload }),
		shouldUpdateSnapshot: true,
	}
}
