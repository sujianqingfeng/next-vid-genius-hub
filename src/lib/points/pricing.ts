import { and, eq, isNull, or } from 'drizzle-orm'
import { getDb, schema } from '~/lib/db'
import type { PointResourceType } from '~/lib/db/schema'
import { POINT_RESOURCE_TYPES } from '~/lib/job/task'
import { MICRO_POINTS_PER_POINT } from './units'

export type PricingRule = typeof schema.pointPricingRules.$inferSelect

type DbClient = Awaited<ReturnType<typeof getDb>>

function applyMinCharge(cost: number, minCharge?: number | null) {
	return Math.max(cost, minCharge ?? 0)
}

function ceilDivBigInt(numerator: bigint, denominator: bigint): bigint {
	const ZERO = BigInt(0)
	const ONE = BigInt(1)
	if (denominator <= ZERO) throw new Error('denominator must be positive')
	if (numerator <= ZERO) return ZERO
	return (numerator + denominator - ONE) / denominator
}

async function resolveRule(opts: {
	resourceType: PointResourceType
	modelId?: string | null
	db?: DbClient
}): Promise<PricingRule> {
	const client = opts.db ?? (await getDb())

	// Download pricing never depends on provider/model.
	if (opts.resourceType === POINT_RESOURCE_TYPES.DOWNLOAD) {
		const row = await client.query.pointPricingRules.findFirst({
			where: and(
				eq(schema.pointPricingRules.resourceType, opts.resourceType),
				isNull(schema.pointPricingRules.providerId),
				isNull(schema.pointPricingRules.modelId),
			),
		})
		if (!row) {
			throw new Error(
				`Pricing rule not found for ${opts.resourceType} (model=default)`,
			)
		}
		return row
	}

	const modelId = opts.modelId ?? null
	let providerId: string | null = null

	if (modelId) {
		const model = await client.query.aiModels.findFirst({
			where: eq(schema.aiModels.id, modelId),
		})
		if (model) {
			// Best-effort kind validation
			if (
				opts.resourceType === POINT_RESOURCE_TYPES.LLM &&
				model.kind !== 'llm'
			) {
				throw new Error(
					`Pricing model kind mismatch for llm (model=${modelId})`,
				)
			}
			if (
				opts.resourceType === POINT_RESOURCE_TYPES.ASR &&
				model.kind !== 'asr'
			) {
				throw new Error(
					`Pricing model kind mismatch for asr (model=${modelId})`,
				)
			}
			providerId = model.providerId
		}
	}

	const whereClause = modelId
		? and(
				eq(schema.pointPricingRules.resourceType, opts.resourceType),
				or(
					eq(schema.pointPricingRules.modelId, modelId),
					and(
						isNull(schema.pointPricingRules.modelId),
						providerId
							? eq(schema.pointPricingRules.providerId, providerId)
							: isNull(schema.pointPricingRules.providerId),
					),
					and(
						isNull(schema.pointPricingRules.modelId),
						isNull(schema.pointPricingRules.providerId),
					),
				),
			)
		: and(
				eq(schema.pointPricingRules.resourceType, opts.resourceType),
				isNull(schema.pointPricingRules.modelId),
				isNull(schema.pointPricingRules.providerId),
			)

	const rows = await client.query.pointPricingRules.findMany({
		where: whereClause,
	})

	const modelRule = modelId
		? rows.find((r) => r.modelId === modelId)
		: undefined
	const providerRule = providerId
		? rows.find((r) => r.modelId == null && r.providerId === providerId)
		: undefined
	const globalRule = rows.find((r) => r.modelId == null && r.providerId == null)

	const rule = modelRule ?? providerRule ?? globalRule
	if (!rule) {
		throw new Error(
			`Pricing rule not found for ${opts.resourceType} (model=${opts.modelId ?? 'default'})`,
		)
	}
	return rule
}

export async function calculateLlmCost(opts: {
	modelId?: string | null
	inputTokens?: number
	outputTokens?: number
	db?: DbClient
}): Promise<{ points: number; rule: PricingRule; totalTokens: number }> {
	const rule = await resolveRule({
		resourceType: POINT_RESOURCE_TYPES.LLM,
		modelId: opts.modelId,
		db: opts.db,
	})
	const inputTokens = Math.max(0, Math.trunc(opts.inputTokens ?? 0))
	const outputTokens = Math.max(0, Math.trunc(opts.outputTokens ?? 0))
	const totalTokens = inputTokens + outputTokens
	if (rule.unit !== 'token') {
		throw new Error(`LLM pricing rule unit must be token (got ${rule.unit})`)
	}
	// LLM pricing uses micropoints per token to support sub-point granularity.
	// - 1 point = 1_000_000 micropoints
	// - `inputPricePerUnit` / `outputPricePerUnit` store micropoints per token (integers)
	const inputPriceMicro = Math.max(0, Math.trunc(rule.inputPricePerUnit ?? 0))
	const outputPriceMicro = Math.max(0, Math.trunc(rule.outputPricePerUnit ?? 0))
	const rawCostMicro =
		BigInt(inputTokens) * BigInt(inputPriceMicro) +
		BigInt(outputTokens) * BigInt(outputPriceMicro)
	const pointsBig = ceilDivBigInt(rawCostMicro, BigInt(MICRO_POINTS_PER_POINT))
	if (pointsBig > BigInt(Number.MAX_SAFE_INTEGER)) {
		throw new Error('LLM cost overflow (points too large)')
	}
	const points = applyMinCharge(Number(pointsBig), rule.minCharge)
	return { points, rule, totalTokens }
}

export async function calculateAsrCost(opts: {
	modelId?: string | null
	durationSeconds: number
	db?: DbClient
}): Promise<{ points: number; rule: PricingRule; durationSeconds: number }> {
	const rule = await resolveRule({
		resourceType: POINT_RESOURCE_TYPES.ASR,
		modelId: opts.modelId,
		db: opts.db,
	})
	const seconds = Math.max(0, opts.durationSeconds)
	const units =
		rule.unit === 'minute' ? Math.ceil(seconds / 60) : Math.ceil(seconds)
	const points = applyMinCharge(units * rule.pricePerUnit, rule.minCharge)
	return { points, rule, durationSeconds: seconds }
}

export async function calculateDownloadCost(opts: {
	durationSeconds: number
	db?: DbClient
}): Promise<{ points: number; rule: PricingRule; durationSeconds: number }> {
	const rule = await resolveRule({
		resourceType: POINT_RESOURCE_TYPES.DOWNLOAD,
		modelId: null,
		db: opts.db,
	})
	const seconds = Math.max(0, opts.durationSeconds)
	const units =
		rule.unit === 'minute' ? Math.ceil(seconds / 60) : Math.ceil(seconds)
	const points = applyMinCharge(units * rule.pricePerUnit, rule.minCharge)
	return { points, rule, durationSeconds: seconds }
}
