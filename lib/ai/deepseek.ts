import { createDeepSeek } from '@ai-sdk/deepseek'

export const deepseekModels = [
	{ id: 'deepseek/deepseek-v3', modelName: 'deepseek-chat' },
] as const

const deepseek = createDeepSeek({
	apiKey: process.env.DEEPSEEK_API_KEY,
})

// Keep the same provider shape so lib/ai/chat.ts can keep using deepseekProvider(modelName).
export const deepseekProvider = deepseek
