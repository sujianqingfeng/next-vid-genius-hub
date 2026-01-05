import { z } from 'zod'
import { logger } from '~/lib/infra/logger'
import { streamObjectWithUsage, streamTextWithUsage } from './chat'
import { AIModelId } from './models'

const unsupportedStructuredModels = new Set<AIModelId>()

const translationSchema = z.object({
	translation: z.string().min(1),
})

const translationsSchema = z.object({
	translations: z.array(z.string()),
})

const translationSystemPrompt = [
	'You are a professional translator that must respond with JSON only.',
	'Every reply MUST be a single JSON object that matches this exact schema: {"translation": "string"}.',
	'The value of "translation" must be fluent Simplified Chinese; only preserve non-Chinese proper nouns or symbols when necessary.',
	'Do NOT output markdown, code fences, prose, or extra keys.',
	'Do NOT wrap the JSON in quotes; emit raw JSON like {"translation":"示例"}.',
	'Trim leading/trailing whitespace and avoid commentary or metadata.',
	'If the source is already Chinese, still return {"translation":"<original text>"} with identical content.',
].join(' ')

const translationsSystemPrompt = [
	'You are a professional translator that must respond with JSON only.',
	'Every reply MUST be a single JSON object that matches this exact schema: {"translations": ["string", ...]}.',
	'The value of "translations" must be an array with the EXACT same length and order as the input texts.',
	'Each item must be fluent Simplified Chinese; preserve non-Chinese proper nouns or symbols only when necessary.',
	'Do NOT output markdown, code fences, prose, or extra keys.',
	'Do NOT wrap the JSON in quotes; emit raw JSON only.',
	'If an input item is already Chinese, output it unchanged at the same index.',
].join(' ')

export async function translateTextWithUsage(
	text: string,
	modelId: AIModelId,
): Promise<{
	translation: string
	usage: { inputTokens: number; outputTokens: number; totalTokens: number }
}> {
	const prompt = [
		'Task: translate the provided text into natural Simplified Chinese.',
		'Output requirement: respond with EXACTLY one JSON object: {"translation":"..."} (no markdown, no prose).',
		'Preserve meaning, tone, and any inline formatting such as quotes, emojis, or punctuation.',
		'If the text is already Chinese, keep it unchanged inside the translation field.',
		'Input text:',
		text,
	].join('\n')

	let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

	if (!unsupportedStructuredModels.has(modelId)) {
		try {
			const res = await streamObjectWithUsage({
				model: modelId,
				system: translationSystemPrompt,
				prompt,
				schema: translationSchema,
			})
			usage = {
				inputTokens: usage.inputTokens + (res.usage?.inputTokens ?? 0),
				outputTokens: usage.outputTokens + (res.usage?.outputTokens ?? 0),
				totalTokens: usage.totalTokens + (res.usage?.totalTokens ?? 0),
			}

			const parsed = translationSchema.safeParse(res.object)
			if (!parsed.success) {
				throw new Error('Translation response did not match expected schema')
			}

			const output = parsed.data.translation.trim()
			if (output.length > 0) {
				return { translation: output, usage }
			}
		} catch (error) {
			const details: Record<string, unknown> = { modelId }
			if (error && typeof error === 'object') {
				const err = error as Record<string, unknown>
				const rawResponse =
					err.response ??
					(err.cause && typeof err.cause === 'object'
						? (err.cause as Record<string, unknown>).response
						: undefined)
				const rawBody =
					typeof rawResponse === 'object' && rawResponse !== null
						? (rawResponse as Record<string, unknown>).body
						: undefined
				const text =
					err.text ??
					(err.cause && typeof err.cause === 'object'
						? (err.cause as Record<string, unknown>).text
						: undefined)

				if (rawResponse) details.rawResponse = rawResponse
				if (rawBody) details.rawBody = rawBody
				if (text) details.sourceText = text
				details.errorMessage =
					err.message ??
					(err.cause as { message?: string } | undefined)?.message
			}

			logger.warn(
				'translation',
				'[translateText] Structured translation failed, falling back to text mode.',
			)
			unsupportedStructuredModels.add(modelId)
		}
	}

	// Fallback: request raw text translation
	const fallbackSystem = [
		'You are a professional translator.',
		'Reply with the translation only, in fluent Simplified Chinese.',
		'Do not add explanations, metadata, or extra punctuation.',
	].join(' ')

	const fallbackPrompt = [
		'Translate to Simplified Chinese.',
		'If already Chinese, return the original text.',
		'Text:',
		text,
	].join('\n')

	const fallback = await streamTextWithUsage({
		model: modelId,
		system: fallbackSystem,
		prompt: fallbackPrompt,
	})
	usage = {
		inputTokens: usage.inputTokens + (fallback.usage?.inputTokens ?? 0),
		outputTokens: usage.outputTokens + (fallback.usage?.outputTokens ?? 0),
		totalTokens: usage.totalTokens + (fallback.usage?.totalTokens ?? 0),
	}

	const raw = fallback.text?.trim() ?? ''
	const normalized = raw
		.replace(/^(translation|翻译)[:：]\s*/i, '')
		.replace(/^(output|result)[:：]\s*/i, '')
		.trim()

	return {
		translation: normalized.length > 0 ? normalized : text,
		usage,
	}
}

export async function translateTextsWithUsage(
	texts: string[],
	modelId: AIModelId,
): Promise<{
	translations: string[]
	usage: { inputTokens: number; outputTokens: number; totalTokens: number }
}> {
	if (texts.length === 0) {
		return {
			translations: [],
			usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
		}
	}

	const prompt = [
		'Task: translate each provided text into natural Simplified Chinese.',
		'Output requirement: respond with EXACTLY one JSON object: {"translations":["..."]} (no markdown, no prose).',
		'The translations array MUST have the same length and order as the input.',
		'Input JSON:',
		JSON.stringify({ texts }),
	].join('\n')

	let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

	const parseResult = (
		value: unknown,
		nextUsage: {
			inputTokens: number
			outputTokens: number
			totalTokens: number
		},
	) => {
		const parsed = translationsSchema.safeParse(value)
		if (!parsed.success) {
			throw new Error('Translation response did not match expected schema')
		}
		if (parsed.data.translations.length !== texts.length) {
			throw new Error(
				`Translation response length mismatch (expected ${texts.length}, got ${parsed.data.translations.length})`,
			)
		}
		const normalized = parsed.data.translations.map((t, i) => {
			const v = String(t ?? '').trim()
			return v.length > 0 ? v : texts[i]
		})
		return { translations: normalized, usage: nextUsage }
	}

	if (!unsupportedStructuredModels.has(modelId)) {
		try {
			const res = await streamObjectWithUsage({
				model: modelId,
				system: translationsSystemPrompt,
				prompt,
				schema: translationsSchema,
			})
			usage = {
				inputTokens: usage.inputTokens + (res.usage?.inputTokens ?? 0),
				outputTokens: usage.outputTokens + (res.usage?.outputTokens ?? 0),
				totalTokens: usage.totalTokens + (res.usage?.totalTokens ?? 0),
			}
			return parseResult(res.object, usage)
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error)
			logger.warn(
				'translation',
				`[translateTexts] Structured translation failed, falling back to JSON text mode. reason=${reason}`,
			)
			unsupportedStructuredModels.add(modelId)
		}
	}

	const fallback = await streamTextWithUsage({
		model: modelId,
		system: translationsSystemPrompt,
		prompt,
	})
	usage = {
		inputTokens: usage.inputTokens + (fallback.usage?.inputTokens ?? 0),
		outputTokens: usage.outputTokens + (fallback.usage?.outputTokens ?? 0),
		totalTokens: usage.totalTokens + (fallback.usage?.totalTokens ?? 0),
	}

	const raw = (fallback.text ?? '').trim()
	const firstBrace = raw.indexOf('{')
	const lastBrace = raw.lastIndexOf('}')
	const candidate =
		firstBrace >= 0 && lastBrace > firstBrace
			? raw.slice(firstBrace, lastBrace + 1)
			: raw

	let json: unknown
	try {
		json = JSON.parse(candidate)
	} catch {
		throw new Error('Translation response was not valid JSON')
	}
	return parseResult(json, usage)
}

export async function translateText(text: string, modelId: AIModelId) {
	const { translation } = await translateTextWithUsage(text, modelId)
	return translation
}
