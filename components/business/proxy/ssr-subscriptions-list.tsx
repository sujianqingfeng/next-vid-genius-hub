'use client'

import { useQuery } from '@tanstack/react-query'
import { Link, Trash2, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '~/components/ui/button'
import { queryOrpc } from '~/lib/orpc/query-client'
import { useProxySubscriptionMutation } from '~/lib/proxy/useProxySubscriptionMutation'
import { useConfirmDialog } from '~/components/business/layout/confirm-dialog-provider'

export function SSRSubscriptionsList() {
	const t = useTranslations('Proxy.subscription.list')
	const confirmDialog = useConfirmDialog()
	const { data: subscriptionsData, isLoading } = useQuery(
		queryOrpc.proxy.getSSRSubscriptions.queryOptions(),
	)

	const deleteSubscriptionMutation = useProxySubscriptionMutation(
		queryOrpc.proxy.deleteSSRSubscription.mutationOptions(),
		{
			successToast: t('deleteSuccess'),
			errorToast: ({ error }) => t('deleteError', { message: error.message }),
		},
	)

	const importFromSubscriptionMutation = useProxySubscriptionMutation(
		queryOrpc.proxy.importSSRFromSubscription.mutationOptions(),
		{
			successToast: ({ data }) =>
				data && typeof data === 'object' && 'count' in data
					? t('importSuccess', { count: (data as { count?: number }).count ?? 0 })
					: t('importSuccessFallback'),
			errorToast: ({ error }) => t('importError', { message: error.message }),
		},
	)


	const handleDeleteSubscription = async (subscriptionId: string) => {
		const confirmed = await confirmDialog({
			description: t('deleteConfirm'),
			variant: 'destructive',
		})
		if (!confirmed) return
		deleteSubscriptionMutation.mutate({ id: subscriptionId })
	}

	const handleImportFromSubscription = (subscriptionId: string) => {
		importFromSubscriptionMutation.mutate({ subscriptionId })
	}

	// testing logic removed

	if (isLoading) {
		return (
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-pulse">
				{[1, 2, 3].map((i) => (
					<div key={i} className="h-40 rounded-2xl bg-secondary/30"></div>
				))}
			</div>
		)
	}

	if (!subscriptionsData?.subscriptions?.length) {
		return (
			<div className="rounded-2xl border border-dashed border-border/50 bg-background/30 py-20 text-center backdrop-blur-sm">
				<div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-secondary/50 flex items-center justify-center">
					<Link className="h-8 w-8 text-muted-foreground/50" strokeWidth={1.5} />
				</div>
				<h3 className="mb-2 text-lg font-semibold text-foreground">{t('emptyTitle')}</h3>
				<p className="text-muted-foreground font-light max-w-sm mx-auto">
					{t('emptyDesc')}
				</p>
			</div>
		)
	}

	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{subscriptionsData.subscriptions.map((subscription) => (
				<div key={subscription.id} className="group relative overflow-hidden rounded-2xl border border-white/20 bg-white/40 p-5 shadow-sm backdrop-blur-md transition-all hover:bg-white/60 hover:shadow-md">
					<div className="mb-4 flex items-start justify-between gap-4">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
								<Link className="h-5 w-5" strokeWidth={1.5} />
							</div>
							<div>
								<h3 className="font-semibold leading-none text-foreground">{subscription.name}</h3>
								<p className="mt-1 text-xs text-muted-foreground font-light">
									{t('proxiesCount', { count: subscription.proxies?.length || 0 })}
								</p>
							</div>
						</div>
						
						<Button
							variant="ghost"
							size="icon"
							onClick={() => handleDeleteSubscription(subscription.id)}
							className="h-8 w-8 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
						>
							<Trash2 className="h-4 w-4" strokeWidth={1.5} />
						</Button>
					</div>
					
					<div className="mb-4 space-y-1">
						<p className="truncate text-xs text-muted-foreground font-mono bg-secondary/30 px-2 py-1 rounded-md">
							{subscription.url}
						</p>
						{subscription.lastUpdated && (
							<p className="text-[10px] text-muted-foreground font-light px-1">
								{t('updated', { date: new Date(subscription.lastUpdated).toLocaleDateString() })}
							</p>
						)}
					</div>

					<Button
						variant="secondary"
						size="sm"
						onClick={() => handleImportFromSubscription(subscription.id)}
						disabled={importFromSubscriptionMutation.isPending}
						className="w-full bg-secondary/80 hover:bg-secondary shadow-sm"
					>
						<RefreshCw className={`h-3.5 w-3.5 mr-2 ${importFromSubscriptionMutation.isPending ? 'animate-spin' : ''}`} strokeWidth={1.5} />
						{importFromSubscriptionMutation.isPending ? t('syncing') : t('sync')}
					</Button>
				</div>
			))}
		</div>
	)
}
