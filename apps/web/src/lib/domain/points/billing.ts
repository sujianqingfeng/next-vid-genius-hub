import {
	POINT_RESOURCE_TYPES,
	POINT_TRANSACTION_TYPES,
} from '~/lib/features/job/task'
import { logger } from '~/lib/infra/logger'
import {
	calculateAsrCost,
	calculateDownloadCost,
	calculateLlmCost,
} from './pricing'
import {
	InsufficientPointsError,
	spendPoints,
	spendPointsOnce,
} from './service'

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

export async function chargeLlmUsage(
	opts: BaseChargeInput & {
		modelId?: string | null
		inputTokens?: number
		outputTokens?: number
	},
): Promise<{ charged: number; balance?: number }> {
	let points: number
	let totalTokens: number

	try {
		const result = await calculateLlmCost({
			modelId: opts.modelId,
			inputTokens: opts.inputTokens,
			outputTokens: opts.outputTokens,
		})
		points = result.points
		totalTokens = result.totalTokens
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.startsWith('Pricing rule not found for llm')
		) {
			return { charged: 0 }
		}
		logger.error(
			'api',
			`[billing.llm] pricing error user=${opts.userId} model=${opts.modelId ?? 'default'} error=${error instanceof Error ? error.message : String(error)}`,
		)
		throw error
	}

	// If AI SDK didn't provide usage, totalTokens may be 0. Avoid charging minCharge blindly.
	if (totalTokens <= 0) return { charged: 0 }
	if (points <= 0) return { charged: 0 }
	const remark = buildRemark(
		`model=${opts.modelId ?? 'default'} tokens=${totalTokens}`,
		opts.remark,
	)
	const balance = await spendPoints({
		userId: opts.userId,
		amount: points,
		type: POINT_TRANSACTION_TYPES.AI_USAGE,
		refType: opts.refType ?? 'ai',
		refId: opts.refId ?? null,
		remark,
		metadata: {
			resourceType: POINT_RESOURCE_TYPES.LLM,
			modelId: opts.modelId ?? null,
			tokens: totalTokens,
			inputTokens: opts.inputTokens ?? 0,
			outputTokens: opts.outputTokens ?? 0,
			...opts.metadata,
		},
	})
	logger.info(
		'api',
		`[billing.llm] charged user=${opts.userId} model=${opts.modelId ?? 'default'} tokens=${totalTokens} points=${points} balance=${balance ?? 0}`,
	)
	return { charged: points, balance }
}

export async function chargeAsrUsage(
	opts: BaseChargeInput & {
		modelId?: string | null
		durationSeconds: number
	},
): Promise<{ charged: number; balance?: number }> {
	let points: number
	let durationSeconds: number

	try {
		const result = await calculateAsrCost({
			modelId: opts.modelId,
			durationSeconds: opts.durationSeconds,
		})
		points = result.points
		durationSeconds = result.durationSeconds
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.startsWith('Pricing rule not found for asr')
		) {
			return { charged: 0 }
		}
		logger.error(
			'api',
			`[billing.asr] pricing error user=${opts.userId} model=${opts.modelId ?? 'default'} error=${error instanceof Error ? error.message : String(error)}`,
		)
		throw error
	}

	if (points <= 0) return { charged: 0 }

	const remark = buildRemark(
		`asr model=${opts.modelId ?? 'default'} dur=${durationSeconds.toFixed(1)}s`,
		opts.remark,
	)
	const spendResult =
		opts.refId && opts.refId.trim()
			? await spendPointsOnce({
					userId: opts.userId,
					amount: points,
					type: POINT_TRANSACTION_TYPES.ASR_USAGE,
					refType: opts.refType ?? 'asr',
					refId: opts.refId,
					remark,
					metadata: {
						resourceType: POINT_RESOURCE_TYPES.ASR,
						modelId: opts.modelId ?? null,
						durationSeconds,
						...opts.metadata,
					},
				})
			: {
					charged: points,
					balance: await spendPoints({
						userId: opts.userId,
						amount: points,
						type: POINT_TRANSACTION_TYPES.ASR_USAGE,
						refType: opts.refType ?? 'asr',
						refId: opts.refId ?? null,
						remark,
						metadata: {
							resourceType: POINT_RESOURCE_TYPES.ASR,
							modelId: opts.modelId ?? null,
							durationSeconds,
							...opts.metadata,
						},
					}),
				}

	if (spendResult.charged <= 0) return { charged: 0 }

	const balance = spendResult.balance
	logger.info(
		'api',
		`[billing.asr] charged user=${opts.userId} model=${opts.modelId ?? 'default'} dur=${durationSeconds.toFixed(1)}s points=${points} balance=${balance ?? 0}`,
	)
	return { charged: points, balance }
}

export async function chargeDownloadUsage(
	opts: BaseChargeInput & {
		durationSeconds: number
	},
): Promise<{ charged: number; balance?: number }> {
	let points: number
	let durationSeconds: number

	try {
		const result = await calculateDownloadCost({
			durationSeconds: opts.durationSeconds,
		})
		points = result.points
		durationSeconds = result.durationSeconds
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.startsWith('Pricing rule not found for download')
		) {
			return { charged: 0 }
		}
		logger.error(
			'api',
			`[billing.download] pricing error user=${opts.userId} dur=${opts.durationSeconds.toFixed(1)}s error=${error instanceof Error ? error.message : String(error)}`,
		)
		throw error
	}

	if (points <= 0) return { charged: 0 }

	const remark = buildRemark(
		`download dur=${durationSeconds.toFixed(1)}s`,
		opts.remark,
	)
	const spendResult =
		opts.refId && opts.refId.trim()
			? await spendPointsOnce({
					userId: opts.userId,
					amount: points,
					type: POINT_TRANSACTION_TYPES.DOWNLOAD_USAGE,
					refType: opts.refType ?? 'download',
					refId: opts.refId,
					remark,
					metadata: {
						resourceType: POINT_RESOURCE_TYPES.DOWNLOAD,
						durationSeconds,
						...opts.metadata,
					},
				})
			: {
					charged: points,
					balance: await spendPoints({
						userId: opts.userId,
						amount: points,
						type: POINT_TRANSACTION_TYPES.DOWNLOAD_USAGE,
						refType: opts.refType ?? 'download',
						refId: opts.refId ?? null,
						remark,
						metadata: {
							resourceType: POINT_RESOURCE_TYPES.DOWNLOAD,
							durationSeconds,
							...opts.metadata,
						},
					}),
				}

	if (spendResult.charged <= 0) return { charged: 0 }

	const balance = spendResult.balance
	logger.info(
		'api',
		`[billing.download] charged user=${opts.userId} dur=${durationSeconds.toFixed(1)}s points=${points} balance=${balance ?? 0}`,
	)
	return { charged: points, balance }
}

export { InsufficientPointsError }
