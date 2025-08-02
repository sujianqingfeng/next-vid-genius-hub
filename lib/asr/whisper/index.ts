import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'

export type WhisperModel = 'whisper-large' | 'whisper-medium'

interface TranscribeWithWhisperOptions {
	audioPath: string
	model: WhisperModel
	whisperProjectPath: string
}

export async function transcribeWithWhisper({
	audioPath,
	model,
	whisperProjectPath,
}: TranscribeWithWhisperOptions): Promise<string> {
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

	return vttContent
}
