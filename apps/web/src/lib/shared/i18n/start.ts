import { createIsomorphicFn } from '@tanstack/react-start'

import {
	DEFAULT_LOCALE,
	getLocaleFromCookieHeader,
	getLocaleFromDocument,
	I18nProvider,
	loadMessages,
	type Messages,
	setLocaleCookie,
	useLocale,
	useTranslations,
} from '~/lib/shared/i18n'

export {
	DEFAULT_LOCALE,
	I18nProvider,
	setLocaleCookie,
	useLocale,
	useTranslations,
}

export type { Messages }
export type { Locale } from '~/lib/shared/i18n'

export const getInitialI18n = createIsomorphicFn()
	.server(async () => {
		const { getRequestHeaders } = await import('@tanstack/react-start/server')
		const cookieHeader = getRequestHeaders().get('cookie')
		const locale = getLocaleFromCookieHeader(cookieHeader)
		return { locale, messages: await loadMessages(locale) }
	})
	.client(async () => {
		const locale = getLocaleFromDocument()
		return { locale, messages: await loadMessages(locale) }
	})
