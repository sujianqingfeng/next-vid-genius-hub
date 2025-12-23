export function getUserFriendlyErrorMessage(error: unknown): string {
	const e = error as { code?: string; message?: string } | null | undefined

	// Standardized ORPC business errors
	if (e?.code === 'INSUFFICIENT_POINTS') {
		// Generic copy; more specific messages can still be provided by the server
		// via `message`, but we ensure a friendly default here.
		return '积分不足，请前往“积分”页面充值后再重试。'
	}

	if (e?.code === 'NO_SUCCESS_PROXY') {
		return '暂无可用代理（状态为“可用”），请先在“代理管理”中检测/添加代理后再试。'
	}

	if (e?.code === 'PROXY_NOT_SUCCESS') {
		return e.message || '所选代理不可用，请选择状态为“可用”的代理。'
	}

	if (e?.code === 'TIMEOUT') {
		return e.message || '云转录耗时较长，任务仍在后台运行，请稍后刷新重试。'
	}

	// Fallback to server-provided message when available
	if (e?.message) return e.message

	return '发生未知错误，请稍后重试。'
}
