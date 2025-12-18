import * as React from 'react'
import { createIsomorphicFn } from '@tanstack/react-start'

import {
	DEFAULT_LOCALE,
	getValidLocale,
	LOCALE_COOKIE_NAME,
	type Locale,
} from '~/i18n/config'

import enMessages from '~/messages/en.json'
import zhMessages from '~/messages/zh.json'

type Messages = Record<string, unknown>

export { DEFAULT_LOCALE }

const messagesByLocale: Record<Locale, Messages> = {
	en: enMessages as Messages,
	zh: zhMessages as Messages,
}

function readCookieValue(cookieHeader: string, name: string): string | undefined {
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

function getLocaleFromCookieHeader(cookieHeader: string | undefined | null): Locale {
	const raw = cookieHeader ? readCookieValue(cookieHeader, LOCALE_COOKIE_NAME) : undefined
	return getValidLocale(raw)
}

function getLocaleFromDocument(): Locale {
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

export function useTranslations(namespace: string) {
	const ctx = React.useContext(I18nContext)
	return React.useMemo(() => {
		const scope = getByPath(ctx?.messages, [namespace])
		return (key: string) => {
			const value = getByPath(scope, key.split('.'))
			return typeof value === 'string' ? value : `${namespace}.${key}`
		}
	}, [ctx?.messages, namespace])
}
