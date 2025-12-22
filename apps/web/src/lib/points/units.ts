export const MICRO_POINTS_PER_POINT = 1_000_000 as const

// Business config: 10 RMB = 1000 points => 1 RMB = 100 points.
// Used only for admin-side display / conversions (LLM charging uses micropoints directly).
export const POINTS_PER_RMB = 100 as const

export const MICRO_POINTS_PER_RMB = MICRO_POINTS_PER_POINT * POINTS_PER_RMB

export function rmbPerMillionTokensFromMicroPointsPerToken(
	microPointsPerToken: number,
): number {
	const micro = Number.isFinite(microPointsPerToken)
		? Math.max(0, microPointsPerToken)
		: 0
	// RMB / 1M tokens = (microPoints/token) * (1 point / 1e6 micro) * (0.01 RMB / point) * 1e6
	// With 10 RMB = 1000 points => RMB / 1M tokens = microPoints/token ÷ 100
	return micro / POINTS_PER_RMB
}

export function microPointsPerTokenFromRmbPerMillionTokens(
	rmbPerMillionTokens: number,
): number {
	const rmb = Number.isFinite(rmbPerMillionTokens)
		? Math.max(0, rmbPerMillionTokens)
		: 0
	// microPoints/token = (RMB / 1M tokens) * 100
	// (because 1 RMB = 100 points and 1 point = 1e6 micro-points)
	return Math.round(rmb * POINTS_PER_RMB)
}
