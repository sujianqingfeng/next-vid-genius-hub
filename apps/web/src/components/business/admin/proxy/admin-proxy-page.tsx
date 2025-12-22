'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, Plus, RefreshCcw, Shield, Trash2 } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { useConfirmDialog } from '~/components/business/layout/confirm-dialog-provider'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { DEFAULT_PAGE_LIMIT } from '~/lib/pagination'
import { classifyHost, formatHostPort, hostKindLabel } from '~/lib/proxy/host'
import { useTranslations } from '~/lib/i18n'
import { queryOrpc } from '~/lib/orpc/client'

export type AdminProxyTab = 'subscriptions' | 'proxies'

const SubscriptionFormSchema = z.object({
	name: z.string().min(1),
	url: z.string().url(),
})

function toDateLabel(input: unknown): string {
	if (input instanceof Date) return input.toLocaleString()
	if (typeof input === 'string' || typeof input === 'number') {
		const d = new Date(input)
		if (!Number.isNaN(d.getTime())) return d.toLocaleString()
	}
	return ''
}

function proxyStatusBadgeClass(status: string | null | undefined): string {
	if (status === 'success') {
		return 'bg-emerald-500/15 text-emerald-500'
	}
	if (status === 'failed') {
		return 'bg-destructive/15 text-destructive'
	}
	return 'bg-secondary text-foreground/80'
}

export function AdminProxyPage({
	tab,
	subscriptionId,
	page,
	setSearch,
}: {
	tab: AdminProxyTab
	subscriptionId?: string
	page: number
	setSearch: (next: {
		tab: AdminProxyTab
		subscriptionId?: string
		page: number
	}) => void
}) {
	const t = useTranslations('Proxy')
	const qc = useQueryClient()
	const confirmDialog = useConfirmDialog()

	const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
	const [newName, setNewName] = React.useState('')
	const [newUrl, setNewUrl] = React.useState('')

	const subsQuery = useQuery(queryOrpc.proxy.getSSRSubscriptions.queryOptions())
	const defaultQuery = useQuery(queryOrpc.proxy.getDefaultProxy.queryOptions())
	const proxiesQuery = useQuery(
		queryOrpc.proxy.getProxies.queryOptions({
			input: { subscriptionId, page, limit: DEFAULT_PAGE_LIMIT },
		}),
	)

	const subscriptions = subsQuery.data?.subscriptions ?? []
	const proxies = proxiesQuery.data?.proxies ?? []
	const total = proxiesQuery.data?.total ?? 0
	const totalPages = proxiesQuery.data?.totalPages ?? 1
	const defaultProxyId = defaultQuery.data?.defaultProxyId ?? null

	const createSubscriptionMutation = useEnhancedMutation(
		queryOrpc.proxy.createSSRSubscription.mutationOptions({
			onSuccess: async () => {
				setCreateDialogOpen(false)
				setNewName('')
				setNewUrl('')
				await qc.invalidateQueries({
					queryKey: queryOrpc.proxy.getSSRSubscriptions.key(),
				})
			},
		}),
		{
			successToast: t('subscription.dialog.success'),
			errorToast: ({ error }) =>
				t('subscription.dialog.error', {
					message: error instanceof Error ? error.message : 'Unknown',
				}),
		},
	)

	const deleteSubscriptionMutation = useEnhancedMutation(
		queryOrpc.proxy.deleteSSRSubscription.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					qc.invalidateQueries({
						queryKey: queryOrpc.proxy.getSSRSubscriptions.key(),
					}),
					qc.invalidateQueries({
						queryKey: queryOrpc.proxy.getProxies.key(),
					}),
				])
			},
		}),
		{
			successToast: t('subscription.list.deleteSuccess'),
			errorToast: ({ error }) =>
				t('subscription.list.deleteError', {
					message: error instanceof Error ? error.message : 'Unknown',
				}),
		},
	)

	const importMutation = useEnhancedMutation(
		queryOrpc.proxy.importSSRFromSubscription.mutationOptions({
			onSuccess: async (data) => {
				await Promise.all([
					qc.invalidateQueries({
						queryKey: queryOrpc.proxy.getSSRSubscriptions.key(),
					}),
					qc.invalidateQueries({
						queryKey: queryOrpc.proxy.getProxies.key(),
					}),
				])
				toast.success(
					t('subscription.list.importSuccess', { count: data.count }),
				)
			},
		}),
		{
			errorToast: ({ error }) =>
				t('subscription.list.importError', {
					message: error instanceof Error ? error.message : 'Unknown',
				}),
		},
	)

	const runChecksMutation = useEnhancedMutation(
		{
			mutationFn: async () => {
				const res = await fetch('/api/proxy-check/run', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ concurrency: 5 }),
				})
				if (!res.ok) {
					const text = await res.text().catch(() => '')
					throw new Error(text || `HTTP ${res.status}`)
				}
				return (await res.json()) as { ok?: boolean; runId?: string }
			},
		},
		{
			successToast: ({ data }) =>
				t('page.runChecksQueued', { runId: data.runId ?? '' }),
			errorToast: ({ error }) =>
				t('page.runChecksError', {
					message: error instanceof Error ? error.message : String(error),
				}),
		},
	)

	const runOneCheckMutation = useEnhancedMutation(
		{
			mutationFn: async (variables: { proxyId: string }) => {
				const res = await fetch('/api/proxy-check/run-one', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ proxyId: variables.proxyId }),
				})
				if (!res.ok) {
					const text = await res.text().catch(() => '')
					throw new Error(text || `HTTP ${res.status}`)
				}
				return (await res.json()) as {
					ok?: boolean
					runId?: string
					jobId?: string
				}
			},
		},
		{
			successToast: ({ data }) =>
				t('list.checkQueued', { runId: data.runId ?? '' }),
			errorToast: ({ error }) =>
				t('list.checkError', {
					message: error instanceof Error ? error.message : String(error),
				}),
		},
	)

	function queueSingleCheck(proxyId: string) {
		if (runOneCheckMutation.isPending) return
		runOneCheckMutation.mutate({ proxyId })
	}

	const setDefaultMutation = useEnhancedMutation(
		queryOrpc.proxy.setDefaultProxy.mutationOptions({
			onSuccess: async (data) => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.proxy.getDefaultProxy.key(),
				})
				const nextId = data.defaultProxyId ?? null
				toast.success(
					nextId
						? t('list.setDefaultSuccess.set')
						: t('list.setDefaultSuccess.cleared'),
				)
			},
		}),
		{
			errorToast: ({ error }) =>
				t('list.setDefaultError', {
					message: error instanceof Error ? error.message : 'Unknown',
				}),
		},
	)

	const deleteProxyMutation = useEnhancedMutation(
		queryOrpc.proxy.deleteProxy.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					qc.invalidateQueries({
						queryKey: queryOrpc.proxy.getProxies.key(),
					}),
					qc.invalidateQueries({
						queryKey: queryOrpc.proxy.getDefaultProxy.key(),
					}),
					qc.invalidateQueries({
						queryKey: queryOrpc.proxy.getSSRSubscriptions.key(),
					}),
				])
			},
		}),
		{
			successToast: t('list.deleteSuccess'),
			errorToast: ({ error }) =>
				t('list.deleteError', {
					message: error instanceof Error ? error.message : 'Unknown',
				}),
		},
	)

	return (
		<div className="min-h-screen bg-background selection:bg-primary/10 selection:text-primary">
			<div className="px-4 py-10 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-5xl">
					<div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h1 className="text-3xl font-semibold tracking-tight">
								{t('page.title')}
							</h1>
						</div>
						<div className="flex flex-wrap gap-2">
							<Button
								variant="secondary"
								type="button"
								onClick={() => {
									subsQuery.refetch()
									proxiesQuery.refetch()
									defaultQuery.refetch()
								}}
							>
								<RefreshCcw className="mr-2 h-4 w-4" />
								Refresh
							</Button>
							<Button
								variant="secondary"
								type="button"
								disabled={runChecksMutation.isPending}
								onClick={() => runChecksMutation.mutate()}
							>
								<Activity className="mr-2 h-4 w-4" />
								{runChecksMutation.isPending
									? t('page.runChecksRunning')
									: t('page.runChecks')}
							</Button>
							<Button type="button" onClick={() => setCreateDialogOpen(true)}>
								<Plus className="mr-2 h-4 w-4" />
								{t('page.addSubscription')}
							</Button>
						</div>
					</div>

					<Tabs
						value={tab}
						onValueChange={(nextTab) =>
							setSearch({
								tab: nextTab as AdminProxyTab,
								subscriptionId,
								page,
							})
						}
						className="space-y-6"
					>
						<TabsList className="glass inline-flex h-12 items-center justify-center rounded-full bg-secondary/30 p-1 text-muted-foreground shadow-sm">
							<TabsTrigger
								value="subscriptions"
								className="rounded-full px-6 py-2 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
							>
								{t('page.tabs.subscriptions')}
							</TabsTrigger>
							<TabsTrigger
								value="proxies"
								className="rounded-full px-6 py-2 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
							>
								{t('page.tabs.proxies')}
							</TabsTrigger>
						</TabsList>

						<TabsContent value="subscriptions">
							{subscriptions.length === 0 ? (
								<div className="glass rounded-2xl p-8 text-center">
									<div className="text-lg font-semibold">
										{t('subscription.list.emptyTitle')}
									</div>
									<div className="mt-1 text-sm text-muted-foreground">
										{t('subscription.list.emptyDesc')}
									</div>
									<div className="mt-6">
										<Button
											type="button"
											onClick={() => setCreateDialogOpen(true)}
										>
											<Plus className="mr-2 h-4 w-4" />
											{t('page.addSubscription')}
										</Button>
									</div>
								</div>
							) : (
								<div className="space-y-4">
									{subscriptions.map((s) => (
										<div key={s.id} className="glass rounded-2xl p-5">
											<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
												<div className="space-y-1">
													<div className="text-lg font-semibold">{s.name}</div>
													<div className="break-all text-xs text-muted-foreground">
														{s.url}
													</div>
													<div className="mt-2 text-xs text-muted-foreground">
														{t('subscription.list.proxiesCount', {
															count: s.proxies?.length ?? 0,
														})}
														{s.lastUpdated ? (
															<>
																{' · '}
																{t('subscription.list.updated', {
																	date: toDateLabel(s.lastUpdated),
																})}
															</>
														) : null}
													</div>
												</div>

												<div className="flex flex-wrap gap-2">
													<Button
														variant="secondary"
														type="button"
														disabled={importMutation.isPending}
														onClick={() =>
															importMutation.mutate({ subscriptionId: s.id })
														}
													>
														<Shield className="mr-2 h-4 w-4" />
														{importMutation.isPending
															? t('subscription.list.syncing')
															: t('subscription.list.sync')}
													</Button>
													<Button
														variant="destructive"
														type="button"
														disabled={deleteSubscriptionMutation.isPending}
														onClick={() =>
															void (async () => {
																const ok = await confirmDialog({
																	description: t(
																		'subscription.list.deleteConfirm',
																	),
																	variant: 'destructive',
																})
																if (!ok) return
																deleteSubscriptionMutation.mutate({ id: s.id })
															})()
														}
													>
														<Trash2 className="mr-2 h-4 w-4" />
														Delete
													</Button>
												</div>
											</div>
										</div>
									))}
								</div>
							)}
						</TabsContent>

						<TabsContent value="proxies">
							<div className="glass mb-4 rounded-2xl p-4">
								<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
									<div className="text-sm font-medium">Proxies</div>
									<div className="flex flex-wrap gap-2">
										<Button
											variant="secondary"
											size="sm"
											type="button"
											onClick={() =>
												setSearch({
													tab,
													subscriptionId: undefined,
													page: 1,
												})
											}
										>
											All
										</Button>
										{subscriptions.map((s) => (
											<Button
												key={s.id}
												variant={
													subscriptionId === s.id ? 'default' : 'secondary'
												}
												size="sm"
												type="button"
												onClick={() =>
													setSearch({
														tab,
														subscriptionId: s.id,
														page: 1,
													})
												}
											>
												{s.name}
											</Button>
										))}
									</div>
								</div>
							</div>

							{proxies.length === 0 ? (
								<div className="glass rounded-2xl p-8 text-center">
									<div className="text-lg font-semibold">
										{t('list.empty.title')}
									</div>
									<div className="mt-1 text-sm text-muted-foreground">
										{t('list.empty.desc')}
									</div>
								</div>
							) : (
								<div className="space-y-3">
									{proxies.map((p) => {
										const isDefault = defaultProxyId && p.id === defaultProxyId
										const hostKind = classifyHost(p.server)
										const hostLabel = hostKindLabel(hostKind)
										const lastTestedLabel = p.lastTestedAt
											? t('list.lastTested', {
													date: toDateLabel(p.lastTestedAt),
												})
											: ''
										const rttLabel =
											typeof p.responseTime === 'number' &&
											Number.isFinite(p.responseTime)
												? t('list.rtt', {
														ms: Math.max(0, Math.trunc(p.responseTime)),
													})
												: ''
										return (
											<div
												key={p.id}
												className="glass cursor-pointer rounded-2xl p-4 transition-colors hover:bg-secondary/20"
												role="button"
												tabIndex={0}
												aria-disabled={runOneCheckMutation.isPending}
												onClick={() => queueSingleCheck(p.id)}
												onKeyDown={(e) => {
													if (e.key === 'Enter' || e.key === ' ') {
														e.preventDefault()
														queueSingleCheck(p.id)
													}
												}}
											>
												<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
													<div className="space-y-1">
														<div className="flex flex-wrap items-center gap-2">
															<div className="font-semibold">
																{p.name || p.server}
															</div>
															<span
																className={`rounded-md px-2 py-1 text-xs ${proxyStatusBadgeClass(
																	p.testStatus,
																)}`}
															>
																{p.testStatus === 'success'
																	? t('list.status.success')
																	: p.testStatus === 'failed'
																		? t('list.status.failed')
																		: t('list.status.pending')}
															</span>
															{hostLabel ? (
																<span className="rounded-md bg-secondary px-2 py-1 text-xs">
																	{hostLabel}
																</span>
															) : null}
															{isDefault ? (
																<span className="rounded-md bg-secondary px-2 py-1 text-xs">
																	{t('list.defaultBadge')}
																</span>
															) : null}
														</div>
														<div className="text-xs text-muted-foreground">
															{p.protocol}://{formatHostPort(p.server, p.port)}
															{lastTestedLabel ? (
																<>
																	{' · '}
																	{lastTestedLabel}
																</>
															) : null}
															{rttLabel ? (
																<>
																	{' · '}
																	{rttLabel}
																</>
															) : null}
														</div>
													</div>

													<div className="flex flex-wrap gap-2">
														<Button
															variant="secondary"
															size="sm"
															type="button"
															disabled={runOneCheckMutation.isPending}
															onClick={(e) => {
																e.stopPropagation()
																queueSingleCheck(p.id)
															}}
														>
															{t('list.check')}
														</Button>
														<Button
															variant="secondary"
															size="sm"
															type="button"
															disabled={setDefaultMutation.isPending}
															onClick={(e) => {
																e.stopPropagation()
																setDefaultMutation.mutate({
																	proxyId: isDefault ? null : p.id,
																})
															}}
														>
															{isDefault
																? t('list.clearDefault')
																: t('list.setDefault')}
														</Button>
														<Button
															variant="destructive"
															size="sm"
															type="button"
															disabled={deleteProxyMutation.isPending}
															onClick={(e) => {
																e.stopPropagation()
																void (async () => {
																	const ok = await confirmDialog({
																		description: t('list.deleteConfirm'),
																		variant: 'destructive',
																	})
																	if (!ok) return
																	deleteProxyMutation.mutate({ id: p.id })
																})()
															}}
														>
															<Trash2 className="mr-2 h-4 w-4" />
															Delete
														</Button>
													</div>
												</div>
											</div>
										)
									})}
								</div>
							)}

							{totalPages > 1 ? (
								<div className="mt-6 flex items-center justify-center gap-2">
									<Button
										variant="secondary"
										type="button"
										disabled={page <= 1}
										onClick={() =>
											setSearch({
												tab,
												subscriptionId,
												page: page - 1,
											})
										}
									>
										{t('list.pagination.prev')}
									</Button>
									<div className="px-2 text-sm text-muted-foreground">
										{t('list.pagination.page', { page, pages: totalPages })}
									</div>
									<Button
										variant="secondary"
										type="button"
										disabled={page >= totalPages}
										onClick={() =>
											setSearch({
												tab,
												subscriptionId,
												page: page + 1,
											})
										}
									>
										{t('list.pagination.next')}
									</Button>
									<div className="hidden sm:block px-2 text-xs text-muted-foreground">
										{t('list.pagination.label', {
											from: (page - 1) * DEFAULT_PAGE_LIMIT + 1,
											to: Math.min(page * DEFAULT_PAGE_LIMIT, total),
											total,
										})}
									</div>
								</div>
							) : null}
						</TabsContent>
					</Tabs>
				</div>
			</div>

			<Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('subscription.dialog.title')}</DialogTitle>
						<DialogDescription>
							{t('subscription.dialog.desc')}
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="sub-name">
								{t('subscription.dialog.nameLabel')}
							</Label>
							<Input
								id="sub-name"
								value={newName}
								onChange={(e) => setNewName(e.target.value)}
								placeholder="My subscription"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="sub-url">
								{t('subscription.dialog.urlLabel')}
							</Label>
							<Input
								id="sub-url"
								value={newUrl}
								onChange={(e) => setNewUrl(e.target.value)}
								placeholder="https://example.com/subscription"
							/>
							<div className="text-xs text-muted-foreground">
								{t('subscription.dialog.urlHint')}
							</div>
						</div>
					</div>

					<DialogFooter>
						<Button
							variant="secondary"
							type="button"
							onClick={() => setCreateDialogOpen(false)}
							disabled={createSubscriptionMutation.isPending}
						>
							{t('subscription.dialog.cancel')}
						</Button>
						<Button
							type="button"
							disabled={createSubscriptionMutation.isPending}
							onClick={() => {
								const parsed = SubscriptionFormSchema.safeParse({
									name: newName.trim(),
									url: newUrl.trim(),
								})
								if (!parsed.success) {
									const message = !newName.trim()
										? t('subscription.dialog.nameRequired')
										: !newUrl.trim()
											? t('subscription.dialog.urlRequired')
											: t('subscription.dialog.urlInvalid')
									toast.error(message)
									return
								}

								createSubscriptionMutation.mutate(parsed.data)
							}}
						>
							{createSubscriptionMutation.isPending
								? t('subscription.dialog.creating')
								: t('subscription.dialog.create')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
