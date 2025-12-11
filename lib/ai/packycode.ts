import { createOpenAI } from '@ai-sdk/openai'

const BASE_URL = 'https://codex-api.packycode.com/v1'

export const packycodeModels = [
	{ id: 'packycode/gpt-5.1', modelName: 'gpt-5.1' },
	{ id: 'packycode/gpt-5', modelName: 'gpt-5' },
] as const

const packycode = createOpenAI({
	apiKey: process.env.PACKYCODE_API_KEY,
	baseURL: BASE_URL,
})

// Same callable provider contract as before; only the underlying client changed.
export const packycodeProvider = packycode
