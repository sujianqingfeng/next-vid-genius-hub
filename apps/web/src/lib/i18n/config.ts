export const SUPPORTED_LOCALES = ['zh', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'zh'
export const LOCALE_COOKIE_NAME = 'locale'

export const BCP47_LOCALE_BY_LOCALE: Record<Locale, string> = {
	zh: 'zh-CN',
	en: 'en-US',
}

export function getValidLocale(value?: string | null): Locale {
	if (!value) return DEFAULT_LOCALE
	return SUPPORTED_LOCALES.includes(value as Locale)
		? (value as Locale)
		: DEFAULT_LOCALE
}

export function getBcp47Locale(locale: Locale): string {
	return BCP47_LOCALE_BY_LOCALE[locale] ?? BCP47_LOCALE_BY_LOCALE[DEFAULT_LOCALE]
}
