import { transcribeWithCloudflareWhisper } from '~/lib/ai/cloudflare'
import { prepareAudioForCloudflare } from '~/lib/asr/prepare'
import { logger } from '~/lib/logger'
import { type TranscriptionWord } from '~/lib/db/schema'
import type { CloudflareInputFormat, WhisperModel } from '~/lib/subtitle/config/models'

export interface CloudflareConfig {
	accountId: string
	apiToken: string
	inputFormat?: CloudflareInputFormat
}

interface TranscribeWithWhisperOptions {
	audioPath?: string
	audioBuffer?: ArrayBuffer
	model: WhisperModel
	cloudflareConfig: CloudflareConfig
	language?: string
}

export interface TranscriptionResult {
	vtt: string
	words?: TranscriptionWord[]
}

/**
 * Cloudflare-only transcription helper
 */
export async function transcribeWithWhisper({
	audioPath,
	audioBuffer,
	model,
	cloudflareConfig,
	language,
}: TranscribeWithWhisperOptions): Promise<TranscriptionResult> {
	const cloudflareModelMap: Record<
		string,
		'@cf/openai/whisper-tiny-en' | '@cf/openai/whisper-large-v3-turbo' | '@cf/openai/whisper'
	> = {
		'whisper-tiny-en': '@cf/openai/whisper-tiny-en',
		'whisper-large-v3-turbo': '@cf/openai/whisper-large-v3-turbo',
		'whisper-medium': '@cf/openai/whisper',
	}
	const modelId = cloudflareModelMap[model]
	if (!modelId) throw new Error(`Model ${model} is not supported by Cloudflare provider`)

	// Prefer buffer if provided; otherwise read from audioPath
	let preparedBuffer: ArrayBuffer
	if (audioBuffer) {
		try {
			const size = audioBuffer.byteLength
			const mb = (size / (1024 * 1024)).toFixed(2)
			logger.info('transcription', `Cloudflare upload (buffer): ${size} bytes (~${mb} MB)`)
		} catch {}
		preparedBuffer = await prepareAudioForCloudflare(audioBuffer)
	} else {
		if (!audioPath) throw new Error('Either audioBuffer or audioPath is required for Cloudflare provider')
		const fs = await import('fs/promises')
		const fileBuffer = await fs.readFile(audioPath)
		try {
			const size = fileBuffer.byteLength
			const mb = (size / (1024 * 1024)).toFixed(2)
			logger.info('transcription', `Cloudflare upload (file): ${size} bytes (~${mb} MB) from ${audioPath}`)
		} catch {}
		const arrayBuffer = fileBuffer.buffer.slice(
			fileBuffer.byteOffset,
			fileBuffer.byteOffset + fileBuffer.byteLength,
		) as ArrayBuffer
		preparedBuffer = await prepareAudioForCloudflare(arrayBuffer)
	}

	return transcribeWithCloudflareWhisper(
		preparedBuffer,
		{ ...cloudflareConfig, model: modelId },
		language,
	)
}

