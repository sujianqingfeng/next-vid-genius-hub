import { ORPCError } from '@orpc/server'

export const INSUFFICIENT_POINTS_CODE = 'INSUFFICIENT_POINTS' as const
export const ASR_TIMEOUT_CODE = 'TIMEOUT' as const
export const NO_SUCCESS_PROXY_CODE = 'NO_SUCCESS_PROXY' as const
export const PROXY_NOT_SUCCESS_CODE = 'PROXY_NOT_SUCCESS' as const

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
		message: message ?? ASR_TIMEOUT_CODE,
		data: { reason: ASR_TIMEOUT_CODE },
	})
}

export function throwNoSuccessProxyError(message?: string): never {
	throw new ORPCError(NO_SUCCESS_PROXY_CODE, {
		status: 503,
		message: message ?? NO_SUCCESS_PROXY_CODE,
		data: { reason: NO_SUCCESS_PROXY_CODE },
	})
}

export function throwProxyNotSuccessError(message?: string): never {
	throw new ORPCError(PROXY_NOT_SUCCESS_CODE, {
		status: 400,
		message: message ?? PROXY_NOT_SUCCESS_CODE,
		data: { reason: PROXY_NOT_SUCCESS_CODE },
	})
}
