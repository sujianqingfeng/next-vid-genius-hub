import { and, eq, isNull, or } from 'drizzle-orm'
import { getDb, schema } from '~/lib/db'
import type { PointResourceType } from '~/lib/db/schema'
import { POINT_RESOURCE_TYPES } from '~/lib/job/task'

export type PricingRule = typeof schema.pointPricingRules.$inferSelect

type DbClient = Awaited<ReturnType<typeof getDb>>

function applyMinCharge(cost: number, minCharge?: number | null) {
	return Math.max(cost, minCharge ?? 0)
}

async function resolveRule(opts: {
	resourceType: PointResourceType
	modelId?: string | null
	db?: DbClient
}): Promise<PricingRule> {
	const client = opts.db ?? (await getDb())
	const rows = await client.query.pointPricingRules.findMany({
		where: and(
			eq(schema.pointPricingRules.resourceType, opts.resourceType),
			or(eq(schema.pointPricingRules.modelId, opts.modelId ?? null), isNull(schema.pointPricingRules.modelId)),
		),
	})

	const match = rows.find((r) => r.modelId && opts.modelId && r.modelId === opts.modelId)
	const fallback = rows.find((r) => r.modelId == null)
	const rule = match ?? fallback
	if (!rule) {
		throw new Error(`Pricing rule not found for ${opts.resourceType} (model=${opts.modelId ?? 'default'})`)
	}
	return rule
}

export async function calculateLlmCost(opts: {
	modelId?: string | null
	inputTokens?: number
	outputTokens?: number
	db?: DbClient
}): Promise<{ points: number; rule: PricingRule; totalTokens: number }> {
	const rule = await resolveRule({ resourceType: POINT_RESOURCE_TYPES.LLM, modelId: opts.modelId, db: opts.db })
	const inputTokens = Math.max(0, opts.inputTokens ?? 0)
	const outputTokens = Math.max(0, opts.outputTokens ?? 0)
	const totalTokens = inputTokens + outputTokens
	const units = rule.unit === 'token' ? totalTokens : totalTokens
	const points = applyMinCharge(Math.ceil(units * rule.pricePerUnit), rule.minCharge)
	return { points, rule, totalTokens }
}

export async function calculateAsrCost(opts: {
	modelId?: string | null
	durationSeconds: number
	db?: DbClient
}): Promise<{ points: number; rule: PricingRule; durationSeconds: number }> {
	const rule = await resolveRule({ resourceType: POINT_RESOURCE_TYPES.ASR, modelId: opts.modelId, db: opts.db })
	const seconds = Math.max(0, opts.durationSeconds)
	const units = rule.unit === 'minute' ? Math.ceil(seconds / 60) : Math.ceil(seconds)
	const points = applyMinCharge(units * rule.pricePerUnit, rule.minCharge)
	return { points, rule, durationSeconds: seconds }
}

export async function calculateDownloadCost(opts: {
	durationSeconds: number
	db?: DbClient
}): Promise<{ points: number; rule: PricingRule; durationSeconds: number }> {
	const rule = await resolveRule({ resourceType: POINT_RESOURCE_TYPES.DOWNLOAD, modelId: null, db: opts.db })
	const seconds = Math.max(0, opts.durationSeconds)
	const units = rule.unit === 'minute' ? Math.ceil(seconds / 60) : Math.ceil(seconds)
	const points = applyMinCharge(units * rule.pricePerUnit, rule.minCharge)
	return { points, rule, durationSeconds: seconds }
}
