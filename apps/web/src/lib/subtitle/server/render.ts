import { bucketPaths } from '@app/media-domain'
import { eq } from 'drizzle-orm'
import type { JobStatusResponse } from '~/lib/cloudflare'
import { getJobStatus, type JobManifest } from '~/lib/cloudflare'
import { getDb, schema } from '~/lib/db'
import { enqueueCloudTask } from '~/lib/job/enqueue'
import { TASK_KINDS } from '~/lib/job/task'
import { logger } from '~/lib/logger'
import { resolveCloudVideoKey } from '~/lib/media/resolve-cloud-video-key'
import type { SubtitleRenderConfig } from '~/lib/subtitle/types'

export async function startCloudRender(input: {
	mediaId: string
	subtitleConfig?: SubtitleRenderConfig
}): Promise<{ jobId: string; taskId: string }> {
	const where = eq(schema.media.id, input.mediaId)
	const db = await getDb()
	const media = await db.query.media.findFirst({ where })
	if (!media) throw new Error('Media not found')
	if (!media.translation) throw new Error('Translation not found')

	logger.info(
		'rendering',
		`[subtitles.render.start] media=${media.id} user=${media.userId ?? 'null'}`,
	)

	try {
		const { taskId, jobId } = await enqueueCloudTask({
			db,
			userId: media.userId ?? null,
			kind: TASK_KINDS.RENDER_SUBTITLES,
			engine: 'burner-ffmpeg',
			targetType: 'media',
			targetId: media.id,
			mediaId: media.id,
			purpose: TASK_KINDS.RENDER_SUBTITLES,
			title: media.title || undefined,
			payload: { subtitleConfig: input.subtitleConfig ?? null },
			options: { subtitleConfig: input.subtitleConfig },
			buildManifest: async ({ jobId }): Promise<JobManifest> => {
				const resolvedVideoKey = await resolveCloudVideoKey({
					sourcePolicy: 'original',
					remoteVideoKey: media.remoteVideoKey ?? null,
					downloadJobId: media.downloadJobId ?? null,
				})
				if (!resolvedVideoKey) {
					throw new Error(
						'Source video not found in cloud storage. Re-run cloud download for this media and retry.',
					)
				}

				const vttKey = bucketPaths.inputs.subtitles(media.id, {
					title: media.title ?? undefined,
				})

				return {
					jobId,
					mediaId: media.id,
					purpose: TASK_KINDS.RENDER_SUBTITLES,
					engine: 'burner-ffmpeg',
					createdAt: Date.now(),
					inputs: {
						// For subtitles burn-in we always use the canonical remote video as source.
						videoKey: resolvedVideoKey,
						vttKey,
						sourcePolicy: 'original',
					},
					optionsSnapshot: {
						subtitleConfig: input.subtitleConfig ?? null,
					},
				}
			},
		})

		logger.info(
			'rendering',
			`[subtitles.render.job] queued media=${media.id} user=${media.userId ?? 'null'} task=${taskId} job=${jobId}`,
		)

		return { jobId, taskId }
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: 'Failed to start subtitles render'
		logger.error(
			'rendering',
			`[subtitles.render.error] media=${media.id} user=${media.userId ?? 'null'} error=${message}`,
		)
		throw error
	}
}

export async function getRenderStatus(input: {
	jobId: string
}): Promise<JobStatusResponse> {
	const status = await getJobStatus(input.jobId)
	logger.debug(
		'rendering',
		`[subtitles.render.status] job=${input.jobId} status=${status.status} progress=${
			typeof status.progress === 'number'
				? Math.round(status.progress * 100)
				: 'n/a'
		}`,
	)
	return status
}
