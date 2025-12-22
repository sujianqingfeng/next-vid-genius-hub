import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'

import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { useTranslations } from '../integrations/i18n'
import { queryOrpc } from '../integrations/orpc/client'

const TX_LIMIT = 50

export const Route = createFileRoute('/points')({
	loader: async ({ context, location }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpc.auth.me.queryOptions(),
		)
		if (!me.user) {
			const next = location.href
			throw redirect({ to: '/login', search: { next } })
		}

		await Promise.all([
			context.queryClient.prefetchQuery(
				queryOrpc.points.getMyBalance.queryOptions(),
			),
			context.queryClient.prefetchQuery(
				queryOrpc.points.listMyTransactions.queryOptions({
					input: { limit: TX_LIMIT, offset: 0 },
				}),
			),
		])
	},
	component: PointsRoute,
})

function PointsRoute() {
	const t = useTranslations('Points')

	const balanceQuery = useQuery(queryOrpc.points.getMyBalance.queryOptions())
	const txQuery = useQuery(
		queryOrpc.points.listMyTransactions.queryOptions({
			input: { limit: TX_LIMIT, offset: 0 },
		}),
	)

	const balance = balanceQuery.data?.balance ?? 0
	const transactions = txQuery.data?.items ?? []

	const isLoading = balanceQuery.isLoading || txQuery.isLoading

	const grouped = transactions.map((tx) => ({
		...tx,
		sign: tx.delta >= 0 ? '+' : '-',
		abs: Math.abs(tx.delta),
	}))

	return (
		<div className="min-h-screen bg-background selection:bg-primary/10 selection:text-primary">
			<div className="px-4 py-10 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-5xl space-y-6">
					<div className="flex items-center justify-between gap-4">
						<h1 className="text-3xl font-semibold tracking-tight">
							{t('title')}
						</h1>
						<Button
							variant="secondary"
							size="sm"
							onClick={() => {
								balanceQuery.refetch()
								txQuery.refetch()
							}}
							disabled={isLoading}
						>
							<RefreshCw className="mr-2 h-4 w-4" /> {t('refresh')}
						</Button>
					</div>

					<div className="grid gap-4 md:grid-cols-3">
						<Card className="md:col-span-2">
							<CardHeader className="pb-2">
								<CardTitle className="text-base">
									{t('balance.title')}
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="flex items-baseline gap-2 text-4xl font-semibold tracking-tight">
									{balance}
									<span className="text-sm text-muted-foreground">
										{t('balance.unit')}
									</span>
								</div>
								<p className="mt-2 text-xs text-muted-foreground">
									{t('balance.hint')}
								</p>
							</CardContent>
						</Card>
						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="text-base">{t('notes.title')}</CardTitle>
							</CardHeader>
							<CardContent className="space-y-2 text-sm text-muted-foreground">
								{['one', 'two', 'three', 'four'].map((key) => (
									<p key={key}>· {t(`notes.items.${key}`)}</p>
								))}
							</CardContent>
						</Card>
					</div>

					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-base">{t('table.title')}</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-5 border-b border-border/60 pb-2 text-xs font-medium text-muted-foreground">
								<div>{t('table.headers.time')}</div>
								<div>{t('table.headers.type')}</div>
								<div>{t('table.headers.delta')}</div>
								<div>{t('table.headers.balance')}</div>
								<div>{t('table.headers.remark')}</div>
							</div>
							<div className="divide-y divide-border/60">
								{grouped.length === 0 ? (
									<div className="py-6 text-center text-sm text-muted-foreground">
										{isLoading ? t('table.loading') : t('table.empty')}
									</div>
								) : null}
								{grouped.map((item) => (
									<div
										key={item.id}
										className="grid grid-cols-5 items-center py-3 text-sm"
									>
										<div className="text-xs text-muted-foreground">
											{new Date(item.createdAt).toLocaleString()}
										</div>
										<div>
											<Badge variant="secondary" className="capitalize">
												{String(item.type).replace('_', ' ')}
											</Badge>
										</div>
										<div
											className={
												item.delta >= 0 ? 'text-emerald-600' : 'text-red-500'
											}
										>
											{item.sign}
											{item.abs}
										</div>
										<div>{item.balanceAfter}</div>
										<div className="text-xs text-muted-foreground">
											{item.remark || item.refType || '-'}
										</div>
									</div>
								))}
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	)
}
