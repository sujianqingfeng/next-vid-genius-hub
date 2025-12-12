import { bucketPaths } from '@app/media-domain'
import type { Env } from '../types'
import { presignS3 } from '../storage/presign'
import { s3Put } from '../storage/s3'
import { jobStub } from '../utils/job'

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer)
	let binary = ''
	const chunk = 0x8000
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
	}
	return btoa(binary)
}

export async function runAsrForPipeline(env: Env, doc: any) {
	const bucket = env.S3_BUCKET_NAME || 'vidgen-render'
	const jobId = doc.jobId
	const audioKey: string | undefined =
		doc.outputAudioKey || doc.outputs?.audio?.key
	if (!audioKey) throw new Error('asr-pipeline: missing outputAudioKey')
	const aiAccountId = env.CF_AI_ACCOUNT_ID
	const aiApiToken = env.CF_AI_API_TOKEN
	if (!aiAccountId || !aiApiToken) {
		throw new Error('asr-pipeline: Workers AI credentials not configured')
	}

	// Fetch downsampled audio bytes via presigned GET (with small retries)
	const audioUrl = await presignS3(env, 'GET', bucket, audioKey, 600)
	console.log('[asr-pipeline] fetching audio for ASR', { jobId, key: audioKey })
	let audioResp: Response | undefined
	let attempts = 0
	while (attempts < 3) {
		attempts += 1
		const r = await fetch(audioUrl)
		if (r.ok) {
			audioResp = r
			break
		}
		console.warn('[asr-pipeline] fetch audio attempt failed', {
			jobId,
			key: audioKey,
			attempt: attempts,
			status: r.status,
		})
		await new Promise((res) => setTimeout(res, 300 * attempts))
	}
	if (!audioResp || !audioResp.ok) {
		throw new Error(`fetch audio failed: ${audioResp?.status || 'n/a'}`)
	}
	const audioBuf = await audioResp.arrayBuffer()
	try {
		console.log('[asr-pipeline] audio bytes ready', {
			jobId,
			bytes: audioBuf.byteLength,
			mb: (audioBuf.byteLength / 1048576).toFixed(2),
		})
	} catch {}

	// Decide model
	const model: string =
		(doc?.metadata?.model as string) || '@cf/openai/whisper-tiny-en'

	// Call Workers AI Whisper via REST
	// Workers AI run endpoint requires raw slug path (do not encode slashes)
	const runUrl = `https://api.cloudflare.com/client/v4/accounts/${aiAccountId}/ai/run/${model}`
	const jobLanguage =
		typeof doc?.metadata?.language === 'string' ? doc.metadata.language : undefined
	const normalizedLanguage =
		jobLanguage && jobLanguage !== 'auto' ? jobLanguage : undefined
	const inputFormat =
		doc?.metadata?.inputFormat === 'base64'
			? 'base64'
			: doc?.metadata?.inputFormat === 'array'
				? 'array'
				: 'binary'
	console.log('[asr-pipeline] calling Workers AI', {
		jobId,
		model,
		language: normalizedLanguage,
		inputFormat,
	})
	let body: BodyInit
	let contentType = 'application/octet-stream'
	if (inputFormat === 'base64') {
		contentType = 'application/json'
		body = JSON.stringify({
			audio: arrayBufferToBase64(audioBuf),
			...(normalizedLanguage ? { language: normalizedLanguage } : {}),
		})
	} else if (inputFormat === 'array') {
		contentType = 'application/json'
		body = JSON.stringify({
			audio: Array.from(new Uint8Array(audioBuf)),
		})
	} else {
		body = audioBuf
	}
	const r = await fetch(runUrl, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${aiApiToken}`,
			'Content-Type': contentType,
			Accept: 'application/json',
		},
		body,
	})
	if (!r.ok) {
		const t = await r.text().catch(() => '')
		console.error('[asr-pipeline] Workers AI ASR failed', {
			jobId,
			status: r.status,
			size: audioBuf.byteLength,
		})
		throw new Error(`Workers AI ASR failed: ${r.status} ${t}`)
	}
	const result = (await r.json()) as any
	const extractWords = (payload: any) => {
		if (
			payload?.words &&
			Array.isArray(payload.words) &&
			payload.words.length > 0
		) {
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

	// Store into R2
	const mediaKey = doc.mediaId || 'unknown'
	const pathOptions = { title: doc?.title as string | undefined }
	const vttKey = bucketPaths.asr.results.transcript(mediaKey, jobId, pathOptions)
	await s3Put(env, bucket, vttKey, 'text/vtt', String(vtt))

	let wordsKey: string | undefined
	if (words && (Array.isArray(words) ? words.length > 0 : true)) {
		wordsKey = bucketPaths.asr.results.words(mediaKey, jobId, pathOptions)
		await s3Put(env, bucket, wordsKey, 'application/json', JSON.stringify(words))
	}

	// Update DO state with outputs
	const stub = jobStub(env, jobId)
	if (stub) {
		const outputs: any = { vtt: { key: vttKey } }
		if (wordsKey) outputs.words = { key: wordsKey }
		const p = {
			jobId,
			status: 'completed',
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

