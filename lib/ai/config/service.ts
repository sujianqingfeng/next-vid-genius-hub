import { and, asc, eq } from 'drizzle-orm'
import { getDb, schema } from '~/lib/db'
import { ensureAiSeeded } from './seed'
import { deriveCloudflareAsrCapabilities } from '@app/media-domain'

export type AIProviderKind = 'llm' | 'asr'

type DbClient = Awaited<ReturnType<typeof getDb>>

const CACHE_TTL_MS = 60_000

type CacheEntry<T> = { at: number; value: T }

const providersCache = new Map<string, CacheEntry<typeof schema.aiProviders.$inferSelect[]>>()
const modelsCache = new Map<string, CacheEntry<typeof schema.aiModels.$inferSelect[]>>()
const modelByIdCache = new Map<string, CacheEntry<(typeof schema.aiModels.$inferSelect & { provider: typeof schema.aiProviders.$inferSelect }) | null>>()
const defaultModelCache = new Map<string, CacheEntry<(typeof schema.aiModels.$inferSelect & { provider: typeof schema.aiProviders.$inferSelect }) | null>>()

function isFresh(entry?: CacheEntry<unknown>) {
	return Boolean(entry && Date.now() - entry.at < CACHE_TTL_MS)
}

async function getDatabase(db?: DbClient) {
	const database = db ?? (await getDb())
	await ensureAiSeeded(database)
	return database
}

export function invalidateAiConfigCache() {
	providersCache.clear()
	modelsCache.clear()
	modelByIdCache.clear()
	defaultModelCache.clear()
}

export async function listAiProviders(opts: {
	kind: AIProviderKind
	enabledOnly?: boolean
	db?: DbClient
}) {
	const enabledOnly = opts.enabledOnly ?? true
	const key = `providers:${opts.kind}:${enabledOnly ? 1 : 0}`
	const cached = providersCache.get(key)
	if (isFresh(cached)) return cached!.value

	const database = await getDatabase(opts.db)
	const where = enabledOnly
		? and(
				eq(schema.aiProviders.kind, opts.kind),
				eq(schema.aiProviders.enabled, true),
			)
		: eq(schema.aiProviders.kind, opts.kind)

	const items = await database.query.aiProviders.findMany({
		where,
		orderBy: asc(schema.aiProviders.createdAt),
	})

	providersCache.set(key, { at: Date.now(), value: items })
	return items
}

export async function listAiModels(opts: {
	kind: AIProviderKind
	enabledOnly?: boolean
	db?: DbClient
}) {
	const enabledOnly = opts.enabledOnly ?? true
	const key = `models:${opts.kind}:${enabledOnly ? 1 : 0}`
	const cached = modelsCache.get(key)
	if (isFresh(cached)) return cached!.value

	const database = await getDatabase(opts.db)
	const where = enabledOnly
		? and(
				eq(schema.aiModels.kind, opts.kind),
				eq(schema.aiModels.enabled, true),
			)
		: eq(schema.aiModels.kind, opts.kind)

	const items = await database.query.aiModels.findMany({
		where,
		orderBy: asc(schema.aiModels.createdAt),
	})

	const normalized =
		opts.kind === 'asr'
			? items.map((m) => ({
					...m,
					capabilities: deriveCloudflareAsrCapabilities(m.remoteModelId),
				}))
			: items

	modelsCache.set(key, { at: Date.now(), value: normalized })
	return normalized
}

export async function getAiModelConfig(id: string, db?: DbClient) {
	const key = `model:${id}`
	const cached = modelByIdCache.get(key)
	if (isFresh(cached)) return cached!.value

	const database = await getDatabase(db)
	const model = await database.query.aiModels.findFirst({
		where: eq(schema.aiModels.id, id),
	})
	if (!model) {
		modelByIdCache.set(key, { at: Date.now(), value: null })
		return null
	}

	const provider = await database.query.aiProviders.findFirst({
		where: eq(schema.aiProviders.id, model.providerId),
	})
	if (!provider) {
		modelByIdCache.set(key, { at: Date.now(), value: null })
		return null
	}

	const value =
		model.kind === 'asr'
			? {
					...model,
					capabilities: deriveCloudflareAsrCapabilities(model.remoteModelId),
					provider,
				}
			: { ...model, provider }
	modelByIdCache.set(key, { at: Date.now(), value })
	return value
}

export async function getDefaultAiModel(kind: AIProviderKind, db?: DbClient) {
	const key = `default:${kind}`
	const cached = defaultModelCache.get(key)
	if (isFresh(cached)) return cached!.value

	const database = await getDatabase(db)
	const defaultModel = await database.query.aiModels.findFirst({
		where: and(
			eq(schema.aiModels.kind, kind),
			eq(schema.aiModels.enabled, true),
			eq(schema.aiModels.isDefault, true),
		),
	})

	let model = defaultModel
	if (!model) {
		model = await database.query.aiModels.findFirst({
			where: and(
				eq(schema.aiModels.kind, kind),
				eq(schema.aiModels.enabled, true),
			),
			orderBy: asc(schema.aiModels.createdAt),
		})
	}

	if (!model) {
		defaultModelCache.set(key, { at: Date.now(), value: null })
		return null
	}

	const provider = await database.query.aiProviders.findFirst({
		where: eq(schema.aiProviders.id, model.providerId),
	})
	if (!provider) {
		defaultModelCache.set(key, { at: Date.now(), value: null })
		return null
	}

	const value =
		model.kind === 'asr'
			? {
					...model,
					capabilities: deriveCloudflareAsrCapabilities(model.remoteModelId),
					provider,
				}
			: { ...model, provider }
	defaultModelCache.set(key, { at: Date.now(), value })
	return value
}

export async function isEnabledModel(kind: AIProviderKind, id: string, db?: DbClient) {
	const cfg = await getAiModelConfig(id, db)
	return Boolean(cfg && cfg.kind === kind && cfg.enabled)
}
