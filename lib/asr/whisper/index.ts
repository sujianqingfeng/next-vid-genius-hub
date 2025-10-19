import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { transcribeWithCloudflareWhisper } from '~/lib/ai/cloudflare'
import { prepareAudioForCloudflare } from '~/lib/asr/prepare'
import { logger } from '~/lib/logger'
import { type TranscriptionWord } from '~/lib/db/schema'
import {
	getAvailableModels,
	getModelLabel,
	getModelDescription,
	getDefaultModel
} from '~/lib/subtitle/config/models'
import type {
	TranscriptionProvider,
	WhisperModel
} from '~/lib/subtitle/config/models'

export interface CloudflareConfig {
	accountId: string
	apiToken: string
}

interface TranscribeWithWhisperOptions {
    // Prefer audioPath for local provider; for cloudflare provider, either audioPath or audioBuffer is accepted.
    audioPath?: string
    audioBuffer?: ArrayBuffer
    model: WhisperModel
    provider: TranscriptionProvider
    whisperProjectPath?: string
    cloudflareConfig?: CloudflareConfig
}

export interface TranscriptionResult {
	vtt: string
	words?: TranscriptionWord[]
}

/**
 * Main transcription function that routes to local or Cloudflare provider
 */
export async function transcribeWithWhisper({
    audioPath,
    audioBuffer,
    model,
    provider,
    whisperProjectPath,
    cloudflareConfig,
}: TranscribeWithWhisperOptions): Promise<TranscriptionResult> {
    if (provider === 'cloudflare') {
        if (!cloudflareConfig) {
            throw new Error('Cloudflare config is required for cloudflare provider')
        }
        // Map our WhisperModel to Cloudflare model id
        const cloudflareModelMap: Record<string, '@cf/openai/whisper-tiny-en' | '@cf/openai/whisper-large-v3-turbo' | '@cf/openai/whisper'> = {
            'whisper-tiny-en': '@cf/openai/whisper-tiny-en',
            'whisper-large-v3-turbo': '@cf/openai/whisper-large-v3-turbo',
            'whisper-medium': '@cf/openai/whisper',
            'whisper-large': '@cf/openai/whisper',
        }
        const modelId = cloudflareModelMap[model]
        if (!modelId) throw new Error(`Model ${model} is not supported by Cloudflare provider`)

        if (audioBuffer) {
            try {
                const size = audioBuffer.byteLength
                const mb = (size / (1024 * 1024)).toFixed(2)
                logger.info('transcription', `Cloudflare upload (buffer): ${size} bytes (~${mb} MB)`) 
            } catch {}
            const prepared = await prepareAudioForCloudflare(audioBuffer)
            return transcribeWithCloudflareWhisper(prepared, { ...cloudflareConfig, model: modelId })
        }
        if (!audioPath) throw new Error('Either audioBuffer or audioPath is required for cloudflare provider')
        // Read file to buffer for Cloudflare
        const fs = await import('fs/promises')
        const b = await fs.readFile(audioPath)
        try {
            const size = b.byteLength
            const mb = (size / (1024 * 1024)).toFixed(2)
            logger.info('transcription', `Cloudflare upload (file): ${size} bytes (~${mb} MB) from ${audioPath}`)
        } catch {}
        const arrayBuffer = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
        const prepared = await prepareAudioForCloudflare(arrayBuffer)
        return transcribeWithCloudflareWhisper(prepared, { ...cloudflareConfig, model: modelId })
    } else {
        if (!whisperProjectPath) {
            throw new Error('Whisper project path is required for local provider')
        }
        if (!audioPath) throw new Error('audioPath is required for local provider')
        return transcribeWithLocalWhisper(audioPath, model, whisperProjectPath)
    }
}

/**
 * Transcribe using local Whisper.cpp
 */
async function transcribeWithLocalWhisper(
	audioPath: string,
	model: WhisperModel,
	whisperProjectPath: string,
): Promise<TranscriptionResult> {
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

	logger.info('transcription', `Starting local Whisper transcription for ${audioPath}`)
	logger.debug('transcription', `Whisper executable: ${whisperExecutablePath}`)
	logger.debug('transcription', `Whisper model: ${whisperModelPath}`)

	await new Promise<void>((resolve, reject) => {
		const whisper = spawn(whisperExecutablePath, [
			'-m',
			whisperModelPath,
			audioPath,
			'-ovtt',
		])

		whisper.on('close', (code) => {
			if (code === 0) {
				logger.info('transcription', 'Local Whisper transcription completed successfully')
				resolve()
			} else {
				logger.error('transcription', `whisper.cpp exited with code ${code}`)
				reject(new Error(`whisper.cpp exited with code ${code}`))
			}
		})

		whisper.stderr.on('data', (data) => {
			logger.warn('transcription', `whisper.cpp stderr: ${data.toString().trim()}`)
		})
	})

	const vttPath = `${audioPath}.vtt`
	const vttContent = await fs.readFile(vttPath, 'utf-8')
	// await fs.unlink(vttPath) // Temporarily keep VTT file for inspection

	// Local runs lack per-word timing, so surface an empty list and let callers clear prior data
	const words: TranscriptionWord[] = []

	// Clean up VTT file
	await fs.unlink(vttPath)

	logger.info('transcription', `Generated VTT content: ${vttContent.length} characters${words ? `, ${words.length} words` : ''}`)

	// Local Whisper transcription completed
	logger.info('transcription', `Local Whisper transcription completed: ${vttContent.length} characters`)

	return { vtt: vttContent, words }
}

// 重新导出新配置中的函数
export { getAvailableModels, getModelLabel, getModelDescription, getDefaultModel }
