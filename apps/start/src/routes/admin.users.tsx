import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { History, Plus, Shield, UserCheck } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { ADMIN_USERS_PAGE_SIZE } from '~/lib/pagination'

import { useTranslations } from '../integrations/i18n'
import { queryOrpcNext } from '../integrations/orpc/next-client'

export const Route = createFileRoute('/admin/users')({
	loader: async ({ context }) => {
		await context.queryClient.prefetchQuery(
			queryOrpcNext.admin.listUsers.queryOptions({
				input: { page: 1, limit: ADMIN_USERS_PAGE_SIZE, q: undefined },
			}),
		)
	},
	component: AdminUsersPage,
})

function AdminUsersPage() {
	const t = useTranslations('Admin.users')
	const qc = useQueryClient()
	const [page, setPage] = useState(1)
	const [search, setSearch] = useState('')
	const [appliedSearch, setAppliedSearch] = useState('')
	const [selectedUserForLog, setSelectedUserForLog] = useState<null | { id: string; email: string }>(null)
	const [selectedUserForAdd, setSelectedUserForAdd] = useState<null | { id: string; email: string }>(null)
	const [addAmount, setAddAmount] = useState<number>(0)
	const [addRemark, setAddRemark] = useState('')

	const listQuery = useQuery({
		...queryOrpcNext.admin.listUsers.queryOptions({
			input: { page, limit: ADMIN_USERS_PAGE_SIZE, q: appliedSearch || undefined },
		}),
		placeholderData: keepPreviousData,
	})

	const invalidateList = () => qc.invalidateQueries({ queryKey: queryOrpcNext.admin.listUsers.key() })
	const invalidateTransactions = (userId: string) =>
		qc.invalidateQueries({ queryKey: queryOrpcNext.admin.listUserTransactions.queryKey({ input: { userId } }) })

	const updateRole = useEnhancedMutation(
		queryOrpcNext.admin.updateUserRole.mutationOptions({
			onSuccess: invalidateList,
		}),
		{
			successToast: t('toast.roleUpdated'),
			errorToast: ({ error }) => (error as Error)?.message || t('toast.roleUpdateError'),
		},
	)

	const updateStatus = useEnhancedMutation(
		queryOrpcNext.admin.updateUserStatus.mutationOptions({
			onSuccess: invalidateList,
		}),
		{
			successToast: ({ variables }) =>
				variables.status === 'active' ? t('toast.statusUpdatedActive') : t('toast.statusUpdatedBanned'),
			errorToast: ({ error }) => (error as Error)?.message || t('toast.statusUpdateError'),
		},
	)

	const addPointsMutation = useEnhancedMutation(
		queryOrpcNext.admin.addUserPoints.mutationOptions({
			onSuccess: (_, variables) => {
				invalidateList()
				invalidateTransactions(variables.userId)
				setSelectedUserForAdd(null)
				setAddAmount(0)
				setAddRemark('')
			},
		}),
		{
			successToast: t('toast.pointsAdded'),
			errorToast: ({ error }) => (error as Error)?.message || t('toast.pointsAddError'),
		},
	)

	const users = listQuery.data?.items ?? []
	const pageCount = listQuery.data?.pageCount ?? 1
	const isUpdating = updateRole.isPending || updateStatus.isPending || addPointsMutation.isPending

	const handleSearch = (e: React.FormEvent) => {
		e.preventDefault()
		setPage(1)
		setAppliedSearch(search.trim())
	}

	const transactionsQuery = useQuery({
		...queryOrpcNext.admin.listUserTransactions.queryOptions({
			input: { userId: selectedUserForLog?.id || '', limit: 20, offset: 0 },
		}),
		enabled: Boolean(selectedUserForLog?.id),
	})

	const formattedStats = useMemo(
		() => ({
			total: listQuery.data?.total ?? 0,
		}),
		[listQuery.data?.total],
	)

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
					<p className="text-sm text-muted-foreground">
						{t('subtitle', { total: formattedStats.total })}
					</p>
				</div>
				<Badge variant="secondary" className="gap-1">
					<Shield className="h-3.5 w-3.5" /> {t('badge')}
				</Badge>
			</div>

			<Card className="border-border/60 shadow-sm">
				<CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<CardTitle className="text-lg">{t('table.actions')}</CardTitle>
					<form onSubmit={handleSearch} className="flex w-full max-w-sm gap-2">
						<Input
							placeholder={t('searchPlaceholder')}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
						<Button type="submit" variant="secondary">
							{t('searchButton')}
						</Button>
					</form>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="overflow-x-auto rounded-lg border border-border/60">
						<table className="min-w-full text-sm">
							<thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
								<tr>
									<th className="px-4 py-3 font-medium">{t('table.email')}</th>
									<th className="px-4 py-3 font-medium">{t('table.nickname')}</th>
									<th className="px-4 py-3 font-medium">{t('table.role')}</th>
									<th className="px-4 py-3 font-medium">{t('table.status')}</th>
									<th className="px-4 py-3 font-medium">{t('table.createdAt')}</th>
									<th className="px-4 py-3 font-medium">{t('table.lastLogin')}</th>
									<th className="px-4 py-3 font-medium text-right">{t('table.actions')}</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/60">
								{users.map((user) => (
									<tr key={user.id} className="hover:bg-muted/30">
										<td className="px-4 py-3 font-medium">{user.email}</td>
										<td className="px-4 py-3 text-muted-foreground">{user.nickname || t('labels.none')}</td>
										<td className="px-4 py-3">
											<Badge variant={user.role === 'admin' ? 'default' : 'outline'}>
												{user.role === 'admin' ? t('roles.admin') : t('roles.user')}
											</Badge>
										</td>
										<td className="px-4 py-3">
											<div className="flex items-center gap-2">
												<Switch
													checked={user.status === 'active'}
													onCheckedChange={(checked) =>
														updateStatus.mutate({
															userId: user.id,
															status: checked ? 'active' : 'banned',
														})
													}
													disabled={isUpdating}
													aria-label={`切换${user.email}状态`}
												/>
												<span className="text-xs text-muted-foreground">
													{user.status === 'active' ? t('status.active') : t('status.banned')}
												</span>
											</div>
										</td>
										<td className="px-4 py-3 text-muted-foreground">
											{formatDate(user.createdAt)}
										</td>
										<td className="px-4 py-3 text-muted-foreground">
											{user.lastLoginAt ? formatDate(user.lastLoginAt) : '—'}
										</td>
										<td className="px-4 py-3 text-right">
											<div className="flex justify-end gap-2">
												<Button
													size="sm"
													variant="secondary"
													className="gap-2"
													onClick={() =>
														setSelectedUserForAdd({ id: user.id, email: user.email })
													}
													disabled={isUpdating}
												>
													<Plus className="h-4 w-4" />
													{t('actions.addPoints')}
												</Button>
												<Button
													size="sm"
													variant="outline"
													className="gap-2"
													onClick={() =>
														setSelectedUserForLog({ id: user.id, email: user.email })
													}
												>
													<History className="h-4 w-4" />
													{t('actions.transactions')}
												</Button>
												<Button
													size="sm"
													variant="outline"
													className="gap-2"
													onClick={() =>
														updateRole.mutate({
															userId: user.id,
															role: user.role === 'admin' ? 'user' : 'admin',
														})
													}
													disabled={isUpdating}
												>
													<UserCheck className="h-4 w-4" />
													{user.role === 'admin'
														? t('actions.toggleRoleToUser')
														: t('actions.toggleRoleToAdmin')}
												</Button>
											</div>
										</td>
									</tr>
								))}
								{!listQuery.isLoading && users.length === 0 ? (
									<tr>
										<td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
											{t('empty')}
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>

					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<p className="text-xs text-muted-foreground">
							{t('pagination', { page, pages: pageCount, total: formattedStats.total })}
						</p>
						<div className="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={page === 1 || listQuery.isFetching}
								onClick={() => setPage((p) => Math.max(1, p - 1))}
							>
								{t('prev')}
							</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={page >= pageCount || listQuery.isFetching}
								onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
							>
								{t('next')}
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>

			<Dialog
				open={Boolean(selectedUserForAdd)}
				onOpenChange={(open) => !open && setSelectedUserForAdd(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('dialogs.addTitle', { email: selectedUserForAdd?.email || '' })}</DialogTitle>
					</DialogHeader>
					<div className="space-y-3 py-2">
						<div className="space-y-2">
							<label className="text-sm font-medium text-foreground">积分数量</label>
							<Input
								type="number"
								min={1}
								value={addAmount}
								onChange={(e) => setAddAmount(Number(e.target.value))}
								placeholder="例如 100"
							/>
						</div>
						<div className="space-y-2">
							<label className="text-sm font-medium text-foreground">备注（可选）</label>
							<Textarea
								value={addRemark}
								onChange={(e) => setAddRemark(e.target.value)}
								placeholder="比如：活动奖励、手动补偿"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setSelectedUserForAdd(null)}
							disabled={addPointsMutation.isPending}
						>
							取消
						</Button>
						<Button
							onClick={() => {
								if (!selectedUserForAdd) return
								if (!addAmount || addAmount <= 0) return
								addPointsMutation.mutate({
									userId: selectedUserForAdd.id,
									amount: Math.floor(addAmount),
									remark: addRemark || undefined,
								})
							}}
							disabled={!addAmount || addAmount <= 0 || addPointsMutation.isPending}
						>
							{addPointsMutation.isPending ? '处理中…' : '确认加分'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={Boolean(selectedUserForLog)}
				onOpenChange={(open) => !open && setSelectedUserForLog(null)}
			>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>{selectedUserForLog?.email} 的积分流水</DialogTitle>
					</DialogHeader>
					<div className="max-h-[60vh] overflow-y-auto">
						<table className="min-w-full text-sm">
							<thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
								<tr>
									<th className="px-3 py-2 font-medium">时间</th>
									<th className="px-3 py-2 font-medium">变化</th>
									<th className="px-3 py-2 font-medium">余额</th>
									<th className="px-3 py-2 font-medium">类型</th>
									<th className="px-3 py-2 font-medium">备注</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/60">
								{transactionsQuery.data?.items?.map((row) => (
									<tr key={row.id} className="hover:bg-muted/20">
										<td className="px-3 py-2 text-muted-foreground">{formatDate(row.createdAt)}</td>
										<td className="px-3 py-2 font-medium">
											{row.delta > 0 ? `+${row.delta}` : row.delta}
										</td>
										<td className="px-3 py-2 text-muted-foreground">{row.balanceAfter}</td>
										<td className="px-3 py-2 text-muted-foreground">{row.type}</td>
										<td className="px-3 py-2 text-muted-foreground">
											{row.remark || '—'}
										</td>
									</tr>
								))}
								{transactionsQuery.isFetching ? (
									<tr>
										<td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
											加载中…
										</td>
									</tr>
								) : null}
								{!transactionsQuery.isFetching && (transactionsQuery.data?.items?.length ?? 0) === 0 ? (
									<tr>
										<td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
											暂无流水
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setSelectedUserForLog(null)}>
							关闭
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}

function formatDate(value: string | number | Date | null | undefined) {
	if (!value) return '—'
	const date = value instanceof Date ? value : new Date(value)
	return date.toLocaleString()
}

