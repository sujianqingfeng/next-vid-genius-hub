import { createDeepSeek } from '@ai-sdk/deepseek'
import { createOpenAI } from '@ai-sdk/openai'
import type { schema } from '~/lib/db'

type AIProvider = typeof schema.aiProviders.$inferSelect

function resolveApiKey(provider: AIProvider) {
	if (provider.apiKey) return provider.apiKey

	const envBySlug: Record<string, string | undefined> = {
		openai: process.env.OPENAI_API_KEY,
		packycode: process.env.PACKYCODE_API_KEY,
		deepseek: process.env.DEEPSEEK_API_KEY,
	}
	return envBySlug[provider.slug]
}

export function getProviderClient(provider: AIProvider) {
	if (provider.kind !== 'llm') {
		throw new Error(`Provider ${provider.slug} is not an LLM provider`)
	}

	const apiKey = resolveApiKey(provider)
	if (!apiKey) {
		throw new Error(`API key is not configured for provider ${provider.slug}`)
	}

	if (provider.type === 'deepseek_native') {
		return createDeepSeek({
			apiKey,
			baseURL: provider.baseUrl || undefined,
		})
	}

	// openai_compat providers (OpenAI / Packycode / others)
	return createOpenAI({
		apiKey,
		baseURL: provider.baseUrl || undefined,
	})
}

