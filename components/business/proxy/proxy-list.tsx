'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Switch } from '~/components/ui/switch'
import { Input } from '~/components/ui/input'
// dropdown menu imports removed (no longer used)
import { toast } from 'sonner'
import { queryOrpc } from '~/lib/orpc/query-client'

export function ProxyList() {
	const [page, setPage] = React.useState(1)
	const [searchTerm, setSearchTerm] = React.useState('')
	const queryClient = useQueryClient()

	const { data: proxiesData, isLoading } = useQuery(
		queryOrpc.proxy.getProxies.queryOptions({ input: { page } }),
	)

	const updateProxyMutation = useMutation({
		...queryOrpc.proxy.updateProxy.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: queryOrpc.proxy.getProxies.key(),
			})
			toast.success('Proxy updated successfully')
		},
		onError: (error) => {
			toast.error(`Failed to update proxy: ${error.message}`)
		},
	})

	const deleteProxyMutation = useMutation({
		...queryOrpc.proxy.deleteProxy.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: queryOrpc.proxy.getProxies.key(),
			})
			toast.success('Proxy deleted successfully')
		},
		onError: (error) => {
			toast.error(`Failed to delete proxy: ${error.message}`)
		},
	})


	const handleToggleActive = (proxyId: string, isActive: boolean) => {
		updateProxyMutation.mutate({ id: proxyId, isActive })
	}

	const handleDeleteProxy = (proxyId: string) => {
		if (confirm('Are you sure you want to delete this proxy?')) {
			deleteProxyMutation.mutate(proxyId)
		}
	}

	const filteredProxies = proxiesData?.proxies?.filter(proxy => 
		proxy.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
		proxy.server.toLowerCase().includes(searchTerm.toLowerCase()) ||
		proxy.protocol.toLowerCase().includes(searchTerm.toLowerCase())
	) || []

	if (isLoading) {
		return (
			<div className="space-y-4">
				{[1, 2, 3, 4, 5].map((i) => (
					<Card key={i} className="animate-pulse">
						<CardContent className="p-4">
							<div className="h-20 bg-muted rounded"></div>
						</CardContent>
					</Card>
				))}
			</div>
		)
	}

	if (!filteredProxies.length) {
		return (
			<Card>
				<CardHeader className="text-center">
					<Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
					<CardTitle>No proxies found</CardTitle>
				</CardHeader>
			</Card>
		)
	}

	return (
		<div className="space-y-4">
			{/* Search Bar */}
			<div className="flex items-center gap-4">
				<Input
					placeholder="Search proxies..."
					value={searchTerm}
					onChange={(e) => setSearchTerm(e.target.value)}
					className="max-w-sm"
				/>
			</div>

			{/* Proxy List */}
			<div className="space-y-1">
				{filteredProxies.map((proxy) => (
					<div key={proxy.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
						<div className="flex items-center gap-3">
							<Switch
								checked={proxy.isActive}
								onCheckedChange={(checked) => handleToggleActive(proxy.id, checked)}
								disabled={updateProxyMutation.isPending}
							/>
							<div>
								<div className="flex items-center gap-2">
									<span className="font-medium">
										{proxy.name || `${proxy.server}:${proxy.port}`}
									</span>
									<span className="text-xs text-muted-foreground">
										{proxy.protocol.toUpperCase()}
									</span>
								</div>
								<div className="text-sm text-muted-foreground">
									{proxy.server}:{proxy.port}
								</div>
							</div>
						</div>

						<div className="flex items-center gap-2">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => handleDeleteProxy(proxy.id)}
							>
								<Trash2 className="h-4 w-4" />
							</Button>
						</div>
					</div>
				))}
			</div>

			{/* Pagination */}
			{proxiesData && proxiesData.totalPages > 1 && (
				<div className="flex items-center justify-between">
					<p className="text-sm text-muted-foreground">
						Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, proxiesData.total)} of {proxiesData.total} proxies
					</p>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setPage(page - 1)}
							disabled={page === 1}
						>
							<ChevronLeft className="h-4 w-4" />
							Previous
						</Button>
						<span className="text-sm">
							Page {page} of {proxiesData.totalPages}
						</span>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setPage(page + 1)}
							disabled={page === proxiesData.totalPages}
						>
							Next
							<ChevronRight className="h-4 w-4" />
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}
