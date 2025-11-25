import { eq } from 'drizzle-orm'
import { getDb, schema } from '~/lib/db'
import type { SubtitleRenderConfig } from '~/lib/subtitle/types'
import { startCloudJob, getJobStatus } from '~/lib/cloudflare'
import type { JobStatusResponse } from '~/lib/cloudflare'

export async function startCloudRender(input: { mediaId: string; subtitleConfig?: SubtitleRenderConfig }): Promise<{ jobId: string }> {
  const where = eq(schema.media.id, input.mediaId)
  const db = await getDb()
  const media = await db.query.media.findFirst({ where })
  if (!media) throw new Error('Media not found')
  if (!media.translation) throw new Error('Translation not found')
  const job = await startCloudJob({ mediaId: media.id, engine: 'burner-ffmpeg', options: { subtitleConfig: input.subtitleConfig } })
  return { jobId: job.jobId }
}

export async function getRenderStatus(input: { jobId: string }): Promise<JobStatusResponse> {
  return getJobStatus(input.jobId)
}
