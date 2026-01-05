import { createIsomorphicFn } from '@tanstack/react-start'

import {
	DEFAULT_LOCALE,
	getLocaleFromCookieHeader,
	getLocaleFromDocument,
	getMessages,
	I18nProvider,
	type Messages,
	setLocaleCookie,
	useLocale,
	useTranslations,
} from '~/lib/shared/i18n'

export {
	DEFAULT_LOCALE,
	getMessages,
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
		return { locale, messages: getMessages(locale) }
	})
	.client(() => {
		const locale = getLocaleFromDocument()
		return { locale, messages: getMessages(locale) }
	})
