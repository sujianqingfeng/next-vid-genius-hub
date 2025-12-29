import {
	keepPreviousData,
	useQuery,
	useQueryClient,
} from '@tanstack/react-query'
import { Shield } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { ADMIN_USERS_PAGE_SIZE } from '~/lib/pagination'

import { useTranslations } from '~/lib/i18n'
import { queryOrpc } from '~/lib/orpc/client'
import { cn } from '~/lib/utils'

export function AdminUsersPage() {
	const t = useTranslations('Admin.users')
	const qc = useQueryClient()
	const [page, setPage] = useState(1)
	const [search, setSearch] = useState('')
	const [appliedSearch, setAppliedSearch] = useState('')
	const [selectedUserForLog, setSelectedUserForLog] = useState<null | {
		id: string
		email: string
	}>(null)
	const [selectedUserForAdd, setSelectedUserForAdd] = useState<null | {
		id: string
		email: string
	}>(null)
	const [selectedUserForDelete, setSelectedUserForDelete] = useState<null | {
		id: string
		email: string
	}>(null)
	const [addAmount, setAddAmount] = useState<number>(0)
	const [addRemark, setAddRemark] = useState('')

	const listQuery = useQuery({
		...queryOrpc.admin.listUsers.queryOptions({
			input: {
				page,
				limit: ADMIN_USERS_PAGE_SIZE,
				q: appliedSearch || undefined,
			},
		}),
		placeholderData: keepPreviousData,
	})

	const invalidateList = () =>
		qc.invalidateQueries({ queryKey: queryOrpc.admin.listUsers.key() })
	const invalidateTransactions = (userId: string) =>
		qc.invalidateQueries({
			queryKey: queryOrpc.admin.listUserTransactions.queryKey({
				input: { userId },
			}),
		})

	const updateRole = useEnhancedMutation(
		queryOrpc.admin.updateUserRole.mutationOptions({
			onSuccess: invalidateList,
		}),
		{
			successToast: t('toast.roleUpdated'),
			errorToast: ({ error }) =>
				(error as Error)?.message || t('toast.roleUpdateError'),
		},
	)

	const updateStatus = useEnhancedMutation(
		queryOrpc.admin.updateUserStatus.mutationOptions({
			onSuccess: invalidateList,
		}),
		{
			successToast: ({ variables }) =>
				variables.status === 'active'
					? t('toast.statusUpdatedActive')
					: t('toast.statusUpdatedBanned'),
			errorToast: ({ error }) =>
				(error as Error)?.message || t('toast.statusUpdateError'),
		},
	)

	const addPointsMutation = useEnhancedMutation(
		queryOrpc.admin.addUserPoints.mutationOptions({
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
			errorToast: ({ error }) =>
				(error as Error)?.message || t('toast.pointsAddError'),
		},
	)

	const deleteUserMutation = useEnhancedMutation(
		queryOrpc.admin.deleteUser.mutationOptions({
			onSuccess: () => {
				invalidateList()
				setSelectedUserForDelete(null)
			},
		}),
		{
			successToast: t('toast.userDeleted'),
			errorToast: ({ error }) => {
				const message = (error as Error)?.message
				if (message === 'CANNOT_DELETE_SELF') return t('toast.deleteSelfError')
				if (message === 'CANNOT_DELETE_LAST_ADMIN')
					return t('toast.deleteLastAdminError')
				return message || t('toast.userDeleteError')
			},
		},
	)

	const users = listQuery.data?.items ?? []
	const pageCount = listQuery.data?.pageCount ?? 1
	const isUpdating =
		updateRole.isPending ||
		updateStatus.isPending ||
		addPointsMutation.isPending ||
		deleteUserMutation.isPending

	const handleSearch = (e: React.FormEvent) => {
		e.preventDefault()
		setPage(1)
		setAppliedSearch(search.trim())
	}

	const transactionsQuery = useQuery({
		...queryOrpc.admin.listUserTransactions.queryOptions({
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
		<div className="space-y-8 font-sans">
			<div className="flex items-end justify-between border-b border-primary pb-4">
				<div>
					<div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
						System / Administration / Users
					</div>
					<h1 className="text-3xl font-black uppercase tracking-tight">
						{t('title')}
					</h1>
				</div>
				<div className="text-right">
					<div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
						Active Records
					</div>
					<div className="font-mono text-xl font-bold">
						{formattedStats.total.toString().padStart(6, '0')}
					</div>
				</div>
			</div>

			<div className="border border-border bg-card">
				<div className="flex flex-col gap-4 p-4 border-b border-border sm:flex-row sm:items-center sm:justify-between bg-muted/30">
					<div className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
						<Shield className="h-3 w-3" />
						{t('table.actions')}
					</div>
					<form onSubmit={handleSearch} className="flex w-full max-w-sm gap-0">
						<Input
							placeholder={t('searchPlaceholder')}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="rounded-none border-border font-mono text-xs focus-visible:ring-0 focus-visible:border-primary"
						/>
						<Button type="submit" variant="primary" className="rounded-none uppercase text-xs font-bold tracking-widest px-6">
							{t('searchButton')}
						</Button>
					</form>
				</div>
				<div className="p-0">
					<div className="overflow-x-auto">
						<table className="min-w-full border-collapse">
							<thead>
								<tr className="border-b border-border bg-muted/50">
									<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-r border-border">{t('table.email')}</th>
									<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-r border-border">
										{t('table.nickname')}
									</th>
									<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-r border-border">{t('table.role')}</th>
									<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-r border-border">{t('table.status')}</th>
									<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-r border-border">
										{t('table.createdAt')}
									</th>
									<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-r border-border">
										{t('table.lastLogin')}
									</th>
									<th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
										{t('table.actions')}
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{users.map((user) => (
									<tr key={user.id} className="hover:bg-muted/30 transition-none">
										<td className="px-4 py-3 font-mono text-xs border-r border-border">{user.email}</td>
										<td className="px-4 py-3 font-mono text-xs text-muted-foreground border-r border-border">
											{user.nickname || '---'}
										</td>
										<td className="px-4 py-3 border-r border-border">
											<div className={cn(
												"inline-block px-2 py-0.5 text-[10px] font-bold uppercase border",
												user.role === 'admin' ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
											)}>
												{user.role === 'admin' ? t('roles.admin') : t('roles.user')}
											</div>
										</td>
										<td className="px-4 py-3 border-r border-border">
											<div className="flex items-center gap-3">
												<Switch
													checked={user.status === 'active'}
													onCheckedChange={(checked) =>
														updateStatus.mutate({
															userId: user.id,
															status: checked ? 'active' : 'banned',
														})
													}
													disabled={isUpdating}
													className="scale-75 data-[state=checked]:bg-primary"
												/>
												<span className="font-mono text-[10px] uppercase tracking-tighter">
													{user.status === 'active'
														? t('status.active')
														: t('status.banned')}
												</span>
											</div>
										</td>
										<td className="px-4 py-3 font-mono text-[10px] text-muted-foreground border-r border-border">
											{formatDate(user.createdAt)}
										</td>
										<td className="px-4 py-3 font-mono text-[10px] text-muted-foreground border-r border-border">
											{user.lastLoginAt ? formatDate(user.lastLoginAt) : '---'}
										</td>
										<td className="px-4 py-3 text-right">
											<div className="flex justify-end gap-1">
												<Button
													size="xs"
													variant="outline"
													className="rounded-none border-border hover:bg-primary hover:text-primary-foreground uppercase text-[9px] font-bold px-2 h-7"
													onClick={() =>
														setSelectedUserForAdd({
															id: user.id,
															email: user.email,
														})
													}
													disabled={isUpdating}
												>
													+ PTS
												</Button>
												<Button
													size="xs"
													variant="outline"
													className="rounded-none border-border hover:bg-primary hover:text-primary-foreground uppercase text-[9px] font-bold px-2 h-7"
													onClick={() =>
														setSelectedUserForLog({
															id: user.id,
															email: user.email,
														})
													}
												>
													LOGS
												</Button>
												<Button
													size="xs"
													variant="outline"
													className="rounded-none border-border hover:bg-primary hover:text-primary-foreground uppercase text-[9px] font-bold px-2 h-7"
													onClick={() =>
														updateRole.mutate({
															userId: user.id,
															role: user.role === 'admin' ? 'user' : 'admin',
														})
													}
													disabled={isUpdating}
												>
													ROLE
												</Button>
												<Button
													size="xs"
													variant="destructive"
													className="rounded-none uppercase text-[9px] font-bold px-2 h-7"
													onClick={() =>
														setSelectedUserForDelete({
															id: user.id,
															email: user.email,
														})
													}
													disabled={isUpdating}
												>
													DEL
												</Button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					<div className="flex flex-col gap-0 border-t border-border sm:flex-row sm:items-center sm:justify-between bg-muted/30">
						<p className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
							PAGE: {page.toString().padStart(3, '0')} / {pageCount.toString().padStart(3, '0')} | TOTAL: {formattedStats.total}
						</p>
						<div className="flex border-l border-border">
							<Button
								variant="ghost"
								disabled={page === 1 || listQuery.isFetching}
								onClick={() => setPage((p) => Math.max(1, p - 1))}
								className="rounded-none border-r border-border px-6 py-3 h-auto uppercase text-[10px] font-bold tracking-[0.2em] hover:bg-primary hover:text-primary-foreground disabled:opacity-30"
							>
								PREV
							</Button>
							<Button
								variant="ghost"
								disabled={page >= pageCount || listQuery.isFetching}
								onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
								className="rounded-none px-6 py-3 h-auto uppercase text-[10px] font-bold tracking-[0.2em] hover:bg-primary hover:text-primary-foreground disabled:opacity-30"
							>
								NEXT
							</Button>
						</div>
					</div>
				</div>
			</div>

			<Dialog
				open={Boolean(selectedUserForAdd)}
				onOpenChange={(open) => !open && setSelectedUserForAdd(null)}
			>
				<DialogContent className="rounded-none border-2 border-primary p-0 overflow-hidden max-w-md">
					<DialogHeader className="bg-primary p-4 text-primary-foreground">
						<DialogTitle className="text-xs font-bold uppercase tracking-[0.2em]">
							ADD_POINTS // {selectedUserForAdd?.email}
						</DialogTitle>
					</DialogHeader>
					<div className="p-6 space-y-6">
						<div className="space-y-2">
							<label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
								AMOUNT_INT
							</label>
							<Input
								type="number"
								min={1}
								value={addAmount}
								onChange={(e) => setAddAmount(Number(e.target.value))}
								className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
								placeholder="000"
							/>
						</div>
						<div className="space-y-2">
							<label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
								REMARK_STR
							</label>
							<Textarea
								value={addRemark}
								onChange={(e) => setAddRemark(e.target.value)}
								className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary min-h-[100px]"
								placeholder="..."
							/>
						</div>
					</div>
					<div className="flex border-t border-border">
						<Button
							variant="ghost"
							onClick={() => setSelectedUserForAdd(null)}
							disabled={addPointsMutation.isPending}
							className="flex-1 rounded-none border-r border-border h-12 uppercase text-xs font-bold tracking-widest hover:bg-muted"
						>
							CANCEL
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
							disabled={
								!addAmount || addAmount <= 0 || addPointsMutation.isPending
							}
							className="flex-1 rounded-none h-12 bg-primary text-primary-foreground uppercase text-xs font-bold tracking-widest hover:bg-primary/90"
						>
							{addPointsMutation.isPending ? 'PROCESSING...' : 'CONFIRM_COMMIT'}
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			<Dialog
				open={Boolean(selectedUserForLog)}
				onOpenChange={(open) => !open && setSelectedUserForLog(null)}
			>
				<DialogContent className="max-w-3xl rounded-none border-2 border-primary p-0 overflow-hidden">
					<DialogHeader className="bg-primary p-4 text-primary-foreground">
						<DialogTitle className="text-xs font-bold uppercase tracking-[0.2em]">
							TRANSACTION_LOG // {selectedUserForLog?.email}
						</DialogTitle>
					</DialogHeader>
					<div className="max-h-[60vh] overflow-y-auto">
						<table className="min-w-full border-collapse">
							<thead>
								<tr className="border-b border-border bg-muted/50 sticky top-0">
									<th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-r border-border">TIMESTAMP</th>
									<th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-r border-border">DELTA</th>
									<th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-r border-border">BALANCE</th>
									<th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-r border-border">TYPE</th>
									<th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">REMARK</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{transactionsQuery.data?.items?.map((row) => (
									<tr key={row.id} className="hover:bg-muted/20 transition-none font-mono text-[10px]">
										<td className="px-4 py-2 text-muted-foreground border-r border-border">
											{formatDate(row.createdAt)}
										</td>
										<td className={cn(
											"px-4 py-2 font-bold border-r border-border text-xs",
											row.delta > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
										)}>
											{row.delta > 0 ? `+${row.delta}` : row.delta}
										</td>
										<td className="px-4 py-2 text-muted-foreground border-r border-border">
											{row.balanceAfter}
										</td>
										<td className="px-4 py-2 text-muted-foreground border-r border-border uppercase">
											{row.type}
										</td>
										<td className="px-4 py-2 text-muted-foreground">
											{row.remark || '---'}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<div className="p-4 border-t border-border bg-muted/30">
						<Button
							variant="outline"
							onClick={() => setSelectedUserForLog(null)}
							className="w-full rounded-none border-border uppercase text-xs font-bold tracking-widest hover:bg-primary hover:text-primary-foreground"
						>
							CLOSE_VIEW
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			<Dialog
				open={Boolean(selectedUserForDelete)}
				onOpenChange={(open) => !open && setSelectedUserForDelete(null)}
			>
				<DialogContent className="rounded-none border-2 border-destructive p-0 overflow-hidden max-w-md">
					<DialogHeader className="bg-destructive p-4 text-destructive-foreground">
						<DialogTitle className="text-xs font-bold uppercase tracking-[0.2em]">
							DANGER_ZONE // DELETE_USER
						</DialogTitle>
					</DialogHeader>
					<div className="p-6 space-y-4">
						<p className="text-xs font-mono leading-relaxed">
							WARNING: YOU ARE ABOUT TO PERMANENTLY REMOVE THE FOLLOWING ACCOUNT FROM THE SYSTEM. THIS ACTION IS IRREVERSIBLE.
							<br /><br />
							IDENTIFIER: <span className="font-bold underline">{selectedUserForDelete?.email}</span>
						</p>
					</div>
					<div className="flex border-t border-border">
						<Button
							variant="ghost"
							onClick={() => setSelectedUserForDelete(null)}
							disabled={deleteUserMutation.isPending}
							className="flex-1 rounded-none border-r border-border h-12 uppercase text-xs font-bold tracking-widest hover:bg-muted"
						>
							ABORT
						</Button>
						<Button
							variant="destructive"
							onClick={() => {
								if (!selectedUserForDelete) return
								deleteUserMutation.mutate({ userId: selectedUserForDelete.id })
							}}
							disabled={!selectedUserForDelete || deleteUserMutation.isPending}
							className="flex-1 rounded-none h-12 uppercase text-xs font-bold tracking-widest"
						>
							{deleteUserMutation.isPending
								? 'DELETING...'
								: 'CONFIRM_DELETE'}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}

function formatDate(value: string | number | Date | null | undefined) {
	if (!value) return '---'
	const date = value instanceof Date ? value : new Date(value)
	// Return ISO-like format for "Engineering" look
	return date.toISOString().replace('T', ' ').split('.')[0]
}
