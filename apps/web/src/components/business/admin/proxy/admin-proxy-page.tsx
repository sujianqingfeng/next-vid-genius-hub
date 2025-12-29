'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { useConfirmDialog } from '~/components/business/layout/confirm-dialog-provider'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
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
import { cn } from '~/lib/utils'

export type AdminProxyTab = 'subscriptions' | 'proxies'

const SubscriptionFormSchema = z.object({
	name: z.string().min(1),
	url: z.string().url(),
})

function toDateLabel(input: unknown): string {
	if (!input) return '---'
	const d = input instanceof Date ? input : new Date(input as any)
	if (Number.isNaN(d.getTime())) return '---'
	return d.toISOString().replace('T', ' ').split('.')[0]
}

function proxyStatusBadgeClass(status: string | null | undefined): string {
	if (status === 'success') {
		return 'border-emerald-500 text-emerald-500'
	}
	if (status === 'failed') {
		return 'border-destructive text-destructive'
	}
	return 'border-border text-muted-foreground'
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
	const tCommon = useTranslations('Common')
	const qc = useQueryClient()
	const confirmDialog = useConfirmDialog()

	const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
	const [newName, setNewName] = React.useState('')
	const [newUrl, setNewUrl] = React.useState('')
	const [checkSettingsDialogOpen, setCheckSettingsDialogOpen] =
		React.useState(false)

	const [checkTestUrl, setCheckTestUrl] = React.useState('')
	const [checkTimeoutMs, setCheckTimeoutMs] = React.useState('60000')
	const [checkProbeBytes, setCheckProbeBytes] = React.useState('65536')
	const [checkConcurrency, setCheckConcurrency] = React.useState('5')

	const subsQuery = useQuery(queryOrpc.proxy.getSSRSubscriptions.queryOptions())
	const defaultQuery = useQuery(queryOrpc.proxy.getDefaultProxy.queryOptions())
	const checkSettingsQuery = useQuery(
		queryOrpc.proxy.getProxyCheckSettings.queryOptions(),
	)
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
					message:
						error instanceof Error
							? error.message
							: tCommon('fallback.unknown'),
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
					message:
						error instanceof Error
							? error.message
							: tCommon('fallback.unknown'),
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
					message:
						error instanceof Error
							? error.message
							: tCommon('fallback.unknown'),
				}),
		},
	)

	const runChecksMutation = useEnhancedMutation(
		{
			mutationFn: async () => {
				const res = await fetch('/api/proxy-check/run', { method: 'POST' })
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

	const saveCheckSettingsMutation = useEnhancedMutation(
		queryOrpc.proxy.updateProxyCheckSettings.mutationOptions({
			onSuccess: async () => {
				setCheckSettingsDialogOpen(false)
				await qc.invalidateQueries({
					queryKey: queryOrpc.proxy.getProxyCheckSettings.key(),
				})
			},
		}),
		{
			successToast: t('page.checkSettingsSaved'),
			errorToast: ({ error }) =>
				t('page.checkSettingsSaveError', {
					message: error instanceof Error ? error.message : String(error),
				}),
		},
	)

	React.useEffect(() => {
		if (!checkSettingsDialogOpen) return
		const settings = checkSettingsQuery.data?.settings
		if (!settings) return

		setCheckTestUrl(settings.testUrl ?? '')
		setCheckTimeoutMs(String(settings.timeoutMs ?? 60_000))
		setCheckProbeBytes(String(settings.probeBytes ?? 65_536))
		setCheckConcurrency(String(settings.concurrency ?? 5))
	}, [checkSettingsDialogOpen, checkSettingsQuery.data?.settings])

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
					message:
						error instanceof Error
							? error.message
							: tCommon('fallback.unknown'),
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
					message:
						error instanceof Error
							? error.message
							: tCommon('fallback.unknown'),
				}),
		},
	)

	return (
		<div className="space-y-8 font-sans">
			<div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between border-b border-primary pb-6">
				<div>
					<div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
						Network / Proxy Infrastructure
					</div>
					<h1 className="text-3xl font-black uppercase tracking-tight">
						{t('page.title')}
					</h1>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						size="sm"
						className="rounded-none border-border uppercase text-[10px] font-bold tracking-widest px-4 h-9"
						onClick={() => {
							subsQuery.refetch()
							proxiesQuery.refetch()
							defaultQuery.refetch()
						}}
					>
						REFRESH
					</Button>
					<Button
						variant="outline"
						size="sm"
						className="rounded-none border-border uppercase text-[10px] font-bold tracking-widest px-4 h-9"
						disabled={runChecksMutation.isPending}
						onClick={() => runChecksMutation.mutate(undefined)}
					>
						{runChecksMutation.isPending ? 'CHECKING...' : 'RUN_FULL_CHECKS'}
					</Button>
					<Button
						variant="outline"
						size="sm"
						className="rounded-none border-border uppercase text-[10px] font-bold tracking-widest px-4 h-9"
						onClick={() => setCheckSettingsDialogOpen(true)}
					>
						CONFIG
					</Button>
					<Button
						variant="primary"
						size="sm"
						className="rounded-none uppercase text-[10px] font-bold tracking-widest px-4 h-9"
						onClick={() => setCreateDialogOpen(true)}
					>
						+ NEW_SUB
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
				className="space-y-0"
			>
				<TabsList className="h-auto w-full justify-start rounded-none bg-transparent p-0 border-b border-border mb-8">
					<TabsTrigger
						value="subscriptions"
						className="rounded-none border-b-2 border-transparent px-8 py-3 text-xs font-bold uppercase tracking-[0.2em] data-[state=active]:border-primary data-[state=active]:bg-muted/50 data-[state=active]:shadow-none"
					>
						{t('page.tabs.subscriptions')}
					</TabsTrigger>
					<TabsTrigger
						value="proxies"
						className="rounded-none border-b-2 border-transparent px-8 py-3 text-xs font-bold uppercase tracking-[0.2em] data-[state=active]:border-primary data-[state=active]:bg-muted/50 data-[state=active]:shadow-none"
					>
						{t('page.tabs.proxies')}
					</TabsTrigger>
				</TabsList>

				<TabsContent value="subscriptions" className="mt-0 outline-none">
					{subscriptions.length === 0 ? (
						<div className="border border-dashed border-border p-12 text-center">
							<div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
								NO_RECORDS_FOUND
							</div>
							<Button
								variant="outline"
								className="mt-6 rounded-none uppercase text-xs font-bold tracking-widest"
								onClick={() => setCreateDialogOpen(true)}
							>
								ADD_FIRST_SUBSCRIPTION
							</Button>
						</div>
					) : (
						<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
							{subscriptions.map((s) => (
								<div key={s.id} className="border border-border bg-card p-6">
									<div className="flex flex-col gap-6">
										<div className="space-y-3">
											<div className="text-sm font-black uppercase tracking-wider border-b border-border pb-2">
												{s.name}
											</div>
											<div className="font-mono text-[10px] text-muted-foreground break-all bg-muted/30 p-2">
												URL: {s.url}
											</div>
											<div className="flex gap-4 font-mono text-[10px] uppercase tracking-tighter">
												<div>
													NODES:{' '}
													<span className="text-foreground font-bold">
														{(s.proxies?.length ?? 0)
															.toString()
															.padStart(3, '0')}
													</span>
												</div>
												{s.lastUpdated ? (
													<div>
														SYNC:{' '}
														<span className="text-foreground font-bold">
															{toDateLabel(s.lastUpdated)}
														</span>
													</div>
												) : null}
											</div>
										</div>

										<div className="flex gap-2">
											<Button
												variant="outline"
												size="sm"
												className="flex-1 rounded-none border-border hover:bg-primary hover:text-primary-foreground uppercase text-[10px] font-bold tracking-widest h-9"
												disabled={importMutation.isPending}
												onClick={() =>
													importMutation.mutate({ subscriptionId: s.id })
												}
											>
												{importMutation.isPending ? 'SYNCING...' : 'FORCE_SYNC'}
											</Button>
											<Button
												variant="outline"
												size="sm"
												className="rounded-none border-border hover:bg-destructive hover:text-destructive-foreground uppercase text-[10px] font-bold tracking-widest h-9 px-4"
												disabled={deleteSubscriptionMutation.isPending}
												onClick={() =>
													void (async () => {
														const ok = await confirmDialog({
															description: t('subscription.list.deleteConfirm'),
															variant: 'destructive',
														})
														if (!ok) return
														deleteSubscriptionMutation.mutate({ id: s.id })
													})()
												}
											>
												DELETE
											</Button>
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</TabsContent>

				<TabsContent value="proxies" className="mt-0 outline-none">
					<div className="border border-border bg-muted/30 p-4 mb-6">
						<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
							<div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
								FILTER_BY_SOURCE:
							</div>
							<div className="flex flex-wrap gap-1">
								<Button
									variant={!subscriptionId ? 'primary' : 'outline'}
									size="xs"
									className="rounded-none uppercase text-[9px] font-bold tracking-widest h-7 px-3"
									onClick={() =>
										setSearch({
											tab,
											subscriptionId: undefined,
											page: 1,
										})
									}
								>
									ALL_SOURCES
								</Button>
								{subscriptions.map((s) => (
									<Button
										key={s.id}
										variant={subscriptionId === s.id ? 'primary' : 'outline'}
										size="xs"
										className="rounded-none uppercase text-[9px] font-bold tracking-widest h-7 px-3"
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
						<div className="border border-dashed border-border p-12 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
							NO_PROXIES_AVAILABLE
						</div>
					) : (
						<div className="border border-border">
							<table className="min-w-full border-collapse">
								<thead>
									<tr className="border-b border-border bg-muted/50">
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-r border-border">
											NODE_IDENTIFIER
										</th>
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-r border-border">
											STATUS
										</th>
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-r border-border">
											ADDRESS_INFRA
										</th>
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-r border-border">
											METRICS
										</th>
										<th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
											CONTROL
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border">
									{proxies.map((p) => {
										const isDefault = defaultProxyId && p.id === defaultProxyId
										const hostKind = classifyHost(p.server)
										const hostLabel = hostKindLabel(hostKind)
										const rtt =
											typeof p.responseTime === 'number' &&
											Number.isFinite(p.responseTime)
												? Math.max(0, Math.trunc(p.responseTime))
												: null

										return (
											<tr
												key={p.id}
												className="hover:bg-muted/30 transition-none group"
											>
												<td className="px-4 py-3 border-r border-border">
													<div className="flex items-center gap-2">
														<div className="font-mono text-xs font-bold uppercase">
															{p.name || p.server}
														</div>
														{isDefault && (
															<div className="bg-primary text-primary-foreground text-[8px] font-black px-1 uppercase tracking-tighter">
																DEFAULT
															</div>
														)}
													</div>
												</td>
												<td className="px-4 py-3 border-r border-border">
													<div
														className={cn(
															'inline-block px-2 py-0.5 text-[9px] font-bold uppercase border',
															proxyStatusBadgeClass(p.testStatus),
														)}
													>
														{p.testStatus === 'success'
															? 'OK'
															: p.testStatus === 'failed'
																? 'ERR'
																: 'NULL'}
													</div>
												</td>
												<td className="px-4 py-3 border-r border-border">
													<div className="font-mono text-[10px] text-muted-foreground">
														{p.protocol}://{formatHostPort(p.server, p.port)}
														{hostLabel && (
															<span className="ml-2 border border-border px-1 text-[8px]">
																{hostLabel}
															</span>
														)}
													</div>
												</td>
												<td className="px-4 py-3 border-r border-border font-mono text-[10px] text-muted-foreground space-y-1">
													{rtt !== null && (
														<div className="flex items-center gap-2">
															<span>LATENCY:</span>
															<span
																className={cn(
																	'font-bold',
																	rtt < 200
																		? 'text-green-600'
																		: rtt < 500
																			? 'text-yellow-600'
																			: 'text-red-600',
																)}
															>
																{rtt.toString().padStart(4, ' ')}ms
															</span>
														</div>
													)}
													<div className="flex items-center gap-2">
														<span>LAST_CHK:</span>
														<span>{toDateLabel(p.lastTestedAt)}</span>
													</div>
												</td>
												<td className="px-4 py-3 text-right">
													<div className="flex justify-end gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
														<Button
															variant="outline"
															size="xs"
															className="rounded-none border-border hover:bg-primary hover:text-primary-foreground uppercase text-[9px] font-bold px-2 h-7"
															disabled={runOneCheckMutation.isPending}
															onClick={() => queueSingleCheck(p.id)}
														>
															PING
														</Button>
														<Button
															variant="outline"
															size="xs"
															className="rounded-none border-border hover:bg-primary hover:text-primary-foreground uppercase text-[9px] font-bold px-2 h-7"
															disabled={setDefaultMutation.isPending}
															onClick={() =>
																setDefaultMutation.mutate({
																	proxyId: isDefault ? null : p.id,
																})
															}
														>
															{isDefault ? 'UNSET_DEF' : 'SET_DEF'}
														</Button>
														<Button
															variant="destructive"
															size="xs"
															className="rounded-none uppercase text-[9px] font-bold px-2 h-7"
															disabled={deleteProxyMutation.isPending}
															onClick={() =>
																void (async () => {
																	const ok = await confirmDialog({
																		description: t('list.deleteConfirm'),
																		variant: 'destructive',
																	})
																	if (!ok) return
																	deleteProxyMutation.mutate({ id: p.id })
																})()
															}
														>
															DEL
														</Button>
													</div>
												</td>
											</tr>
										)
									})}
								</tbody>
							</table>
						</div>
					)}

					{totalPages > 1 ? (
						<div className="flex flex-col gap-0 border border-t-0 border-border sm:flex-row sm:items-center sm:justify-between bg-muted/30">
							<p className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								PAGE: {page.toString().padStart(3, '0')} /{' '}
								{totalPages.toString().padStart(3, '0')} | TOTAL: {total}
							</p>
							<div className="flex border-l border-border">
								<Button
									variant="ghost"
									disabled={page <= 1}
									onClick={() =>
										setSearch({ tab, subscriptionId, page: page - 1 })
									}
									className="rounded-none border-r border-border px-6 py-3 h-auto uppercase text-[10px] font-bold tracking-[0.2em] hover:bg-primary hover:text-primary-foreground disabled:opacity-30"
								>
									PREV
								</Button>
								<Button
									variant="ghost"
									disabled={page >= totalPages}
									onClick={() =>
										setSearch({ tab, subscriptionId, page: page + 1 })
									}
									className="rounded-none px-6 py-3 h-auto uppercase text-[10px] font-bold tracking-[0.2em] hover:bg-primary hover:text-primary-foreground disabled:opacity-30"
								>
									NEXT
								</Button>
							</div>
						</div>
					) : null}
				</TabsContent>
			</Tabs>

			<Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
				<DialogContent className="rounded-none border-2 border-primary p-0 overflow-hidden max-w-md">
					<DialogHeader className="bg-primary p-4 text-primary-foreground">
						<DialogTitle className="text-xs font-bold uppercase tracking-[0.2em]">
							NEW_SUBSCRIPTION // PROXY_SOURCE
						</DialogTitle>
					</DialogHeader>

					<div className="p-6 space-y-6">
						<div className="space-y-2">
							<Label
								htmlFor="sub-name"
								className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
							>
								SOURCE_NAME
							</Label>
							<Input
								id="sub-name"
								value={newName}
								onChange={(e) => setNewName(e.target.value)}
								className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
								placeholder="MY_SSR_LIST"
							/>
						</div>
						<div className="space-y-2">
							<Label
								htmlFor="sub-url"
								className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
							>
								SOURCE_URL_ENDPOINT
							</Label>
							<Input
								id="sub-url"
								value={newUrl}
								onChange={(e) => setNewUrl(e.target.value)}
								className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
								placeholder="HTTPS://..."
							/>
						</div>
					</div>

					<div className="flex border-t border-border">
						<Button
							variant="ghost"
							onClick={() => setCreateDialogOpen(false)}
							disabled={createSubscriptionMutation.isPending}
							className="flex-1 rounded-none border-r border-border h-12 uppercase text-xs font-bold tracking-widest hover:bg-muted"
						>
							ABORT
						</Button>
						<Button
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
							className="flex-1 rounded-none h-12 bg-primary text-primary-foreground uppercase text-xs font-bold tracking-widest hover:bg-primary/90"
						>
							{createSubscriptionMutation.isPending
								? 'CREATING...'
								: 'COMMIT_SOURCE'}
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			<Dialog
				open={checkSettingsDialogOpen}
				onOpenChange={setCheckSettingsDialogOpen}
			>
				<DialogContent className="rounded-none border-2 border-primary p-0 overflow-hidden max-w-lg">
					<DialogHeader className="bg-primary p-4 text-primary-foreground">
						<DialogTitle className="text-xs font-bold uppercase tracking-[0.2em]">
							SYSTEM_CONFIG // PROXY_VALIDATION
						</DialogTitle>
					</DialogHeader>

					<div className="p-6 space-y-6">
						<div className="space-y-2">
							<Label
								htmlFor="proxy-check-test-url"
								className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
							>
								VALIDATION_TARGET_URL
							</Label>
							<Input
								id="proxy-check-test-url"
								value={checkTestUrl}
								onChange={(e) => setCheckTestUrl(e.target.value)}
								className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
							/>
						</div>

						<div className="grid grid-cols-3 gap-4">
							<div className="space-y-2">
								<Label
									htmlFor="proxy-check-timeout"
									className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
								>
									TIMEOUT_MS
								</Label>
								<Input
									id="proxy-check-timeout"
									type="number"
									value={checkTimeoutMs}
									onChange={(e) => setCheckTimeoutMs(e.target.value)}
									className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
								/>
							</div>
							<div className="space-y-2">
								<Label
									htmlFor="proxy-check-probe-bytes"
									className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
								>
									PROBE_B
								</Label>
								<Input
									id="proxy-check-probe-bytes"
									type="number"
									value={checkProbeBytes}
									onChange={(e) => setCheckProbeBytes(e.target.value)}
									className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
								/>
							</div>
							<div className="space-y-2">
								<Label
									htmlFor="proxy-check-concurrency"
									className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
								>
									CONCURRENCY
								</Label>
								<Input
									id="proxy-check-concurrency"
									type="number"
									value={checkConcurrency}
									onChange={(e) => setCheckConcurrency(e.target.value)}
									className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
								/>
							</div>
						</div>
					</div>

					<div className="flex border-t border-border">
						<Button
							variant="ghost"
							onClick={() => setCheckSettingsDialogOpen(false)}
							disabled={saveCheckSettingsMutation.isPending}
							className="flex-1 rounded-none border-r border-border h-12 uppercase text-xs font-bold tracking-widest hover:bg-muted"
						>
							CANCEL
						</Button>
						<Button
							disabled={
								saveCheckSettingsMutation.isPending ||
								checkSettingsQuery.isLoading ||
								!checkSettingsQuery.data?.settings
							}
							onClick={() => {
								const timeoutMs = Number(checkTimeoutMs)
								const probeBytes = Number(checkProbeBytes)
								const concurrency = Number(checkConcurrency)
								if (
									!Number.isFinite(timeoutMs) ||
									!Number.isFinite(probeBytes) ||
									!Number.isFinite(concurrency)
								) {
									toast.error(t('page.checkSettingsBadNumber'))
									return
								}
								saveCheckSettingsMutation.mutate({
									testUrl: checkTestUrl,
									timeoutMs,
									probeBytes,
									concurrency,
								})
							}}
							className="flex-1 rounded-none h-12 bg-primary text-primary-foreground uppercase text-xs font-bold tracking-widest hover:bg-primary/90"
						>
							{saveCheckSettingsMutation.isPending
								? 'SAVING...'
								: 'SAVE_CONFIG'}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}
