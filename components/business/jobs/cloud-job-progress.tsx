'use client'

import type { ReactNode } from 'react'
import { Progress } from '~/components/ui/progress'
import { STATUS_LABELS, PHASE_LABELS } from '~/lib/config/media-status'
import { cn } from '~/lib/utils'

type CloudJobProgressLabels = {
	status?: string
	phase?: string
	jobId?: string
	mediaId?: string
}

export interface CloudJobProgressProps {
	status?: string
	phase?: string
	/**
	 * Job progress as a fraction (0..1) or percentage (0..100).
	 * Values <= 1 are treated as 0..1 and converted to percent.
	 */
	progress?: number | null
	jobId?: string | null
	mediaId?: string | null
	/**
	 * Explicit control over whether the job is considered "active"
	 * for pill styling. Defaults to true when status is non-terminal.
	 */
	jobActive?: boolean
	/**
	 * Label shown when no status is available.
	 */
	idleLabel?: string
	/**
	 * Whether to render the phase row.
	 */
	showPhase?: boolean
	/**
	 * Whether to render jobId / mediaId rows.
	 */
	showIds?: boolean
	/**
	 * Optional override labels (for i18n).
	 */
	labels?: CloudJobProgressLabels
	/**
	 * Extra rows rendered under the IDs block (e.g. proxy info).
	 */
	extraRows?: ReactNode
	className?: string
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'canceled'])

export function CloudJobProgress({
	status,
	phase,
	progress,
	jobId,
	mediaId,
	jobActive,
	idleLabel = 'Idle',
	showPhase = true,
	showIds = true,
	labels,
	extraRows,
	className,
}: CloudJobProgressProps) {
	const resolvedStatusLabel = status
		? STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status
		: idleLabel

	const resolvedPhaseLabel =
		phase && (PHASE_LABELS as Record<string, string>)[phase]
			? (PHASE_LABELS as Record<string, string>)[phase]
			: phase

	let pct: number | undefined
	if (typeof progress === 'number') {
		pct = progress <= 1 ? progress * 100 : progress
	}

	const isActive =
		jobActive ??
		(Boolean(status) && !TERMINAL_STATUSES.has(status as string))

	const pillClass = isActive
		? 'bg-primary/10 text-primary'
		: 'bg-secondary text-muted-foreground'

	return (
		<div className={cn('space-y-3', className)}>
			<div className="flex items-center justify-between text-sm">
				<span className="font-medium text-muted-foreground">
					{labels?.status ?? 'Status'}
				</span>
				<span
					className={cn(
						'rounded-full px-2 py-0.5 text-xs font-semibold',
						pillClass,
					)}
				>
					{resolvedStatusLabel}
				</span>
			</div>
			<Progress value={pct ?? 0} className="h-2" />

			{showPhase && resolvedPhaseLabel && (
				<div className="flex items-center justify-between text-xs text-muted-foreground">
					<span>{labels?.phase ?? 'Phase'}</span>
					<span className="font-medium text-foreground">
						{resolvedPhaseLabel}
					</span>
				</div>
			)}

			{showIds && (jobId || mediaId) && (
				<div className="space-y-2 border-t border-border/40 pt-3">
					{jobId && (
						<div className="flex items-center justify-between gap-2 text-xs">
							<span className="text-muted-foreground">
								{labels?.jobId ?? 'Job ID'}
							</span>
							<span className="rounded bg-secondary/30 px-1.5 py-0.5 font-mono text-foreground">
								{jobId.length > 11
									? `${jobId.slice(0, 8)}...`
									: jobId}
							</span>
						</div>
					)}
					{mediaId && (
						<div className="flex items-center justify-between gap-2 text-xs">
							<span className="text-muted-foreground">
								{labels?.mediaId ?? 'Media ID'}
							</span>
							<span className="rounded bg-secondary/30 px-1.5 py-0.5 font-mono text-foreground">
								{mediaId.length > 11
									? `${mediaId.slice(0, 8)}...`
									: mediaId}
							</span>
						</div>
					)}
				</div>
			)}

			{extraRows}
		</div>
	)
}

