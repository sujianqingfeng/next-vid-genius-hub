'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import { Button } from '~/components/ui/button'
import { getUserFriendlyErrorMessage } from '~/lib/errors/client'
import { useTranslations } from '~/lib/i18n'
import { queryOrpc } from '~/lib/orpc/client'
import { cn } from '~/lib/utils'
import type { AgentWorkflowSettings, AgentWorkflowStep } from './agent-workflow'
import { resolveStepMode } from './agent-workflow'

export type AgentAction = {
	id: string
	kind: AgentWorkflowStep
	status: 'proposed' | 'canceled' | 'running' | 'completed' | 'failed'
	params?: unknown
	estimate?: unknown
	result?: unknown
	error?: string | null
	createdAt?: string | Date
	confirmedAt?: string | Date | null
	completedAt?: string | Date | null
}

function getEstimate(action: AgentAction): {
	points?: number
	unknown?: boolean
	basis?: string
} {
	const raw = action.estimate
	if (!raw || typeof raw !== 'object') return {}
	const r = raw as any
	return {
		points: typeof r.points === 'number' ? r.points : undefined,
		unknown: Boolean(r.unknown),
		basis: typeof r.basis === 'string' ? r.basis : undefined,
	}
}

function getJobInfo(action: AgentAction): { mediaId?: string; jobId?: string } {
	const r = action.result
	if (!r || typeof r !== 'object') return {}
	const o = r as any
	return {
		mediaId: typeof o.mediaId === 'string' ? o.mediaId : undefined,
		jobId: typeof o.jobId === 'string' ? o.jobId : undefined,
	}
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
	const res = await fetch(url, {
		method: 'POST',
		credentials: 'same-origin',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})
	const json = await res.json().catch(() => ({}))
	if (!res.ok) {
		const msg =
			typeof (json as any)?.error === 'string'
				? (json as any).error
				: `HTTP ${res.status}`
		throw new Error(msg)
	}
	return json as T
}

export function AgentActionCard(props: {
	action: AgentAction
	settings: AgentWorkflowSettings
	onUpdateAction: (action: AgentAction) => void
	onSuggestNext: (mediaId: string) => void
}) {
	const t = useTranslations('Agent')
	const { action, settings } = props

	const estimate = getEstimate(action)
	const mode = resolveStepMode(settings, action.kind)

	const forcedConfirm =
		mode === 'auto' &&
		(settings.auto.requireConfirmOnUnknownCost && estimate.unknown
			? true
			: typeof estimate.points === 'number' &&
				  typeof settings.auto.maxEstimatedPointsPerAction === 'number'
				? estimate.points > settings.auto.maxEstimatedPointsPerAction
				: false)

	const canAuto =
		action.status === 'proposed' && mode === 'auto' && !forcedConfirm

	const [autoLeftMs, setAutoLeftMs] = React.useState<number | null>(null)
	const autoCancelRef = React.useRef(false)

	const { mediaId, jobId } = getJobInfo(action)

	const downloadStatusQuery = useQuery({
		...queryOrpc.download.getCloudDownloadStatus.queryOptions({
			input: { jobId: jobId ?? '' },
		}),
		enabled: action.kind === 'download' && Boolean(jobId),
		refetchInterval: (q) => {
			const status = (q.state.data as any)?.status
			if (!status) return 1000
			return status === 'completed' ||
				status === 'failed' ||
				status === 'canceled'
				? false
				: 1000
		},
	})

	const asrStatusQuery = useQuery({
		...queryOrpc.subtitle.getAsrStatus.queryOptions({
			input: { jobId: jobId ?? '' },
		}),
		enabled: action.kind === 'asr' && Boolean(jobId),
		refetchInterval: (q) => {
			const status = (q.state.data as any)?.status
			if (!status) return 1000
			return status === 'completed' ||
				status === 'failed' ||
				status === 'canceled'
				? false
				: 1000
		},
	})

	const renderStatusQuery = useQuery({
		...queryOrpc.subtitle.getRenderStatus.queryOptions({
			input: { jobId: jobId ?? '' },
		}),
		enabled: action.kind === 'render' && Boolean(jobId),
		refetchInterval: (q) => {
			const status = (q.state.data as any)?.status
			if (!status) return 1000
			return status === 'completed' ||
				status === 'failed' ||
				status === 'canceled'
				? false
				: 1000
		},
	})

	const effectiveJobStatus =
		action.kind === 'download'
			? (downloadStatusQuery.data as any)
			: action.kind === 'asr'
				? (asrStatusQuery.data as any)
				: action.kind === 'render'
					? (renderStatusQuery.data as any)
					: null

	const suggestedRef = React.useRef<Set<string>>(new Set())

	React.useEffect(() => {
		if (!settings.autoSuggestNext) return
		if (!mediaId || !jobId) return
		if (!effectiveJobStatus?.status) return
		if (effectiveJobStatus.status !== 'completed') return
		if (suggestedRef.current.has(jobId)) return
		suggestedRef.current.add(jobId)
		props.onSuggestNext(mediaId)
	}, [
		effectiveJobStatus?.status,
		jobId,
		mediaId,
		props.onSuggestNext,
		settings.autoSuggestNext,
	])

	const confirm = React.useCallback(async () => {
		try {
			props.onUpdateAction({ ...action, status: 'running' })
			const res = await postJson<{ action: AgentAction }>(
				'/api/agent/actions/confirm',
				{ actionId: action.id },
			)
			if (res.action) props.onUpdateAction(res.action)
			const nextMediaId =
				action.kind === 'optimize' || action.kind === 'translate'
					? ((res.action?.result as any)?.mediaId ??
						(action.params as any)?.mediaId)
					: undefined
			if (settings.autoSuggestNext && nextMediaId) {
				props.onSuggestNext(String(nextMediaId))
			}
		} catch (err) {
			const message = getUserFriendlyErrorMessage(err)
			props.onUpdateAction({ ...action, status: 'failed', error: message })
		}
	}, [action, props, settings.autoSuggestNext, action.kind])

	const cancel = React.useCallback(async () => {
		try {
			autoCancelRef.current = true
			setAutoLeftMs(null)
			const res = await postJson<{ action: AgentAction | null }>(
				'/api/agent/actions/cancel',
				{ actionId: action.id },
			)
			if (res.action) props.onUpdateAction(res.action)
			else props.onUpdateAction({ ...action, status: 'canceled' })
		} catch (err) {
			const message = getUserFriendlyErrorMessage(err)
			props.onUpdateAction({ ...action, status: 'failed', error: message })
		}
	}, [action, props])

	React.useEffect(() => {
		if (!canAuto) return
		if (autoLeftMs != null) return

		autoCancelRef.current = false
		const start = Date.now()
		const total = Math.max(0, settings.auto.delayMs)
		setAutoLeftMs(total)

		const interval = setInterval(() => {
			if (autoCancelRef.current) {
				clearInterval(interval)
				return
			}
			const left = Math.max(0, total - (Date.now() - start))
			setAutoLeftMs(left)
			if (left <= 0) {
				clearInterval(interval)
				void confirm()
			}
		}, 100)

		return () => clearInterval(interval)
	}, [autoLeftMs, canAuto, confirm, settings.auto.delayMs])

	const titleKey = `actions.kind.${action.kind}` as const
	const pointsText =
		typeof estimate.points === 'number'
			? t('actions.pointsKnown', { points: estimate.points })
			: estimate.unknown
				? t('actions.pointsUnknown')
				: t('actions.pointsUnknown')

	const statusLabel =
		action.status === 'proposed'
			? t('actions.status.proposed')
			: action.status === 'running'
				? t('actions.status.running')
				: action.status === 'completed'
					? t('actions.status.completed')
					: action.status === 'canceled'
						? t('actions.status.canceled')
						: t('actions.status.failed')

	const jobLine =
		jobId && effectiveJobStatus?.status
			? `${t('actions.job')} ${jobId} · ${String(effectiveJobStatus.status)}`
			: jobId
				? `${t('actions.job')} ${jobId}`
				: null

	return (
		<div className="border border-border bg-card p-3 font-mono text-xs">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">
						{t(titleKey)}
					</div>
					<div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
						<span>{statusLabel}</span>
						<span className="opacity-60">•</span>
						<span>{pointsText}</span>
						{forcedConfirm ? (
							<>
								<span className="opacity-60">•</span>
								<span className="text-yellow-600">
									{t('actions.forceConfirm')}
								</span>
							</>
						) : null}
					</div>
					{jobLine ? (
						<div className="mt-1 text-[10px] text-muted-foreground">
							{jobLine}
						</div>
					) : null}
					{action.error ? (
						<div className="mt-2 text-[10px] text-destructive">
							{t('actions.errorPrefix')}
							{action.error}
						</div>
					) : null}
				</div>

				<div className="flex shrink-0 items-center gap-2">
					{action.status === 'proposed' ? (
						<>
							<Button
								variant="outline"
								size="sm"
								className="h-8 rounded-none text-[10px] uppercase tracking-wider"
								type="button"
								onClick={() => void cancel()}
							>
								{t('actions.cancel')}
							</Button>
							<Button
								size="sm"
								className={cn(
									'h-8 rounded-none text-[10px] uppercase tracking-wider',
								)}
								type="button"
								onClick={() => void confirm()}
							>
								{canAuto && autoLeftMs != null
									? t('actions.autoConfirm', {
											seconds: Math.ceil(autoLeftMs / 1000),
										})
									: t('actions.confirm')}
							</Button>
						</>
					) : action.status === 'running' ? (
						<div className="flex items-center gap-2 text-[10px] text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							{t('actions.running')}
						</div>
					) : null}
				</div>
			</div>
		</div>
	)
}
