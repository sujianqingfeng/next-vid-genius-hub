'use client'

import { useEffect } from 'react'
import { useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query'
import { usePersistedJobId } from './usePersistedJobId'

type DefaultStatus = string | undefined

interface UseCloudJobOptions<TData, TError, TQueryFnData, TQueryKey extends readonly unknown[]> {
	storageKey: string
	createQueryOptions: (jobId: string) => UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>
	enabled?: boolean
	getStatus?: (data: TData | undefined) => DefaultStatus
	completeStatuses?: string[]
	onCompleted?: (params: { data: TData | undefined; jobId: string }) => void
	autoClearOnComplete?: boolean
}

const DEFAULT_COMPLETE_STATUSES = ['completed']

export function useCloudJob<TData = unknown, TError = unknown, TQueryFnData = TData, TQueryKey extends readonly unknown[] = readonly unknown[]>(
	options: UseCloudJobOptions<TData, TError, TQueryFnData, TQueryKey>,
) {
	const {
		storageKey,
		createQueryOptions,
		enabled = true,
		getStatus = (data) => (data && typeof data === 'object' ? (data as { status?: string }).status : undefined),
		completeStatuses = DEFAULT_COMPLETE_STATUSES,
		onCompleted,
		autoClearOnComplete = true,
	} = options

	const [jobId, setJobId] = usePersistedJobId(storageKey)

	const queryOptions = createQueryOptions(jobId ?? '')
	const mergedEnabled = Boolean(jobId) && enabled && (queryOptions.enabled ?? true)
	const statusQuery: UseQueryResult<TData, TError> = useQuery({
		...queryOptions,
		enabled: mergedEnabled,
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
	}, [autoClearOnComplete, completeStatuses, getStatus, jobId, onCompleted, setJobId, statusQuery.data])

	return {
		jobId,
		setJobId,
		statusQuery,
	}
}

