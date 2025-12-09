import {
	generateObject as generateObjectFromAI,
	generateText as generateTextFromAI,
} from 'ai'
import { z } from 'zod'
import { deepseekProvider } from './deepseek'
import { AIModelId, models } from './models'
import { openaiProvider } from './openai'
import { packycodeProvider } from './packycode'

function getModel(modelId: AIModelId) {
	const modelInfo = models.find((m) => m.id === modelId)
	if (!modelInfo) {
		throw new Error(`Model ${modelId} not found`)
	}

	// Check if model has modelName property (chat/text models)
	if ('modelName' in modelInfo) {
		if (modelInfo.id.startsWith('deepseek/')) {
			return deepseekProvider(modelInfo.modelName)
		}
		if (modelInfo.id.startsWith('packycode/')) {
			return packycodeProvider(modelInfo.modelName)
		}
		return openaiProvider(modelInfo.modelName)
	}

	// Handle Whisper models differently - they don't need modelName for transcription
	throw new Error(`Model ${modelId} is a transcription model and cannot be used for chat`)
}

export async function generateText(options: {
	model: AIModelId
	system: string
	prompt: string
}) {
	const { model: modelId, ...rest } = options
	const model = getModel(modelId)

	return generateTextFromAI({
		...rest,
		model,
	})
}

export async function generateObject<T>(options: {
	model: AIModelId
	system: string
	prompt: string
	schema: z.Schema<T>
}) {
	const { model: modelId, schema, ...rest } = options
	const model = getModel(modelId)

	return generateObjectFromAI({
		...rest,
		model,
		schema,
		output: 'object',
	})
}


export async function generateTextWithUsage(options: {
	model: AIModelId
	system: string
	prompt: string
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
	model: AIModelId
	system: string
	prompt: string
	schema: z.Schema<T>
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
