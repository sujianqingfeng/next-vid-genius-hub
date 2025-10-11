'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, Trash2, RefreshCw, MoreHorizontal } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import { 
	DropdownMenu, 
	DropdownMenuContent, 
	DropdownMenuItem, 
	DropdownMenuSeparator, 
	DropdownMenuTrigger 
} from '~/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { queryOrpc } from '~/lib/orpc/query-client'

export function SSRSubscriptionsList() {
	const queryClient = useQueryClient()

	const { data: subscriptionsData, isLoading } = useQuery(
		queryOrpc.proxy.getSSRSubscriptions.queryOptions(),
	)

	const deleteSubscriptionMutation = useMutation({
		...queryOrpc.proxy.deleteSSRSubscription.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: queryOrpc.proxy.getSSRSubscriptions.key(),
			})
			toast.success('SSR subscription deleted successfully')
		},
		onError: (error) => {
			toast.error(`Failed to delete SSR subscription: ${error.message}`)
		},
	})

	const importFromSubscriptionMutation = useMutation({
		...queryOrpc.proxy.importSSRFromSubscription.mutationOptions(),
		onSuccess: (data) => {
			queryClient.invalidateQueries({
				queryKey: queryOrpc.proxy.getSSRSubscriptions.key(),
			})
			toast.success(`Successfully imported ${data.count} proxies from subscription`)
		},
		onError: (error) => {
			toast.error(`Failed to import from subscription: ${error.message}`)
		},
	})


	const handleDeleteSubscription = (subscriptionId: string) => {
		if (confirm('Are you sure you want to delete this SSR subscription? This will also delete all associated proxies.')) {
			deleteSubscriptionMutation.mutate({ id: subscriptionId })
		}
	}

	const handleImportFromSubscription = (subscriptionId: string) => {
		importFromSubscriptionMutation.mutate({ subscriptionId })
	}

	// testing logic removed

	if (isLoading) {
		return (
			<div className="space-y-4">
				{[1, 2, 3].map((i) => (
					<Card key={i} className="animate-pulse">
						<CardHeader>
							<div className="h-6 bg-muted rounded w-1/3"></div>
							<div className="h-4 bg-muted rounded w-2/3 mt-2"></div>
						</CardHeader>
						<CardContent>
							<div className="h-20 bg-muted rounded"></div>
						</CardContent>
					</Card>
				))}
			</div>
		)
	}

	if (!subscriptionsData?.subscriptions?.length) {
		return (
			<Card>
				<CardHeader className="text-center">
					<Link className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
					<CardTitle>No SSR subscriptions yet</CardTitle>
					<CardDescription>
						Add your first SSR subscription to start managing proxy servers
					</CardDescription>
				</CardHeader>
			</Card>
		)
	}

	return (
		<div className="space-y-4">
			{subscriptionsData.subscriptions.map((subscription) => (
				<Card key={subscription.id}>
					<CardHeader>
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-3">
								<div className="flex items-center gap-2">
									<Link className="h-5 w-5" />
									<CardTitle>{subscription.name}</CardTitle>
								</div>
							</div>
							
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="icon">
										<MoreHorizontal className="h-4 w-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem onClick={() => handleImportFromSubscription(subscription.id)}>
										<RefreshCw className="h-4 w-4 mr-2" />
										Import Proxies
									</DropdownMenuItem>

									<DropdownMenuSeparator />
									<DropdownMenuItem 
										onClick={() => handleDeleteSubscription(subscription.id)}
										className="text-destructive"
									>
										<Trash2 className="h-4 w-4 mr-2" />
										Delete Subscription
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
						<CardDescription>
							{subscription.url}
							{subscription.lastUpdated && (
								<span className="ml-2 text-xs">
									Last updated: {new Date(subscription.lastUpdated).toLocaleDateString()}
								</span>
							)}
						</CardDescription>
					</CardHeader>
					
					<CardContent>
						<div className="space-y-3">
							{/* Stats */}
							<div className="flex items-center gap-4 text-sm text-muted-foreground">
								<span>{subscription.proxies?.length || 0} proxies</span>
							</div>

							{/* Recent Proxies */}
							{subscription.proxies && subscription.proxies.length > 0 && (
								<div className="space-y-2">
									<h4 className="text-sm font-medium">Recent Proxies</h4>
									<div className="space-y-1">
										{subscription.proxies.slice(0, 3).map((proxy) => (
											<div 
												key={proxy.id} 
												className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
											>
												<div className="flex items-center gap-2">
													<span className="font-medium">{proxy.name || `${proxy.server}:${proxy.port}`}</span>
												</div>
												<div className="flex items-center gap-2">
													<Badge variant="outline" className="text-xs">
														{proxy.protocol}
													</Badge>
												</div>
											</div>
										))}
									</div>
								</div>
							)}

							{/* Action Buttons */}
							<div className="flex gap-2 pt-2">
								<Button
									variant="outline"
									size="sm"
									onClick={() => handleImportFromSubscription(subscription.id)}
									disabled={importFromSubscriptionMutation.isPending}
								>
									<RefreshCw className="h-4 w-4 mr-2" />
									{importFromSubscriptionMutation.isPending ? 'Importing...' : 'Import Proxies'}
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	)
}
