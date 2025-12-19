import * as React from "react"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, RefreshCcw, Shield, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import { Button } from "~/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { DEFAULT_PAGE_LIMIT } from "~/lib/pagination"
import { useEnhancedMutation } from "~/lib/hooks/useEnhancedMutation"

import { queryOrpcNext } from "../integrations/orpc/next-client"
import { useTranslations } from "../integrations/i18n"

const SearchSchema = z.object({
	tab: z.enum(["subscriptions", "proxies"]).optional().default("subscriptions"),
	subscriptionId: z.string().optional(),
	page: z.coerce.number().int().min(1).optional().default(1),
})

const SubscriptionFormSchema = z.object({
	name: z.string().min(1),
	url: z.string().url(),
})

export const Route = createFileRoute("/proxy")({
	validateSearch: SearchSchema,
	loaderDeps: ({ search }) => ({
		page: search.page,
		subscriptionId: search.subscriptionId,
	}),
	loader: async ({ context, deps, location }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpcNext.auth.me.queryOptions(),
		)
		if (!me.user) {
			const next = location.href
			throw redirect({ to: "/login", search: { next } })
		}

		await Promise.all([
			context.queryClient.prefetchQuery(
				queryOrpcNext.proxy.getSSRSubscriptions.queryOptions(),
			),
			context.queryClient.prefetchQuery(
				queryOrpcNext.proxy.getDefaultProxy.queryOptions(),
			),
			context.queryClient.prefetchQuery(
				queryOrpcNext.proxy.getProxies.queryOptions({
					input: {
						subscriptionId: deps.subscriptionId,
						page: deps.page,
						limit: DEFAULT_PAGE_LIMIT,
					},
				}),
			),
		])
	},
	component: ProxyRoute,
})

function toDateLabel(input: unknown): string {
	if (input instanceof Date) return input.toLocaleString()
	if (typeof input === "string" || typeof input === "number") {
		const d = new Date(input)
		if (!Number.isNaN(d.getTime())) return d.toLocaleString()
	}
	return ""
}

function ProxyRoute() {
	const t = useTranslations("Proxy")
	const navigate = Route.useNavigate()
	const qc = useQueryClient()

	const { tab, subscriptionId, page } = Route.useSearch()

	const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
	const [newName, setNewName] = React.useState("")
	const [newUrl, setNewUrl] = React.useState("")

	const subsQuery = useQuery(queryOrpcNext.proxy.getSSRSubscriptions.queryOptions())
	const defaultQuery = useQuery(queryOrpcNext.proxy.getDefaultProxy.queryOptions())
	const proxiesQuery = useQuery(
		queryOrpcNext.proxy.getProxies.queryOptions({
			input: { subscriptionId, page, limit: DEFAULT_PAGE_LIMIT },
		}),
	)

	const subscriptions = subsQuery.data?.subscriptions ?? []
	const proxies = proxiesQuery.data?.proxies ?? []
	const total = proxiesQuery.data?.total ?? 0
	const totalPages = proxiesQuery.data?.totalPages ?? 1
	const defaultProxyId = defaultQuery.data?.defaultProxyId ?? null

	const createSubscriptionMutation = useEnhancedMutation(
		queryOrpcNext.proxy.createSSRSubscription.mutationOptions({
			onSuccess: async () => {
				setCreateDialogOpen(false)
				setNewName("")
				setNewUrl("")
				await qc.invalidateQueries({
					queryKey: queryOrpcNext.proxy.getSSRSubscriptions.key(),
				})
			},
		}),
		{
			successToast: t("subscription.dialog.success"),
			errorToast: ({ error }) =>
				t("subscription.dialog.error", {
					message: error instanceof Error ? error.message : "Unknown",
				}),
		},
	)

	const deleteSubscriptionMutation = useEnhancedMutation(
		queryOrpcNext.proxy.deleteSSRSubscription.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					qc.invalidateQueries({ queryKey: queryOrpcNext.proxy.getSSRSubscriptions.key() }),
					qc.invalidateQueries({ queryKey: queryOrpcNext.proxy.getProxies.key() }),
				])
			},
		}),
		{
			successToast: t("subscription.list.deleteSuccess"),
			errorToast: ({ error }) =>
				t("subscription.list.deleteError", {
					message: error instanceof Error ? error.message : "Unknown",
				}),
		},
	)

	const importMutation = useEnhancedMutation(
		queryOrpcNext.proxy.importSSRFromSubscription.mutationOptions({
			onSuccess: async (data) => {
				await Promise.all([
					qc.invalidateQueries({ queryKey: queryOrpcNext.proxy.getSSRSubscriptions.key() }),
					qc.invalidateQueries({ queryKey: queryOrpcNext.proxy.getProxies.key() }),
				])
				toast.success(t("subscription.list.importSuccess", { count: data.count }))
			},
		}),
		{
			errorToast: ({ error }) =>
				t("subscription.list.importError", {
					message: error instanceof Error ? error.message : "Unknown",
				}),
		},
	)

	const setDefaultMutation = useEnhancedMutation(
		queryOrpcNext.proxy.setDefaultProxy.mutationOptions({
			onSuccess: async (data) => {
				await qc.invalidateQueries({
					queryKey: queryOrpcNext.proxy.getDefaultProxy.key(),
				})
				const nextId = data.defaultProxyId ?? null
				toast.success(
					nextId
						? t("list.setDefaultSuccess.set")
						: t("list.setDefaultSuccess.cleared"),
				)
			},
		}),
		{
			errorToast: ({ error }) =>
				t("list.setDefaultError", {
					message: error instanceof Error ? error.message : "Unknown",
				}),
		},
	)

	const deleteProxyMutation = useEnhancedMutation(
		queryOrpcNext.proxy.deleteProxy.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					qc.invalidateQueries({ queryKey: queryOrpcNext.proxy.getProxies.key() }),
					qc.invalidateQueries({ queryKey: queryOrpcNext.proxy.getDefaultProxy.key() }),
					qc.invalidateQueries({ queryKey: queryOrpcNext.proxy.getSSRSubscriptions.key() }),
				])
			},
		}),
		{
			successToast: t("list.deleteSuccess"),
			errorToast: ({ error }) =>
				t("list.deleteError", { message: error instanceof Error ? error.message : "Unknown" }),
		},
	)

	return (
		<div className="min-h-screen bg-background selection:bg-primary/10 selection:text-primary">
			<div className="px-4 py-10 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-5xl">
					<div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h1 className="text-3xl font-semibold tracking-tight">{t("page.title")}</h1>
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
							<Button type="button" onClick={() => setCreateDialogOpen(true)}>
								<Plus className="mr-2 h-4 w-4" />
								{t("page.addSubscription")}
							</Button>
						</div>
					</div>

					<Tabs
						value={tab}
						onValueChange={(nextTab) =>
							navigate({
								search: {
									tab: nextTab as "subscriptions" | "proxies",
									subscriptionId,
									page,
								},
							})
						}
						className="space-y-6"
					>
						<TabsList className="glass inline-flex h-12 items-center justify-center rounded-full bg-secondary/30 p-1 text-muted-foreground shadow-sm">
							<TabsTrigger
								value="subscriptions"
								className="rounded-full px-6 py-2 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
							>
								{t("page.tabs.subscriptions")}
							</TabsTrigger>
							<TabsTrigger
								value="proxies"
								className="rounded-full px-6 py-2 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
							>
								{t("page.tabs.proxies")}
							</TabsTrigger>
						</TabsList>

						<TabsContent value="subscriptions">
							{subscriptions.length === 0 ? (
								<div className="glass rounded-2xl p-8 text-center">
									<div className="text-lg font-semibold">{t("subscription.list.emptyTitle")}</div>
									<div className="mt-1 text-sm text-muted-foreground">{t("subscription.list.emptyDesc")}</div>
									<div className="mt-6">
										<Button type="button" onClick={() => setCreateDialogOpen(true)}>
											<Plus className="mr-2 h-4 w-4" />
											{t("page.addSubscription")}
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
													<div className="break-all text-xs text-muted-foreground">{s.url}</div>
																	<div className="mt-2 text-xs text-muted-foreground">
																		{t("subscription.list.proxiesCount", {
																			count: s.proxies?.length ?? 0,
																		})}
																		{s.lastUpdated ? (
																			<>
																				{" · "}
																				{t("subscription.list.updated", {
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
														onClick={() => importMutation.mutate({ subscriptionId: s.id })}
													>
														<Shield className="mr-2 h-4 w-4" />
														{importMutation.isPending
															? t("subscription.list.syncing")
															: t("subscription.list.sync")}
													</Button>
													<Button
														variant="destructive"
														type="button"
														disabled={deleteSubscriptionMutation.isPending}
														onClick={() => {
															if (!confirm(t("subscription.list.deleteConfirm"))) return
															deleteSubscriptionMutation.mutate({ id: s.id })
														}}
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
												navigate({
													search: {
														tab,
														subscriptionId: undefined,
														page: 1,
													},
												})
											}
										>
											All
										</Button>
										{subscriptions.map((s) => (
											<Button
												key={s.id}
												variant={subscriptionId === s.id ? "default" : "secondary"}
												size="sm"
												type="button"
												onClick={() =>
													navigate({
														search: {
															tab,
															subscriptionId: s.id,
															page: 1,
														},
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
									<div className="text-lg font-semibold">{t("list.empty.title")}</div>
									<div className="mt-1 text-sm text-muted-foreground">{t("list.empty.desc")}</div>
								</div>
							) : (
								<div className="space-y-3">
									{proxies.map((p) => {
										const isDefault = defaultProxyId && p.id === defaultProxyId
										return (
											<div key={p.id} className="glass rounded-2xl p-4">
												<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
													<div className="space-y-1">
														<div className="flex flex-wrap items-center gap-2">
															<div className="font-semibold">{p.name || p.server}</div>
															{isDefault ? (
																<span className="rounded-md bg-secondary px-2 py-1 text-xs">
																	{t("list.defaultBadge")}
																</span>
															) : null}
														</div>
														<div className="text-xs text-muted-foreground">
															{p.protocol}://{p.server}:{p.port}
														</div>
													</div>

													<div className="flex flex-wrap gap-2">
														<Button
															variant="secondary"
															size="sm"
															type="button"
															disabled={setDefaultMutation.isPending}
															onClick={() =>
																setDefaultMutation.mutate({
																	proxyId: isDefault ? null : p.id,
																})
															}
														>
															{isDefault ? t("list.clearDefault") : t("list.setDefault")}
														</Button>
														<Button
															variant="destructive"
															size="sm"
															type="button"
															disabled={deleteProxyMutation.isPending}
															onClick={() => {
																if (!confirm(t("list.deleteConfirm"))) return
																deleteProxyMutation.mutate({ id: p.id })
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
											navigate({
												search: {
													tab,
													subscriptionId,
													page: page - 1,
												},
											})
										}
									>
										{t("list.pagination.prev")}
									</Button>
									<div className="px-2 text-sm text-muted-foreground">
										{t("list.pagination.page", { page, pages: totalPages })}
									</div>
									<Button
										variant="secondary"
										type="button"
										disabled={page >= totalPages}
										onClick={() =>
											navigate({
												search: {
													tab,
													subscriptionId,
													page: page + 1,
												},
											})
										}
									>
										{t("list.pagination.next")}
									</Button>
									<div className="hidden sm:block px-2 text-xs text-muted-foreground">
										{t("list.pagination.label", {
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
						<DialogTitle>{t("subscription.dialog.title")}</DialogTitle>
						<DialogDescription>{t("subscription.dialog.desc")}</DialogDescription>
					</DialogHeader>

					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="sub-name">{t("subscription.dialog.nameLabel")}</Label>
							<Input
								id="sub-name"
								value={newName}
								onChange={(e) => setNewName(e.target.value)}
								placeholder="My subscription"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="sub-url">{t("subscription.dialog.urlLabel")}</Label>
							<Input
								id="sub-url"
								value={newUrl}
								onChange={(e) => setNewUrl(e.target.value)}
								placeholder="https://example.com/subscription"
							/>
							<div className="text-xs text-muted-foreground">{t("subscription.dialog.urlHint")}</div>
						</div>
					</div>

					<DialogFooter>
						<Button
							variant="secondary"
							type="button"
							onClick={() => setCreateDialogOpen(false)}
							disabled={createSubscriptionMutation.isPending}
						>
							{t("subscription.dialog.cancel")}
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
									const message =
										!newName.trim()
											? t("subscription.dialog.nameRequired")
											: !newUrl.trim()
												? t("subscription.dialog.urlRequired")
												: t("subscription.dialog.urlInvalid")
									toast.error(message)
									return
								}

								createSubscriptionMutation.mutate(parsed.data)
							}}
						>
							{createSubscriptionMutation.isPending
								? t("subscription.dialog.creating")
								: t("subscription.dialog.create")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
