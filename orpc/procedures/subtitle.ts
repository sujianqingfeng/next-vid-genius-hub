import fs from 'node:fs/promises'
import path from 'node:path'
import { os } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { AIModelIds, generateText } from '~/lib/ai'
import { transcribeWithWhisper } from '~/lib/asr/whisper'
import { logger } from '~/lib/logger'
import {
	OPERATIONS_DIR,
} from '~/lib/config/app.config'
import {
	WHISPER_CPP_PATH,
	RENDERED_VIDEO_FILENAME,
	CLOUDFLARE_ACCOUNT_ID,
	CLOUDFLARE_API_TOKEN,
} from '~/lib/constants/app.constants'
import { db, schema, type TranscriptionWord } from '~/lib/db'
import { renderVideoWithSubtitles } from '~/lib/media'
import {
	getTranslationPrompt,
	DEFAULT_TRANSLATION_PROMPT_ID
} from '~/lib/subtitle/config/prompts'
import {
    subtitleRenderConfigSchema,
} from '~/lib/subtitle/types'
import { startCloudJob, getJobStatus } from '~/lib/cloudflare'
import {
	parseVttCues,
	serializeVttCues,
	validateVttContent,
	normalizeVttContent
} from '~/lib/subtitle/utils/vtt'
// removed unused types from models

export const transcribe = os
	.input(
		z.object({
			mediaId: z.string(),
			model: z.enum(['whisper-large', 'whisper-medium', 'whisper-tiny-en', 'whisper-large-v3-turbo']),
			provider: z.enum(['local', 'cloudflare']).default('local'),
		}),
	)
	.handler(async ({ input }) => {
		const { mediaId, model, provider } = input

		logger.info('transcription', `Starting transcription for media ${mediaId} with ${provider}/${model}`)

		const mediaRecord = await db.query.media.findFirst({
			where: eq(schema.media.id, mediaId),
		})

		if (!mediaRecord || !mediaRecord.audioFilePath) {
			logger.error('transcription', 'Media not found or audio file path is missing')
			throw new Error('Media not found or audio file path is missing.')
		}

		let vttContent: string
		let transcriptionWords: TranscriptionWord[] | undefined

		if (provider === 'cloudflare') {
			// Validate Cloudflare configuration
			if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
				logger.error('transcription', 'Cloudflare configuration is missing')
				throw new Error(
					'Cloudflare configuration is missing. Please set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables.',
				)
			}

			logger.info('transcription', `Using Cloudflare provider with model ${model}`)
			const transcriptionResult = await transcribeWithWhisper({
				audioPath: mediaRecord.audioFilePath,
				model,
				provider: 'cloudflare',
				cloudflareConfig: {
					accountId: CLOUDFLARE_ACCOUNT_ID,
					apiToken: CLOUDFLARE_API_TOKEN,
				},
			})
			vttContent = transcriptionResult.vtt
			transcriptionWords = transcriptionResult.words
		} else {
			// Validate local Whisper configuration
			if (!WHISPER_CPP_PATH) {
				logger.error('transcription', 'Whisper.cpp path is not configured')
				throw new Error(
					'WHISPER_CPP_PATH is not set in the environment variables.',
				)
			}

			logger.info('transcription', `Using local Whisper provider with model ${model}`)
			const transcriptionResult = await transcribeWithWhisper({
				audioPath: mediaRecord.audioFilePath,
				model,
				provider: 'local',
				whisperProjectPath: WHISPER_CPP_PATH,
			})
			vttContent = transcriptionResult.vtt
			transcriptionWords = transcriptionResult.words
		}

		// 验证并标准化VTT格式
		const validation = validateVttContent(vttContent)
		if (!validation.isValid) {
			logger.warn('transcription', `VTT format validation failed for ${provider}: ${validation.errors.join(', ')}`)

			// 尝试标准化格式
			vttContent = normalizeVttContent(vttContent)

			// 重新验证
			const revalidation = validateVttContent(vttContent)
			if (revalidation.isValid) {
				logger.info('transcription', `Successfully normalized VTT format for ${provider}`)
			} else {
				logger.error('transcription', `Failed to normalize VTT format for ${provider}: ${revalidation.errors.join(', ')}`)
				throw new Error(`Invalid VTT format from ${provider} transcription: ${revalidation.errors.join(', ')}`)
			}
		}

		await db
			.update(schema.media)
			.set({
				transcription: vttContent,
				transcriptionWords: transcriptionWords,
			})
			.where(eq(schema.media.id, mediaId))

		logger.info('transcription', `Transcription completed successfully for media ${mediaId}`)
		return { success: true, transcription: vttContent }
	})

const translateInput = z.object({
	mediaId: z.string(),
	model: z.enum(AIModelIds),
	promptId: z.string().default(DEFAULT_TRANSLATION_PROMPT_ID).optional(),
})

export const translate = os.input(translateInput).handler(async ({ input }) => {
	const { mediaId, model, promptId } = input

	const where = eq(schema.media.id, mediaId)

	const media = await db.query.media.findFirst({
		where,
	})

	if (!media?.transcription) {
		throw new Error('Transcription not found')
	}

	// 使用配置化的提示词
	const promptConfig = getTranslationPrompt(promptId || DEFAULT_TRANSLATION_PROMPT_ID)
	if (!promptConfig) {
		throw new Error(`Invalid translation prompt ID: ${promptId}`)
	}

	logger.info('translation', `Using translation prompt: ${promptConfig.name} for media ${mediaId}`)

	const { text: translatedText } = await generateText({
		model,
		system: promptConfig.template,
		prompt: media.transcription,
	})

	await db
		.update(schema.media)
		.set({ translation: translatedText })
		.where(where)

	return {
		translation: translatedText,
	}
})

// 使用新架构中的Schema，移除重复定义

export const render = os
    .input(
        z.object({
            mediaId: z.string(),
            subtitleConfig: subtitleRenderConfigSchema.optional(),
            backend: z.enum(['local', 'cloud']).optional().default('local'),
        }),
    )
    .handler(async ({ input }) => {
        const where = eq(schema.media.id, input.mediaId)
        const media = await db.query.media.findFirst({
            where,
        })

		if (!media) {
			throw new Error('Media not found')
		}

		if (!media.translation) {
			throw new Error('Translation not found')
		}

		if (!media.filePath) {
			throw new Error('Media file path not found')
		}

        if (input.backend === 'cloud') {
            const job = await startCloudJob({
                mediaId: media.id,
                engine: 'burner-ffmpeg',
                options: { subtitleConfig: input.subtitleConfig },
            })
            return { message: 'Cloud render queued', jobId: job.jobId }
        }

        const operationDir = path.join(OPERATIONS_DIR, media.id)
        await fs.mkdir(operationDir, { recursive: true })

        const originalFilePath = media.filePath
        const outputPath = path.join(operationDir, RENDERED_VIDEO_FILENAME)

        // Pass subtitle content directly instead of writing to file
        await renderVideoWithSubtitles(
            originalFilePath,
            media.translation,
            outputPath,
            input.subtitleConfig,
        )

        await db
            .update(schema.media)
            .set({ videoWithSubtitlesPath: outputPath })
            .where(where)

        return {
            message: 'Rendering started',
        }
    })

export const updateTranslation = os
	.input(
		z.object({
			mediaId: z.string(),
			translation: z.string(),
		}),
	)
	.handler(async ({ input }) => {
		const where = eq(schema.media.id, input.mediaId)
		await db
			.update(schema.media)
			.set({ translation: input.translation })
			.where(where)
		return { success: true }
	})

export const deleteTranslationCue = os
	.input(
		z.object({
			mediaId: z.string(),
			index: z.number().min(0),
		}),
	)
	.handler(async ({ input }) => {
		const where = eq(schema.media.id, input.mediaId)
		const media = await db.query.media.findFirst({ where })
		if (!media?.translation) throw new Error('Translation not found')
		const cues = parseVttCues(media.translation)
		if (input.index < 0 || input.index >= cues.length)
			throw new Error('Cue index out of range')
		cues.splice(input.index, 1)
    const updated = serializeVttCues(cues)
    await db.update(schema.media).set({ translation: updated }).where(where)
    return { success: true, translation: updated }
})

// Cloud rendering: start job explicitly
export const startCloudRender = os
    .input(
        z.object({
            mediaId: z.string(),
            subtitleConfig: subtitleRenderConfigSchema.optional(),
        }),
    )
    .handler(async ({ input }) => {
        const where = eq(schema.media.id, input.mediaId)
        const media = await db.query.media.findFirst({ where })
        if (!media) throw new Error('Media not found')
        if (!media.translation) throw new Error('Translation not found')

        const job = await startCloudJob({
            mediaId: media.id,
            engine: 'burner-ffmpeg',
            options: { subtitleConfig: input.subtitleConfig },
        })
        return { jobId: job.jobId }
    })

// Cloud rendering: get status
export const getRenderStatus = os
    .input(z.object({ jobId: z.string().min(1) }))
    .handler(async ({ input }) => {
        const status = await getJobStatus(input.jobId)
        return status
    })
