import { cookies } from 'next/headers'

import { getValidLocale, LOCALE_COOKIE_NAME } from '~/i18n/config'

import { createTranslator, getMessages } from './index'

export async function getServerTranslations(namespace: string) {
	const store = await cookies()
	const localeCookie = store.get(LOCALE_COOKIE_NAME)?.value
	const locale = getValidLocale(localeCookie)
	const messages = getMessages(locale)
	return createTranslator({ locale, messages, namespace })
}

