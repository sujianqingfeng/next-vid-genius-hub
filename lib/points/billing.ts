import { calculateAsrCost, calculateDownloadCost, calculateLlmCost } from './pricing'
import { InsufficientPointsError, spendPoints } from './service'
import type { PointTransactionType } from '~/lib/db/schema'

interface BaseChargeInput {
	userId: string
	refType?: string | null
	refId?: string | null
	remark?: string | null
	metadata?: Record<string, unknown> | null
}

function buildRemark(defaultRemark: string, remark?: string | null) {
	return remark?.trim() || defaultRemark
}

export async function chargeLlmUsage(opts: BaseChargeInput & {
	modelId?: string | null
	inputTokens?: number
	outputTokens?: number
}): Promise<{ charged: number; balance?: number }> {
	const { points, totalTokens } = await calculateLlmCost({
		modelId: opts.modelId,
		inputTokens: opts.inputTokens,
		outputTokens: opts.outputTokens,
	})
	if (points <= 0) return { charged: 0 }
	const remark = buildRemark(`model=${opts.modelId ?? 'default'} tokens=${totalTokens}`, opts.remark)
	const balance = await spendPoints({
		userId: opts.userId,
		amount: points,
		type: 'ai_usage',
		refType: opts.refType ?? 'ai',
		refId: opts.refId ?? null,
		remark,
		metadata: {
			resourceType: 'llm',
			modelId: opts.modelId ?? null,
			tokens: totalTokens,
			inputTokens: opts.inputTokens ?? 0,
			outputTokens: opts.outputTokens ?? 0,
			...(opts.metadata ?? {}),
		},
	})
	return { charged: points, balance }
}

export async function chargeAsrUsage(opts: BaseChargeInput & {
	modelId?: string | null
	durationSeconds: number
}): Promise<{ charged: number; balance?: number }> {
	const { points, durationSeconds } = await calculateAsrCost({
		modelId: opts.modelId,
		durationSeconds: opts.durationSeconds,
	})
	if (points <= 0) return { charged: 0 }
	const remark = buildRemark(`asr model=${opts.modelId ?? 'default'} dur=${durationSeconds.toFixed(1)}s`, opts.remark)
	const balance = await spendPoints({
		userId: opts.userId,
		amount: points,
		type: 'asr_usage',
		refType: opts.refType ?? 'asr',
		refId: opts.refId ?? null,
		remark,
		metadata: {
			resourceType: 'asr',
			modelId: opts.modelId ?? null,
			durationSeconds,
			...(opts.metadata ?? {}),
		},
	})
	return { charged: points, balance }
}

export async function chargeDownloadUsage(opts: BaseChargeInput & {
	durationSeconds: number
}): Promise<{ charged: number; balance?: number }> {
	const { points, durationSeconds } = await calculateDownloadCost({ durationSeconds: opts.durationSeconds })
	if (points <= 0) return { charged: 0 }
	const remark = buildRemark(`download dur=${durationSeconds.toFixed(1)}s`, opts.remark)
	const balance = await spendPoints({
		userId: opts.userId,
		amount: points,
		type: 'download_usage',
		refType: opts.refType ?? 'download',
		refId: opts.refId ?? null,
		remark,
		metadata: {
			resourceType: 'download',
			durationSeconds,
			...(opts.metadata ?? {}),
		},
	})
	return { charged: points, balance }
}

export { InsufficientPointsError }
