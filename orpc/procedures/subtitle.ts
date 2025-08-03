import { os } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { AIModelIds, generateText } from '~/lib/ai'
import { transcribeWithWhisper } from '~/lib/asr/whisper'
import { WHISPER_CPP_PATH } from '~/lib/constants'
import { db, schema } from '~/lib/db'

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
For example:
Original:
- Hello, world!

Translated:
- Hello, world!
- 你好，世界！`

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
