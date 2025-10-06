import fs from 'node:fs/promises'
import path from 'node:path'
import { os } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { AIModelIds, generateText } from '~/lib/ai'
import { transcribeWithWhisper, type TranscriptionProvider, type WhisperModel } from '~/lib/asr/whisper'
import { logger } from '~/lib/logger'
import {
	OPERATIONS_DIR,
	WHISPER_CPP_PATH,
	RENDERED_VIDEO_FILENAME,
	CLOUDFLARE_ACCOUNT_ID,
	CLOUDFLARE_API_TOKEN,
} from '~/lib/constants'
import { db, schema, type TranscriptionWord } from '~/lib/db'
import { renderVideoWithSubtitles } from '~/lib/media'
import { type SubtitleRenderConfig } from '~/lib/media/types'
import { parseVttCues, serializeVttCues } from '~/lib/media/utils/vtt'

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
})

export const translate = os.input(translateInput).handler(async ({ input }) => {
	const { mediaId, model } = input

	const where = eq(schema.media.id, mediaId)

	const media = await db.query.media.findFirst({
		where,
	})

	if (!media?.transcription) {
		throw new Error('Transcription not found')
	}

	const bilingualPrompt = `You are a professional translator. Your task is to translate the text content of a VTT file from English to Chinese while preserving the VTT format exactly.

You will be given the content of a VTT file.
You MUST:
1. Keep all timestamp lines (e.g., "00.000 --> 01.740") EXACTLY as they are
2. Keep the WEBVTT header exactly as it is
3. For each text segment under a timestamp, add the Chinese translation on the next line
4. Do NOT translate timestamps or any metadata
5. Keep the exact same structure as the original VTT

IMPORTANT: Do NOT add any dashes (-) or bullet points to the translated text. Keep the text clean without prefixes.
IMPORTANT: Do NOT add punctuation at the end of sentences for both English and Chinese text. Remove periods, commas, exclamation marks, and question marks at the end of each line.

Example format:
WEBVTT

00.000 --> 02.000
Hello, world
你好，世界

02.000 --> 04.000
This is a test
这是一个测试

Return the complete VTT content with preserved timestamps and structure.`

	const { text: translatedText } = await generateText({
		model,
		system: bilingualPrompt,
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

const hexColor = /^#(?:[0-9a-fA-F]{3}){1,2}$/

const timeSegmentEffectSchema = z.object({
	id: z.string(),
	startTime: z.number().min(0),
	endTime: z.number().min(0),
	muteAudio: z.boolean(),
	blackScreen: z.boolean(),
	description: z.string().optional(),
})

const hintTextConfigSchema = z.object({
	enabled: z.boolean(),
	text: z.string(),
	fontSize: z.number().min(12).max(72),
	textColor: z.string().regex(hexColor, 'Invalid text color'),
	backgroundColor: z.string().regex(hexColor, 'Invalid background color'),
	backgroundOpacity: z.number().min(0).max(1),
	outlineColor: z.string().regex(hexColor, 'Invalid outline color'),
	position: z.enum(['center', 'top', 'bottom']),
	animation: z.enum(['fade-in', 'slide-up', 'none']).optional(),
})

const subtitleConfigSchema: z.ZodType<SubtitleRenderConfig> = z.object({
	fontSize: z.number().min(12).max(72),
	textColor: z.string().regex(hexColor, 'Invalid text color'),
	backgroundColor: z.string().regex(hexColor, 'Invalid background color'),
	backgroundOpacity: z.number().min(0).max(1),
	outlineColor: z.string().regex(hexColor, 'Invalid outline color'),
	timeSegmentEffects: z.array(timeSegmentEffectSchema),
	hintTextConfig: hintTextConfigSchema.optional(),
})

export const render = os
	.input(
		z.object({
			mediaId: z.string(),
			subtitleConfig: subtitleConfigSchema.optional(),
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
