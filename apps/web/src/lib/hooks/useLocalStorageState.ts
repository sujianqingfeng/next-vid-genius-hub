'use client'

import * as React from 'react'

type Setter<T> = T | ((prev: T) => T)

type Envelope<T> = {
	v: number
	value: T
}

function resolveSetter<T>(value: Setter<T>, previous: T): T {
	return typeof value === 'function'
		? (value as (prev: T) => T)(previous)
		: value
}

function readLocalStorage(key: string): string | null {
	if (typeof window === 'undefined') return null
	try {
		return window.localStorage.getItem(key)
	} catch {
		return null
	}
}

function writeLocalStorage(key: string, value: string | null) {
	if (typeof window === 'undefined') return
	try {
		if (value === null) window.localStorage.removeItem(key)
		else window.localStorage.setItem(key, value)
	} catch {
		// ignore storage errors (private mode, full quota, etc.)
	}
}

function defaultSerialize<T>(value: Envelope<T>): string {
	return JSON.stringify(value)
}

function defaultDeserialize(raw: string): unknown {
	return JSON.parse(raw) as unknown
}

function isEnvelope(value: unknown): value is Envelope<unknown> {
	if (!value || typeof value !== 'object') return false
	const v = (value as any).v
	return typeof v === 'number' && 'value' in (value as any)
}

export function useLocalStorageState<T>(
	key: string,
	options: {
		defaultValue: T | (() => T)
		version: number
		migrate?: (stored: unknown, storedVersion: number) => T | null
		serialize?: (value: Envelope<T>) => string
		deserialize?: (raw: string) => unknown
	},
) {
	const {
		defaultValue,
		version,
		migrate,
		serialize = defaultSerialize,
		deserialize = defaultDeserialize,
	} = options

	const defaultValueRef = React.useRef(defaultValue)
	defaultValueRef.current = defaultValue

	const read = React.useCallback((): T => {
		const raw = readLocalStorage(key)
		const fallback =
			typeof defaultValueRef.current === 'function'
				? (defaultValueRef.current as () => T)()
				: defaultValueRef.current

		if (!raw) return fallback

		let parsed: unknown
		try {
			parsed = deserialize(raw)
		} catch {
			return fallback
		}

		if (isEnvelope(parsed)) {
			if (parsed.v === version) return parsed.value as T
			if (migrate) {
				const migrated = migrate(parsed.value, parsed.v)
				if (migrated !== null) return migrated
			}
			return fallback
		}

		if (migrate) {
			const migrated = migrate(parsed, 0)
			if (migrated !== null) return migrated
		}

		return fallback
	}, [deserialize, key, migrate, version])

	const [state, setState] = React.useState<T>(() => read())

	React.useEffect(() => {
		setState(read())
	}, [read])

	const set = React.useCallback(
		(value: Setter<T>) => {
			setState((prev) => {
				const next = resolveSetter(value, prev)
				const env: Envelope<T> = { v: version, value: next }
				writeLocalStorage(key, serialize(env))
				return next
			})
		},
		[key, serialize, version],
	)

	const remove = React.useCallback(() => {
		writeLocalStorage(key, null)
		setState(() => {
			const fallback =
				typeof defaultValueRef.current === 'function'
					? (defaultValueRef.current as () => T)()
					: defaultValueRef.current
			return fallback
		})
	}, [key])

	return [state, set, remove] as const
}
