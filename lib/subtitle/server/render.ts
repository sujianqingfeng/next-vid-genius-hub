import { eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { getDb, schema } from '~/lib/db'
import { logger } from '~/lib/logger'
import type { SubtitleRenderConfig } from '~/lib/subtitle/types'
import { startCloudJob, getJobStatus, putJobManifest, type JobManifest } from '~/lib/cloudflare'
import type { JobStatusResponse } from '~/lib/cloudflare'
import { bucketPaths, TERMINAL_JOB_STATUSES } from '@app/media-domain'
import { TASK_KINDS } from '~/lib/job/task'
import { resolveCloudVideoKey } from '~/lib/media/resolve-cloud-video-key'

export async function startCloudRender(input: { mediaId: string; subtitleConfig?: SubtitleRenderConfig }): Promise<{ jobId: string; taskId: string }> {
  const where = eq(schema.media.id, input.mediaId)
  const db = await getDb()
  const media = await db.query.media.findFirst({ where })
  if (!media) throw new Error('Media not found')
  if (!media.translation) throw new Error('Translation not found')

  logger.info(
    'rendering',
    `[subtitles.render.start] media=${media.id} user=${media.userId ?? 'null'}`,
  )

  const taskId = createId()
  const now = new Date()
  await db.insert(schema.tasks).values({
    id: taskId,
    userId: media.userId ?? null,
    kind: TASK_KINDS.RENDER_SUBTITLES,
    engine: 'burner-ffmpeg',
    targetType: 'media',
    targetId: media.id,
    status: 'queued',
    progress: 0,
    payload: {
      subtitleConfig: input.subtitleConfig ?? null,
    },
    createdAt: now,
    updatedAt: now,
  })

  try {
    // Generate job id up-front so we can materialize a per-job manifest that
    // describes the exact inputs this render should use.
    const jobId = `job_${createId()}`

    const resolvedVideoKey = await resolveCloudVideoKey({
      sourcePolicy: 'original',
      remoteVideoKey: media.remoteVideoKey ?? null,
      downloadJobId: media.downloadJobId ?? null,
      filePath: media.filePath ?? null,
    })
    if (!resolvedVideoKey) {
      throw new Error(
        'Source video not found in cloud storage. Re-run cloud download for this media and retry.',
      )
    }

    const vttKey = bucketPaths.inputs.subtitles(media.id, { title: media.title ?? undefined })
    const manifest: JobManifest = {
      jobId,
      mediaId: media.id,
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

    await putJobManifest(jobId, manifest)

    const job = await startCloudJob({
      jobId,
      mediaId: media.id,
      engine: 'burner-ffmpeg',
      title: media.title || undefined,
      options: { subtitleConfig: input.subtitleConfig },
    })

    await db
      .update(schema.tasks)
      .set({
        jobId: job.jobId,
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, taskId))

    logger.info(
      'rendering',
      `[subtitles.render.job] queued media=${media.id} user=${media.userId ?? 'null'} task=${taskId} job=${job.jobId}`,
    )

    return { jobId: job.jobId, taskId }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start subtitles render'
    await db
      .update(schema.tasks)
      .set({
        status: 'failed',
        error: message,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, taskId))
    logger.error(
      'rendering',
      `[subtitles.render.error] media=${media.id} user=${media.userId ?? 'null'} task=${taskId} error=${message}`,
    )
    throw error
  }
}

export async function getRenderStatus(input: { jobId: string }): Promise<JobStatusResponse> {
  const status = await getJobStatus(input.jobId)
  logger.debug(
    'rendering',
    `[subtitles.render.status] job=${input.jobId} status=${status.status} progress=${typeof status.progress === 'number' ? Math.round(
      status.progress * 100,
    ) : 'n/a'}`,
  )
  try {
    const db = await getDb()
    const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.jobId, input.jobId) })
    if (task) {
      await db
        .update(schema.tasks)
        .set({
          status: status.status,
          progress: typeof status.progress === 'number' ? Math.round(status.progress * 100) : null,
          jobStatusSnapshot: status,
          updatedAt: new Date(),
          finishedAt: TERMINAL_JOB_STATUSES.includes(status.status) ? new Date() : task.finishedAt,
        })
        .where(eq(schema.tasks.id, task.id))
    }
  } catch {
    // best-effort
  }
  return status
}
