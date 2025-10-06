import fs from 'node:fs/promises'
import path from 'node:path'
import { os } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { AIModelIds, generateText } from '~/lib/ai'
import { transcribeWithWhisper } from '~/lib/asr/whisper'
import {
	OPERATIONS_DIR,
	WHISPER_CPP_PATH,
	RENDERED_VIDEO_FILENAME,
} from '~/lib/constants'
import { db, schema } from '~/lib/db'
import { renderVideoWithSubtitles } from '~/lib/media'
import { type SubtitleRenderConfig } from '~/lib/media/types'
import { parseVttCues, serializeVttCues } from '~/lib/media/utils/vtt'

export const transcribe = os
	.input(
		z.object({
			mediaId: z.string(),
			model: z.enum(['whisper-large', 'whisper-medium']),
		}),
	)
	.handler(async ({ input }) => {
		const { mediaId, model } = input

		const mediaRecord = await db.query.media.findFirst({
			where: eq(schema.media.id, mediaId),
		})

		if (!mediaRecord || !mediaRecord.audioFilePath) {
			throw new Error('Media not found or audio file path is missing.')
		}

		if (!WHISPER_CPP_PATH) {
			throw new Error(
				'WHISPER_CPP_PATH is not set in the environment variables.',
			)
		}

		const vttContent = await transcribeWithWhisper({
			audioPath: mediaRecord.audioFilePath,
			model,
			whisperProjectPath: WHISPER_CPP_PATH,
		})

		await db
			.update(schema.media)
			.set({
				transcription: vttContent,
			})
			.where(eq(schema.media.id, mediaId))

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

	const bilingualPrompt = `You are a professional translator. Your task is to translate the text content of a VTT file from English to Chinese.
You will be given the content of a VTT file.
You need to add the Chinese translation under each English sentence.
Do not translate timestamps or other metadata.
For each text segment, the original English text should be on one line, and the Chinese translation should be on the following line.
IMPORTANT: Do NOT add any dashes (-) or bullet points to the translated text. Keep the text clean without prefixes.
IMPORTANT: Do NOT add punctuation at the end of sentences for both English and Chinese text. Remove periods, commas, exclamation marks, and question marks at the end of each line.

For example:
Original:
Hello, world!

Translated:
Hello, world
你好，世界

Another example:
Original:
This is a test.

Translated:
This is a test
这是一个测试`

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

const subtitleConfigSchema: z.ZodType<SubtitleRenderConfig> = z.object({
	fontSize: z.number().min(12).max(72),
	textColor: z.string().regex(hexColor, 'Invalid text color'),
	backgroundColor: z.string().regex(hexColor, 'Invalid background color'),
	backgroundOpacity: z.number().min(0).max(1),
	outlineColor: z.string().regex(hexColor, 'Invalid outline color'),
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
