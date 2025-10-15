import { type TranscriptionWord } from '~/lib/db/schema'

export interface CloudflareWhisperConfig {
	accountId: string
	apiToken: string
	model: '@cf/openai/whisper-tiny-en' | '@cf/openai/whisper-large-v3-turbo' | '@cf/openai/whisper'
}

export interface CloudflareTranscriptionData {
	text: string
	word_count?: number
	words?: TranscriptionWord[]
	vtt?: string
}

export interface CloudflareTranscriptionResponse {
	result: CloudflareTranscriptionData
	success: true
	errors: []
	messages: []
}

export interface CloudflareErrorResponse {
	success: false
	errors: Array<{
		code: number
		message: string
	}>
}

export type CloudflareApiResponse = CloudflareTranscriptionResponse | CloudflareErrorResponse

/**
 * Transcribe audio using Cloudflare Workers AI Whisper model
 *
 * @param audioBuffer - Audio data as ArrayBuffer
 * @param config - Cloudflare configuration
 * @returns Transcribed data with VTT format and words array
 */
export async function transcribeWithCloudflareWhisper(
	audioBuffer: ArrayBuffer,
	config: CloudflareWhisperConfig,
): Promise<{ vtt: string; words?: TranscriptionWord[] }> {
	const { accountId, apiToken, model } = config

	try {
		// Log the payload size prior to upload
		try {
			const size = audioBuffer.byteLength
			const mb = (size / (1024 * 1024)).toFixed(2)
			console.info(`[Cloudflare Whisper] Upload size: ${size} bytes (~${mb} MB), model=${model}`)
		} catch {}
		// Send raw binary payload as documented by Cloudflare REST API
		// (equivalent to: curl ... --data-binary "@file.mp3")
		const binaryBody = audioBuffer

		async function runOnce() {
            const resp = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${apiToken}`,
                        // Use a specific audio type when possible; octet-stream also works.
                        'Content-Type': 'audio/mpeg',
                        Accept: 'application/json',
                    },
                    body: binaryBody,
                },
            )
			if (!resp.ok) {
				const errorText = await resp.text()
				console.error('Cloudflare API error:', errorText)
				throw new Error(`Transcription failed: ${resp.status} ${errorText}`)
			}
			const json: CloudflareApiResponse = await resp.json()
			return json
		}

		// Light retry for transient network issues (e.g., code 6001)
		let result: CloudflareApiResponse | undefined
		let lastErr: unknown
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				result = await runOnce()
				break
			} catch (e) {
				lastErr = e
				const msg = e instanceof Error ? e.message : String(e)
				// Backoff on likely transient failures
				if (/6001|Network connection lost|ECONNRESET|ETIMEDOUT/i.test(msg) && attempt < 2) {
					await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
					continue
				}
				throw e
			}
		}
		if (!result) throw lastErr ?? new Error('Unknown Cloudflare error')

		console.log('Cloudflare API response:', result)

		// Check for error response
		if ('success' in result && !result.success) {
			throw new Error(result.errors?.map(e => e.message).join(', ') || 'Transcription failed')
		}

		// Check for successful response with text in result object
		if ('result' in result && result.result && result.result.text) {
			const transcriptionData = result.result
			return {
				vtt: transcriptionData.vtt || convertToVTT(transcriptionData.text),
				words: transcriptionData.words
			}
		}

		// Also handle direct response format (without result wrapper)
		if ('text' in result && result.text) {
			// Type assertion for direct format
			const directResult = result as CloudflareTranscriptionData
			return {
				vtt: directResult.vtt || convertToVTT(directResult.text),
				words: directResult.words
			}
		}

		console.error('Unexpected response format:', result)
		throw new Error('Transcription failed - unexpected response format')
	} catch (error) {
		console.error('Cloudflare Whisper transcription error:', error)
		throw new Error(
			`Cloudflare transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
		)
	}
}

/**
 * Convert plain text transcription to WebVTT format
 *
 * @param text - Transcribed text
 * @returns VTT formatted string
 */
function convertToVTT(text: string): string {
	const lines = text.trim().split('\n').filter(line => line.trim())
	const cues: string[] = []

	// Add VTT header
	cues.push('WEBVTT')
	cues.push('')

	// Create simple VTT with approximate timings
	// Assume each line takes about 3 seconds to speak
	let currentTime = 0

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim()
		if (!line) continue

		const startTime = formatTime(currentTime)
		const endTime = formatTime(currentTime + 3)

		cues.push(`${startTime} --> ${endTime}`)
		cues.push(line)
		cues.push('')

		currentTime += 3
	}

	return cues.join('\n')
}

/**
 * Format time in seconds to VTT timestamp format (HH:MM:SS.mmm)
 */
function formatTime(seconds: number): string {
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	const secs = seconds % 60
	const ms = Math.floor((secs % 1) * 1000)

	return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${Math.floor(secs).toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
}
