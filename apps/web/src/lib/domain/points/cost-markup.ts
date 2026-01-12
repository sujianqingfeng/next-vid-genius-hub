import { POINTS_PER_RMB } from './units'
import type { PointResourceType } from '~/lib/infra/db/schema'

function ceilDivBigInt(numerator: bigint, denominator: bigint): bigint {
	const ZERO = BigInt(0)
	const ONE = BigInt(1)
	if (denominator <= ZERO) throw new Error('denominator must be positive')
	if (numerator <= ZERO) return ZERO
	return (numerator + denominator - ONE) / denominator
}

export function rmbToFen(rmb: number): number {
	if (!Number.isFinite(rmb) || rmb < 0) throw new Error('INVALID_RMB_AMOUNT')
	return Math.round(rmb * 100)
}

export function markupPercentToBps(markupPercent: number): number {
	if (!Number.isFinite(markupPercent) || markupPercent < 0) {
		throw new Error('INVALID_MARKUP_PERCENT')
	}
	return Math.round(markupPercent * 100)
}

export function applyMarkupFen(costFen: number, markupBps: number): number {
	const cost = BigInt(Math.max(0, Math.trunc(costFen)))
	const bps = BigInt(Math.max(0, Math.trunc(markupBps)))
	const factor = BigInt(10000) + bps
	const sellFen = ceilDivBigInt(cost * factor, BigInt(10000))
	if (sellFen > BigInt(Number.MAX_SAFE_INTEGER)) {
		throw new Error('PRICING_OVERFLOW')
	}
	return Number(sellFen)
}

export function fenToPointsCeil(fen: number): number {
	const fenInt = BigInt(Math.max(0, Math.trunc(fen)))
	const points = ceilDivBigInt(fenInt * BigInt(POINTS_PER_RMB), BigInt(100))
	if (points > BigInt(Number.MAX_SAFE_INTEGER)) {
		throw new Error('PRICING_OVERFLOW')
	}
	return Number(points)
}

export type DerivedPricingRule =
	| {
			resourceType: 'llm'
			unit: 'token'
			pricePerUnit: 0
			inputPricePerUnit: number
			outputPricePerUnit: number
			minCharge: number | null
			pricingMode: 'cost_markup'
			markupBps: number
			costInputFenPer1M: number
			costOutputFenPer1M: number
			costFenPerMinute: null
			minChargeCostFen: number | null
	  }
	| {
			resourceType: 'asr' | 'download'
			unit: 'minute'
			pricePerUnit: number
			inputPricePerUnit: null
			outputPricePerUnit: null
			minCharge: number | null
			pricingMode: 'cost_markup'
			markupBps: number
			costInputFenPer1M: null
			costOutputFenPer1M: null
			costFenPerMinute: number
			minChargeCostFen: number | null
	  }

export function derivePricingRuleFromCostMarkup(input: {
	resourceType: PointResourceType
	markupBps: number
	costInputFenPer1M?: number | null
	costOutputFenPer1M?: number | null
	costFenPerMinute?: number | null
	minChargeCostFen?: number | null
}): DerivedPricingRule {
	const markupBps = Math.max(0, Math.trunc(input.markupBps))
	const minChargeCostFen =
		typeof input.minChargeCostFen === 'number'
			? Math.max(0, Math.trunc(input.minChargeCostFen))
			: null

	const minCharge =
		minChargeCostFen != null && minChargeCostFen > 0
			? fenToPointsCeil(applyMarkupFen(minChargeCostFen, markupBps))
			: null

	if (input.resourceType === 'llm') {
		const costInputFenPer1M =
			typeof input.costInputFenPer1M === 'number'
				? Math.max(0, Math.trunc(input.costInputFenPer1M))
				: null
		const costOutputFenPer1M =
			typeof input.costOutputFenPer1M === 'number'
				? Math.max(0, Math.trunc(input.costOutputFenPer1M))
				: null

		if (costInputFenPer1M == null || costOutputFenPer1M == null) {
			throw new Error('LLM_COST_REQUIRED')
		}

		const sellInputFenPer1M = applyMarkupFen(costInputFenPer1M, markupBps)
		const sellOutputFenPer1M = applyMarkupFen(costOutputFenPer1M, markupBps)

		return {
			resourceType: 'llm',
			unit: 'token',
			pricePerUnit: 0,
			inputPricePerUnit: fenToPointsCeil(sellInputFenPer1M),
			outputPricePerUnit: fenToPointsCeil(sellOutputFenPer1M),
			minCharge,
			pricingMode: 'cost_markup',
			markupBps,
			costInputFenPer1M,
			costOutputFenPer1M,
			costFenPerMinute: null,
			minChargeCostFen,
		}
	}

	const costFenPerMinute =
		typeof input.costFenPerMinute === 'number'
			? Math.max(0, Math.trunc(input.costFenPerMinute))
			: null
	if (costFenPerMinute == null) {
		throw new Error('TIME_COST_REQUIRED')
	}

	const sellFenPerMinute = applyMarkupFen(costFenPerMinute, markupBps)

	return {
		resourceType: input.resourceType,
		unit: 'minute',
		pricePerUnit: fenToPointsCeil(sellFenPerMinute),
		inputPricePerUnit: null,
		outputPricePerUnit: null,
		minCharge,
		pricingMode: 'cost_markup',
		markupBps,
		costInputFenPer1M: null,
		costOutputFenPer1M: null,
		costFenPerMinute,
		minChargeCostFen,
	}
}

