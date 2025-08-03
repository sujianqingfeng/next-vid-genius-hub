import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

const BASE_URL = 'https://api.chatanywhere.tech/v1'

export const openaiModels = [
	{ id: 'openai/gpt-4.1-mini', modelName: 'gpt-4.1-mini' },
	{ id: 'openai/gpt-4.1', modelName: 'gpt-4.1' },
] as const

export const openaiProvider = createOpenAICompatible({
	name: 'openai',
	apiKey: process.env.OPENAI_API_KEY,
	baseURL: BASE_URL,
})
