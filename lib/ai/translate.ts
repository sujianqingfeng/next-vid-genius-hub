import { z } from 'zod'
import { generateObject, generateText } from './chat'
import { AIModelId } from './models'

const unsupportedStructuredModels = new Set<AIModelId>()

const translationSchema = z.object({
	translation: z.string().min(1),
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

export async function translateText(text: string, modelId: AIModelId) {
	const prompt = [
		'Task: translate the provided text into natural Simplified Chinese.',
		'Output requirement: respond with EXACTLY one JSON object: {"translation":"..."} (no markdown, no prose).',
		'Preserve meaning, tone, and any inline formatting such as quotes, emojis, or punctuation.',
		'If the text is already Chinese, keep it unchanged inside the translation field.',
		'Input text:',
		text,
	].join('\n')

	if (!unsupportedStructuredModels.has(modelId)) {
		try {
			const { object } = await generateObject({
				model: modelId,
				system: translationSystemPrompt,
				prompt,
				schema: translationSchema,
			})

			const parsed = translationSchema.safeParse(object)
			if (!parsed.success) {
				throw new Error('Translation response did not match expected schema')
			}

			const output = parsed.data.translation.trim()
			if (output.length > 0) {
				return output
			}
		} catch (error) {
			const details: Record<string, unknown> = { modelId }
			if (error && typeof error === 'object') {
				const err = error as Record<string, unknown>
				const rawResponse =
					err.response ??
					(err.cause && typeof err.cause === 'object' ? (err.cause as Record<string, unknown>).response : undefined)
				const rawBody =
					typeof rawResponse === 'object' && rawResponse !== null
						? (rawResponse as Record<string, unknown>).body
						: undefined
				const text =
					err.text ??
					(err.cause && typeof err.cause === 'object' ? (err.cause as Record<string, unknown>).text : undefined)

				if (rawResponse) details.rawResponse = rawResponse
				if (rawBody) details.rawBody = rawBody
				if (text) details.sourceText = text
				details.errorMessage = err.message ?? (err.cause as { message?: string } | undefined)?.message
			}

			console.warn('[translateText] Structured translation failed, falling back to text mode.', details)
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

	const fallback = await generateText({
		model: modelId,
		system: fallbackSystem,
		prompt: fallbackPrompt,
	})

	const raw = fallback.text?.trim() ?? ''
	const normalized = raw
		.replace(/^(translation|翻译)[:：]\s*/i, '')
		.replace(/^(output|result)[:：]\s*/i, '')
		.trim()

	return normalized.length > 0 ? normalized : text
}
