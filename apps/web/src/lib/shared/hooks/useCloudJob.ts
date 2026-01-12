'use client'

import {
	type UseQueryOptions,
	type UseQueryResult,
	useQuery,
} from '@tanstack/react-query'
import { useEffect } from 'react'
import { useJobStatusSse } from './useJobStatusSse'
import { usePersistedJobId } from './usePersistedJobId'

type DefaultStatus = string | undefined

interface UseCloudJobOptions<
	TData,
	TError,
	TQueryFnData,
	TQueryKey extends readonly unknown[],
> {
	storageKey: string
	createQueryOptions: (
		jobId: string,
	) => UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>
	enabled?: boolean
	getStatus?: (data: TData | undefined) => DefaultStatus
	completeStatuses?: string[]
	onCompleted?: (params: { data: TData | undefined; jobId: string }) => void
	autoClearOnComplete?: boolean
	sse?: {
		enabled?: boolean
		url?: (jobId: string) => string
		pollFallbackIntervalMs?: number | false
	}
}

const DEFAULT_COMPLETE_STATUSES = ['completed']
const DEFAULT_SSE_POLL_FALLBACK_INTERVAL_MS = 30_000
const DEFAULT_TERMINAL_STATUSES = new Set(['completed', 'failed', 'canceled'])

export function useCloudJob<
	TData = unknown,
	TError = unknown,
	TQueryFnData = TData,
	TQueryKey extends readonly unknown[] = readonly unknown[],
>(options: UseCloudJobOptions<TData, TError, TQueryFnData, TQueryKey>) {
	const {
		storageKey,
		createQueryOptions,
		enabled = true,
		getStatus = (data) =>
			data && typeof data === 'object'
				? (data as { status?: string }).status
				: undefined,
		completeStatuses = DEFAULT_COMPLETE_STATUSES,
		onCompleted,
		autoClearOnComplete = true,
		sse,
	} = options

	const [jobId, setJobId] = usePersistedJobId(storageKey)

	const baseQueryOptions = createQueryOptions(jobId ?? '')
	const sseEnabled = Boolean(sse) && (sse.enabled ?? true)
	const ssePollFallbackIntervalMs =
		sse?.pollFallbackIntervalMs ?? DEFAULT_SSE_POLL_FALLBACK_INTERVAL_MS

	const queryOptions = sseEnabled
		? {
				...baseQueryOptions,
				refetchInterval:
					ssePollFallbackIntervalMs === false
						? false
						: (q: { state: { data?: TData } }) => {
								const status = getStatus(q.state.data)
								if (typeof status === 'string' && DEFAULT_TERMINAL_STATUSES.has(status)) {
									return false
								}
								return ssePollFallbackIntervalMs
							},
			}
		: baseQueryOptions

	const mergedEnabled =
		Boolean(jobId) && enabled && (queryOptions.enabled ?? true)
	const statusQuery: UseQueryResult<TData, TError> = useQuery({
		...queryOptions,
		enabled: mergedEnabled,
	})

	useJobStatusSse({
		jobId,
		queryKey: (queryOptions.queryKey ?? []) as unknown as readonly unknown[],
		enabled: mergedEnabled && sseEnabled,
		url: sse?.url,
		terminalStatuses: DEFAULT_TERMINAL_STATUSES,
	})

	useEffect(() => {
		if (!jobId) return
		const status = getStatus(statusQuery.data)
		if (status && completeStatuses.includes(status)) {
			onCompleted?.({ data: statusQuery.data, jobId })
			if (autoClearOnComplete) {
				setJobId(null)
			}
		}
	}, [
		autoClearOnComplete,
		completeStatuses,
		getStatus,
		jobId,
		onCompleted,
		setJobId,
		statusQuery.data,
	])

	return {
		jobId,
		setJobId,
		statusQuery,
	}
}
