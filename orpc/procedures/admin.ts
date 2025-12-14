import { os } from '@orpc/server'
import { and, asc, count, desc, eq, isNull, like, ne, or } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '~/lib/db'
import { addPoints, listTransactions } from '~/lib/points/service'
import { ADMIN_PRICING_RULES_PAGE_SIZE, ADMIN_USERS_PAGE_SIZE, DEFAULT_PAGE_LIMIT } from '~/lib/pagination'
import type { PointResourceType } from '~/lib/db/schema'
import { POINT_TRANSACTION_TYPES } from '~/lib/job/task'
import {
	invalidateAiConfigCache,
	listAiModels as listAiModelsFromConfig,
	listAiProviders as listAiProvidersFromConfig,
	getDefaultAiModel,
} from '~/lib/ai/config/service'
import { generateText } from '~/lib/ai/chat'
import { deriveCloudflareAsrCapabilities } from '@app/media-domain'

const ListUsersSchema = z.object({
	page: z.number().int().min(1).default(1),
	limit: z.number().int().min(1).max(100).default(ADMIN_USERS_PAGE_SIZE),
	q: z.string().trim().optional(),
})

export const listUsers = os
	.input(ListUsersSchema)
	.handler(async ({ input }) => {
		const db = await getDb()

		const page = input.page ?? 1
		const limit = input.limit ?? ADMIN_USERS_PAGE_SIZE
		const offset = (page - 1) * limit

		const filters = []
		if (input.q && input.q.length > 0) {
			const keyword = `%${input.q}%`
			filters.push(
				or(
					like(schema.users.email, keyword),
					like(schema.users.nickname, keyword),
					like(schema.users.id, keyword),
				),
			)
		}

		const whereClause =
			filters.length === 1 ? filters[0] : filters.length > 1 ? and(...filters) : undefined

		const totalRows = await db
			.select({ value: count() })
			.from(schema.users)
			.where(whereClause)

		const users = await db
			.select({
				id: schema.users.id,
				email: schema.users.email,
				nickname: schema.users.nickname,
				role: schema.users.role,
				status: schema.users.status,
				createdAt: schema.users.createdAt,
				lastLoginAt: schema.users.lastLoginAt,
			})
			.from(schema.users)
			.where(whereClause)
			.orderBy(desc(schema.users.createdAt))
			.limit(limit)
			.offset(offset)

		const total = totalRows?.[0]?.value ?? 0
		const pageCount = Math.ceil(total / limit) || 1

		return {
			items: users,
			total,
			page,
			pageCount,
		}
	})

const UpdateUserRoleSchema = z.object({
	userId: z.string().min(1),
	role: z.enum(['user', 'admin']),
})

export const updateUserRole = os
	.input(UpdateUserRoleSchema)
	.handler(async ({ input }) => {
		const db = await getDb()

		await db
			.update(schema.users)
			.set({
				role: input.role,
				updatedAt: new Date(),
			})
			.where(eq(schema.users.id, input.userId))

		return { success: true }
	})

const UpdateUserStatusSchema = z.object({
	userId: z.string().min(1),
	status: z.enum(['active', 'banned']),
})

export const updateUserStatus = os
	.input(UpdateUserStatusSchema)
	.handler(async ({ input }) => {
		const db = await getDb()

		await db
			.update(schema.users)
			.set({
				status: input.status,
				updatedAt: new Date(),
			})
			.where(eq(schema.users.id, input.userId))

		return { success: true }
	})

const AddPointsSchema = z.object({
	userId: z.string().min(1),
	amount: z.number().int().positive(),
	remark: z.string().max(200).optional(),
})

export const addUserPoints = os
	.input(AddPointsSchema)
	.handler(async ({ input }) => {
		const db = await getDb()

		const balance = await addPoints({
			userId: input.userId,
			amount: input.amount,
			type: POINT_TRANSACTION_TYPES.MANUAL_ADJUST,
			remark: input.remark ?? '管理员加分',
			db,
		})

		return { balance }
	})

const ListUserTransactionsSchema = z.object({
	userId: z.string().min(1),
	limit: z.number().int().min(1).max(100).default(DEFAULT_PAGE_LIMIT),
	offset: z.number().int().min(0).default(0),
})

export const listUserTransactions = os
	.input(ListUserTransactionsSchema)
	.handler(async ({ input }) => {
		const items = await listTransactions({
			userId: input.userId,
			limit: input.limit,
			offset: input.offset,
		})
		return { items }
	})

const ListPricingRulesSchema = z.object({
	page: z.number().int().min(1).default(1),
	limit: z.number().int().min(1).max(ADMIN_PRICING_RULES_PAGE_SIZE).default(DEFAULT_PAGE_LIMIT),
	resourceType: z.custom<PointResourceType>().optional(),
})

export const listPricingRules = os
	.input(ListPricingRulesSchema)
	.handler(async ({ input }) => {
		const db = await getDb()

		const page = input.page ?? 1
		const limit = input.limit ?? DEFAULT_PAGE_LIMIT
		const offset = (page - 1) * limit

		const filters = []
		if (input.resourceType) {
			filters.push(eq(schema.pointPricingRules.resourceType, input.resourceType))
		}

		const whereClause =
			filters.length === 1 ? filters[0] : filters.length > 1 ? and(...filters) : undefined

		const totalRows = await db
			.select({ value: count() })
			.from(schema.pointPricingRules)
			.where(whereClause)

		const items = await db
			.select()
			.from(schema.pointPricingRules)
			.where(whereClause)
			.orderBy(desc(schema.pointPricingRules.createdAt))
			.limit(limit)
			.offset(offset)

		const total = totalRows?.[0]?.value ?? 0
		const pageCount = Math.ceil(total / limit) || 1

		return {
			items,
			total,
			page,
			pageCount,
		}
	})

const UpsertPricingRuleSchema = z.object({
	id: z.string().min(1).optional(),
	resourceType: z.custom<PointResourceType>(),
	providerId: z.string().min(1).optional().nullable(),
	modelId: z.string().trim().max(200).optional().nullable(),
	unit: z.enum(['token', 'second', 'minute']),
	pricePerUnit: z.number().int().min(0),
	inputPricePerUnit: z.number().int().min(0).optional().nullable(),
	outputPricePerUnit: z.number().int().min(0).optional().nullable(),
	minCharge: z.number().int().min(0).optional().nullable(),
})

export const upsertPricingRule = os
	.input(UpsertPricingRuleSchema)
	.handler(async ({ input }) => {
		const db = await getDb()
		const now = new Date()

		let normalizedProviderId =
			input.resourceType === 'download' ? null : (input.providerId ?? null)
		let normalizedModelId =
			input.resourceType === 'download' ? null : (input.modelId ?? null)

		if (normalizedModelId) {
			const model = await db.query.aiModels.findFirst({
				where: eq(schema.aiModels.id, normalizedModelId),
			})
			if (!model) throw new Error('Model not found')
			if (model.kind !== input.resourceType) {
				throw new Error(`Model kind mismatch: model=${model.kind} pricing=${input.resourceType}`)
			}
			if (normalizedProviderId && normalizedProviderId !== model.providerId) {
				throw new Error('Provider mismatch for model pricing rule')
			}
			normalizedProviderId = model.providerId
		} else if (normalizedProviderId) {
			const provider = await db.query.aiProviders.findFirst({
				where: eq(schema.aiProviders.id, normalizedProviderId),
			})
			if (!provider) throw new Error('Provider not found')
			if (provider.kind !== input.resourceType) {
				throw new Error(`Provider kind mismatch: provider=${provider.kind} pricing=${input.resourceType}`)
			}
		}

		if (input.resourceType === 'download') {
			normalizedProviderId = null
			normalizedModelId = null
		}

		if (input.resourceType === 'llm') {
			if (input.unit !== 'token') {
				throw new Error('LLM pricing rule unit must be token')
			}
			if (input.inputPricePerUnit == null || input.outputPricePerUnit == null) {
				throw new Error('LLM pricing rules require both inputPricePerUnit and outputPricePerUnit')
			}
		}

		if (input.id) {
			await db
				.update(schema.pointPricingRules)
				.set({
					resourceType: input.resourceType,
					providerId: normalizedProviderId,
					modelId: normalizedModelId,
					unit: input.unit,
					pricePerUnit: input.pricePerUnit,
					inputPricePerUnit: input.resourceType === 'llm' ? (input.inputPricePerUnit ?? null) : null,
					outputPricePerUnit: input.resourceType === 'llm' ? (input.outputPricePerUnit ?? null) : null,
					minCharge: input.minCharge ?? null,
					updatedAt: now,
				})
				.where(eq(schema.pointPricingRules.id, input.id))
			return { success: true }
		}

		// Upsert by (resourceType, providerId, modelId) to avoid accidental duplicate rules.
		const whereClause =
			normalizedProviderId == null && normalizedModelId == null
				? and(
						eq(schema.pointPricingRules.resourceType, input.resourceType),
						isNull(schema.pointPricingRules.providerId),
						isNull(schema.pointPricingRules.modelId),
					)
				: normalizedProviderId != null && normalizedModelId == null
					? and(
							eq(schema.pointPricingRules.resourceType, input.resourceType),
							eq(schema.pointPricingRules.providerId, normalizedProviderId),
							isNull(schema.pointPricingRules.modelId),
						)
					: normalizedProviderId != null && normalizedModelId != null
						? and(
								eq(schema.pointPricingRules.resourceType, input.resourceType),
								eq(schema.pointPricingRules.modelId, normalizedModelId),
								or(
									eq(schema.pointPricingRules.providerId, normalizedProviderId),
									isNull(schema.pointPricingRules.providerId),
								),
							)
						: and(
								eq(schema.pointPricingRules.resourceType, input.resourceType),
								eq(schema.pointPricingRules.modelId, normalizedModelId ?? ''),
							)

		const existing = await db.query.pointPricingRules.findFirst({ where: whereClause })
		if (existing) {
			await db
				.update(schema.pointPricingRules)
				.set({
					resourceType: input.resourceType,
					providerId: normalizedProviderId,
					modelId: normalizedModelId,
					unit: input.unit,
					pricePerUnit: input.pricePerUnit,
					inputPricePerUnit: input.resourceType === 'llm' ? (input.inputPricePerUnit ?? null) : null,
					outputPricePerUnit: input.resourceType === 'llm' ? (input.outputPricePerUnit ?? null) : null,
					minCharge: input.minCharge ?? null,
					updatedAt: now,
				})
				.where(eq(schema.pointPricingRules.id, existing.id))
			return { success: true }
		}

		await db.insert(schema.pointPricingRules).values({
			resourceType: input.resourceType,
			providerId: normalizedProviderId,
			modelId: normalizedModelId,
			unit: input.unit,
			pricePerUnit: input.pricePerUnit,
			inputPricePerUnit: input.resourceType === 'llm' ? (input.inputPricePerUnit ?? null) : null,
			outputPricePerUnit: input.resourceType === 'llm' ? (input.outputPricePerUnit ?? null) : null,
			minCharge: input.minCharge ?? null,
			createdAt: now,
			updatedAt: now,
		})

		return { success: true }
	})

const DeletePricingRuleSchema = z.object({
	id: z.string().min(1),
})

export const deletePricingRule = os
	.input(DeletePricingRuleSchema)
	.handler(async ({ input }) => {
		const db = await getDb()

		await db
			.delete(schema.pointPricingRules)
			.where(eq(schema.pointPricingRules.id, input.id))

		return { success: true }
	})

// ---------------- AI Providers / Models ----------------

const AI_PROVIDER_KINDS = ['llm', 'asr'] as const
const AI_PROVIDER_TYPES = [
	'openai_compat',
	'deepseek_native',
	'cloudflare_asr',
	'whisper_api',
] as const

function assertProviderKindType(kind: (typeof AI_PROVIDER_KINDS)[number], type: (typeof AI_PROVIDER_TYPES)[number]) {
	if (kind === 'llm') {
		if (type !== 'openai_compat' && type !== 'deepseek_native') {
			throw new Error(`Invalid LLM provider type: ${type}`)
		}
		return
	}
	if (type !== 'cloudflare_asr' && type !== 'whisper_api') {
		throw new Error(`Invalid ASR provider type: ${type}`)
	}
}

const ListAiProvidersSchema = z.object({
	kind: z.enum(AI_PROVIDER_KINDS),
	enabledOnly: z.boolean().optional().default(false),
})

export const listAiProviders = os
	.input(ListAiProvidersSchema)
	.handler(async ({ input }) => {
		const items = await listAiProvidersFromConfig({
			kind: input.kind,
			enabledOnly: input.enabledOnly,
		})
		return { items }
	})

const UpsertAiProviderSchema = z.object({
	id: z.string().min(1).optional(),
	slug: z.string().trim().min(1).max(50),
	name: z.string().trim().min(1).max(200),
	kind: z.enum(AI_PROVIDER_KINDS),
	type: z.enum(AI_PROVIDER_TYPES),
	baseUrl: z.string().trim().max(500).optional().nullable(),
	apiKey: z.string().trim().max(5000).optional().nullable(),
	enabled: z.boolean().optional(),
	// Use catch-all object instead of record() to avoid Zod v4 standard-schema bug
	metadata: z.object({}).catchall(z.unknown()).optional().nullable(),
})

export const upsertAiProvider = os
	.input(UpsertAiProviderSchema)
	.handler(async ({ input }) => {
		assertProviderKindType(input.kind, input.type)

		if (input.kind === 'asr' && input.type === 'whisper_api') {
			const baseUrl = (input.baseUrl ?? '').trim()
			if (!baseUrl) {
				throw new Error('Whisper API providers require baseUrl')
			}
		}
		if (input.kind === 'asr') {
			const maxUploadBytes =
				typeof (input.metadata as any)?.maxUploadBytes === 'number'
					? (input.metadata as any).maxUploadBytes
					: undefined
			if (
				typeof maxUploadBytes === 'number' &&
				(!Number.isFinite(maxUploadBytes) || maxUploadBytes <= 0)
			) {
				throw new Error('metadata.maxUploadBytes must be a positive number')
			}
		}

		const db = await getDb()
		const now = new Date()

		if (input.id) {
			const existing = await db.query.aiProviders.findFirst({
				where: eq(schema.aiProviders.id, input.id),
			})
			if (!existing) throw new Error('Provider not found')

			await db
				.update(schema.aiProviders)
				.set({
					slug: input.slug,
					name: input.name,
					kind: input.kind,
					type: input.type,
					baseUrl: input.baseUrl === undefined ? existing.baseUrl : input.baseUrl,
					apiKey: input.apiKey === undefined ? existing.apiKey : input.apiKey,
					enabled: input.enabled ?? existing.enabled,
					metadata: input.metadata === undefined ? existing.metadata : input.metadata,
					updatedAt: now,
				})
				.where(eq(schema.aiProviders.id, input.id))

			invalidateAiConfigCache()
			return { success: true }
		}

		await db.insert(schema.aiProviders).values({
			slug: input.slug,
			name: input.name,
			kind: input.kind,
			type: input.type,
			baseUrl: input.baseUrl ?? null,
			apiKey: input.apiKey ?? null,
			enabled: input.enabled ?? true,
			metadata: input.metadata ?? null,
			createdAt: now,
			updatedAt: now,
		})

		invalidateAiConfigCache()
		return { success: true }
	})

const ToggleAiProviderSchema = z.object({
	id: z.string().min(1),
	enabled: z.boolean(),
})

export const toggleAiProvider = os
	.input(ToggleAiProviderSchema)
	.handler(async ({ input }) => {
		const db = await getDb()
		await db
			.update(schema.aiProviders)
			.set({ enabled: input.enabled, updatedAt: new Date() })
			.where(eq(schema.aiProviders.id, input.id))

		invalidateAiConfigCache()
		return { success: true }
	})

const DeleteAiProviderSchema = z.object({
	id: z.string().min(1),
})

export const deleteAiProvider = os
	.input(DeleteAiProviderSchema)
	.handler(async ({ input }) => {
		const db = await getDb()

		const provider = await db.query.aiProviders.findFirst({
			where: eq(schema.aiProviders.id, input.id),
		})
		if (!provider) throw new Error('Provider not found')

		const referenced = await db.query.aiModels.findFirst({
			where: eq(schema.aiModels.providerId, input.id),
		})
		if (referenced) {
			throw new Error('Cannot delete provider: models still reference it')
		}

		await db.delete(schema.aiProviders).where(eq(schema.aiProviders.id, input.id))

		invalidateAiConfigCache()
		return { success: true }
	})

const TestAiProviderSchema = z.object({
	providerId: z.string().min(1),
	modelId: z.string().trim().min(1).optional(),
})

export const testAiProvider = os
	.input(TestAiProviderSchema)
	.handler(async ({ input }) => {
		const db = await getDb()
		const provider = await db.query.aiProviders.findFirst({
			where: eq(schema.aiProviders.id, input.providerId),
		})
		if (!provider) throw new Error('Provider not found')
		if (provider.kind !== 'llm') {
			if (provider.type === 'cloudflare_asr') {
				return { success: true, message: 'Cloudflare ASR provider config OK (no direct test).' }
			}

			if (provider.type === 'whisper_api') {
				const baseUrl =
					typeof provider.baseUrl === 'string'
						? provider.baseUrl.trim().replace(/\/$/, '')
						: ''
				if (!baseUrl) throw new Error('Whisper API baseUrl is not configured for this provider')

				const apiKey = typeof provider.apiKey === 'string' ? provider.apiKey.trim() : ''
				if (!apiKey) throw new Error('Whisper API token is not configured for this provider')

				const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
				const timeout = setTimeout(() => controller?.abort(), 5000)
				try {
					const r = await fetch(`${baseUrl}/health`, {
						method: 'GET',
						signal: controller?.signal,
					})
					if (!r.ok) {
						const t = await r.text().catch(() => '')
						throw new Error(`Whisper API health check failed: ${r.status} ${t}`)
					}
					const json = (await r.json().catch(() => null)) as any
					const modelCount = Array.isArray(json?.models) ? json.models.length : undefined
					return {
						success: true,
						message:
							typeof modelCount === 'number'
								? `Whisper API OK (models=${modelCount})`
								: 'Whisper API OK',
					}
				} finally {
					clearTimeout(timeout)
				}
			}

			return { success: true, message: 'ASR provider config OK.' }
		}

		const model = input.modelId
			? await db.query.aiModels.findFirst({
					where: and(
						eq(schema.aiModels.id, input.modelId),
						eq(schema.aiModels.providerId, input.providerId),
						eq(schema.aiModels.kind, 'llm'),
					),
				})
			: await db.query.aiModels.findFirst({
					where: and(
						eq(schema.aiModels.providerId, input.providerId),
						eq(schema.aiModels.kind, 'llm'),
						eq(schema.aiModels.enabled, true),
					),
					orderBy: asc(schema.aiModels.createdAt),
				})

		if (!model) {
			throw new Error('No enabled LLM model found for this provider')
		}

		// Lightweight ping; no points billing.
		const res = await generateText({
			model: model.id,
			system: 'You are a system healthcheck endpoint. Reply with OK only.',
			prompt: 'OK',
		})

		return { success: true, message: res.text?.trim() || 'OK' }
	})

const ListAiModelsSchema = z.object({
	kind: z.enum(AI_PROVIDER_KINDS),
	providerId: z.string().min(1).optional(),
	enabledOnly: z.boolean().optional().default(false),
})

export const listAiModels = os
	.input(ListAiModelsSchema)
	.handler(async ({ input }) => {
		const db = await getDb()

		if (input.kind === 'asr') {
			const all = await listAiModelsFromConfig({ kind: 'asr', enabledOnly: false, db })
			const filtered = all
				.filter((m) => (input.providerId ? m.providerId === input.providerId : true))
				.filter((m) => (input.enabledOnly ? Boolean(m.enabled) : true))
			return { items: filtered }
		}

		// Prefer config cache for the common "list all models by kind" path.
		if (!input.providerId && !input.enabledOnly) {
			const items = await listAiModelsFromConfig({ kind: input.kind, enabledOnly: false, db })
			return { items }
		}

		const filters = [eq(schema.aiModels.kind, input.kind)]
		if (input.providerId) filters.push(eq(schema.aiModels.providerId, input.providerId))
		if (input.enabledOnly) filters.push(eq(schema.aiModels.enabled, true))
		const whereClause = filters.length === 1 ? filters[0] : and(...filters)

		const items = await db.query.aiModels.findMany({
			where: whereClause,
			orderBy: asc(schema.aiModels.createdAt),
		})
		return { items }
	})

const UpsertAiModelSchema = z.object({
	id: z.string().trim().min(1).max(200),
	kind: z.enum(AI_PROVIDER_KINDS),
	providerId: z.string().min(1),
	remoteModelId: z.string().trim().min(1).max(200),
	label: z.string().trim().min(1).max(200),
	description: z.string().trim().max(500).optional().nullable(),
	enabled: z.boolean().optional(),
	isDefault: z.boolean().optional(),
	// Use catch-all object instead of record() to avoid Zod v4 standard-schema bug
	capabilities: z.object({}).catchall(z.unknown()).optional().nullable(),
})

export const upsertAiModel = os
	.input(UpsertAiModelSchema)
	.handler(async ({ input }) => {
		const db = await getDb()
		const now = new Date()

		const provider = await db.query.aiProviders.findFirst({
			where: eq(schema.aiProviders.id, input.providerId),
		})
		if (!provider) throw new Error('Provider not found')
		if (provider.kind !== input.kind) {
			throw new Error(`Provider kind mismatch: provider=${provider.kind} model=${input.kind}`)
		}
		if (input.kind === 'asr') {
			if (provider.type === 'cloudflare_asr') {
				if (input.remoteModelId !== input.id) {
					throw new Error('Cloudflare ASR remoteModelId must equal id (Cloudflare run id)')
				}
				// Validate modelId; ASR capabilities are derived from modelId and cannot be overridden.
				deriveCloudflareAsrCapabilities(input.id)
			} else if (provider.type === 'whisper_api') {
				if (!input.id.startsWith('whisper/')) {
					throw new Error('Whisper ASR model id must be namespaced as whisper/<remoteModelId>')
				}
				const expected = `whisper/${input.remoteModelId}`
				if (input.id !== expected) {
					throw new Error(`Whisper ASR model id must equal whisper/<remoteModelId>: expected ${expected}`)
				}
			}
		}

		const existing = await db.query.aiModels.findFirst({
			where: eq(schema.aiModels.id, input.id),
		})

		const enabled = input.enabled ?? existing?.enabled ?? true
		const isDefault = input.isDefault ?? existing?.isDefault ?? false

		if (isDefault) {
			await db
				.update(schema.aiModels)
				.set({ isDefault: false, updatedAt: now })
				.where(and(eq(schema.aiModels.kind, input.kind), eq(schema.aiModels.isDefault, true), ne(schema.aiModels.id, input.id)))
		}

		if (existing) {
			await db
				.update(schema.aiModels)
				.set({
					providerId: input.providerId,
					kind: input.kind,
					remoteModelId: input.remoteModelId,
					label: input.label,
					description: input.description ?? null,
					enabled,
					isDefault,
					capabilities: input.kind === 'asr' ? null : (input.capabilities ?? null),
					updatedAt: now,
				})
				.where(eq(schema.aiModels.id, input.id))
		} else {
			await db.insert(schema.aiModels).values({
				id: input.id,
				providerId: input.providerId,
				kind: input.kind,
				remoteModelId: input.remoteModelId,
				label: input.label,
				description: input.description ?? null,
				enabled,
				isDefault,
				capabilities: input.kind === 'asr' ? null : (input.capabilities ?? null),
				createdAt: now,
				updatedAt: now,
			})
		}

		invalidateAiConfigCache()
		return { success: true }
	})

const ToggleAiModelSchema = z.object({
	id: z.string().min(1),
	enabled: z.boolean(),
})

export const toggleAiModel = os
	.input(ToggleAiModelSchema)
	.handler(async ({ input }) => {
		const db = await getDb()
		await db
			.update(schema.aiModels)
			.set({ enabled: input.enabled, updatedAt: new Date() })
			.where(eq(schema.aiModels.id, input.id))
		invalidateAiConfigCache()
		return { success: true }
	})

const SetDefaultAiModelSchema = z.object({
	kind: z.enum(AI_PROVIDER_KINDS),
	id: z.string().min(1),
})

export const setDefaultAiModel = os
	.input(SetDefaultAiModelSchema)
	.handler(async ({ input }) => {
		const db = await getDb()
		const now = new Date()

		const model = await db.query.aiModels.findFirst({
			where: eq(schema.aiModels.id, input.id),
		})
		if (!model) throw new Error('Model not found')
		if (model.kind !== input.kind) throw new Error('Model kind mismatch')

		await db
			.update(schema.aiModels)
			.set({ isDefault: false, updatedAt: now })
			.where(and(eq(schema.aiModels.kind, input.kind), eq(schema.aiModels.isDefault, true), ne(schema.aiModels.id, input.id)))

		await db
			.update(schema.aiModels)
			.set({ isDefault: true, updatedAt: now })
			.where(eq(schema.aiModels.id, input.id))

		invalidateAiConfigCache()
		return { success: true }
	})

export const getDefaultModelForKind = os
	.input(z.object({ kind: z.enum(AI_PROVIDER_KINDS) }))
	.handler(async ({ input }) => {
		const cfg = await getDefaultAiModel(input.kind)
		return { model: cfg }
	})
