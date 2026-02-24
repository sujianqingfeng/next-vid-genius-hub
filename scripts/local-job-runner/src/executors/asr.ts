import path from 'node:path'
import { promises as fs } from 'node:fs'
import type {
	AsrTranscribeInput,
	AsrTranscribeResult,
	LocalJobExecutor,
} from '../contracts'
import { ensureDir, resolveOutputPath, writeJsonFile } from '../fs-utils'
import { materializeInputFile } from './io'

type AsrInput = {
	audioPath?: string
	audioUrl?: string
	model?: string
	language?: string
	provider?: 'openai-compatible' | 'custom'
	apiUrl?: string
	apiKey?: string
	responseFormat?: 'verbose_json' | 'json' | 'text' | 'vtt'
	outputDir?: string
	vttPath?: string
	wordsPath?: string
}

function toVttTimestamp(seconds: number): string {
	const safe = Math.max(0, Number(seconds || 0))
	const hours = Math.floor(safe / 3600)
	const minutes = Math.floor((safe % 3600) / 60)
	const secs = Math.floor(safe % 60)
	const millis = Math.round((safe - Math.floor(safe)) * 1000)
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
		2,
		'0',
	)}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

function buildVttFromWords(
	words: Array<{ word: string; start: number; end: number }>,
): string {
	const lines = ['WEBVTT', '']
	for (let index = 0; index < words.length; index++) {
		const word = words[index]!
		lines.push(String(index + 1))
		lines.push(
			`${toVttTimestamp(word.start)} --> ${toVttTimestamp(word.end)}`,
		)
		lines.push(word.word)
		lines.push('')
	}
	return `${lines.join('\n')}\n`
}

function buildVttFromText(text: string): string {
	const clean = String(text || '').trim() || '[empty]'
	return `WEBVTT\n\n1\n00:00:00.000 --> 00:00:03.000\n${clean}\n`
}

function extractWords(raw: any): Array<{ word: string; start: number; end: number }> {
	if (Array.isArray(raw?.words)) {
		return raw.words
			.filter((item: any) =>
				item &&
				typeof item.word === 'string' &&
				typeof item.start === 'number' &&
				typeof item.end === 'number',
			)
			.map((item: any) => ({
				word: item.word,
				start: item.start,
				end: item.end,
			}))
	}

	if (Array.isArray(raw?.segments)) {
		const collected: Array<{ word: string; start: number; end: number }> = []
		for (const seg of raw.segments) {
			if (Array.isArray(seg?.words)) {
				for (const word of seg.words) {
					if (
						word &&
						typeof word.word === 'string' &&
						typeof word.start === 'number' &&
						typeof word.end === 'number'
					) {
						collected.push({ word: word.word, start: word.start, end: word.end })
					}
				}
			}
		}
		if (collected.length > 0) return collected
	}

	return []
}

async function callOpenAiCompatibleAsr(
	input: AsrInput,
	audioPath: string,
): Promise<AsrTranscribeResult> {
	const apiUrl =
		input.apiUrl || process.env.ASR_API_URL || 'https://api.openai.com/v1/audio/transcriptions'
	const apiKey = input.apiKey || process.env.ASR_API_KEY
	if (!apiKey) {
		throw new Error('ASR API key is required (input.apiKey or ASR_API_KEY)')
	}

	const bytes = await fs.readFile(audioPath)
	const fileName = path.basename(audioPath)
	const form = new FormData()
	form.append('file', new Blob([bytes]), fileName)
	form.append('model', input.model || process.env.ASR_MODEL || 'whisper-1')
	if (input.language) form.append('language', input.language)
	if (input.responseFormat) form.append('response_format', input.responseFormat)

	const response = await fetch(apiUrl, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
		body: form,
	})

	if (!response.ok) {
		const body = await response.text().catch(() => '')
		throw new Error(`ASR request failed: ${response.status} ${body}`)
	}

	const requestedFormat = input.responseFormat || 'verbose_json'
	if (requestedFormat === 'vtt') {
		const vtt = await response.text()
		return {
			vtt,
			raw: vtt,
		}
	}

	if (requestedFormat === 'text') {
		const text = await response.text()
		return {
			text,
			vtt: buildVttFromText(text),
			raw: text,
		}
	}

	const raw = (await response.json()) as any
	const words = extractWords(raw)
	const text = typeof raw?.text === 'string' ? raw.text : ''
	const vtt =
		typeof raw?.vtt === 'string'
			? raw.vtt
			: words.length > 0
				? buildVttFromWords(words)
				: buildVttFromText(text)

	return {
		text,
		vtt,
		words,
		raw,
	}
}

export const asrExecutor: LocalJobExecutor = async (ctx) => {
	const input = ctx.spec.input as AsrInput
	if (!input?.audioPath && !input?.audioUrl) {
		throw new Error('asr requires input.audioPath or input.audioUrl')
	}

	const outputDir = resolveOutputPath(
		process.cwd(),
		input.outputDir || path.join('.local-jobs', 'artifacts', ctx.jobId, 'asr'),
	)
	await ensureDir(outputDir)
	const vttPath = input.vttPath
		? resolveOutputPath(outputDir, input.vttPath)
		: path.join(outputDir, 'transcript.vtt')
	const wordsPath = input.wordsPath
		? resolveOutputPath(outputDir, input.wordsPath)
		: path.join(outputDir, 'words.json')

	await ctx.emit({
		status: 'running',
		phase: 'preparing',
		progress: 0.08,
		message: 'Preparing ASR input audio',
	})

	const preparedAudioPath = await materializeInputFile({
		path: input.audioPath,
		url: input.audioUrl,
		fallbackPath: path.join(outputDir, '_audio.input'),
		timeoutMs: 60_000,
	})

	if (await ctx.isCanceled()) return
	await ctx.emit({
		status: 'running',
		phase: 'running',
		progress: 0.2,
		message: 'Calling ASR provider',
	})

	const asrInput: AsrTranscribeInput = {
		audioPath: preparedAudioPath,
		model: input.model,
		language: input.language,
		provider: input.provider,
		responseFormat: input.responseFormat,
	}

	const result = ctx.ports.asr
		? await ctx.ports.asr.transcribe(asrInput)
		: await callOpenAiCompatibleAsr(input, preparedAudioPath)

	const vtt =
		typeof result.vtt === 'string'
			? result.vtt
			: buildVttFromText(result.text || '')
	const words = Array.isArray(result.words) ? result.words : []
	const outputs: Record<string, { path: string; contentType: string }> = {
		vtt: {
			path: vttPath,
			contentType: 'text/vtt',
		},
	}
	if (words.length > 0) {
		outputs.words = {
			path: wordsPath,
			contentType: 'application/json',
		}
	}

	await fs.writeFile(vttPath, vtt, 'utf8')
	if (words.length > 0) {
		await writeJsonFile(wordsPath, words)
	}

	await ctx.emit({
		status: 'completed',
		phase: 'completed',
		progress: 1,
		message: 'ASR completed',
		outputs,
		metadata: {
			wordsCount: words.length,
			model: input.model || process.env.ASR_MODEL || 'whisper-1',
		},
	})
}
