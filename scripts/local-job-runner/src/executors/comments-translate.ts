import path from 'node:path'
import type { LocalJobExecutor } from '../contracts'
import { ensureDir, resolveOutputPath, writeJsonFile } from '../fs-utils'
import { readTextFromPathOrUrl } from './io'

type CommentsTranslateInput = {
	dataPath?: string
	dataUrl?: string
	outputPath?: string
	outputDir?: string
	model?: string
	targetLanguage?: string
	force?: boolean
	translateTitle?: boolean
	translateComments?: boolean
	batchSize?: number
	batchMaxChars?: number
	apiUrl?: string
	apiKey?: string
}

type TokenUsage = {
	inputTokens: number
	outputTokens: number
	totalTokens: number
}

const DEFAULT_API_URL = 'https://api.openai.com/v1/chat/completions'
const DEFAULT_MODEL = 'gpt-4o-mini'
const DEFAULT_TARGET_LANGUAGE = 'zh-CN'
const DEFAULT_BATCH_SIZE = 20
const DEFAULT_BATCH_MAX_CHARS = 6000

function toTokenUsage(value: unknown): TokenUsage {
	if (!value || typeof value !== 'object') {
		return { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
	}
	const usage = value as Record<string, unknown>
	const inputTokens = Number(usage.prompt_tokens || usage.input_tokens || 0) || 0
	const outputTokens =
		Number(usage.completion_tokens || usage.output_tokens || 0) || 0
	const totalTokens = Number(usage.total_tokens || 0) || inputTokens + outputTokens
	return { inputTokens, outputTokens, totalTokens }
}

function mergeUsage(base: TokenUsage, next: TokenUsage): TokenUsage {
	return {
		inputTokens: base.inputTokens + next.inputTokens,
		outputTokens: base.outputTokens + next.outputTokens,
		totalTokens: base.totalTokens + next.totalTokens,
	}
}

function normalizeSnapshot(raw: unknown): {
	snapshot: Record<string, unknown>
	videoInfo: Record<string, unknown>
	comments: Array<Record<string, unknown>>
} {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		throw new Error('comments-translate input must be a JSON object')
	}
	const snapshot = raw as Record<string, unknown>
	const videoInfoRaw =
		snapshot.videoInfo && typeof snapshot.videoInfo === 'object'
			? (snapshot.videoInfo as Record<string, unknown>)
			: {}
	const commentsRaw = Array.isArray(snapshot.comments) ? snapshot.comments : []
	const comments = commentsRaw
		.filter((item) => item && typeof item === 'object')
		.map((item, index) => {
			const c = item as Record<string, unknown>
			return {
				...c,
				id: String(c.id || `c_${index}`),
				author: String(c.author || 'unknown'),
				content: String(c.content || ''),
				likes: Number(c.likes || 0) || 0,
				replyCount: Number(c.replyCount || 0) || 0,
				translatedContent:
					typeof c.translatedContent === 'string'
						? c.translatedContent
						: undefined,
			}
		})
	return { snapshot, videoInfo: { ...videoInfoRaw }, comments }
}

function extractJsonObject(text: string): unknown {
	const raw = String(text || '').trim()
	if (!raw) {
		throw new Error('Translation response was empty')
	}
	try {
		return JSON.parse(raw)
	} catch {}
	const firstBrace = raw.indexOf('{')
	const lastBrace = raw.lastIndexOf('}')
	if (firstBrace === -1 || lastBrace <= firstBrace) {
		throw new Error('Translation response was not valid JSON')
	}
	const candidate = raw.slice(firstBrace, lastBrace + 1)
	return JSON.parse(candidate)
}

function normalizeTranslations(
	payload: unknown,
	sourceTexts: string[],
): string[] {
	if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
		const obj = payload as Record<string, unknown>
		if (Array.isArray(obj.translations)) {
			if (obj.translations.length !== sourceTexts.length) {
				throw new Error(
					`Translation length mismatch (expected ${sourceTexts.length}, got ${obj.translations.length})`,
				)
			}
			return obj.translations.map((item, index) => {
				const next = String(item ?? '').trim()
				return next.length > 0 ? next : sourceTexts[index] || ''
			})
		}
		if (typeof obj.translation === 'string' && sourceTexts.length === 1) {
			const next = obj.translation.trim()
			return [next.length > 0 ? next : sourceTexts[0] || '']
		}
	}
	if (typeof payload === 'string' && sourceTexts.length === 1) {
		const next = payload.trim()
		return [next.length > 0 ? next : sourceTexts[0] || '']
	}
	throw new Error('Translation response schema mismatch')
}

function toMessageContent(value: unknown): string {
	if (typeof value === 'string') return value
	if (Array.isArray(value)) {
		return value
			.map((item) => {
				if (typeof item === 'string') return item
				if (!item || typeof item !== 'object') return ''
				const part = item as Record<string, unknown>
				if (typeof part.text === 'string') return part.text
				if (
					part.type === 'text' &&
					part.text &&
					typeof part.text === 'object' &&
					typeof (part.text as Record<string, unknown>).value === 'string'
				) {
					return String((part.text as Record<string, unknown>).value || '')
				}
				return ''
			})
			.join('\n')
			.trim()
	}
	return ''
}

function buildBatches(
	indices: number[],
	texts: string[],
	maxItems: number,
	maxChars: number,
): number[][] {
	const batches: number[][] = []
	let current: number[] = []
	let currentChars = 0

	const pushCurrent = () => {
		if (current.length === 0) return
		batches.push(current)
		current = []
		currentChars = 0
	}

	for (let i = 0; i < indices.length; i++) {
		const idx = indices[i]!
		const chars = String(texts[i] || '').length
		const overflow =
			current.length >= maxItems ||
			(current.length > 0 && currentChars + chars > maxChars)
		if (overflow) pushCurrent()
		current.push(idx)
		currentChars += chars
	}
	pushCurrent()
	return batches
}

async function callOpenAiCompatibleBatch(
	input: CommentsTranslateInput,
	texts: string[],
): Promise<{ translations: string[]; usage: TokenUsage }> {
	if (texts.length === 0) {
		return {
			translations: [],
			usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
		}
	}

	const apiUrl =
		input.apiUrl ||
		process.env.TRANSLATE_API_URL ||
		process.env.OPENAI_API_URL ||
		DEFAULT_API_URL
	const apiKey =
		input.apiKey || process.env.TRANSLATE_API_KEY || process.env.OPENAI_API_KEY
	const model = input.model || process.env.TRANSLATE_MODEL || DEFAULT_MODEL
	const targetLanguage = input.targetLanguage || DEFAULT_TARGET_LANGUAGE
	if (!apiKey) {
		throw new Error(
			'Translation API key is required (input.apiKey or TRANSLATE_API_KEY / OPENAI_API_KEY)',
		)
	}

	const system = [
		'You are a professional translator.',
		'Return JSON only.',
		'Schema must be: {"translations":["..."]}.',
		'Array length and order must exactly match input texts.',
		`Target language: ${targetLanguage}.`,
		'If source is already target language, keep it unchanged.',
	].join(' ')

	const messages = [
		{ role: 'system', content: system },
		{
			role: 'user',
			content: JSON.stringify({
				targetLanguage,
				texts,
			}),
		},
	]

	const request = async (useResponseFormat: boolean) => {
		const body: Record<string, unknown> = {
			model,
			temperature: 0.2,
			messages,
		}
		if (useResponseFormat) {
			body.response_format = { type: 'json_object' }
		}
		return fetch(apiUrl, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		})
	}

	let response = await request(true)
	if (!response.ok) {
		const detail = await response.text().catch(() => '')
		const shouldRetryWithoutResponseFormat =
			response.status === 400 &&
			/response_format|json_object|schema/i.test(detail)
		if (!shouldRetryWithoutResponseFormat) {
			throw new Error(`Translation request failed: ${response.status} ${detail}`)
		}
		response = await request(false)
		if (!response.ok) {
			const retryDetail = await response.text().catch(() => '')
			throw new Error(
				`Translation request failed: ${response.status} ${retryDetail}`,
			)
		}
	}

	const json = (await response.json()) as Record<string, unknown>
	const usage = toTokenUsage(json.usage)
	const choices = Array.isArray(json.choices) ? json.choices : []
	const first = choices[0]
	if (!first || typeof first !== 'object') {
		throw new Error('Translation response missing choices')
	}
	const message = (first as Record<string, unknown>).message
	const content = message && typeof message === 'object'
		? toMessageContent((message as Record<string, unknown>).content)
		: ''
	if (!content) {
		throw new Error('Translation response content is empty')
	}
	const parsed = extractJsonObject(content)
	return {
		translations: normalizeTranslations(parsed, texts),
		usage,
	}
}

async function translateBatch(
	ctx: Parameters<LocalJobExecutor>[0],
	input: CommentsTranslateInput,
	texts: string[],
): Promise<{ translations: string[]; usage: TokenUsage }> {
	if (texts.length === 0) {
		return {
			translations: [],
			usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
		}
	}
	if (ctx.ports.translate?.translateText) {
		const translated: string[] = []
		for (const text of texts) {
			const next = await ctx.ports.translate.translateText(text, input.model)
			const normalized = String(next || '').trim()
			translated.push(normalized.length > 0 ? normalized : text)
		}
		return {
			translations: translated,
			usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
		}
	}
	return callOpenAiCompatibleBatch(input, texts)
}

export const commentsTranslateExecutor: LocalJobExecutor = async (ctx) => {
	const input = ctx.spec.input as CommentsTranslateInput
	if (!input?.dataPath && !input?.dataUrl) {
		throw new Error('comments-translate requires input.dataPath or input.dataUrl')
	}

	const outputDir = resolveOutputPath(
		process.cwd(),
		input.outputDir ||
			path.join('.local-jobs', 'artifacts', ctx.jobId, 'comments-translate'),
	)
	await ensureDir(outputDir)
	const outputPath = input.outputPath
		? resolveOutputPath(outputDir, input.outputPath)
		: path.join(outputDir, 'comments-snapshot.translated.json')

	await ctx.emit({
		status: 'running',
		phase: 'preparing',
		progress: 0.06,
		message: 'Loading comments snapshot',
	})

	const dataText = await readTextFromPathOrUrl({
		path: input.dataPath,
		url: input.dataUrl,
		timeoutMs: 45_000,
	})
	const raw = JSON.parse(dataText)
	const { snapshot, videoInfo, comments } = normalizeSnapshot(raw)

	const force = Boolean(input.force)
	const translateTitle = input.translateTitle !== false
	const translateComments = input.translateComments !== false
	const batchSize = Math.max(1, Number(input.batchSize || DEFAULT_BATCH_SIZE))
	const batchMaxChars = Math.max(
		200,
		Number(input.batchMaxChars || DEFAULT_BATCH_MAX_CHARS),
	)

	let usage: TokenUsage = {
		inputTokens: 0,
		outputTokens: 0,
		totalTokens: 0,
	}
	let translatedTitle = false
	let translatedComments = 0

	const title = String(videoInfo.title || '').trim()
	const hasTranslatedTitle = typeof videoInfo.translatedTitle === 'string' &&
		String(videoInfo.translatedTitle).trim().length > 0
	const shouldTranslateTitle = translateTitle && title.length > 0 && (force || !hasTranslatedTitle)

	const commentIndices: number[] = []
	if (translateComments) {
		for (let index = 0; index < comments.length; index++) {
			const comment = comments[index]!
			const text = String(comment.content || '').trim()
			if (!text) continue
			const hasTranslatedContent =
				typeof comment.translatedContent === 'string' &&
				String(comment.translatedContent).trim().length > 0
			if (!force && hasTranslatedContent) continue
			commentIndices.push(index)
		}
	}

	const totalItems = (shouldTranslateTitle ? 1 : 0) + commentIndices.length

	if (shouldTranslateTitle) {
		if (await ctx.isCanceled()) return
		await ctx.emit({
			status: 'running',
			phase: 'running',
			progress: 0.14,
			message: 'Translating title',
		})

		const res = await translateBatch(ctx, input, [title])
		usage = mergeUsage(usage, res.usage)
		videoInfo.translatedTitle = res.translations[0]
		translatedTitle = true
	}

	if (commentIndices.length > 0) {
		await ctx.emit({
			status: 'running',
			phase: 'running',
			progress: shouldTranslateTitle ? 0.2 : 0.14,
			message: 'Translating comments',
		})

		const texts = commentIndices.map((index) =>
			String(comments[index]?.content || ''),
		)
		const batches = buildBatches(commentIndices, texts, batchSize, batchMaxChars)

		for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
			if (await ctx.isCanceled()) return
			const indexBatch = batches[batchIndex]!
			const textBatch = indexBatch.map((index) =>
				String(comments[index]?.content || ''),
			)
			const res = await translateBatch(ctx, input, textBatch)
			usage = mergeUsage(usage, res.usage)

			for (let i = 0; i < indexBatch.length; i++) {
				const index = indexBatch[i]!
				const translated = String(res.translations[i] || '').trim()
				comments[index] = {
					...comments[index],
					translatedContent:
						translated.length > 0 ? translated : String(comments[index]?.content || ''),
				}
				translatedComments += 1
			}

			const done = (translatedTitle ? 1 : 0) + translatedComments
			const ratio = totalItems > 0 ? done / totalItems : 1
			await ctx.emit({
				status: 'running',
				phase: 'running',
				progress: 0.2 + ratio * 0.72,
				message: `Translated batch ${batchIndex + 1}/${batches.length}`,
				metadata: {
					translatedComments,
					totalComments: commentIndices.length,
				},
			})
		}
	}

	const translatedSnapshot = {
		...snapshot,
		videoInfo,
		comments,
	}
	await writeJsonFile(outputPath, translatedSnapshot)

	await ctx.emit({
		status: 'completed',
		phase: 'completed',
		progress: 1,
		message: 'Comments translation completed',
		outputs: {
			snapshot: {
				path: outputPath,
				contentType: 'application/json',
			},
		},
		metadata: {
			targetLanguage: input.targetLanguage || DEFAULT_TARGET_LANGUAGE,
			model: input.model || process.env.TRANSLATE_MODEL || DEFAULT_MODEL,
			translatedTitle,
			translatedComments,
			totalComments: comments.length,
			usage,
		},
	})
}
