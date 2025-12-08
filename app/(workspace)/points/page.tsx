'use client'

import { Coins, RefreshCw } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import { queryOrpc } from '~/lib/orpc/query-client'

export default function PointsPage() {
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
		<div className="p-6 space-y-6">
			<div className="flex items-center justify-between">
				<div className="space-y-1">
					<h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
						<Coins className="w-5 h-5 text-primary" /> 积分中心
					</h1>
					<p className="text-sm text-muted-foreground">
						查看当前余额、历史流水。积分用于扣费（如生成任务）。
					</p>
				</div>
				<Button
					variant="secondary"
					size="sm"
					onClick={() => {
						balanceQuery.refetch()
						txQuery.refetch()
					}}
					disabled={isLoading}
				>
					<RefreshCw className="w-4 h-4 mr-2" /> 刷新
				</Button>
			</div>

			<div className="grid gap-4 md:grid-cols-3">
				<Card className="md:col-span-2">
					<CardHeader className="pb-2">
						<CardTitle className="text-base">当前积分余额</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-4xl font-semibold tracking-tight flex items-baseline gap-2">
							{balance}
							<span className="text-sm text-muted-foreground">分</span>
						</div>
						<p className="text-xs text-muted-foreground mt-2">
							注册奖励已发放。后续可通过充值、活动或任务返还增加积分。
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-base">快速说明</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2 text-sm text-muted-foreground">
						<p>· 生成/任务前先扣费，失败时可按策略返还。</p>
						<p>· 积分只在服务端修改，前端无法直接操作余额。</p>
						<p>· 后续接入支付时可在这里跳转充值。</p>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-base">积分流水</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-5 text-xs font-medium text-muted-foreground pb-2 border-b border-border/60">
						<div>时间</div>
						<div>类型</div>
						<div>变动</div>
						<div>余额</div>
						<div>备注</div>
					</div>
					<div className="divide-y divide-border/60">
						{grouped.length === 0 && (
							<div className="py-6 text-center text-sm text-muted-foreground">
								{isLoading ? '加载中…' : '暂无流水'}
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
	)
}
