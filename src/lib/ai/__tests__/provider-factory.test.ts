import { beforeEach, describe, expect, it, vi } from 'vitest'

const openaiProviderFn = vi.fn()
const deepseekProviderFn = vi.fn()

vi.mock('@ai-sdk/openai', () => ({
	createOpenAI: vi.fn(() => openaiProviderFn),
}))
vi.mock('@ai-sdk/deepseek', () => ({
	createDeepSeek: vi.fn(() => deepseekProviderFn),
}))

import { createDeepSeek } from '@ai-sdk/deepseek'
import { createOpenAI } from '@ai-sdk/openai'
import { getProviderClient } from '../provider-factory'

describe('getProviderClient', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		delete process.env.OPENAI_API_KEY
		delete process.env.PACKYCODE_API_KEY
		delete process.env.DEEPSEEK_API_KEY
	})

	it('creates openai_compat client with DB apiKey/baseUrl', () => {
		const provider = {
			id: 'p1',
			slug: 'openai',
			name: 'OpenAI',
			kind: 'llm',
			type: 'openai_compat',
			baseUrl: 'https://example.com/v1',
			apiKey: 'k-openai',
			enabled: true,
			metadata: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as any

		const client = getProviderClient(provider)
		expect(createOpenAI).toHaveBeenCalledWith({
			apiKey: 'k-openai',
			baseURL: 'https://example.com/v1',
		})
		expect(client).toBe(openaiProviderFn)
	})

	it('falls back to env api key for openai_compat providers', () => {
		process.env.PACKYCODE_API_KEY = 'k-pack'
		const provider = {
			id: 'p2',
			slug: 'packycode',
			name: 'Packycode',
			kind: 'llm',
			type: 'openai_compat',
			baseUrl: null,
			apiKey: null,
			enabled: true,
			metadata: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as any

		getProviderClient(provider)
		expect(createOpenAI).toHaveBeenCalledWith({
			apiKey: 'k-pack',
			baseURL: undefined,
		})
	})

	it('creates deepseek_native client', () => {
		process.env.DEEPSEEK_API_KEY = 'k-deep'
		const provider = {
			id: 'p3',
			slug: 'deepseek',
			name: 'DeepSeek',
			kind: 'llm',
			type: 'deepseek_native',
			baseUrl: 'https://deep.example/v1',
			apiKey: null,
			enabled: true,
			metadata: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as any

		const client = getProviderClient(provider)
		expect(createDeepSeek).toHaveBeenCalledWith({
			apiKey: 'k-deep',
			baseURL: 'https://deep.example/v1',
		})
		expect(client).toBe(deepseekProviderFn)
	})

	it('throws for non-llm providers', () => {
		const provider = {
			id: 'p4',
			slug: 'cloudflare',
			name: 'Cloudflare',
			kind: 'asr',
			type: 'cloudflare_asr',
			baseUrl: null,
			apiKey: null,
			enabled: true,
			metadata: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as any

		expect(() => getProviderClient(provider)).toThrow(
			'Provider cloudflare is not an LLM provider',
		)
	})

	it('throws when api key is missing', () => {
		const provider = {
			id: 'p5',
			slug: 'openai',
			name: 'OpenAI',
			kind: 'llm',
			type: 'openai_compat',
			baseUrl: null,
			apiKey: null,
			enabled: true,
			metadata: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as any

		expect(() => getProviderClient(provider)).toThrow(
			'API key is not configured for provider openai',
		)
	})
})
