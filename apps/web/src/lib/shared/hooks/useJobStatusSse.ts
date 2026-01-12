'use client'

import { useQueryClient } from '@tanstack/react-query'
import * as React from 'react'

const DEFAULT_TERMINAL_STATUSES = new Set(['completed', 'failed', 'canceled'])

export function useJobStatusSse<TData = unknown>(opts: {
	jobId: string | null | undefined
	queryKey: readonly unknown[]
	enabled?: boolean
	url?: (jobId: string) => string
	terminalStatuses?: ReadonlySet<string> | string[]
}) {
	const qc = useQueryClient()
	const enabled = opts.enabled ?? true
	const urlForJob =
		opts.url ?? ((jobId: string) => `/api/jobs/${encodeURIComponent(jobId)}/events`)

	const terminal = React.useMemo(() => {
		if (!opts.terminalStatuses) return DEFAULT_TERMINAL_STATUSES
		if (opts.terminalStatuses instanceof Set) return opts.terminalStatuses
		return new Set(opts.terminalStatuses)
	}, [opts.terminalStatuses])

	React.useEffect(() => {
		if (!enabled) return
		const jobId = typeof opts.jobId === 'string' ? opts.jobId.trim() : ''
		if (!jobId) return

		const es = new EventSource(urlForJob(jobId))

		const onStatus = (event: MessageEvent) => {
			try {
				const next = JSON.parse(String(event.data || 'null')) as TData
				qc.setQueryData(opts.queryKey, next)

				const status =
					next && typeof next === 'object'
						? (next as { status?: unknown }).status
						: undefined
				if (typeof status === 'string' && terminal.has(status)) {
					es.close()
				}
			} catch {
				// ignore malformed updates
			}
		}

		es.addEventListener('status', onStatus as unknown as EventListener)
		return () => {
			es.close()
		}
	}, [enabled, opts.jobId, opts.queryKey, qc, terminal, urlForJob])
}

