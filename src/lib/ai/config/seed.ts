import { inArray } from 'drizzle-orm'
import { getDb, schema } from '~/lib/db'
import { deepseekModels } from '../deepseek'
import { openaiModels } from '../openai'
import { packycodeModels } from '../packycode'

type DbClient = Awaited<ReturnType<typeof getDb>>

const DEFAULT_LLM_MODEL_ID = 'packycode/gpt-5.1'
const DEFAULT_ASR_MODEL_ID = '@cf/openai/whisper-tiny-en'

const PROVIDER_SEEDS = [
	{
		slug: 'openai',
		name: 'OpenAI Compatible',
		kind: 'llm' as const,
		type: 'openai_compat' as const,
		baseUrl: 'https://api.chatanywhere.tech/v1',
	},
	{
		slug: 'packycode',
		name: 'Packycode (OpenAI Compatible)',
		kind: 'llm' as const,
		type: 'openai_compat' as const,
		baseUrl: 'https://codex-api.packycode.com/v1',
	},
	{
		slug: 'deepseek',
		name: 'DeepSeek',
		kind: 'llm' as const,
		type: 'deepseek_native' as const,
	},
	{
		slug: 'cloudflare',
		name: 'Cloudflare Workers AI',
		kind: 'asr' as const,
		type: 'cloudflare_asr' as const,
	},
] as const

const ASR_MODEL_SEEDS = [
	{
		id: '@cf/openai/whisper-tiny-en',
		label: 'Whisper Tiny (EN)',
		description: 'Fast, English only',
		capabilities: { inputFormat: 'binary', supportsLanguageHint: false },
		isDefault: true,
	},
	{
		id: '@cf/openai/whisper-large-v3-turbo',
		label: 'Whisper Large v3 Turbo',
		description: 'High quality, faster processing',
		capabilities: { inputFormat: 'base64', supportsLanguageHint: true },
		isDefault: false,
	},
	{
		id: '@cf/openai/whisper',
		label: 'Whisper (Medium)',
		description: 'Balanced quality and speed',
		capabilities: { inputFormat: 'binary', supportsLanguageHint: false },
		isDefault: false,
	},
] as const

export async function ensureAiSeeded(db?: DbClient) {
	const database = db ?? (await getDb())
	const existingProvider = await database.query.aiProviders.findFirst()
	if (existingProvider) return

	const now = new Date()

	await database.insert(schema.aiProviders).values(
		PROVIDER_SEEDS.map((p) => ({
			slug: p.slug,
			name: p.name,
			kind: p.kind,
			type: p.type,
			baseUrl: 'baseUrl' in p ? p.baseUrl : null,
			apiKey: null,
			enabled: true,
			metadata: null,
			createdAt: now,
			updatedAt: now,
		})),
	)

	const providers = await database.query.aiProviders.findMany({
		where: inArray(
			schema.aiProviders.slug,
			PROVIDER_SEEDS.map((p) => p.slug),
		),
	})
	const providerIdBySlug = new Map(providers.map((p) => [p.slug, p.id]))

	const llmSeeds = [
		...openaiModels.map((m) => ({
			id: m.id,
			providerSlug: 'openai',
			remoteModelId: m.modelName,
			label: m.modelName,
		})),
		...packycodeModels.map((m) => ({
			id: m.id,
			providerSlug: 'packycode',
			remoteModelId: m.modelName,
			label: m.modelName,
		})),
		...deepseekModels.map((m) => ({
			id: m.id,
			providerSlug: 'deepseek',
			remoteModelId: m.modelName,
			label: m.modelName,
		})),
	]

	const modelRows = [
		...llmSeeds.map((m) => ({
			id: m.id,
			providerId: providerIdBySlug.get(m.providerSlug)!,
			kind: 'llm' as const,
			remoteModelId: m.remoteModelId,
			label: m.label,
			description: null,
			enabled: true,
			isDefault: m.id === DEFAULT_LLM_MODEL_ID,
			capabilities: null,
			createdAt: now,
			updatedAt: now,
		})),
		...ASR_MODEL_SEEDS.map((m) => ({
			id: m.id,
			providerId: providerIdBySlug.get('cloudflare')!,
			kind: 'asr' as const,
			remoteModelId: m.id,
			label: m.label,
			description: m.description ?? null,
			enabled: true,
			isDefault: m.isDefault,
			capabilities: m.capabilities,
			createdAt: now,
			updatedAt: now,
		})),
	]

	// Seed models; if any duplicates slip in due to concurrency, unique indexes will protect.
	await database.insert(schema.aiModels).values(modelRows)
}

export const DEFAULT_AI_SEED = {
	llm: DEFAULT_LLM_MODEL_ID,
	asr: DEFAULT_ASR_MODEL_ID,
} as const
