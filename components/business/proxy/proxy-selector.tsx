'use client'

import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Globe, Shield } from 'lucide-react'
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
	const { data: proxyData, isLoading, error } = useQuery({
		...queryOrpc.proxy.getActiveProxiesForDownload.queryOptions(),
	})

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
			return 'No Proxy (Direct Connection)'
		}

		const label = proxy.name || `${proxy.protocol}://${proxy.server}:${proxy.port}`
		return label
	}

	const availableProxies = useMemo(() => {
		const list = proxyData?.proxies ?? []
		return allowDirect ? list : list.filter((proxy) => proxy.id !== 'none')
	}, [allowDirect, proxyData?.proxies])

	const firstProxyId = availableProxies[0]?.id

	useEffect(() => {
		if (!allowDirect && firstProxyId && (!value || value === 'none')) {
			onValueChange(firstProxyId)
		}
	}, [allowDirect, firstProxyId, onValueChange, value])

	if (error) {
		console.error('Failed to load proxies:', error)
	}

	return (
		<div className="space-y-2">
			<label htmlFor="proxy" className="text-sm font-medium">
				{allowDirect ? 'Proxy (Optional)' : 'Proxy (Required)'}
			</label>
			<Select
				value={allowDirect ? value || 'none' : value || undefined}
				onValueChange={onValueChange}
				disabled={disabled || isLoading || (!allowDirect && availableProxies.length === 0)}
			>
				<SelectTrigger>
					<SelectValue placeholder="Select proxy" />
				</SelectTrigger>
				<SelectContent>
					{availableProxies.map((proxy) => (
						<SelectItem key={proxy.id} value={proxy.id}>
							<div className="flex items-center gap-2 py-1">
								{renderProxyIcon(proxy)}
								<div className="flex flex-col min-w-0 flex-1">
									<span className="truncate text-sm font-medium">
										{renderProxyLabel(proxy)}
									</span>
									{/* status text removed */}
								</div>
							</div>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{isLoading && (
				<p className="text-xs text-muted-foreground">
					Loading proxies...
				</p>
			)}
			{!allowDirect && !isLoading && availableProxies.length === 0 && (
				<p className="text-xs text-destructive">
					No proxies available. Please add one first.
				</p>
			)}
			{error && (
				<p className="text-xs text-destructive">
					Failed to load proxies. Please try again.
				</p>
			)}
		</div>
	)
}
