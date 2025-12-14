import {
	generateObject as generateObjectFromAI,
	generateText as generateTextFromAI,
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
	const usageRaw: any = (result as any).usage || {}
	const inputTokens = usageRaw.promptTokens ?? usageRaw.inputTokens ?? 0
	const outputTokens = usageRaw.completionTokens ?? usageRaw.outputTokens ?? 0
	return {
		...result,
		usage: {
			inputTokens,
			outputTokens,
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
	const usageRaw: any = (result as any).usage || {}
	const inputTokens = usageRaw.promptTokens ?? usageRaw.inputTokens ?? 0
	const outputTokens = usageRaw.completionTokens ?? usageRaw.outputTokens ?? 0
	return {
		...result,
		usage: {
			inputTokens,
			outputTokens,
			totalTokens: inputTokens + outputTokens,
		},
	}
}
