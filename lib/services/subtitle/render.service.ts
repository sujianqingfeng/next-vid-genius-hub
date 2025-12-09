import { eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { getDb, schema } from '~/lib/db'
import type { SubtitleRenderConfig } from '~/lib/subtitle/types'
import { startCloudJob, getJobStatus } from '~/lib/cloudflare'
import type { JobStatusResponse } from '~/lib/cloudflare'

export async function startCloudRender(input: { mediaId: string; subtitleConfig?: SubtitleRenderConfig }): Promise<{ jobId: string; taskId: string }> {
  const where = eq(schema.media.id, input.mediaId)
  const db = await getDb()
  const media = await db.query.media.findFirst({ where })
  if (!media) throw new Error('Media not found')
  if (!media.translation) throw new Error('Translation not found')

  const taskId = createId()
  const now = new Date()
  await db.insert(schema.tasks).values({
    id: taskId,
    userId: media.userId ?? null,
    kind: 'render-subtitles',
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
    const job = await startCloudJob({
      mediaId: media.id,
      engine: 'burner-ffmpeg',
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
    throw error
  }
}

export async function getRenderStatus(input: { jobId: string }): Promise<JobStatusResponse> {
  const status = await getJobStatus(input.jobId)
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
          finishedAt: ['completed', 'failed', 'canceled'].includes(status.status) ? new Date() : task.finishedAt,
        })
        .where(eq(schema.tasks.id, task.id))
    }
  } catch {
    // best-effort
  }
  return status
}
