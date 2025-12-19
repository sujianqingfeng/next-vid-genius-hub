'use client'

import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Globe, Shield } from 'lucide-react'
import { useTranslations } from '~/lib/i18n'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { queryOrpc } from '~/lib/orpc/query-client'

interface ProxySelectorProps {
	value?: string
	onValueChange: (value: string) => void
	disabled?: boolean
	allowDirect?: boolean
}

export function ProxySelector({ value, onValueChange, disabled, allowDirect = true }: ProxySelectorProps) {
	const t = useTranslations('Proxy.selector')
	const { data: proxyData, isLoading, error } = useQuery({
		...queryOrpc.proxy.getActiveProxiesForDownload.queryOptions(),
	})

	const defaultProxyId = proxyData?.defaultProxyId ?? null

	type SimpleProxy = {
		id: string
		name?: string | null
		server?: string | null
		port?: number | null
		protocol?: string | null
	}

	const renderProxyIcon = (proxy: SimpleProxy) => {
		if (proxy.id === 'none') {
			return <Globe className="w-4 h-4 text-muted-foreground" />
		}
		return <Shield className="w-4 h-4 text-muted-foreground" />
	}

	const renderProxyLabel = (proxy: SimpleProxy) => {
		if (proxy.id === 'none') {
			return t('direct')
		}

		const label = proxy.name || `${proxy.protocol}://${proxy.server}:${proxy.port}`
		return label
	}

	const availableProxies = useMemo(() => {
		const list = proxyData?.proxies ?? []
		return allowDirect ? list : list.filter((proxy) => proxy.id !== 'none')
	}, [allowDirect, proxyData?.proxies])

	useEffect(() => {
		// Prefer persisted default; otherwise fall back to first available when proxy is required.
		if (value && value !== 'none') return
		const preferred = defaultProxyId && availableProxies.find((p) => p.id === defaultProxyId)?.id
		const fallback = !allowDirect
			? availableProxies.find((p) => p.id !== 'none')?.id
			: undefined
		const next = preferred ?? fallback
		if (next) onValueChange(next)
	}, [allowDirect, availableProxies, defaultProxyId, onValueChange, value])

	if (error) {
		console.error('Failed to load proxies:', error)
	}

	return (
		<div className="space-y-2">
			<label htmlFor="proxy" className="text-sm font-medium">
				{allowDirect ? t('label.optional') : t('label.required')}
			</label>
			<Select
				value={allowDirect ? value || 'none' : value || undefined}
				onValueChange={onValueChange}
				disabled={disabled || isLoading || (!allowDirect && availableProxies.length === 0)}
			>
				<SelectTrigger>
					<SelectValue placeholder={t('selectPlaceholder')} />
				</SelectTrigger>
				<SelectContent>
					{availableProxies.map((proxy) => {
						const isDefault = defaultProxyId && proxy.id === defaultProxyId
						return (
							<SelectItem key={proxy.id} value={proxy.id}>
								<div className="flex items-center gap-2 py-1">
									{renderProxyIcon(proxy)}
									<div className="flex flex-col min-w-0 flex-1">
										<span className="truncate text-sm font-medium flex items-center gap-2">
											{renderProxyLabel(proxy)}
											{isDefault && (
												<span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
													{t('defaultBadge')}
												</span>
											)}
										</span>
										{/* status text removed */}
									</div>
								</div>
							</SelectItem>
						)
					})}
				</SelectContent>
			</Select>
			{isLoading && (
				<p className="text-xs text-muted-foreground">
					{t('loading')}
				</p>
			)}
			{!allowDirect && !isLoading && availableProxies.length === 0 && (
				<p className="text-xs text-destructive">
					{t('noneAvailable')}
				</p>
			)}
			{error && (
				<p className="text-xs text-destructive">
					{t('loadError')}
				</p>
			)}
		</div>
	)
}
