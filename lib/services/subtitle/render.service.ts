import fs from 'node:fs/promises'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { db, schema } from '~/lib/db'
import { OPERATIONS_DIR, RENDERED_VIDEO_FILENAME } from '~/lib/config/app.config'
import { renderVideoWithSubtitles } from '@app/media-subtitles'
import type { SubtitleRenderConfig } from '~/lib/subtitle/types'
import { startCloudJob, getJobStatus } from '~/lib/cloudflare'
import type { JobStatusResponse } from '~/lib/cloudflare'

export async function render(input: { mediaId: string; subtitleConfig?: SubtitleRenderConfig; backend?: 'local' | 'cloud' }): Promise<{ message?: string; jobId?: string }> {
  const where = eq(schema.media.id, input.mediaId)
  const media = await db.query.media.findFirst({ where })
  if (!media) throw new Error('Media not found')
  if (!media.translation) throw new Error('Translation not found')
  if (!media.filePath) throw new Error('Media file path not found')

  if (input.backend === 'cloud') {
    const job = await startCloudJob({ mediaId: media.id, engine: 'burner-ffmpeg', options: { subtitleConfig: input.subtitleConfig } })
    return { message: 'Cloud render queued', jobId: job.jobId }
  }

  const operationDir = path.join(OPERATIONS_DIR, media.id)
  await fs.mkdir(operationDir, { recursive: true })
  const originalFilePath = media.filePath
  const outputPath = path.join(operationDir, RENDERED_VIDEO_FILENAME)
  await renderVideoWithSubtitles(originalFilePath, media.translation, outputPath, input.subtitleConfig)
  await db.update(schema.media).set({ videoWithSubtitlesPath: outputPath }).where(where)
  return { message: 'Rendering started' }
}

export async function startCloudRender(input: { mediaId: string; subtitleConfig?: SubtitleRenderConfig }): Promise<{ jobId: string }> {
  const where = eq(schema.media.id, input.mediaId)
  const media = await db.query.media.findFirst({ where })
  if (!media) throw new Error('Media not found')
  if (!media.translation) throw new Error('Translation not found')
  const job = await startCloudJob({ mediaId: media.id, engine: 'burner-ffmpeg', options: { subtitleConfig: input.subtitleConfig } })
  return { jobId: job.jobId }
}

export async function getRenderStatus(input: { jobId: string }): Promise<JobStatusResponse> {
  return getJobStatus(input.jobId)
}

