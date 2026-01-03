'use client'

import { CircularProgress } from '~/components/ui/circular-progress'
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '~/components/ui/tooltip'
import { PHASE_LABELS, STATUS_LABELS } from '~/lib/config/media-status'
import { useTranslations } from '~/lib/i18n'
import { cn } from '~/lib/utils'

type CloudJobProgressLabels = {
	status?: string
	phase?: string
	jobId?: string
	mediaId?: string
	progress?: string
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
	 * Whether to show the status text next to the ring in compact mode.
	 */
	showCompactLabel?: boolean
	/**
	 * Whether to show the percent text next to the ring in compact mode.
	 */
	showCompactPercent?: boolean
	/**
	 * Optional override labels (for i18n).
	 */
	labels?: CloudJobProgressLabels
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
	idleLabel,
	showPhase = true,
	showIds = true,
	showCompactLabel = true,
	showCompactPercent = true,
	labels,
	className,
}: CloudJobProgressProps) {
	const t = useTranslations('Common.cloudJobProgress')

	const resolvedStatusLabel = (() => {
		if (!status) return idleLabel ?? t('idle')
		const translated = t(`status.${status}`)
		if (translated !== `Common.cloudJobProgress.status.${status}`)
			return translated
		return (STATUS_LABELS[status as keyof typeof STATUS_LABELS] ??
			status) as string
	})()

	const resolvedPhaseLabel = (() => {
		if (!phase) return phase
		const translated = t(`phase.${phase}`)
		if (translated !== `Common.cloudJobProgress.phase.${phase}`)
			return translated
		return (PHASE_LABELS as Record<string, string>)[phase] ?? phase
	})()

	let pct: number | undefined
	if (typeof progress === 'number') {
		pct = progress <= 1 ? progress * 100 : progress
	}

	const isActive =
		jobActive ?? (Boolean(status) && !TERMINAL_STATUSES.has(status as string))

	const pctText = typeof pct === 'number' ? `${Math.round(pct)}%` : '0%'

	const statusTone =
		status === 'failed'
			? 'failed'
			: status === 'canceled'
				? 'canceled'
				: status === 'completed'
					? 'completed'
					: isActive
						? 'active'
						: 'idle'

	const ringClass =
		statusTone === 'failed'
			? 'stroke-rose-500'
			: statusTone === 'canceled'
				? 'stroke-slate-500'
				: statusTone === 'completed'
					? 'stroke-emerald-500'
					: 'stroke-primary'

	const pillClass =
		statusTone === 'failed'
			? 'bg-rose-500/10 text-rose-600'
			: statusTone === 'canceled'
				? 'bg-slate-500/10 text-slate-700'
				: statusTone === 'completed'
					? 'bg-emerald-500/10 text-emerald-700'
					: isActive
						? 'bg-primary/10 text-primary'
						: 'bg-secondary text-muted-foreground'

	const tooltipDetails = (
		<div className="space-y-2 min-w-[200px]">
			<div className="flex items-center justify-between gap-3">
				<span className="font-medium">
					{labels?.status ?? t('labels.status')}
				</span>
				<span
					className={cn(
						'rounded-full px-2 py-0.5 text-[11px] font-semibold',
						pillClass,
					)}
				>
					{resolvedStatusLabel}
				</span>
			</div>
			<div className="flex items-center justify-between gap-3 text-[11px] opacity-90">
				<span>{labels?.progress ?? t('labels.progress')}</span>
				<span className="font-medium">{pctText}</span>
			</div>
			{showPhase && resolvedPhaseLabel && (
				<div className="flex items-center justify-between gap-3 text-[11px] opacity-90">
					<span>{labels?.phase ?? t('labels.phase')}</span>
					<span className="font-medium">{resolvedPhaseLabel}</span>
				</div>
			)}
			{showIds && (jobId || mediaId) && (
				<div className="space-y-1 border-t border-background/20 pt-2 text-[11px] opacity-90">
					{jobId && (
						<div className="flex items-center justify-between gap-3">
							<span>{labels?.jobId ?? t('labels.jobId')}</span>
							<span className="font-mono">{jobId}</span>
						</div>
					)}
					{mediaId && (
						<div className="flex items-center justify-between gap-3">
							<span>{labels?.mediaId ?? t('labels.mediaId')}</span>
							<span className="font-mono">{mediaId}</span>
						</div>
					)}
				</div>
			)}
		</div>
	)

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div
					className={cn(
						'inline-flex items-center gap-2 rounded-full border border-border/40 bg-secondary/20 px-2 py-1 text-xs',
						className,
					)}
				>
					<CircularProgress
						value={pct ?? 0}
						size={18}
						strokeWidth={2.5}
						indicatorClassName={ringClass}
					/>
					{showCompactLabel && (
						<span className="font-medium text-foreground/90">
							{resolvedStatusLabel}
						</span>
					)}
					{showCompactPercent && (
						<span className="tabular-nums text-muted-foreground">
							{pctText}
						</span>
					)}
				</div>
			</TooltipTrigger>
			<TooltipContent
				side="top"
				sideOffset={8}
				className="glass border-none shadow-lg"
			>
				{tooltipDetails}
			</TooltipContent>
		</Tooltip>
	)
}
