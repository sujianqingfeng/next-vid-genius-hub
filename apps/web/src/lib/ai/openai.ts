// Static OpenAI-compatible model list used for seeding and fallback UI.
// Runtime clients are created from DB-configured providers via lib/ai/provider-factory.ts.

export const openaiModels = [
	{ id: 'openai/gpt-4.1-mini', modelName: 'gpt-4.1-mini' },
	{ id: 'openai/gpt-4.1', modelName: 'gpt-4.1' },
	{ id: 'openai/gpt-5', modelName: 'gpt-5' },
	{ id: 'openai/gpt-5-mini', modelName: 'gpt-5-mini' },
	{ id: 'openai/gpt-5-nano', modelName: 'gpt-5-nano' },
] as const
