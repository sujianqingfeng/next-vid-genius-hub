import { createOpenAI } from '@ai-sdk/openai'

const BASE_URL = 'https://api.deepseek.com/v1'

export const deepseekModels = [
	{ id: 'deepseek/deepseek-v3', modelName: 'deepseek-chat' },
] as const

export const deepseekProvider = createOpenAI({
	apiKey: process.env.DEEPSEEK_API_KEY,
	baseURL: BASE_URL,
})
