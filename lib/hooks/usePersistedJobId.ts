'use client'

import { useCallback, useEffect, useState } from 'react'

type Setter<T> = T | ((prev: T) => T)

function resolveSetter<T>(value: Setter<T>, previous: T): T {
	return typeof value === 'function' ? (value as (prev: T) => T)(previous) : value
}

export function usePersistedJobId(storageKey: string) {
	const [jobId, setJobIdState] = useState<string | null>(() => {
		if (typeof window === 'undefined') return null
		try {
			return window.localStorage.getItem(storageKey)
		} catch {
			return null
		}
	})

	useEffect(() => {
		if (typeof window === 'undefined') return
		try {
			const stored = window.localStorage.getItem(storageKey)
			if (stored && !jobId) {
				setJobIdState(stored)
			}
			if (!stored && jobId) {
				// Storage key changed, ensure current job id persists under new key
				window.localStorage.setItem(storageKey, jobId)
			}
		} catch {
			// ignore storage errors
		}
	}, [jobId, storageKey])

	useEffect(() => {
		if (typeof window === 'undefined') return
		try {
			if (jobId) {
				window.localStorage.setItem(storageKey, jobId)
			} else {
				window.localStorage.removeItem(storageKey)
			}
		} catch {
			// ignore storage errors
		}
	}, [jobId, storageKey])

	const setJobId = useCallback((value: Setter<string | null>) => {
		setJobIdState((prev) => resolveSetter(value, prev))
	}, [])

	return [jobId, setJobId] as const
}
