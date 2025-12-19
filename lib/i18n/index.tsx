import * as React from 'react'

import {
	DEFAULT_LOCALE,
	getValidLocale,
	LOCALE_COOKIE_NAME,
	type Locale,
} from '~/i18n/config'

import enMessages from '~/messages/en.json'
import zhMessages from '~/messages/zh.json'

export type Messages = Record<string, unknown>

export { DEFAULT_LOCALE }

const messagesByLocale: Record<Locale, Messages> = {
	en: enMessages as Messages,
	zh: zhMessages as Messages,
}

export function readCookieValue(
	cookieHeader: string,
	name: string,
): string | undefined {
	for (const part of cookieHeader.split(';')) {
		const trimmed = part.trim()
		if (!trimmed) continue
		const eqIdx = trimmed.indexOf('=')
		if (eqIdx === -1) continue
		const key = trimmed.slice(0, eqIdx).trim()
		if (key !== name) continue
		return decodeURIComponent(trimmed.slice(eqIdx + 1).trim())
	}
	return undefined
}

export function getLocaleFromCookieHeader(
	cookieHeader: string | undefined | null,
): Locale {
	const raw = cookieHeader ? readCookieValue(cookieHeader, LOCALE_COOKIE_NAME) : undefined
	return getValidLocale(raw)
}

export function getLocaleFromDocument(): Locale {
	if (typeof document === 'undefined') return DEFAULT_LOCALE
	return getLocaleFromCookieHeader(document.cookie)
}

export function getMessages(locale: Locale): Messages {
	return messagesByLocale[locale] ?? messagesByLocale[DEFAULT_LOCALE]
}

export function setLocaleCookie(locale: Locale) {
	const maxAgeSeconds = 60 * 60 * 24 * 365
	document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(
		locale,
	)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`
}

type I18nContextValue = {
	locale: Locale
	messages: Messages
}

const I18nContext = React.createContext<I18nContextValue | null>(null)

export function I18nProvider({
	locale,
	messages,
	children,
}: React.PropsWithChildren<I18nContextValue>) {
	return (
		<I18nContext.Provider value={{ locale, messages }}>
			{children}
		</I18nContext.Provider>
	)
}

export function useLocale(): Locale {
	const ctx = React.useContext(I18nContext)
	if (!ctx) return DEFAULT_LOCALE
	return ctx.locale
}

function getByPath(obj: unknown, path: string[]): unknown {
	let cur: unknown = obj
	for (const key of path) {
		if (!cur || typeof cur !== 'object') return undefined
		cur = (cur as Record<string, unknown>)[key]
	}
	return cur
}

function findMatchingBrace(input: string, openIndex: number): number {
	let depth = 0
	for (let i = openIndex; i < input.length; i++) {
		const ch = input[i]
		if (ch === '{') depth++
		else if (ch === '}') {
			depth--
			if (depth === 0) return i
		}
	}
	return -1
}

function parsePluralCases(body: string): Record<string, string> {
	const cases: Record<string, string> = {}
	let i = 0

	const skipWs = () => {
		while (i < body.length && /\s/.test(body[i] ?? '')) i++
	}

	while (i < body.length) {
		skipWs()
		if (i >= body.length) break

		let key = ''
		while (i < body.length && /[^\s{]/.test(body[i] ?? '')) {
			key += body[i]
			i++
		}
		skipWs()
		if (!key || body[i] !== '{') break

		const start = i
		const end = findMatchingBrace(body, start)
		if (end === -1) break
		const content = body.slice(start + 1, end)
		cases[key] = content
		i = end + 1
	}

	return cases
}

function replaceIcuPlurals(
	template: string,
	locale: string,
	params: Record<string, unknown>,
): string {
	if (!template.includes(', plural,')) return template

	let out = ''
	let i = 0
	while (i < template.length) {
		const ch = template[i]
		if (ch !== '{') {
			out += ch
			i++
			continue
		}

		const end = findMatchingBrace(template, i)
		if (end === -1) {
			out += ch
			i++
			continue
		}

		const inner = template.slice(i + 1, end)
		const match = inner.match(
			/^([a-zA-Z0-9_]+)\s*,\s*plural\s*,([\s\S]*)$/,
		)
		if (!match) {
			out += template.slice(i, end + 1)
			i = end + 1
			continue
		}

		const varName = match[1]!
		const body = match[2]!.trim()
		const cases = parsePluralCases(body)

		const raw = params[varName]
		const n =
			typeof raw === 'number'
				? raw
				: typeof raw === 'string'
					? Number.parseFloat(raw)
					: Number.NaN

		const pluralCategory = Number.isFinite(n)
			? new Intl.PluralRules(locale).select(n)
			: 'other'

		const chosen = cases[pluralCategory] ?? cases.other ?? ''
		out += chosen.replaceAll('#', Number.isFinite(n) ? String(n) : '')

		i = end + 1
	}

	return out
}

function formatMessage(
	template: string,
	locale: string,
	params?: Record<string, unknown>,
): string {
	if (!params) return template
	const withPlurals = replaceIcuPlurals(template, locale, params)
	return Object.entries(params).reduce((acc, [k, v]) => {
		const safeValue =
			v === null || v === undefined ? '' : typeof v === 'string' ? v : String(v)
		return acc.replaceAll(`{${k}}`, safeValue)
	}, withPlurals)
}

export function createTranslator({
	locale,
	messages,
	namespace,
}: {
	locale: Locale
	messages: Messages | undefined | null
	namespace: string
}) {
	const scope = getByPath(messages, namespace.split('.'))
	return (key: string, params?: Record<string, unknown>) => {
		const value = getByPath(scope, key.split('.'))
		const template = typeof value === 'string' ? value : `${namespace}.${key}`
		return formatMessage(template, locale, params)
	}
}

export function useTranslations(namespace: string) {
	const ctx = React.useContext(I18nContext)
	return React.useMemo(() => {
		return createTranslator({
			locale: ctx?.locale ?? DEFAULT_LOCALE,
			messages: ctx?.messages,
			namespace,
		})
	}, [ctx?.locale, ctx?.messages, namespace])
}
