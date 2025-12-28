import {
	DEFAULT_LOCALE,
	createTranslator,
	getLocaleFromDocument,
	getMessages,
	type Locale,
} from '~/lib/i18n'

function getErrorTranslator(locale: Locale) {
	return createTranslator({
		locale,
		messages: getMessages(locale),
		namespace: 'Errors',
	})
}

export function getUserFriendlyErrorMessage(error: unknown): string {
	const e = error as { code?: string; message?: string } | null | undefined
	const locale = getLocaleFromDocument()
	const t = getErrorTranslator(locale ?? DEFAULT_LOCALE)

	// Standardized ORPC business errors
	if (e?.code === 'INSUFFICIENT_POINTS') {
		return t('codes.INSUFFICIENT_POINTS')
	}

	if (e?.code === 'NO_SUCCESS_PROXY') {
		return t('codes.NO_SUCCESS_PROXY')
	}

	if (e?.code === 'PROXY_NOT_SUCCESS') {
		return e.message && e.message !== 'PROXY_NOT_SUCCESS'
			? e.message
			: t('codes.PROXY_NOT_SUCCESS')
	}

	if (e?.code === 'TIMEOUT') {
		return e.message && e.message !== 'TIMEOUT' ? e.message : t('codes.TIMEOUT')
	}

	// Fallback to server-provided message when available
	if (e?.message) return e.message

	return t('unknown')
}
