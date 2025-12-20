import {
	generateObject as generateObjectFromAI,
	generateText as generateTextFromAI,
	streamObject as streamObjectFromAI,
	streamText as streamTextFromAI,
} from 'ai'
import { z } from 'zod'
import { getAiModelConfig } from './config/service'
import { getProviderClient } from './provider-factory'

async function getModel(modelId: string) {
	const cfg = await getAiModelConfig(modelId)
	if (!cfg) {
		throw new Error(`Model ${modelId} not found`)
	}
	if (cfg.kind !== 'llm') {
		throw new Error(`Model ${modelId} is not an LLM model`)
	}
	if (!cfg.enabled) {
		throw new Error(`Model ${modelId} is disabled`)
	}
	if (!cfg.provider.enabled) {
		throw new Error(`Provider ${cfg.provider.slug} is disabled`)
	}

	const providerClient = getProviderClient(cfg.provider)
	return providerClient(cfg.remoteModelId)
}

export async function generateText(options: {
	model: string
	system: string
	prompt: string
	maxTokens?: number
	temperature?: number
}) {
	const { model: modelId, ...rest } = options
	const model = await getModel(modelId)

	return generateTextFromAI({
		...rest,
		model,
	})
}

export async function generateObject<T>(options: {
	model: string
	system: string
	prompt: string
	schema: z.Schema<T>
	maxTokens?: number
	temperature?: number
}) {
	const { model: modelId, schema, ...rest } = options
	const model = await getModel(modelId)

	return generateObjectFromAI({
		...rest,
		model,
		schema,
		output: 'object',
	})
}

export async function generateTextWithUsage(options: {
	model: string
	system: string
	prompt: string
	maxTokens?: number
	temperature?: number
}) {
	const result = await generateText(options)
	const usageUnknown = (result as { usage?: unknown }).usage
	const usageRaw: Record<string, unknown> =
		usageUnknown && typeof usageUnknown === 'object'
			? (usageUnknown as Record<string, unknown>)
			: {}
	const inputTokens = Number(
		usageRaw.promptTokens ?? usageRaw.inputTokens ?? 0,
	)
	const outputTokens = Number(
		usageRaw.completionTokens ?? usageRaw.outputTokens ?? 0,
	)
	return {
		...result,
		usage: {
			inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
			outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
			totalTokens: inputTokens + outputTokens,
		},
	}
}

export async function generateObjectWithUsage<T>(options: {
	model: string
	system: string
	prompt: string
	schema: z.Schema<T>
	maxTokens?: number
	temperature?: number
}) {
	const result = await generateObject<T>(options)
	const usageUnknown = (result as { usage?: unknown }).usage
	const usageRaw: Record<string, unknown> =
		usageUnknown && typeof usageUnknown === 'object'
			? (usageUnknown as Record<string, unknown>)
			: {}
	const inputTokens = Number(
		usageRaw.promptTokens ?? usageRaw.inputTokens ?? 0,
	)
	const outputTokens = Number(
		usageRaw.completionTokens ?? usageRaw.outputTokens ?? 0,
	)
	return {
		...result,
		usage: {
			inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
			outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
			totalTokens: inputTokens + outputTokens,
		},
	}
}

export async function streamObjectWithUsage<T>(options: {
	model: string
	system: string
	prompt: string
	schema: z.Schema<T>
	maxTokens?: number
	temperature?: number
}) {
	const { model: modelId, schema, ...rest } = options
	const model = await getModel(modelId)

	const result = streamObjectFromAI({
		...rest,
		model,
		schema,
		output: 'object',
	})

	// `streamObject()` doesn't progress unless the stream is consumed.
	try {
		for await (const _ of result.fullStream) {
			// drain
		}
	} catch {
		// errors will also surface via `result.object`/`result.usage`
	}

	const [object, usage] = await Promise.all([result.object, result.usage])
	return { object, usage }
}

export async function streamTextWithUsage(options: {
	model: string
	system: string
	prompt: string
	maxTokens?: number
	temperature?: number
}) {
	const { model: modelId, ...rest } = options
	const model = await getModel(modelId)
	const result = streamTextFromAI({ ...rest, model })
	const [text, usage] = await Promise.all([result.text, result.usage])
	return { text, usage }
}
