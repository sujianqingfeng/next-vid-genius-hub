import { ORPCError } from '@orpc/server'

export const INSUFFICIENT_POINTS_CODE = 'INSUFFICIENT_POINTS' as const
export const ASR_TIMEOUT_CODE = 'TIMEOUT' as const

/**
 * Helper for throwing a standardized "insufficient points" ORPC error.
 *
 * - Uses HTTP 402 so clients can distinguish from generic 500s.
 * - Keeps a stable `code` field for frontend mapping / i18n.
 */
export function throwInsufficientPointsError(message?: string): never {
	throw new ORPCError(INSUFFICIENT_POINTS_CODE, {
		status: 402,
		message: message ?? INSUFFICIENT_POINTS_CODE,
		data: { reason: INSUFFICIENT_POINTS_CODE },
	})
}

/**
 * Helper for throwing a standardized timeout error for long-running ASR jobs.
 *
 * Currently not wired into all call sites, but kept here so frontend can
 * safely map `code === 'TIMEOUT'` once used.
 */
export function throwAsrTimeoutError(message?: string): never {
	throw new ORPCError(ASR_TIMEOUT_CODE, {
		status: 504,
		message: message ?? 'Cloud transcription is still running',
		data: { reason: ASR_TIMEOUT_CODE },
	})
}
