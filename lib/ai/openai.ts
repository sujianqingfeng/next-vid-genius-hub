import { createOpenAI } from '@ai-sdk/openai'

const BASE_URL = 'https://api.chatanywhere.tech/v1'

export const openaiModels = [
	{ id: 'openai/gpt-4.1-mini', modelName: 'gpt-4.1-mini' },
	{ id: 'openai/gpt-4.1', modelName: 'gpt-4.1' },
	{ id: 'openai/gpt-5', modelName: 'gpt-5' },
	{ id: 'openai/gpt-5-mini', modelName: 'gpt-5-mini' },
	{ id: 'openai/gpt-5-nano', modelName: 'gpt-5-nano' },
] as const

const openai = createOpenAI({
	apiKey: process.env.OPENAI_API_KEY,
	baseURL: BASE_URL,
})

// Expose provider in the same shape as before: a callable that accepts modelName.
export const openaiProvider = openai
