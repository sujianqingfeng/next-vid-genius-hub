'use client'

import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'

import { Button } from '~/components/ui/button'
import { getBcp47Locale, useLocale, useTranslations } from '~/lib/shared/i18n'
import { queryOrpc } from '~/orpc'

export function PointsPage({ txLimit = 50 }: { txLimit?: number }) {
	const t = useTranslations('Points')
	const locale = useLocale()
	const dateLocale = getBcp47Locale(locale)

	const balanceQuery = useQuery(queryOrpc.points.getMyBalance.queryOptions())
	const txQuery = useQuery(
		queryOrpc.points.listMyTransactions.queryOptions({
			input: { limit: txLimit, offset: 0 },
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

	const getTxRemark = (tx: (typeof grouped)[number]) => {
		if (tx.remark) {
			if (tx.remark === '任务扣费') return t('txRemarks.task_cost')
			if (tx.remark === '管理员加分') return t('txRemarks.manual_adjust')
			return tx.remark
		}

		const byType = t(`txRemarks.${tx.type}`)
		if (byType && byType !== `Points.txRemarks.${tx.type}`) return byType
		return tx.refType || '-'
	}

	return (
		<div className="min-h-screen bg-background font-sans text-foreground selection:bg-primary selection:text-primary-foreground">
			{/* Header Section */}
			<div className="border-b border-border bg-card">
				<div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="space-y-1">
							<div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
								<span className="flex items-center gap-1">
									<span className="h-1.5 w-1.5 rounded-full bg-primary" />
									{t('ui.breadcrumb.system')}
								</span>
								<span>/</span>
								<span>{t('ui.breadcrumb.section')}</span>
							</div>
							<h1 className="font-mono text-xl font-bold uppercase tracking-tight">
								{t('title')}
							</h1>
						</div>

						<Button
							variant="outline"
							size="sm"
							className="rounded-none font-mono text-xs uppercase tracking-wider"
							onClick={() => {
								balanceQuery.refetch()
								txQuery.refetch()
							}}
							disabled={isLoading}
						>
							<RefreshCw
								className={`mr-2 h-3 w-3 ${isLoading ? 'animate-spin' : ''}`}
							/>
							[ {t('refresh')} ]
						</Button>
					</div>
				</div>
			</div>

			<div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
				<div className="space-y-8">
					{/* Balance Summary Grid */}
					<div className="grid gap-6 md:grid-cols-3">
						<div className="md:col-span-2 border border-border bg-card">
							<div className="border-b border-border bg-muted/30 px-4 py-2">
								<h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
									{t('balance.title')}
								</h3>
							</div>
							<div className="p-6">
								<div className="flex items-baseline gap-3">
									<span className="font-mono text-5xl font-bold tracking-tighter text-primary">
										{balance.toLocaleString(dateLocale)}
									</span>
									<span className="font-mono text-sm font-medium uppercase tracking-widest text-muted-foreground">
										{t('balance.unit')}
									</span>
								</div>
								<div className="mt-4 border-t border-border pt-4">
									<p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
										{t('balance.hint')}
									</p>
								</div>
							</div>
						</div>

						<div className="border border-border bg-card">
							<div className="border-b border-border bg-muted/30 px-4 py-2">
								<h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
									{t('notes.title')}
								</h3>
							</div>
							<div className="p-4 space-y-3">
								{['one', 'two', 'three', 'four'].map((key) => (
									<div key={key} className="flex gap-3">
										<span className="font-mono text-[10px] text-primary mt-0.5">
											»
										</span>
										<p className="font-mono text-[10px] uppercase leading-relaxed text-muted-foreground">
											{t(`notes.items.${key}`)}
										</p>
									</div>
								))}
							</div>
						</div>
					</div>

					{/* Transaction History Table */}
					<div className="border border-border bg-card">
						<div className="border-b border-border bg-muted/30 px-4 py-3">
							<div className="flex items-center justify-between">
								<h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
									{t('table.title')}
								</h3>
								<div className="font-mono text-[8px] uppercase tracking-[0.2em] text-muted-foreground opacity-50">
									{t('table.meta', { count: transactions.length, offset: 0 })}
								</div>
							</div>
						</div>

						<div className="overflow-x-auto">
							<table className="w-full border-collapse">
								<thead>
									<tr className="border-b border-border bg-muted/10">
										{[
											t('table.headers.time'),
											t('table.headers.type'),
											t('table.headers.delta'),
											t('table.headers.balance'),
											t('table.headers.remark'),
										].map((header, i) => (
											<th
												key={i}
												className="px-4 py-2 text-left font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
											>
												{header}
											</th>
										))}
									</tr>
								</thead>
								<tbody className="divide-y divide-border font-mono">
									{grouped.length === 0 ? (
										<tr>
											<td colSpan={5} className="px-4 py-12 text-center">
												<div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
													{isLoading ? t('table.loading') : t('table.empty')}
												</div>
											</td>
										</tr>
									) : (
										grouped.map((item) => (
											<tr
												key={item.id}
												className="group hover:bg-muted/20 transition-colors"
											>
												<td className="px-4 py-3 text-[10px] text-muted-foreground">
													{new Date(item.createdAt).toLocaleString(dateLocale)}
												</td>
												<td className="px-4 py-3">
													<span className="bg-primary/5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border border-primary/10">
														{t(`txTypes.${item.type}`)}
													</span>
												</td>
												<td
													className={`px-4 py-3 text-xs font-bold tracking-tight ${item.delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}
												>
													{item.sign}
													{item.abs.toLocaleString(dateLocale)}
												</td>
												<td className="px-4 py-3 text-xs">
													{item.balanceAfter.toLocaleString(dateLocale)}
												</td>
												<td className="px-4 py-3 text-[10px] uppercase text-muted-foreground max-w-[300px] truncate">
													{getTxRemark(item)}
												</td>
											</tr>
										))
									)}
								</tbody>
							</table>
						</div>

						<div className="border-t border-border bg-muted/5 px-4 py-2">
							<div className="font-mono text-[8px] uppercase tracking-[0.3em] text-muted-foreground text-right">
								{t('table.footer', { status: t('table.status.ready') })}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
