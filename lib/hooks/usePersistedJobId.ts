'use client'

import { useCallback, useEffect, useState } from 'react'

type Setter<T> = T | ((prev: T) => T)

function resolveSetter<T>(value: Setter<T>, previous: T): T {
	return typeof value === 'function' ? (value as (prev: T) => T)(previous) : value
}

function readJobId(storageKey: string) {
	if (typeof window === 'undefined') return null
	try {
		return window.localStorage.getItem(storageKey)
	} catch {
		return null
	}
}

export function usePersistedJobId(storageKey: string) {
	const [jobId, setJobIdState] = useState<string | null>(() => readJobId(storageKey))

	useEffect(() => {
		const stored = readJobId(storageKey)
		if (stored !== jobId) {
			setJobIdState(stored)
		}
	}, [jobId, storageKey])

	const setJobId = useCallback((value: Setter<string | null>) => {
		setJobIdState((prev) => {
			const next = resolveSetter(value, prev)
			if (typeof window !== 'undefined') {
				try {
					if (next) {
						window.localStorage.setItem(storageKey, next)
					} else {
						window.localStorage.removeItem(storageKey)
					}
				} catch {
					// ignore storage errors
				}
			}
			return next
		})
	}, [storageKey])

	return [jobId, setJobId] as const
}
