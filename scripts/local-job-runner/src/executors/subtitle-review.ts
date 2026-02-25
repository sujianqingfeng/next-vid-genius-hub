import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { LocalJobExecutor } from '../contracts'
import { ensureDir, resolveOutputPath } from '../fs-utils'
import { readTextFromPathOrUrl } from './io'

type SubtitleReviewInput = {
	mode?: 'apply'
	reviewPath?: string
	reviewUrl?: string
	outputPath?: string
	outputDir?: string
	format?: 'bilingual' | 'replace'
	strict?: boolean
	defaultTranslation?: 'source'
}

type RawReviewItem = Record<string, unknown>

type ReviewItem = {
	index: number
	start: string
	end: string
	sourceLines: string[]
	sourceText: string
	translatedText: string
	status: string
}

function normalizeFormat(value: unknown): 'bilingual' | 'replace' {
	const normalized = String(value || '')
		.trim()
		.toLowerCase()
	return normalized === 'replace' ? 'replace' : 'bilingual'
}

function normalizeStatus(value: unknown): string {
	return String(value || '')
		.trim()
		.toLowerCase()
}

function normalizeLines(value: unknown): string[] {
	if (!Array.isArray(value)) return []
	return value
		.map((line) => String(line || '').trim())
		.filter((line) => line.length > 0)
}

function normalizeText(value: unknown): string {
	return String(value || '')
		.replace(/\r?\n+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

function extractReviewItems(raw: unknown): RawReviewItem[] {
	if (Array.isArray(raw)) {
		return raw.filter((item) => item && typeof item === 'object') as RawReviewItem[]
	}
	if (!raw || typeof raw !== 'object') {
		throw new Error('subtitle-review payload must be a JSON array or object')
	}
	const obj = raw as Record<string, unknown>
	const candidates = [obj.items, obj.cues, obj.decisions]
	for (const candidate of candidates) {
		if (Array.isArray(candidate)) {
			return candidate.filter((item) => item && typeof item === 'object') as RawReviewItem[]
		}
	}
	throw new Error('subtitle-review payload must include items/cues/decisions array')
}

function normalizeReviewItems(items: RawReviewItem[]): ReviewItem[] {
	const normalized: ReviewItem[] = []
	for (let i = 0; i < items.length; i++) {
		const item = items[i]!
		const indexRaw = Number(item.index)
		const index = Number.isFinite(indexRaw) ? Math.max(0, Math.floor(indexRaw)) : i
		const start = String(item.start || '').trim()
		const end = String(item.end || '').trim()
		const sourceLines = normalizeLines(item.sourceLines)
		const sourceText = normalizeText(item.sourceText || sourceLines.join(' '))
		const translatedText = normalizeText(
			item.translatedText ?? item.translation ?? item.translated,
		)
		const status = normalizeStatus(item.status)
		normalized.push({
			index,
			start,
			end,
			sourceLines,
			sourceText,
			translatedText,
			status,
		})
	}
	return normalized.sort((a, b) => a.index - b.index)
}

function serializeVtt(cues: Array<{ start: string; end: string; lines: string[] }>): string {
	const out = ['WEBVTT', '']
	for (let i = 0; i < cues.length; i++) {
		const cue = cues[i]!
		out.push(String(i + 1))
		out.push(`${cue.start} --> ${cue.end}`)
		out.push(...cue.lines)
		out.push('')
	}
	return `${out.join('\n')}\n`
}

export const subtitleReviewExecutor: LocalJobExecutor = async (ctx) => {
	const input = ctx.spec.input as SubtitleReviewInput
	const mode = String(input.mode || 'apply')
		.trim()
		.toLowerCase()
	if (mode !== 'apply') {
		throw new Error('subtitle-review only supports mode="apply"')
	}
	if (!input.reviewPath && !input.reviewUrl) {
		throw new Error('subtitle-review apply mode requires input.reviewPath or input.reviewUrl')
	}

	const outputDir = resolveOutputPath(
		process.cwd(),
		input.outputDir ||
			path.join('.local-jobs', 'artifacts', ctx.jobId, 'subtitle-review'),
	)
	await ensureDir(outputDir)
	const outputPath = input.outputPath
		? resolveOutputPath(outputDir, input.outputPath)
		: path.join(outputDir, 'subtitles.reviewed.vtt')

	const format = normalizeFormat(input.format)
	const strict = input.strict !== false
	const fallbackToSource = String(input.defaultTranslation || 'source') === 'source'

	await ctx.emit({
		status: 'running',
		phase: 'preparing',
		progress: 0.08,
		message: 'Loading subtitle translation template',
	})

	const reviewText = await readTextFromPathOrUrl({
		path: input.reviewPath,
		url: input.reviewUrl,
		timeoutMs: 45_000,
	})
	const rawReview = JSON.parse(reviewText)
	const rawItems = extractReviewItems(rawReview)
	const items = normalizeReviewItems(rawItems)
	if (!items.length) {
		throw new Error('subtitle-review found no review items')
	}

	await ctx.emit({
		status: 'running',
		phase: 'running',
		progress: 0.2,
		message: 'Applying subtitle translation decisions',
	})

	const unresolvedIndices: number[] = []
	let fallbackApplied = 0
	const cues: Array<{ start: string; end: string; lines: string[] }> = []

	for (const item of items) {
		if (await ctx.isCanceled()) return
		if (!item.start || !item.end) {
			throw new Error(`Invalid cue timing at index ${item.index}`)
		}

		const sourceLines =
			item.sourceLines.length > 0
				? item.sourceLines
				: item.sourceText
					? [item.sourceText]
					: ['']

		let translation = item.translatedText
		const isPending = item.status === 'pending' || item.status === 'todo'
		if (!translation || isPending) {
			if (strict) {
				unresolvedIndices.push(item.index)
				continue
			}
			if (fallbackToSource) {
				translation = item.sourceText || sourceLines[0] || ''
				fallbackApplied += 1
			}
		}

		const lines =
			format === 'replace'
				? [translation || item.sourceText || sourceLines[0] || '']
				: [...sourceLines, translation || item.sourceText || sourceLines[0] || '']
		cues.push({
			start: item.start,
			end: item.end,
			lines: lines.filter((line) => String(line || '').trim().length > 0),
		})
	}

	if (strict && unresolvedIndices.length > 0) {
		const sample = unresolvedIndices.slice(0, 12).join(', ')
		const more =
			unresolvedIndices.length > 12
				? ` ... +${unresolvedIndices.length - 12}`
				: ''
		throw new Error(
			`Review not finished. ${unresolvedIndices.length} subtitle cues are missing translatedText (indices: ${sample}${more})`,
		)
	}

	const vtt = serializeVtt(cues)
	if (await ctx.isCanceled()) return
	await ensureDir(path.dirname(outputPath))
	await fs.writeFile(outputPath, vtt, 'utf8')

	const outputs: Record<
		string,
		{ path: string; contentType: string; key?: string; url?: string }
	> = {
		subtitle: {
			path: outputPath,
			contentType: 'text/vtt',
		},
	}

	const objectStore = ctx.ports.objectStore
	if (objectStore) {
		await ctx.emit({
			status: 'running',
			phase: 'uploading',
			progress: 0.95,
			message: 'Uploading reviewed subtitles to object store',
		})
		const key = await objectStore.putText(
			`${ctx.jobId}/subtitle-review/subtitles.vtt`,
			vtt,
			'text/vtt',
		)
		outputs.subtitle.key = key
		if (objectStore.getUrl) {
			const url = await objectStore.getUrl(key)
			if (url) outputs.subtitle.url = url
		}
	}

	await ctx.emit({
		status: 'completed',
		phase: 'completed',
		progress: 1,
		message: 'Subtitle review apply completed',
		outputs,
		metadata: {
			mode: 'apply',
			format,
			strict,
			totalItems: items.length,
			writtenCues: cues.length,
			unresolvedItems: unresolvedIndices.length,
			fallbackApplied,
		},
	})
}
