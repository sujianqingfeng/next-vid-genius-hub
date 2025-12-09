'use server'

import { cookies } from 'next/headers'
import {
	LOCALE_COOKIE_NAME,
	SUPPORTED_LOCALES,
	type Locale,
} from '~/i18n/config'

function isSupportedLocale(locale: string): locale is Locale {
	return SUPPORTED_LOCALES.includes(locale as Locale)
}

export async function setLocale(locale: string) {
	if (!isSupportedLocale(locale)) {
		// Ignore invalid locale to avoid writing unexpected cookies
		return
	}

	const store = await cookies()

	if (typeof store.set === 'function') {
		store.set(LOCALE_COOKIE_NAME, locale, {
			path: '/',
			maxAge: 60 * 60 * 24 * 365,
		})
	}
}
