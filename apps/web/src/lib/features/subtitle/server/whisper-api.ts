import { formatVttTimestamp } from '~/lib/features/subtitle/utils/time'
import { createVttDocument, type VttCue } from '~/lib/features/subtitle/utils/vtt'

type WhisperWord = {
	word: string
	start: number
	end: number
	probability?: number
}

type WhisperSegment = {
	id?: number
	start: number
	end: number
	text: string
	words?: WhisperWord[]
}

type WhisperTranscriptionResponse = {
	model?: string
	text?: string
	language?: string
	duration?: number
	segments?: WhisperSegment[]
}

function normalizeBaseUrl(baseUrl: string) {
	return baseUrl.trim().replace(/\/$/, '')
}

function buildVttFromSegments(segments: WhisperSegment[]): string {
	const cues: VttCue[] = []
	for (const seg of segments) {
		const text = typeof seg.text === 'string' ? seg.text.trim() : ''
		if (!text) continue
		const start = Number(seg.start)
		const end = Number(seg.end)
		if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
			continue
		cues.push({
			start: formatVttTimestamp(start),
			end: formatVttTimestamp(end),
			lines: [text],
		})
	}
	return createVttDocument(cues)
}

function extractWords(
	segments: WhisperSegment[],
): Array<{ word: string; start: number; end: number }> | undefined {
	const out: Array<{ word: string; start: number; end: number }> = []
	for (const seg of segments) {
		if (!Array.isArray(seg.words)) continue
		for (const w of seg.words) {
			if (
				w &&
				typeof w.word === 'string' &&
				typeof w.start === 'number' &&
				typeof w.end === 'number'
			) {
				out.push({ word: w.word, start: w.start, end: w.end })
			}
		}
	}
	return out.length > 0 ? out : undefined
}

export async function runWhisperApiAsr(opts: {
	baseUrl: string
	apiKey: string
	remoteModelId: string
	audio: ArrayBuffer
	language?: string
	filename?: string
}): Promise<{ vtt: string; words?: unknown }> {
	const baseUrl = normalizeBaseUrl(opts.baseUrl)
	const apiKey = opts.apiKey.trim()
	if (!baseUrl) throw new Error('Whisper API baseUrl is required')
	if (!apiKey) throw new Error('Whisper API token is required')

	const normalizedLanguage =
		typeof opts.language === 'string' &&
		opts.language &&
		opts.language !== 'auto'
			? opts.language
			: undefined

	const form = new FormData()
	form.append(
		'file',
		new Blob([opts.audio], { type: 'application/octet-stream' }),
		opts.filename?.trim() || 'audio.mp3',
	)
	form.append('model', opts.remoteModelId)
	form.append('response_format', 'json')
	form.append('timestamp_granularities', 'word')
	if (normalizedLanguage) form.append('language', normalizedLanguage)

	const url = `${baseUrl}/v1/audio/transcriptions`
	const r = await fetch(url, {
		method: 'POST',
		headers: { Authorization: `Bearer ${apiKey}` },
		body: form,
	})
	if (!r.ok) {
		const t = await r.text().catch(() => '')
		const detail = t.trim()
		throw new Error(
			`Whisper API ASR failed: ${r.status}${detail ? ` ${detail}` : ''} (url=${url})`,
		)
	}

	const json = (await r.json()) as WhisperTranscriptionResponse
	const segments = Array.isArray(json?.segments) ? json.segments : []

	if (segments.length > 0) {
		return {
			vtt: buildVttFromSegments(segments),
			words: extractWords(segments),
		}
	}

	const text = typeof json?.text === 'string' ? json.text.trim() : ''
	if (text) {
		return { vtt: `WEBVTT\n\n00:00:00.000 --> 00:00:03.000\n${text}\n` }
	}

	throw new Error('Whisper API ASR: unexpected response format')
}
