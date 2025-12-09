import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import { getValidLocale, LOCALE_COOKIE_NAME } from './config'

export default getRequestConfig(async () => {
	const store = await cookies()
	const localeCookie = store.get(LOCALE_COOKIE_NAME)?.value
	const locale = getValidLocale(localeCookie)

	const messages = (await import(`../messages/${locale}.json`)).default

	return {
		locale,
		messages,
	}
})
