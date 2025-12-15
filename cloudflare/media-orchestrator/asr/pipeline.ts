import { bucketPaths, deriveCloudflareAsrCapabilities } from '@app/media-domain'
import type { Env } from '../types'
import { putObjectStreamToStorage, readObjectArrayBufferWithFallback } from '../storage/fallback'
import { jobStub } from '../utils/job'

export async function runAsrForPipeline(env: Env, doc: any) {
	const jobId = doc.jobId
	const audioKey: string | undefined =
		doc.outputAudioKey || doc.outputs?.audio?.key
	if (!audioKey) throw new Error('asr-pipeline: missing outputAudioKey')

	// Decide model
	const model: string = (doc?.metadata?.model as string) || '@cf/openai/whisper-tiny-en'
	const jobLanguage =
		typeof doc?.metadata?.language === 'string' ? doc.metadata.language : undefined
	const normalizedLanguage =
		jobLanguage && jobLanguage !== 'auto' ? jobLanguage : undefined

	const aiAccountId = (env.CF_AI_ACCOUNT_ID || '').trim()
	const aiApiToken = (env.CF_AI_API_TOKEN || '').trim()
	if (!aiAccountId || !aiApiToken) {
		throw new Error('asr-pipeline: Workers AI credentials not configured (CF_AI_ACCOUNT_ID/CF_AI_API_TOKEN)')
	}

	const audioBuf = await readObjectArrayBufferWithFallback(env, audioKey)
	if (!audioBuf) throw new Error(`asr-pipeline: audio not found: ${audioKey}`)

	const caps = deriveCloudflareAsrCapabilities(model)
	const languageForCloud = caps.supportsLanguageHint ? normalizedLanguage : undefined
	const runUrl = `https://api.cloudflare.com/client/v4/accounts/${aiAccountId}/ai/run/${model}`

	const arrayBufferToBase64 = (buf: ArrayBuffer): string => {
		const bytes = new Uint8Array(buf)
		let binary = ''
		const chunkSize = 0x8000
		for (let i = 0; i < bytes.length; i += chunkSize) {
			const chunk = bytes.subarray(i, i + chunkSize)
			binary += String.fromCharCode(...chunk)
		}
		return btoa(binary)
	}

	let reqBody: BodyInit
	let contentType = 'application/octet-stream'
	if (caps.inputFormat === 'base64') {
		contentType = 'application/json'
		reqBody = JSON.stringify({
			audio: arrayBufferToBase64(audioBuf),
			...(languageForCloud ? { language: languageForCloud } : {}),
		})
	} else if (caps.inputFormat === 'array') {
		contentType = 'application/json'
		reqBody = JSON.stringify({
			audio: Array.from(new Uint8Array(audioBuf)),
			...(languageForCloud ? { language: languageForCloud } : {}),
		})
	} else {
		reqBody = audioBuf as unknown as BodyInit
	}

	console.log('[asr-pipeline] calling Workers AI', { jobId, model })
	const r = await fetch(runUrl, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${aiApiToken}`,
			'Content-Type': contentType,
			Accept: 'application/json',
		},
		body: reqBody,
	})
	if (!r.ok) {
		const t = await r.text().catch(() => '')
		throw new Error(`Workers AI ASR failed: ${r.status} ${t}`)
	}
	const result = (await r.json()) as any

	const extractWords = (payload: any) => {
		if (payload?.words && Array.isArray(payload.words) && payload.words.length > 0) {
			return payload.words as Array<{ word: string; start: number; end: number }>
		}
		if (Array.isArray(payload?.segments)) {
			const collected: Array<{ word: string; start: number; end: number }> = []
			for (const seg of payload.segments as Array<any>) {
				if (seg?.words && Array.isArray(seg.words)) {
					for (const w of seg.words) {
						if (
							w &&
							typeof w.word === 'string' &&
							typeof w.start === 'number' &&
							typeof w.end === 'number'
						) {
							collected.push({ word: w.word, start: w.start, end: w.end })
						}
					}
				}
			}
			return collected.length > 0 ? collected : undefined
		}
		return undefined
	}

	let vtt = ''
	let words: unknown | undefined
	if (result?.result?.vtt || result?.vtt) {
		vtt = result?.result?.vtt || result?.vtt
		words =
			result?.result?.words ||
			extractWords(result?.result) ||
			result?.words ||
			extractWords(result)
	} else if (result?.result?.text || result?.text) {
		const text = result?.result?.text || result?.text
		vtt = `WEBVTT\n\n00:00:00.000 --> 00:00:03.000\n${String(text).trim()}\n`
		words =
			result?.result?.words ||
			extractWords(result?.result) ||
			result?.words ||
			extractWords(result)
	} else {
		throw new Error('Workers AI ASR: unexpected response format')
	}

	const mediaId = doc.mediaId || 'unknown'
	const title = doc?.title as string | undefined
	const pathOptions = { title }
	const vttKey = bucketPaths.asr.results.transcript(mediaId, jobId, pathOptions)
	await putObjectStreamToStorage(env, vttKey, 'text/vtt', String(vtt))

	let wordsKey: string | undefined
	if (words && (Array.isArray(words) ? words.length > 0 : true)) {
		wordsKey = bucketPaths.asr.results.words(mediaId, jobId, pathOptions)
		await putObjectStreamToStorage(env, wordsKey, 'application/json', JSON.stringify(words))
	}

	// Update DO state with outputs
	const stub = jobStub(env, jobId)
	if (stub) {
		const outputs: any = {}
		if (vttKey) outputs.vtt = { key: vttKey }
		if (wordsKey) outputs.words = { key: wordsKey }
		const p = {
			jobId,
			status: vttKey ? 'completed' : 'failed',
			outputs,
			ts: Date.now(),
		}
		await stub.fetch('https://do/progress', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(p),
		})
	}
}
