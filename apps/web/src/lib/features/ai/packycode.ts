// Static Packycode (OpenAI-compatible) model list used for seeding and fallback UI.
// Runtime clients are created from DB-configured providers via lib/ai/provider-factory.ts.

export const packycodeModels = [
	{ id: 'packycode/gpt-5.1', modelName: 'gpt-5.1' },
	{ id: 'packycode/gpt-5', modelName: 'gpt-5' },
] as const
