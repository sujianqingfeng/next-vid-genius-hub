import { type TranscriptionWord } from '~/lib/db/schema'
import { Agent, ProxyAgent, fetch as undiciFetch } from 'undici'
import { PROXY_URL, ASR_TARGET_BITRATES, ASR_SAMPLE_RATE } from '~/lib/config/app.config'
import { prepareAudioForCloudflare } from '~/lib/asr/prepare'
import { logger } from '~/lib/logger'

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
		// Candidate payloads: start with provided buffer, then smaller forced re-encodes if 413 occurs
		const originalBody = audioBuffer

		// Optional proxy + tuned timeouts via undici
		const proxyUrl = process.env.CF_PROXY_URL || PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY
		const connectTimeout = Number(process.env.CF_CONNECT_TIMEOUT_MS || '') || 30_000
		const headersTimeout = Number(process.env.CF_HEADERS_TIMEOUT_MS || '') || 120_000
		const bodyTimeout = Number(process.env.CF_BODY_TIMEOUT_MS || '') || 300_000

		const dispatcher = proxyUrl
			? new ProxyAgent(proxyUrl)
			: new Agent({
					connect: { timeout: connectTimeout },
					headersTimeout,
					bodyTimeout,
			  })

		const fetchImpl = undiciFetch

		async function runOnce(body: ArrayBuffer) {
			// Cloudflare expects the model slug as path segments (e.g., /ai/run/@cf/openai/whisper-tiny-en)
			// Do NOT URL-encode slashes here, otherwise the API returns 7000 "No route for that URI".
			const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`
			const resp = await fetchImpl(url, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiToken}`,
					// Binary audio upload; octet-stream is accepted by Workers AI
					'Content-Type': 'application/octet-stream',
					Accept: 'application/json',
				},
				body: body as any,
				dispatcher,
			})
            if (!resp.ok) {
                const errorText = await resp.text()
                logger.error('transcription', `Cloudflare API error: ${errorText}`)
                throw new Error(`Transcription failed: ${resp.status} ${errorText}`)
            }
			const json: CloudflareApiResponse = await resp.json()
			return json
		}

		// Assemble candidate encodings: try original, then force 24kbps and 16kbps (or from ASR_TARGET_BITRATES)
		const uniqueRates = Array.from(
			new Set([
				...ASR_TARGET_BITRATES.filter((b) => Number.isFinite(b) && b > 0 && b < 48),
				24,
				16,
			]),
		)
		const candidates: Array<{ body: ArrayBuffer; label: string }> = [{ body: originalBody, label: 'original' }]
		for (const br of uniqueRates) {
			try {
				const forced = await prepareAudioForCloudflare(originalBody, {
					targetBitrateKbps: br,
					sampleRate: ASR_SAMPLE_RATE,
					forceTranscode: true,
				})
				if (forced && forced.byteLength < (candidates[candidates.length - 1]?.body.byteLength || Infinity)) {
					try {
						const mb = (forced.byteLength / 1048576).toFixed(2)
						console.info(`[Cloudflare Whisper] Fallback candidate: ${br}kbps -> ${forced.byteLength} bytes (~${mb} MB) @ ${ASR_SAMPLE_RATE}Hz`)
					} catch {}
					candidates.push({ body: forced, label: `force-${br}kbps` })
				}
			} catch (e) {
				// If ffmpeg missing or fails, skip this candidate
			}
		}

		let result: CloudflareApiResponse | undefined
		let lastErr: unknown
		for (const cand of candidates) {
			for (let attempt = 0; attempt < 3; attempt++) {
				try {
					result = await runOnce(cand.body)
					break
				} catch (e) {
					lastErr = e
					const msg = e instanceof Error ? e.message : String(e)
					// If size-related (413 or code 3006), switch to next smaller candidate
					if (/\b413\b|code\":\s*3006|Request is too large/i.test(msg)) {
						// Move to next candidate (smaller)
						break
					}
					// Backoff on likely transient network failures
					if (/6001|Network connection lost|ECONNRESET|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT/i.test(msg) && attempt < 2) {
						await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
						continue
					}
					throw e
				}
			}
			if (result) break
		}
		if (!result) throw lastErr ?? new Error('Unknown Cloudflare error')

		

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

        logger.error('transcription', 'Unexpected response format from Cloudflare API')
        throw new Error('Transcription failed - unexpected response format')
    } catch (error) {
        logger.error('transcription', `Cloudflare Whisper transcription error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        const baseMsg = error instanceof Error ? error.message : 'Unknown error'
        // Offer actionable guidance on common network issues
		if (typeof baseMsg === 'string' && /UND_ERR_CONNECT_TIMEOUT|ECONNRESET|ENETUNREACH|ETIMEDOUT/i.test(baseMsg)) {
			const hint = `
		Cannot reach api.cloudflare.com within the configured connect timeout.
		- If you are behind a corporate proxy or egress is restricted, set CF_PROXY_URL/HTTPS_PROXY/HTTP_PROXY.
		- You can increase timeouts via CF_CONNECT_TIMEOUT_MS/CF_HEADERS_TIMEOUT_MS/CF_BODY_TIMEOUT_MS.
		- As a fallback, try provider 'local' (WHISPER_CPP_PATH required) or use downsampleBackend='cloud' to route via orchestrator.
		`.trim()
			throw new Error(`Cloudflare transcription failed: ${baseMsg}. ${hint}`)
		}
		throw new Error(`Cloudflare transcription failed: ${baseMsg}`)
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
