import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { transcribeWithCloudflareWhisper } from '~/lib/ai/cloudflare'

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

/**
 * Main transcription function that routes to local or Cloudflare provider
 */
export async function transcribeWithWhisper({
	audioPath,
	model,
	provider,
	whisperProjectPath,
	cloudflareConfig,
}: TranscribeWithWhisperOptions): Promise<string> {
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
): Promise<string> {
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

/**
 * Transcribe using Cloudflare Workers AI
 */
async function transcribeWithCloudflareProvider(
	audioPath: string,
	model: WhisperModel,
	config: CloudflareConfig,
): Promise<string> {
	// Map model names to Cloudflare model identifiers
	const cloudflareModelMap: Record<string, '@cf/openai/whisper-tiny-en' | '@cf/openai/whisper-large-v3-turbo'> = {
		'whisper-tiny-en': '@cf/openai/whisper-tiny-en',
		'whisper-large-v3-turbo': '@cf/openai/whisper-large-v3-turbo',
	}

	const cloudflareModel = cloudflareModelMap[model]
	if (!cloudflareModel) {
		throw new Error(`Model ${model} is not supported by Cloudflare provider`)
	}

	// Read audio file as ArrayBuffer
	const audioBuffer = await fs.readFile(audioPath)
	const arrayBuffer = audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength) as ArrayBuffer

	// Call Cloudflare API
	return transcribeWithCloudflareWhisper(arrayBuffer, {
		...config,
		model: cloudflareModel,
	})
}

/**
 * Get available models for each provider
 */
export function getAvailableModels(provider: TranscriptionProvider): WhisperModel[] {
	if (provider === 'cloudflare') {
		return ['whisper-tiny-en', 'whisper-large-v3-turbo']
	} else {
		return ['whisper-medium', 'whisper-large']
	}
}
