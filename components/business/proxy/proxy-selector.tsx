'use client'

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
}

export function ProxySelector({ value, onValueChange, disabled }: ProxySelectorProps) {
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

	if (error) {
		console.error('Failed to load proxies:', error)
	}

	return (
		<div className="space-y-2">
			<label htmlFor="proxy" className="text-sm font-medium">
				Proxy (Optional)
			</label>
			<Select
				value={value || 'none'}
				onValueChange={onValueChange}
				disabled={disabled || isLoading}
			>
				<SelectTrigger>
					<SelectValue placeholder="Select proxy" />
				</SelectTrigger>
				<SelectContent>
					{proxyData?.proxies.map((proxy) => (
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
			{error && (
				<p className="text-xs text-destructive">
					Failed to load proxies. Using no proxy.
				</p>
			)}
		</div>
	)
}
