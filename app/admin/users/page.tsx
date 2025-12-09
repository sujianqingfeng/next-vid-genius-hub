'use client'

import { Shield, UserCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Badge } from '~/components/ui/badge'
import { Switch } from '~/components/ui/switch'
import { queryOrpc } from '~/lib/orpc/query-client'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'

const PAGE_SIZE = 20

export default function AdminUsersPage() {
	const qc = useQueryClient()
	const [page, setPage] = useState(1)
	const [search, setSearch] = useState('')
	const [appliedSearch, setAppliedSearch] = useState('')

	const listQuery = useQuery({
		...queryOrpc.admin.listUsers.queryOptions({
			input: { page, limit: PAGE_SIZE, q: appliedSearch || undefined },
		}),
		keepPreviousData: true,
	})

	const invalidateList = () => qc.invalidateQueries({ queryKey: queryOrpc.admin.listUsers.key() })

	const updateRole = useEnhancedMutation(
		queryOrpc.admin.updateUserRole.mutationOptions({
			onSuccess: invalidateList,
		}),
		{
			successToast: '角色已更新',
			errorToast: ({ error }) => (error as Error)?.message || '更新角色失败',
		},
	)

	const updateStatus = useEnhancedMutation(
		queryOrpc.admin.updateUserStatus.mutationOptions({
			onSuccess: invalidateList,
		}),
		{
			successToast: ({ variables }) => (variables.status === 'active' ? '已解封' : '已封禁'),
			errorToast: ({ error }) => (error as Error)?.message || '更新状态失败',
		},
	)

	const users = listQuery.data?.items ?? []
	const pageCount = listQuery.data?.pageCount ?? 1

	const isUpdating = updateRole.isPending || updateStatus.isPending

	const handleSearch = (e: React.FormEvent) => {
		e.preventDefault()
		setPage(1)
		setAppliedSearch(search.trim())
	}

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
					<h1 className="text-2xl font-semibold tracking-tight">用户管理</h1>
					<p className="text-sm text-muted-foreground">
						查看、封禁或提升用户角色。当前用户数：{formattedStats.total}
					</p>
				</div>
				<Badge variant="secondary" className="gap-1">
					<Shield className="h-3.5 w-3.5" /> Admin
				</Badge>
			</div>

			<Card className="border-border/60 shadow-sm">
				<CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<CardTitle className="text-lg">用户列表</CardTitle>
					<form onSubmit={handleSearch} className="flex w-full max-w-sm gap-2">
						<Input
							placeholder="搜索邮箱 / 昵称 / ID"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
						<Button type="submit" variant="secondary">
							搜索
						</Button>
					</form>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="overflow-x-auto rounded-lg border border-border/60">
						<table className="min-w-full text-sm">
							<thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
								<tr>
									<th className="px-4 py-3 font-medium">Email</th>
									<th className="px-4 py-3 font-medium">昵称</th>
									<th className="px-4 py-3 font-medium">角色</th>
									<th className="px-4 py-3 font-medium">状态</th>
									<th className="px-4 py-3 font-medium">创建时间</th>
									<th className="px-4 py-3 font-medium">上次登录</th>
									<th className="px-4 py-3 font-medium text-right">操作</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/60">
								{users.map((user) => (
									<tr key={user.id} className="hover:bg-muted/30">
										<td className="px-4 py-3 font-medium">{user.email}</td>
										<td className="px-4 py-3 text-muted-foreground">{user.nickname || '—'}</td>
										<td className="px-4 py-3">
											<Badge variant={user.role === 'admin' ? 'default' : 'outline'}>
												{user.role === 'admin' ? '管理员' : '普通用户'}
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
													{user.status === 'active' ? '正常' : '已封禁'}
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
												{user.role === 'admin' ? '降为普通' : '设为管理员'}
											</Button>
										</td>
									</tr>
								))}
								{!listQuery.isLoading && users.length === 0 && (
									<tr>
										<td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
											未找到用户
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>

					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<p className="text-xs text-muted-foreground">
							第 {page} / {pageCount} 页，{formattedStats.total} 个用户
						</p>
						<div className="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={page === 1 || listQuery.isFetching}
								onClick={() => setPage((p) => Math.max(1, p - 1))}
							>
								上一页
							</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={page >= pageCount || listQuery.isFetching}
								onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
							>
								下一页
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}

function formatDate(value: string | number | Date | null | undefined) {
	if (!value) return '—'
	const date = value instanceof Date ? value : new Date(value)
	return date.toLocaleString()
}
