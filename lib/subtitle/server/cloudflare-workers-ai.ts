import { deriveCloudflareAsrCapabilities } from '@app/media-domain'

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	return Buffer.from(buffer).toString('base64')
}

export async function runCloudflareWorkersAiAsr(opts: {
	accountId: string
	apiToken: string
	modelId: string
	audio: ArrayBuffer
	language?: string
}): Promise<{ vtt: string; words?: unknown }> {
	const caps = deriveCloudflareAsrCapabilities(opts.modelId)
	const normalizedLanguage =
		typeof opts.language === 'string' && opts.language && opts.language !== 'auto'
			? opts.language
			: undefined
	const languageForCloud = caps.supportsLanguageHint ? normalizedLanguage : undefined

	const runUrl = `https://api.cloudflare.com/client/v4/accounts/${opts.accountId}/ai/run/${opts.modelId}`

	let body: BodyInit
	let contentType = 'application/octet-stream'
	if (caps.inputFormat === 'base64') {
		contentType = 'application/json'
		body = JSON.stringify({
			audio: arrayBufferToBase64(opts.audio),
			...(languageForCloud ? { language: languageForCloud } : {}),
		})
	} else if (caps.inputFormat === 'array') {
		contentType = 'application/json'
		body = JSON.stringify({
			audio: Array.from(new Uint8Array(opts.audio)),
			...(languageForCloud ? { language: languageForCloud } : {}),
		})
	} else {
		body = opts.audio as unknown as BodyInit
	}

	const r = await fetch(runUrl, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${opts.apiToken}`,
			'Content-Type': contentType,
			Accept: 'application/json',
		},
		body,
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

	return { vtt: String(vtt), words }
}

