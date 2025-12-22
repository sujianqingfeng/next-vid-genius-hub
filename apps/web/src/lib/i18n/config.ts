export const SUPPORTED_LOCALES = ['zh', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'zh'
export const LOCALE_COOKIE_NAME = 'locale'

export function getValidLocale(value?: string | null): Locale {
	if (!value) return DEFAULT_LOCALE
	return SUPPORTED_LOCALES.includes(value as Locale)
		? (value as Locale)
		: DEFAULT_LOCALE
}
