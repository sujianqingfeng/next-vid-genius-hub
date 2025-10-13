'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, Trash2, RefreshCw } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'
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
			<div className="space-y-2">
				{[1, 2, 3].map((i) => (
					<div key={i} className="animate-pulse">
						<div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
						<div className="h-3 bg-muted rounded w-2/3"></div>
					</div>
				))}
			</div>
		)
	}

	if (!subscriptionsData?.subscriptions?.length) {
		return (
			<div className="text-center py-8 text-muted-foreground">
				<Link className="h-8 w-8 mx-auto mb-3 opacity-50" />
				<div className="font-medium">No subscriptions yet</div>
				<div className="text-sm mt-1">Add your first subscription to start</div>
			</div>
		)
	}

	return (
		<div className="space-y-3">
			{subscriptionsData.subscriptions.map((subscription) => (
				<div key={subscription.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
					<div className="flex items-center justify-between mb-2">
						<div className="flex items-center gap-2">
							<Link className="h-4 w-4 text-muted-foreground" />
							<span className="font-medium">{subscription.name}</span>
							<span className="text-xs text-muted-foreground">
								({subscription.proxies?.length || 0} proxies)
							</span>
						</div>
						
						<Button
							variant="ghost"
							size="sm"
							onClick={() => handleDeleteSubscription(subscription.id)}
							className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
						>
							<Trash2 className="h-4 w-4" />
						</Button>
					</div>
					
					<div className="text-xs text-muted-foreground mb-3">
						{subscription.url}
						{subscription.lastUpdated && (
							<span className="ml-2">
								Updated {new Date(subscription.lastUpdated).toLocaleDateString()}
							</span>
						)}
					</div>

					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => handleImportFromSubscription(subscription.id)}
							disabled={importFromSubscriptionMutation.isPending}
						>
							<RefreshCw className="h-3 w-3 mr-1" />
							{importFromSubscriptionMutation.isPending ? 'Importing...' : 'Import'}
						</Button>
					</div>
				</div>
			))}
		</div>
	)
}
