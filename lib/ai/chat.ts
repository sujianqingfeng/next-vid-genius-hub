import {
	generateObject as generateObjectFromAI,
	generateText as generateTextFromAI,
} from 'ai'
import { z } from 'zod'
import { deepseekProvider } from './deepseek'
import { AIModelId, models } from './models'
import { openaiProvider } from './openai'

function getModel(modelId: AIModelId) {
	const modelInfo = models.find((m) => m.id === modelId)
	if (!modelInfo) {
		throw new Error(`Model ${modelId} not found`)
	}

	if (modelInfo.id.startsWith('deepseek/')) {
		return deepseekProvider(modelInfo.modelName)
	}
	return openaiProvider(modelInfo.modelName)
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
