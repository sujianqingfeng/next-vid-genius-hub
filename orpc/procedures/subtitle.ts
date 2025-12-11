import { os } from '@orpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { AIModelIds } from '~/lib/ai/models'
import { subtitleRenderConfigSchema } from '~/lib/subtitle/types'
import { subtitleService } from '~/lib/subtitle/server/subtitle'
import { cloudflareInputFormatSchema, whisperModelSchema } from '~/lib/subtitle/config/models'
import { getDb, schema } from '~/lib/db'
import type { RequestContext } from '~/lib/auth/types'
import { getJobStatus } from '~/lib/cloudflare'
import { TERMINAL_JOB_STATUSES } from '@app/media-domain'

export const transcribe = os
  .input(
    z.object({
      mediaId: z.string(),
      model: whisperModelSchema,
      language: z.string().min(2).max(16).optional(),
      inputFormat: cloudflareInputFormatSchema.optional(),
    }),
  )
  .handler(async ({ input, context }) => {
  	const ctx = context as RequestContext
  	const userId = ctx.auth.user!.id
  	const db = await getDb()
  	const media = await db.query.media.findFirst({
  		where: and(eq(schema.media.id, input.mediaId), eq(schema.media.userId, userId)),
  	})
  	if (!media) {
  		throw new Error('Media not found')
  	}
  	const res = await subtitleService.transcribe(input)

  	// Billing for ASR usage is now handled in the ASR callback handler based on media.duration
  	return { success: true, jobId: res.jobId, durationSeconds: res.durationSeconds, model: input.model, userId }
  })

const translateInput = z.object({
  mediaId: z.string(),
  model: z.enum(AIModelIds),
  promptId: z.string().optional(),
});
export const translate = os.input(translateInput).handler(async ({ input, context }) => {
  const ctx = context as RequestContext
  const userId = ctx.auth.user!.id
  const db = await getDb()
  const media = await db.query.media.findFirst({
    where: and(eq(schema.media.id, input.mediaId), eq(schema.media.userId, userId)),
  })
  if (!media) {
    throw new Error("Media not found")
  }
  const res = await subtitleService.translate(input)
  return res
});

// 使用新架构中的Schema，移除重复定义

export const updateTranslation = os
  .input(
    z.object({
      mediaId: z.string(),
      translation: z.string(),
    }),
  )
  .handler(async ({ input, context }) => {
    const ctx = context as RequestContext
    const userId = ctx.auth.user!.id
    const db = await getDb()
    const media = await db.query.media.findFirst({
      where: and(eq(schema.media.id, input.mediaId), eq(schema.media.userId, userId)),
    })
    if (!media) {
      throw new Error("Media not found")
    }
    return subtitleService.updateTranslation(input)
  });

export const deleteTranslationCue = os
  .input(
    z.object({
      mediaId: z.string(),
      index: z.number().min(0),
    }),
  )
  .handler(async ({ input, context }) => {
    const ctx = context as RequestContext
    const userId = ctx.auth.user!.id
    const db = await getDb()
    const media = await db.query.media.findFirst({
      where: and(eq(schema.media.id, input.mediaId), eq(schema.media.userId, userId)),
    })
    if (!media) {
      throw new Error("Media not found")
    }
    return subtitleService.deleteTranslationCue(input)
  });

// Cloud rendering: start job explicitly
export const startCloudRender = os
  .input(
    z.object({
      mediaId: z.string(),
      subtitleConfig: subtitleRenderConfigSchema.optional(),
    }),
  )
  .handler(async ({ input, context }) => {
    const ctx = context as RequestContext
    const userId = ctx.auth.user!.id
    const db = await getDb()
    const media = await db.query.media.findFirst({
      where: and(eq(schema.media.id, input.mediaId), eq(schema.media.userId, userId)),
    })
    if (!media) {
      throw new Error("Media not found")
    }
    return subtitleService.startCloudRender(input)
  });

// Cloud rendering: get status
export const getRenderStatus = os
  .input(z.object({ jobId: z.string().min(1) }))
  .handler(async ({ input }) => {
    // Optional: could look up task by jobId and enforce ownership here.
    return subtitleService.getRenderStatus(input)
  });

// Optimize transcription using per-word timings + AI segmentation
export const optimizeTranscription = os
  .input(
    z.object({
      mediaId: z.string(),
      model: z.enum(AIModelIds),
      pauseThresholdMs: z.number().min(0).max(5000).default(480),
      maxSentenceMs: z.number().min(1000).max(30000).default(8000),
      maxChars: z.number().min(10).max(160).default(68),
      lightCleanup: z.boolean().optional().default(false),
      textCorrect: z.boolean().optional().default(false),
    }),
  )
  .handler(async ({ input, context }) => {
    const ctx = context as RequestContext
    const userId = ctx.auth.user!.id
    const db = await getDb()
    const media = await db.query.media.findFirst({
      where: and(eq(schema.media.id, input.mediaId), eq(schema.media.userId, userId)),
    })
    if (!media) {
      throw new Error("Media not found")
    }
    return subtitleService.optimizeTranscription(input)
  });

// Restore transcription from original backup if available
export const clearOptimizedTranscription = os
  .input(z.object({ mediaId: z.string() }))
  .handler(async ({ input, context }) => {
    const ctx = context as RequestContext
    const userId = ctx.auth.user!.id
    const db = await getDb()
    const media = await db.query.media.findFirst({
      where: and(eq(schema.media.id, input.mediaId), eq(schema.media.userId, userId)),
    })
    if (!media) {
      throw new Error("Media not found")
    }
    return subtitleService.clearOptimizedTranscription(input)
  });

// ASR status: lightweight proxy to orchestrator for UI progress
export const getAsrStatus = os
  .input(z.object({ jobId: z.string().min(1) }))
  .handler(async ({ input }) => {
    const status = await getJobStatus(input.jobId)
    try {
      const db = await getDb()
      const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.jobId, input.jobId) })
      if (task) {
        await db
          .update(schema.tasks)
          .set({
            status: status.status,
            progress:
              typeof status.progress === 'number' ? Math.round(status.progress * 100) : null,
            jobStatusSnapshot: status,
            updatedAt: new Date(),
            finishedAt: TERMINAL_JOB_STATUSES.includes(status.status)
              ? new Date()
              : task.finishedAt,
          })
          .where(eq(schema.tasks.id, task.id))
      }
    } catch {
      // best-effort; ignore sync errors
    }
    return status
  })
