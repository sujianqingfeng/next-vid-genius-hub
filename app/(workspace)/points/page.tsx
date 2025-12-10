'use client'

import { Coins, RefreshCw } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { PageHeader } from '~/components/business/layout/page-header'
import { WorkspacePageShell } from '~/components/business/layout/workspace-page-shell'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import { queryOrpc } from '~/lib/orpc/query-client'

export default function PointsPage() {
	const t = useTranslations('Points')
	const balanceQuery = useQuery(queryOrpc.points.getMyBalance.queryOptions())
	const txQuery = useQuery(
		queryOrpc.points.listMyTransactions.queryOptions({ input: { limit: 50, offset: 0 } }),
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
		<WorkspacePageShell
			header={
				<PageHeader
					backHref="/"
					showBackButton={false}
					title={t('title')}
					subtitle={t('subtitle')}
					rightContent={
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
					}
				/>
			}
		>
			<div className="space-y-6">
			<div className="grid gap-4 md:grid-cols-3">
				<Card className="md:col-span-2">
					<CardHeader className="pb-2">
						<CardTitle className="text-base">{t('balance.title')}</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-4xl font-semibold tracking-tight flex items-baseline gap-2">
							{balance}
							<span className="text-sm text-muted-foreground">{t('balance.unit')}</span>
						</div>
						<p className="text-xs text-muted-foreground mt-2">
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
					<div className="grid grid-cols-5 text-xs font-medium text-muted-foreground pb-2 border-b border-border/60">
						<div>{t('table.headers.time')}</div>
						<div>{t('table.headers.type')}</div>
						<div>{t('table.headers.delta')}</div>
						<div>{t('table.headers.balance')}</div>
						<div>{t('table.headers.remark')}</div>
					</div>
					<div className="divide-y divide-border/60">
						{grouped.length === 0 && (
							<div className="py-6 text-center text-sm text-muted-foreground">
								{isLoading ? t('table.loading') : t('table.empty')}
							</div>
						)}
						{grouped.map((item) => (
							<div key={item.id} className="grid grid-cols-5 py-3 text-sm items-center">
								<div className="text-muted-foreground text-xs">
									{new Date(item.createdAt).toLocaleString()}
								</div>
								<div>
									<Badge variant="secondary" className="capitalize">
										{item.type.replace('_', ' ')}
									</Badge>
								</div>
								<div className={item.delta >= 0 ? 'text-emerald-600' : 'text-red-500'}>
									{item.sign}
									{item.abs}
								</div>
								<div>{item.balanceAfter}</div>
								<div className="text-muted-foreground text-xs">
									{item.remark || item.refType || '-'}
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>
		</div>
		</WorkspacePageShell>
	)
}
