// Static DeepSeek model list used for seeding and fallback UI.
// Runtime clients are created from DB-configured providers via lib/ai/provider-factory.ts.

export const deepseekModels = [
	{ id: 'deepseek/deepseek-v3', modelName: 'deepseek-chat' },
] as const
