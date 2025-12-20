export function getUserFriendlyErrorMessage(error: unknown): string {
	const e = error as { code?: string; message?: string } | null | undefined

	// Standardized ORPC business errors
	if (e?.code === 'INSUFFICIENT_POINTS') {
		// Generic copy; more specific messages can still be provided by the server
		// via `message`, but we ensure a friendly default here.
		return '积分不足，请前往“积分”页面充值后再重试。'
	}

	if (e?.code === 'TIMEOUT') {
		return e.message || '云转录耗时较长，任务仍在后台运行，请稍后刷新重试。'
	}

	// Fallback to server-provided message when available
	if (e?.message) return e.message

	return '发生未知错误，请稍后重试。'
}
