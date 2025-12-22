'use client'

import * as React from 'react'

import { useTranslations } from '~/lib/i18n'
import { cn } from '~/lib/utils'

export type ProxyTestStatus =
	| 'pending'
	| 'success'
	| 'failed'
	| null
	| undefined

function proxyStatusBadgeClass(status: ProxyTestStatus): string {
	if (status === 'success') return 'bg-emerald-500/15 text-emerald-500'
	if (status === 'failed') return 'bg-destructive/15 text-destructive'
	return 'bg-secondary text-foreground/80'
}

function isFiniteNumber(n: unknown): n is number {
	return typeof n === 'number' && Number.isFinite(n)
}

export function ProxyStatusPill({
	status,
	responseTime,
	className,
}: {
	status: ProxyTestStatus
	responseTime?: number | null
	className?: string
}) {
	const t = useTranslations('Proxy.list')

	const effectiveStatus: Exclude<ProxyTestStatus, null | undefined> =
		status === 'success' || status === 'failed' || status === 'pending'
			? status
			: 'pending'

	const rttMs = isFiniteNumber(responseTime)
		? Math.max(0, Math.trunc(responseTime))
		: null

	const label = t(`status.${effectiveStatus}`)
	const withRtt =
		effectiveStatus === 'success' && typeof rttMs === 'number'
			? `${label} · ${rttMs}ms`
			: label

	return (
		<span
			className={cn(
				'rounded-md px-2 py-1 text-[10px] font-semibold leading-none',
				proxyStatusBadgeClass(effectiveStatus),
				className,
			)}
		>
			{withRtt}
		</span>
	)
}
