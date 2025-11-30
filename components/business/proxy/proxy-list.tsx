'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
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


    const handleDeleteProxy = (proxyId: string) => {
        if (confirm('Are you sure you want to delete this proxy?')) {
            deleteProxyMutation.mutate({ id: proxyId })
        }
    }

	const filteredProxies = proxiesData?.proxies?.filter(proxy => 
		proxy.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
		proxy.server.toLowerCase().includes(searchTerm.toLowerCase()) ||
		proxy.protocol.toLowerCase().includes(searchTerm.toLowerCase())
	) || []

	if (isLoading) {
		return (
			<div className="space-y-4 animate-pulse">
				{[1, 2, 3, 4, 5].map((i) => (
					<div key={i} className="h-16 rounded-xl bg-secondary/30"></div>
				))}
			</div>
		)
	}

	if (!filteredProxies.length) {
		return (
			<div className="rounded-2xl border border-dashed border-border/50 bg-background/30 py-20 text-center backdrop-blur-sm">
				<div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-secondary/50 flex items-center justify-center">
					<Settings className="h-8 w-8 text-muted-foreground/50" strokeWidth={1.5} />
				</div>
				<h3 className="mb-2 text-lg font-semibold text-foreground">No proxies found</h3>
				<p className="text-muted-foreground font-light max-w-sm mx-auto">
					Try adjusting your search or add a new subscription.
				</p>
			</div>
		)
	}

	return (
		<div className="space-y-6">
			{/* Search Bar */}
			<div className="flex items-center gap-4">
				<Input
					placeholder="Search proxies..."
					value={searchTerm}
					onChange={(e) => setSearchTerm(e.target.value)}
					className="max-w-sm h-10 bg-background/50 backdrop-blur-sm border-border/50 focus:border-primary/50 transition-all"
				/>
			</div>

			{/* Proxy List */}
			<div className="space-y-2">
				{filteredProxies.map((proxy) => (
					<div key={proxy.id} className="group flex items-center justify-between p-4 rounded-xl border border-white/20 bg-white/40 shadow-sm backdrop-blur-md transition-all hover:bg-white/60 hover:shadow-md">
						<div className="flex items-center gap-4">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-mono text-xs font-bold">
								{proxy.protocol.toUpperCase().slice(0, 3)}
							</div>
							<div>
								<div className="flex items-center gap-2">
									<span className="font-medium text-foreground">
										{proxy.name || `${proxy.server}:${proxy.port}`}
									</span>
								</div>
								<div className="text-xs text-muted-foreground font-light font-mono mt-0.5">
									{proxy.server}:{proxy.port}
								</div>
							</div>
						</div>

						<Button
							variant="ghost"
							size="icon"
							onClick={() => handleDeleteProxy(proxy.id)}
							className="h-8 w-8 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
						>
							<Trash2 className="h-4 w-4" strokeWidth={1.5} />
						</Button>
					</div>
				))}
			</div>

			{/* Pagination */}
			{proxiesData && proxiesData.totalPages > 1 && (
				<div className="flex items-center justify-between pt-4">
					<p className="text-sm text-muted-foreground font-light">
						Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, proxiesData.total)} of {proxiesData.total} proxies
					</p>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setPage(page - 1)}
							disabled={page === 1}
							className="h-8 px-3 bg-transparent border-border/50 hover:bg-secondary/50"
						>
							<ChevronLeft className="h-4 w-4 mr-1" strokeWidth={1.5} />
							Previous
						</Button>
						<span className="text-sm font-medium px-2">
							Page {page} of {proxiesData.totalPages}
						</span>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setPage(page + 1)}
							disabled={page === proxiesData.totalPages}
							className="h-8 px-3 bg-transparent border-border/50 hover:bg-secondary/50"
						>
							Next
							<ChevronRight className="h-4 w-4 ml-1" strokeWidth={1.5} />
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}
