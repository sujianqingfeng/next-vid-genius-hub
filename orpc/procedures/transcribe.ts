import { os } from '@orpc/server'
import { spawn } from 'child_process'
import { eq } from 'drizzle-orm'
import fs from 'fs/promises'
import path from 'path'
import { z } from 'zod'
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

		const audioPath = mediaRecord.audioFilePath
		const whisperProjectPath = process.env.WHISPER_CPP_PATH

		if (!whisperProjectPath) {
			throw new Error(
				'WHISPER_CPP_PATH is not set in the environment variables.',
			)
		}

		const whisperExecutablePath = path.join(
			whisperProjectPath,
			'build/bin/whisper-cli',
		)
		const whisperModelPath = path.join(
			whisperProjectPath,
			model === 'whisper-large'
				? 'models/ggml-large-v3-turbo-q8_0.bin'
				: 'models/ggml-medium.bin',
		)

		try {
			// Step 1: Transcribe using whisper.cpp
			await new Promise<void>((resolve, reject) => {
				const whisper = spawn(whisperExecutablePath, [
					'-m',
					whisperModelPath,
					audioPath,
					'-ovtt',
				])

				whisper.on('close', (code) => {
					if (code === 0) {
						resolve()
					} else {
						reject(new Error(`whisper.cpp exited with code ${code}`))
					}
				})

				whisper.stderr.on('data', (data) => {
					console.error(`whisper.cpp stderr: ${data}`)
				})
			})

			const vttPath = `${audioPath}.vtt`
			const vttContent = await fs.readFile(vttPath, 'utf-8')

			await fs.unlink(vttPath)

			return { success: true, transcription: vttContent }
		} catch (error) {
			throw error
		}
	})
