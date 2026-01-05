import { bucketPaths } from '@app/media-domain'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { streamObjectWithUsage } from '~/lib/features/ai/chat'
import type { AIModelId } from '~/lib/features/ai/models'
import { translateTextWithUsage } from '~/lib/features/ai/translate'
import { putObjectByKey } from '~/lib/infra/cloudflare'
import { getDb, schema } from '~/lib/infra/db'
import { logger } from '~/lib/infra/logger'
import {
	DEFAULT_TRANSLATION_PROMPT_ID,
	getTranslationPrompt,
} from '~/lib/features/subtitle/config/prompts'
import {
	parseVttCues,
	serializeVttCues,
	validateVttContent,
} from '~/lib/features/subtitle/utils/vtt'
import {
	type CompactCue,
	chunkByCharLimit,
	extractAssistantTextFromError,
	tryParseJsonObjectFromText,
} from './translate-structured-utils'

type StructuredTranslationCue = {
	i: number
	zh: string
}

const StructuredSchema = z.object({
	cues: z
		.array(
			z.object({
				i: z.number().int().nonnegative(),
				zh: z.string(),
			}),
		)
		.min(1),
})

function logStructuredTranslationError(args: {
	mediaId: string
	model: AIModelId
	error: unknown
	message: string
}) {
	const { mediaId, model, error, message } = args

	let debugDetails: Record<string, unknown> | null = null
	if (error && typeof error === 'object') {
		const err = error as Record<string, unknown>
		debugDetails = { mediaId, model }

		debugDetails.errorName = (error as { name?: unknown }).name
		if (err.cause && typeof err.cause === 'object')
			debugDetails.causeName = (err.cause as { name?: unknown }).name
		debugDetails.errorMessage =
			(err.message as string | undefined) ??
			(err.cause as { message?: string } | undefined)?.message
	}

	if (debugDetails) {
		let serialized = ''
		try {
			serialized = JSON.stringify(debugDetails)
		} catch {
			serialized = String(debugDetails)
		}
		logger.warn(
			'translation',
			`Structured translation failed for media ${mediaId}: ${message} | details=${serialized}`,
		)
		return
	}

	logger.warn(
		'translation',
		`Structured translation failed for media ${mediaId}: ${message}`,
	)
}

async function translateBatchStructured(args: {
	mediaId: string
	model: AIModelId
	system: string
	batch: CompactCue[]
}): Promise<{
	cues: StructuredTranslationCue[]
	usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
}> {
	const { model, system, batch } = args

	const prompt = `Original cues (i + timestamps + text):\n${JSON.stringify(batch)}\n\nReturn JSON with shape {"cues":[{"i":number,"zh":string}]} only.`

	try {
		const res = await streamObjectWithUsage({
			model,
			system,
			prompt,
			schema: StructuredSchema,
			maxTokens: 4096,
			temperature: 0.2,
		})

		const out = Array.isArray(res.object?.cues) ? res.object.cues : []
		if (!out.length) throw new Error('Empty cues from structured translation')
		const usage = res.usage
			? {
					inputTokens: res.usage.inputTokens ?? 0,
					outputTokens: res.usage.outputTokens ?? 0,
					totalTokens: res.usage.totalTokens ?? 0,
				}
			: undefined
		return { cues: out, usage }
	} catch (e) {
		// If the provider returned JSON (but AI SDK failed to parse), attempt manual recovery.
		const assistantText = extractAssistantTextFromError(e)
		if (assistantText) {
			const maybe = tryParseJsonObjectFromText(assistantText)
			const parsed = StructuredSchema.safeParse(maybe)
			if (parsed.success && parsed.data.cues.length)
				return { cues: parsed.data.cues }
		}
		throw e
	}
}

async function translateCompactCuesStructured(args: {
	mediaId: string
	model: AIModelId
	cues: CompactCue[]
	system: string
}): Promise<{
	translated: Map<number, string>
	usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
}> {
	const { mediaId, model, cues, system } = args

	const translated = new Map<number, string>()
	let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

	const translateWithSplit = async (batch: CompactCue[]): Promise<void> => {
		try {
			const res = await translateBatchStructured({
				mediaId,
				model,
				system,
				batch,
			})
			if (res.usage) {
				usage = {
					inputTokens: usage.inputTokens + (res.usage.inputTokens ?? 0),
					outputTokens: usage.outputTokens + (res.usage.outputTokens ?? 0),
					totalTokens: usage.totalTokens + (res.usage.totalTokens ?? 0),
				}
			}

			const expected = new Set(batch.map((c) => c.i))
			const got = new Set<number>()
			for (const c of res.cues) {
				if (!expected.has(c.i)) continue
				if (got.has(c.i)) continue
				got.add(c.i)
				translated.set(c.i, c.zh)
			}

			if (got.size !== expected.size) {
				throw new Error(
					`Structured translation returned mismatched cue indices (expected ${expected.size}, got ${got.size})`,
				)
			}
		} catch (e) {
			if (batch.length <= 1) {
				const only = batch[0]
				if (!only) throw e
				const msg = e instanceof Error ? e.message : String(e)
				logStructuredTranslationError({
					mediaId,
					model,
					error: e,
					message: msg,
				})
				const fallback = await translateTextWithUsage(only.text, model)
				usage = {
					inputTokens: usage.inputTokens + (fallback.usage?.inputTokens ?? 0),
					outputTokens:
						usage.outputTokens + (fallback.usage?.outputTokens ?? 0),
					totalTokens: usage.totalTokens + (fallback.usage?.totalTokens ?? 0),
				}
				translated.set(only.i, fallback.translation)
				return
			}

			const mid = Math.ceil(batch.length / 2)
			await translateWithSplit(batch.slice(0, mid))
			await translateWithSplit(batch.slice(mid))
		}
	}

	const initialBatches = chunkByCharLimit(cues, {
		maxCues: 40,
		maxChars: 12_000,
	})
	for (const batch of initialBatches) await translateWithSplit(batch)

	return { translated, usage }
}

export async function translate(input: {
	mediaId: string
	model: AIModelId
	promptId?: string
}): Promise<{
	translation: string
	usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
}> {
	const { mediaId, model, promptId } = input
	const where = eq(schema.media.id, mediaId)
	const db = await getDb()
	const media = await db.query.media.findFirst({ where })
	if (!media?.transcription && !media?.optimizedTranscription)
		throw new Error('Transcription not found')

	const promptConfig = getTranslationPrompt(
		promptId || DEFAULT_TRANSLATION_PROMPT_ID,
	)
	if (!promptConfig)
		throw new Error(`Invalid translation prompt ID: ${promptId}`)
	logger.info(
		'translation',
		`Using translation prompt: ${promptConfig.name} for media ${mediaId}`,
	)

	const sourceVtt = media.optimizedTranscription || media.transcription!
	logger.info(
		'translation',
		`Preparing to translate ${sourceVtt.length} characters for media ${mediaId} with model ${model}`,
	)

	const originalCues = parseVttCues(sourceVtt)
	if (!originalCues || originalCues.length === 0)
		throw new Error('Source VTT has no cues to translate')
	const compact: CompactCue[] = originalCues.map((c, i) => ({
		i,
		start: c.start,
		end: c.end,
		text: c.lines.join(' ').replace(/\s+/g, ' ').trim(),
	}))

	const system = `You are a subtitle translator that outputs JSON only. The source text can be ANY language (Korean, Japanese, English, etc.).
Strict rules:
- Do NOT change any cue index 'i' (it must match the input)
- Produce the SAME number of cues, same order, with 'zh' translated
- 'zh' MUST be a faithful Simplified Chinese translation of the original text (no other languages)
- Do NOT add bullets, dashes, phonetics, or extra commentary
- Remove trailing sentence-ending punctuation in 'zh'
- Output strictly valid JSON matching the provided schema`

	let translated: Map<number, string>
	let llmUsage:
		| { inputTokens: number; outputTokens: number; totalTokens: number }
		| undefined
	try {
		const res = await translateCompactCuesStructured({
			mediaId,
			model,
			cues: compact,
			system,
		})
		translated = res.translated
		llmUsage = res.usage
		logger.info(
			'translation',
			`Structured translation produced ${translated.size} items for media ${mediaId}`,
		)
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e)
		throw new Error(`Structured translation failed: ${msg}`)
	}

	const pairs = originalCues.map((c, i) => {
		const enFallback = c.lines.join(' ').trim()
		const rawZh = (translated.get(i) ?? '').trim()
		const clean = (s: string) =>
			s
				.replace(/^[-•\s]+/, '')
				.replace(/[.,!?，。！？]$/g, '')
				.trim()
		// Force first line to remain the original text (no AI rewrite)
		const enText = clean(enFallback)
		const zhText = clean(rawZh || enFallback)
		const lines = [enText, zhText]
		return { start: c.start, end: c.end, lines }
	})
	const rebuilt = serializeVttCues(pairs)
	const vtt = rebuilt.trim().startsWith('WEBVTT')
		? rebuilt
		: `WEBVTT\n\n${rebuilt}`
	const check = validateVttContent(vtt)
	if (!check.cues.length) throw new Error('Rebuilt VTT has 0 cues')

	await db.update(schema.media).set({ translation: vtt }).where(where)
	try {
		const vttKey = bucketPaths.inputs.subtitles(mediaId, {
			title: media.title || undefined,
		})
		await putObjectByKey(vttKey, 'text/vtt', vtt)
		logger.info('translation', `Translated VTT materialized: ${vttKey}`)
	} catch (err) {
		logger.warn(
			'translation',
			`Translate materialization skipped: ${err instanceof Error ? err.message : String(err)}`,
		)
	}
	return { translation: vtt, usage: llmUsage }
}
