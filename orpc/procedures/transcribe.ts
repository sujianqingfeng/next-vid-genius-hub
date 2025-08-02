import { os } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
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
