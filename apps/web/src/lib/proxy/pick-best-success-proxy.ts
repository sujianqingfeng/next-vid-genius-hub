export type SuccessProxyCandidate = {
	id: string
	responseTime: number | null
	createdAt: Date
}

export function pickBestSuccessProxyId(
	candidates: readonly SuccessProxyCandidate[],
): string | null {
	if (!candidates.length) return null

	const sorted = [...candidates].sort((a, b) => {
		const aRtt = a.responseTime ?? Number.POSITIVE_INFINITY
		const bRtt = b.responseTime ?? Number.POSITIVE_INFINITY
		if (aRtt !== bRtt) return aRtt - bRtt
		return b.createdAt.getTime() - a.createdAt.getTime()
	})

	return sorted[0]?.id ?? null
}

