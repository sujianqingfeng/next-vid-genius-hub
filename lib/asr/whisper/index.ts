import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { transcribeWithCloudflareWhisper } from '~/lib/ai/cloudflare'
import { logger } from '~/lib/logger'
import { type TranscriptionWord } from '~/lib/db/schema'

export type TranscriptionProvider = 'local' | 'cloudflare'

export type WhisperModel =
	| 'whisper-large'
	| 'whisper-medium'
	| 'whisper-tiny-en'
	| 'whisper-large-v3-turbo'

export interface CloudflareConfig {
	accountId: string
	apiToken: string
}

interface TranscribeWithWhisperOptions {
	audioPath: string
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
	model,
	provider,
	whisperProjectPath,
	cloudflareConfig,
}: TranscribeWithWhisperOptions): Promise<TranscriptionResult> {
	if (provider === 'cloudflare') {
		if (!cloudflareConfig) {
			throw new Error('Cloudflare config is required for cloudflare provider')
		}
		return transcribeWithCloudflareProvider(audioPath, model, cloudflareConfig)
	} else {
		if (!whisperProjectPath) {
			throw new Error('Whisper project path is required for local provider')
		}
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

/**
 * Transcribe using Cloudflare Workers AI
 */
/**
 * Parse time string in MM:SS.mmm format to seconds
 */
function parseTimeToSeconds(timeStr: string): number {
	const [minutes, secondsWithMs] = timeStr.split(':')
	const [seconds, milliseconds] = secondsWithMs.split('.')
	return parseInt(minutes) * 60 + parseInt(seconds) + parseInt(milliseconds) / 1000
}

async function transcribeWithCloudflareProvider(
	audioPath: string,
	model: WhisperModel,
	config: CloudflareConfig,
): Promise<TranscriptionResult> {
	logger.info('transcription', `Starting Cloudflare transcription for ${audioPath}`)

	// Map model names to Cloudflare model identifiers
	const cloudflareModelMap: Record<string, '@cf/openai/whisper-tiny-en' | '@cf/openai/whisper-large-v3-turbo' | '@cf/openai/whisper'> = {
		'whisper-tiny-en': '@cf/openai/whisper-tiny-en',
		'whisper-large-v3-turbo': '@cf/openai/whisper-large-v3-turbo',
		'whisper-medium': '@cf/openai/whisper',
	}

	const cloudflareModel = cloudflareModelMap[model]
	if (!cloudflareModel) {
		logger.error('transcription', `Model ${model} is not supported by Cloudflare provider`)
		throw new Error(`Model ${model} is not supported by Cloudflare provider`)
	}

	logger.info('transcription', `Using Cloudflare model: ${cloudflareModel}`)

	// Read audio file as ArrayBuffer
	const audioBuffer = await fs.readFile(audioPath)
	const arrayBuffer = audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength) as ArrayBuffer

	logger.debug('transcription', `Audio buffer size: ${arrayBuffer.byteLength} bytes`)

	// Call Cloudflare API
	const result = await transcribeWithCloudflareWhisper(arrayBuffer, {
		...config,
		model: cloudflareModel,
	})

	logger.info('transcription', `Cloudflare transcription completed: ${result.vtt.length} characters${result.words ? `, ${result.words.length} words` : ''}`)

	// Print Cloudflare transcription results for debugging
	console.log('\n=== Cloudflare Transcription Results ===')
	console.log('VTT Content:')
	console.log(result.vtt)
	console.log('\nWords Array:')
	if (result.words && result.words.length > 0) {
		console.log(`Total words: ${result.words.length}`)
		result.words.forEach((word, index) => {
			console.log(`${index + 1}. "${word.word}" (${word.start.toFixed(2)}s - ${word.end.toFixed(2)}s)`)
		})
	} else {
		console.log('No word timing data available')
	}
	console.log('=== End Cloudflare Transcription Results ===\n')

	return result
}

/**
 * Get available models for each provider
 */
export function getAvailableModels(provider: TranscriptionProvider): WhisperModel[] {
	if (provider === 'cloudflare') {
		return ['whisper-tiny-en', 'whisper-large-v3-turbo', 'whisper-medium']
	} else {
		return ['whisper-medium', 'whisper-large']
	}
}
