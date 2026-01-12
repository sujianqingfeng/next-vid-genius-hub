'use client'

import * as React from 'react'

type MultiJobStatusEvent<TDoc> = {
	jobId: string
	doc: TDoc
}

type DoneEvent = {
	jobIds: string[]
}

function normalizeJobId(value: string): string {
	return value.trim()
}

function defaultUrl(jobIds: string[]): string {
	const params = new URLSearchParams()
	for (const jobId of jobIds) {
		params.append('jobId', jobId)
	}
	const qs = params.toString()
	return qs ? `/api/jobs/events?${qs}` : '/api/jobs/events'
}

export function useMultiJobStatusSse<TDoc = unknown>(opts: {
	jobIds: readonly (string | null | undefined)[]
	enabled?: boolean
	url?: (jobIds: string[]) => string
	onStatus: (event: MultiJobStatusEvent<TDoc>) => void
	onDone?: (event: DoneEvent) => void
	onStreamError?: (error: Event) => void
}) {
	const enabled = opts.enabled ?? true
	const onStatusEvent = opts.onStatus
	const onDoneEvent = opts.onDone
	const onStreamErrorEvent = opts.onStreamError

	const jobIds = React.useMemo(() => {
		const ids = opts.jobIds
			.map((x) => (typeof x === 'string' ? normalizeJobId(x) : ''))
			.filter(Boolean)
		return [...new Set(ids)]
	}, [opts.jobIds])

	const jobIdsKey = React.useMemo(() => jobIds.join('|'), [jobIds])
	const urlForJobs = React.useMemo(() => opts.url ?? defaultUrl, [opts.url])

	React.useEffect(() => {
		if (!enabled) return
		if (!jobIdsKey) return

		const es = new EventSource(urlForJobs(jobIds))
		let closed = false

		const close = () => {
			if (closed) return
			closed = true
			es.close()
		}

		const onStatus = (event: MessageEvent) => {
			try {
				const parsed = JSON.parse(String(event.data || 'null')) as any
				const jobId =
					parsed && typeof parsed.jobId === 'string' ? parsed.jobId : null
				if (!jobId) return
				onStatusEvent({ jobId, doc: parsed.doc as TDoc })
			} catch {
				// ignore
			}
		}

		const onDone = (event: MessageEvent) => {
			try {
				const parsed = JSON.parse(String(event.data || 'null')) as any
				const ids = Array.isArray(parsed?.jobIds)
					? parsed.jobIds.map((x: any) => String(x))
					: jobIds
				onDoneEvent?.({ jobIds: ids })
			} catch {
				onDoneEvent?.({ jobIds })
			}
			close()
		}

		const onError = (e: Event) => {
			onStreamErrorEvent?.(e)
		}

		es.addEventListener('status', onStatus as unknown as EventListener)
		es.addEventListener('done', onDone as unknown as EventListener)
		es.addEventListener('error', onError as unknown as EventListener)

		return () => {
			close()
		}
	}, [
		enabled,
		jobIds,
		jobIdsKey,
		onDoneEvent,
		onStatusEvent,
		onStreamErrorEvent,
		urlForJobs,
	])
}
