import { os } from '@orpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
	getDefaultAiModel,
	isEnabledModel,
} from '~/lib/features/ai/config/service'
import type { RequestContext } from '~/lib/features/auth/types'
import { getJobStatus } from '~/lib/infra/cloudflare'
import { getDb, schema } from '~/lib/infra/db'
import { throwInsufficientPointsError } from '../errors'
import {
	chargeLlmUsage,
	InsufficientPointsError,
} from '~/lib/domain/points/billing'
import { subtitleService } from '~/lib/features/subtitle/server/subtitle'
import { subtitleRenderConfigSchema } from '~/lib/features/subtitle/types'
import { TRANSLATION_PROMPT_IDS } from '~/lib/features/subtitle/config/prompts'

export const transcribe = os
	.input(
		z.object({
			mediaId: z.string(),
			model: z.string().min(1),
			language: z.string().min(2).max(16).optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()
		const media = await db.query.media.findFirst({
			where: and(
				eq(schema.media.id, input.mediaId),
				eq(schema.media.userId, userId),
			),
		})
		if (!media) {
			throw new Error('Media not found')
		}
		if (!(await isEnabledModel('asr', input.model, db))) {
			throw new Error(`ASR model ${input.model} is not enabled`)
		}
		try {
			const res = await subtitleService.transcribe(input)
			return {
				success: true,
				jobId: res.jobId,
				durationSeconds: res.durationSeconds,
				model: input.model,
				userId,
			}
		} catch (err) {
			if (err instanceof InsufficientPointsError) {
				throwInsufficientPointsError()
			}
			throw err
		}
	})

const translateInput = z.object({
	mediaId: z.string(),
	model: z.string().trim().min(1).optional(),
	promptId: z.enum(TRANSLATION_PROMPT_IDS).optional(),
})
export const translate = os
	.input(translateInput)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()
		const defaultModel = await getDefaultAiModel('llm', db)
		const modelId = input.model ?? defaultModel?.id
		if (!modelId || !(await isEnabledModel('llm', modelId, db))) {
			throw new Error('LLM model is not enabled')
		}
		const media = await db.query.media.findFirst({
			where: and(
				eq(schema.media.id, input.mediaId),
				eq(schema.media.userId, userId),
			),
		})
		if (!media) {
			throw new Error('Media not found')
		}
		const res = await subtitleService.translate({ ...input, model: modelId })
		try {
			await chargeLlmUsage({
				userId,
				modelId,
				inputTokens: res.usage?.inputTokens ?? 0,
				outputTokens: res.usage?.outputTokens ?? 0,
				refType: 'subtitle-translate',
				refId: input.mediaId,
				remark: `subtitle translate tokens=${res.usage?.totalTokens ?? 0}`,
			})
		} catch (err) {
			if (err instanceof InsufficientPointsError) {
				throwInsufficientPointsError()
			}
			throw err
		}
		return { translation: res.translation }
	})

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
			where: and(
				eq(schema.media.id, input.mediaId),
				eq(schema.media.userId, userId),
			),
		})
		if (!media) {
			throw new Error('Media not found')
		}
		return subtitleService.updateTranslation(input)
	})

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
			where: and(
				eq(schema.media.id, input.mediaId),
				eq(schema.media.userId, userId),
			),
		})
		if (!media) {
			throw new Error('Media not found')
		}
		return subtitleService.deleteTranslationCue(input)
	})

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
			where: and(
				eq(schema.media.id, input.mediaId),
				eq(schema.media.userId, userId),
			),
		})
		if (!media) {
			throw new Error('Media not found')
		}
		return subtitleService.startCloudRender(input)
	})

// Cloud rendering: get status
export const getRenderStatus = os
	.input(z.object({ jobId: z.string().min(1) }))
	.handler(async ({ input }) => {
		// Optional: could look up task by jobId and enforce ownership here.
		return subtitleService.getRenderStatus(input)
	})

// Optimize transcription using per-word timings + AI segmentation
export const optimizeTranscription = os
	.input(
		z.object({
			mediaId: z.string(),
			model: z.string().trim().min(1).optional(),
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
		const defaultModel = await getDefaultAiModel('llm', db)
		const modelId = input.model ?? defaultModel?.id
		if (!modelId || !(await isEnabledModel('llm', modelId, db))) {
			throw new Error('LLM model is not enabled')
		}
		const media = await db.query.media.findFirst({
			where: and(
				eq(schema.media.id, input.mediaId),
				eq(schema.media.userId, userId),
			),
		})
		if (!media) {
			throw new Error('Media not found')
		}
		const res = await subtitleService.optimizeTranscription({
			...input,
			model: modelId,
		})
		try {
			await chargeLlmUsage({
				userId,
				modelId,
				inputTokens: res.usage?.inputTokens ?? 0,
				outputTokens: res.usage?.outputTokens ?? 0,
				refType: 'subtitle-optimize',
				refId: input.mediaId,
				remark: `subtitle optimize tokens=${res.usage?.totalTokens ?? 0}`,
			})
		} catch (err) {
			if (err instanceof InsufficientPointsError) {
				throwInsufficientPointsError()
			}
			throw err
		}
		return { optimizedTranscription: res.optimizedTranscription }
	})

// Restore transcription from original backup if available
export const clearOptimizedTranscription = os
	.input(z.object({ mediaId: z.string() }))
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()
		const media = await db.query.media.findFirst({
			where: and(
				eq(schema.media.id, input.mediaId),
				eq(schema.media.userId, userId),
			),
		})
		if (!media) {
			throw new Error('Media not found')
		}
		return subtitleService.clearOptimizedTranscription(input)
	})

// ASR status: lightweight proxy to orchestrator for UI progress
export const getAsrStatus = os
	.input(z.object({ jobId: z.string().min(1) }))
	.handler(async ({ input }) => {
		const status = await getJobStatus(input.jobId)
		return status
	})
