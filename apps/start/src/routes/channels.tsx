import * as React from "react"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDown, ChevronUp, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select"
import { DEFAULT_CHAT_MODEL_ID, type ChatModelId } from "~/lib/ai/models"
import { useEnhancedMutation } from "~/lib/hooks/useEnhancedMutation"

import { CloudJobProgress } from "~/components/business/jobs/cloud-job-progress"

import { queryOrpcNext } from "../integrations/orpc/next-client"
import { useTranslations } from "../integrations/i18n"

type ChannelRow = {
	id: string
	title: string | null
	channelUrl: string
	channelId: string | null
	thumbnail: string | null
	defaultProxyId: string | null
	lastSyncedAt: Date | null
	lastSyncStatus: "queued" | "running" | "completed" | "failed" | null
	lastJobId: string | null
}

const SYNC_VIDEO_LIMIT = 20

export const Route = createFileRoute("/channels")({
	loader: async ({ context, location }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpcNext.auth.me.queryOptions(),
		)
		if (!me.user) {
			const next = location.href
			throw redirect({ to: "/login", search: { next } })
		}

		await Promise.all([
			context.queryClient.prefetchQuery(
				queryOrpcNext.channel.listChannels.queryOptions({}),
			),
			context.queryClient.prefetchQuery(
				queryOrpcNext.proxy.getActiveProxiesForDownload.queryOptions(),
			),
			context.queryClient.prefetchQuery(
				queryOrpcNext.ai.listModels.queryOptions({
					input: { kind: "llm", enabledOnly: true },
				}),
			),
			context.queryClient.prefetchQuery(
				queryOrpcNext.ai.getDefaultModel.queryOptions({
					input: { kind: "llm" },
				}),
			),
		])
	},
	component: ChannelsRoute,
})

function channelLabel(ch: ChannelRow): string {
	return (
		ch.title ||
		ch.channelId ||
		(ch.channelUrl ? ch.channelUrl.replace(/^https?:\/\//, "") : "") ||
		ch.id
	)
}

function toDateLabel(input: unknown): string {
	if (input instanceof Date) return input.toLocaleString()
	if (typeof input === "string" || typeof input === "number") {
		const d = new Date(input)
		if (!Number.isNaN(d.getTime())) return d.toLocaleString()
	}
	return ""
}

function ChannelsRoute() {
	const t = useTranslations("Channels.page")
	const tVideos = useTranslations("Channels.videos")

	const qc = useQueryClient()

	const [newInput, setNewInput] = React.useState("")
	const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})
	const [selectedProxyByChannel, setSelectedProxyByChannel] = React.useState<
		Record<string, string>
	>({})
	const [selectedModelByChannel, setSelectedModelByChannel] = React.useState<
		Record<string, ChatModelId>
	>({})
	const [translatedTitleMapByChannel, setTranslatedTitleMapByChannel] =
		React.useState<Record<string, Record<string, string>>>({})
	const [showTranslationByChannel, setShowTranslationByChannel] = React.useState<
		Record<string, boolean>
	>({})

	const channelsQuery = useQuery(queryOrpcNext.channel.listChannels.queryOptions({}))
	const channels = (channelsQuery.data?.channels ?? []) as ChannelRow[]

	const proxiesQuery = useQuery(queryOrpcNext.proxy.getActiveProxiesForDownload.queryOptions())
	const proxies = React.useMemo(() => {
		const raw =
			proxiesQuery.data?.proxies ?? [{ id: "none", name: "No Proxy", server: "", port: 0, protocol: "http" as const }]
		return raw.map((p) => ({
			id: p.id,
			name: p.name ?? p.server ?? p.id,
		}))
	}, [proxiesQuery.data?.proxies])

	const llmModelsQuery = useQuery(
		queryOrpcNext.ai.listModels.queryOptions({
			input: { kind: "llm", enabledOnly: true },
		}),
	)
	const llmDefaultQuery = useQuery(
		queryOrpcNext.ai.getDefaultModel.queryOptions({ input: { kind: "llm" } }),
	)

	const llmDefaultId =
		(llmDefaultQuery.data?.model?.id as ChatModelId | undefined) ??
		DEFAULT_CHAT_MODEL_ID

	const createMutation = useEnhancedMutation(
		queryOrpcNext.channel.createChannel.mutationOptions({
			onSuccess: async () => {
				setNewInput("")
				await qc.invalidateQueries({
					queryKey: queryOrpcNext.channel.listChannels.queryKey({}),
				})
			},
		}),
		{
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : t("deleteError", { message: "Unknown" }),
		},
	)

	const deleteMutation = useEnhancedMutation(
		queryOrpcNext.channel.deleteChannel.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpcNext.channel.listChannels.queryKey({}),
				})
				toast.success(t("deleteSuccess"))
			},
		}),
		{
			errorToast: ({ error }) =>
				t("deleteError", { message: error instanceof Error ? error.message : "Unknown" }),
		},
	)

	const startSyncMutation = useMutation(
		queryOrpcNext.channel.startCloudSync.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpcNext.channel.listChannels.queryKey({}),
				})
			},
		}),
	)

	const finalizeMutation = useEnhancedMutation(
		queryOrpcNext.channel.finalizeCloudSync.mutationOptions({
			onSuccess: async (_res, variables) => {
				await Promise.all([
					qc.invalidateQueries({
						queryKey: queryOrpcNext.channel.listChannels.queryKey({}),
					}),
					qc.invalidateQueries({
						queryKey: queryOrpcNext.channel.listChannelVideos.queryKey({
							input: { id: variables.id, limit: SYNC_VIDEO_LIMIT },
						}),
					}),
				])
				setExpanded((m) => ({ ...m, [variables.id]: true }))
			},
		}),
		{
			successToast: "Finalized",
			errorToast: ({ error }) => (error instanceof Error ? error.message : "Failed"),
		},
	)

	const translateMutation = useEnhancedMutation(
		queryOrpcNext.channel.translateVideoTitles.mutationOptions({
			onSuccess: (res, variables) => {
				const map: Record<string, string> = {}
				for (const item of res.items) {
					if (item.id && item.translation) map[String(item.id)] = item.translation
				}
				setTranslatedTitleMapByChannel((m) => ({ ...m, [variables.channelId]: map }))
				setShowTranslationByChannel((m) => ({ ...m, [variables.channelId]: true }))
			},
		}),
		{
			successToast: t("actions.translateSuccess"),
			errorToast: ({ error }) =>
				t("actions.translateError", {
					message: error instanceof Error ? error.message : "Unknown",
				}),
		},
	)

	return (
		<div className="min-h-screen bg-background selection:bg-primary/10 selection:text-primary">
			<div className="px-4 py-10 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-6xl space-y-6">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
						</div>
						<form
							onSubmit={(e) => {
								e.preventDefault()
								const trimmed = newInput.trim()
								if (!trimmed || createMutation.isPending) return
								createMutation.mutate({ channelUrlOrId: trimmed })
							}}
							className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center"
						>
							<Input
								value={newInput}
								onChange={(e) => setNewInput(e.target.value)}
								placeholder={t("inputPlaceholder")}
								className="h-10 w-full min-w-0 bg-background/50 backdrop-blur-sm border-border/50 focus:border-primary/50 transition-all sm:w-80"
							/>
							<Button
								type="submit"
								disabled={!newInput.trim() || createMutation.isPending}
								className="h-10 px-6 shadow-sm transition-all hover:shadow-md"
							>
								{createMutation.isPending ? t("adding") : t("add")}
							</Button>
						</form>
					</div>

					{channelsQuery.isLoading ? (
						<div className="py-20 text-center text-muted-foreground animate-pulse">
							{t("loading")}
						</div>
					) : null}

					{!channelsQuery.isLoading && channels.length === 0 ? (
						<div className="rounded-2xl border border-dashed border-border/50 bg-background/30 py-20 text-center text-muted-foreground backdrop-blur-sm">
							{t("empty")}
						</div>
					) : null}

					{channels.length > 0 ? (
						<div className="grid gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
							{channels.map((ch) => (
								<ChannelCard
									key={ch.id}
									ch={ch}
									proxies={proxies}
									selectedProxyId={
										selectedProxyByChannel[ch.id] ?? (ch.defaultProxyId || "none")
									}
									onSelectProxy={(v) =>
										setSelectedProxyByChannel((m) => ({ ...m, [ch.id]: v }))
									}
									modelOptions={(llmModelsQuery.data?.items ?? []).map((m) => ({
										id: m.id as ChatModelId,
										label: m.label,
									}))}
									selectedModel={selectedModelByChannel[ch.id] ?? llmDefaultId}
									onSelectModel={(v) =>
										setSelectedModelByChannel((m) => ({ ...m, [ch.id]: v }))
									}
									expanded={!!expanded[ch.id]}
									onToggleExpanded={() =>
										setExpanded((m) => ({ ...m, [ch.id]: !m[ch.id] }))
									}
									translatedTitleMap={translatedTitleMapByChannel[ch.id]}
									translationVisible={!!showTranslationByChannel[ch.id]}
									onToggleTranslation={() =>
										setShowTranslationByChannel((m) => ({ ...m, [ch.id]: !m[ch.id] }))
									}
									onDelete={() => {
										if (deleteMutation.isPending) return
										if (!confirm(t("deleteConfirm"))) return
										deleteMutation.mutate({ id: ch.id })
									}}
									deleting={deleteMutation.isPending}
									onSync={() => {
										const sel = selectedProxyByChannel[ch.id] ?? ch.defaultProxyId ?? "none"
										startSyncMutation.mutate({
											id: ch.id,
											limit: SYNC_VIDEO_LIMIT,
											proxyId: sel && sel !== "none" ? sel : undefined,
										})
									}}
									syncing={startSyncMutation.isPending}
									onFinalize={(jobId) => finalizeMutation.mutate({ id: ch.id, jobId })}
									finalizing={finalizeMutation.isPending}
									onTranslate={() =>
										translateMutation.mutate({
											channelId: ch.id,
											limit: SYNC_VIDEO_LIMIT,
											model: (selectedModelByChannel[ch.id] ?? llmDefaultId) as string,
										})
									}
									translating={translateMutation.isPending}
									tVideos={tVideos}
									t={t}
								/>
							))}
						</div>
					) : null}
				</div>
			</div>
		</div>
	)
}

type ProxyOption = {
	id: string
	name: string
}

function ChannelCard({
	ch,
	proxies,
	selectedProxyId,
	onSelectProxy,
	modelOptions,
	selectedModel,
	onSelectModel,
	expanded,
	onToggleExpanded,
	translatedTitleMap,
	translationVisible,
	onToggleTranslation,
	onDelete,
	deleting,
	onSync,
	syncing,
	onFinalize,
	finalizing,
	onTranslate,
	translating,
	t,
	tVideos,
}: {
	ch: ChannelRow
	proxies: ProxyOption[]
	selectedProxyId: string
	onSelectProxy: (id: string) => void
	modelOptions: { id: ChatModelId; label: string }[]
	selectedModel: ChatModelId
	onSelectModel: (id: ChatModelId) => void
	expanded: boolean
	onToggleExpanded: () => void
	translatedTitleMap?: Record<string, string>
	translationVisible: boolean
	onToggleTranslation: () => void
	onDelete: () => void
	deleting: boolean
	onSync: () => void
	syncing: boolean
	onFinalize: (jobId: string) => void
	finalizing: boolean
	onTranslate: () => void
	translating: boolean
	t: ReturnType<typeof useTranslations>
	tVideos: ReturnType<typeof useTranslations>
}) {
	const jobId = ch.lastJobId || null

	// Re-create query with polling only when jobId exists.
	const polledStatusQuery = useQuery({
		...queryOrpcNext.channel.getCloudSyncStatus.queryOptions({
			input: { jobId: jobId || "" },
		}),
		enabled: Boolean(jobId),
		refetchInterval: (q) => {
			const status = (q.state.data as any)?.status
			if (!status) return 1500
			return ["completed", "failed", "canceled"].includes(status) ? false : 1500
		},
	})

	const effectiveStatus = (polledStatusQuery.data as any)?.status ?? ch.lastSyncStatus ?? "idle"
	const effectivePhase = (polledStatusQuery.data as any)?.phase
	const effectiveProgress = (polledStatusQuery.data as any)?.progress
	const canFinalize = Boolean(jobId) && effectiveStatus === "completed"

	const videosQuery = useQuery({
		...queryOrpcNext.channel.listChannelVideos.queryOptions({
			input: { id: ch.id, limit: SYNC_VIDEO_LIMIT },
		}),
		enabled: expanded,
	})

	const videos = videosQuery.data?.videos ?? []

	const translationAvailable = Boolean(
		translatedTitleMap && Object.keys(translatedTitleMap).length,
	)
	const showTranslatedTitles = translationAvailable && translationVisible

	return (
		<div className="glass rounded-2xl p-5">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
				<div className="flex items-start gap-4">
					<div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-secondary/60">
						{ch.thumbnail ? (
							<img src={ch.thumbnail} alt="thumb" className="h-full w-full object-cover" />
						) : null}
					</div>
					<div className="min-w-0">
						<div className="truncate text-lg font-semibold">{channelLabel(ch)}</div>
						<div className="mt-1 break-all text-xs text-muted-foreground">{ch.channelUrl}</div>
						<div className="mt-2 flex flex-wrap items-center gap-2">
							{jobId ? (
								<CloudJobProgress
									status={effectiveStatus}
									phase={effectivePhase}
									progress={typeof effectiveProgress === "number" ? effectiveProgress : null}
									jobId={jobId}
									mediaId={ch.id}
									showIds={false}
								/>
							) : null}
							{ch.lastSyncedAt ? (
								<span className="text-xs text-muted-foreground">
									{toDateLabel(ch.lastSyncedAt)}
								</span>
							) : null}
						</div>
					</div>
				</div>

				<div className="grid w-full gap-3 lg:w-[520px]">
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div className="space-y-1">
							<div className="text-xs font-medium text-muted-foreground">{t("actions.syncTitle")}</div>
							<Select
								name={`proxy-${ch.id}`}
								value={selectedProxyId}
								onValueChange={onSelectProxy}
								disabled={syncing}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Proxy" />
								</SelectTrigger>
								<SelectContent>
									{proxies.map((p) => (
										<SelectItem key={p.id} value={p.id}>
											{p.name || p.id}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<div className="text-[11px] text-muted-foreground">{t("actions.syncDesc")}</div>
						</div>

						<div className="space-y-1">
							<div className="text-xs font-medium text-muted-foreground">{t("actions.translateTitle")}</div>
							<Select
								name={`model-${ch.id}`}
								value={selectedModel}
								onValueChange={(v) => onSelectModel(v as ChatModelId)}
								disabled={translating}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder={t("actions.model")} />
								</SelectTrigger>
								<SelectContent>
									{modelOptions.map((m) => (
										<SelectItem key={m.id} value={m.id}>
											{m.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<div className="text-[11px] text-muted-foreground">{t("actions.translateDesc")}</div>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<Button variant="secondary" onClick={onToggleExpanded}>
							{expanded ? (
								<>
									<ChevronUp className="mr-2 h-4 w-4" />
									{t("actions.hide")}
								</>
							) : (
								<>
									<ChevronDown className="mr-2 h-4 w-4" />
									{t("actions.view")}
								</>
							)}
						</Button>

						<Button variant="secondary" onClick={onSync} disabled={syncing}>
							{syncing ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									{t("actions.syncing")}
								</>
							) : (
								t("actions.sync")
							)}
						</Button>

						<Button variant="secondary" onClick={onTranslate} disabled={translating}>
							{translating ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									{t("actions.translating")}
								</>
							) : (
								t("actions.translate")
							)}
						</Button>

						{translationAvailable ? (
							<Button variant="ghost" onClick={onToggleTranslation}>
								{translationVisible
									? t("actions.hideTranslation")
									: t("actions.showTranslation")}
							</Button>
						) : null}

						{canFinalize ? (
							<Button
								variant="secondary"
								disabled={finalizing}
								onClick={() => onFinalize(jobId!)}
							>
								Finalize
							</Button>
						) : null}

						<Button variant="destructive" onClick={onDelete} disabled={deleting}>
							<Trash2 className="mr-2 h-4 w-4" />
							Delete
						</Button>
					</div>
				</div>
			</div>

			{expanded ? (
				<div className="mt-4 rounded-xl border border-border/40 bg-background/40">
					{videosQuery.isLoading ? (
						<div className="p-3 text-sm text-muted-foreground">{tVideos("loading")}</div>
					) : null}

					{!videosQuery.isLoading && videos.length === 0 ? (
						<div className="p-3 text-sm text-muted-foreground">{tVideos("empty")}</div>
					) : null}

					{videos.length > 0 ? (
						<div className="divide-y">
							{videos.map((v) => {
								const translated = showTranslatedTitles
									? translatedTitleMap?.[v.id]
									: undefined
								return (
									<div key={v.id} className="flex items-center gap-3 p-3">
										{v.thumbnail ? (
											<img
												src={v.thumbnail}
												alt="thumb"
												className="h-8 w-14 rounded object-cover"
												loading="lazy"
											/>
										) : (
											<div className="h-8 w-14 rounded bg-muted" />
										)}
										<div className="min-w-0 flex-1">
											<div className="truncate text-sm font-medium">{translated ?? v.title}</div>
											{translated ? (
												<div className="truncate text-xs text-muted-foreground">
													{tVideos("original", { title: v.title })}
												</div>
											) : null}
											<div className="truncate text-xs text-muted-foreground">{v.url}</div>
										</div>
										<a href={v.url} target="_blank" rel="noreferrer">
											<Button size="sm" variant="ghost">
												{tVideos("open")}
											</Button>
										</a>
									</div>
								)
							})}
						</div>
					) : null}
				</div>
			) : null}
		</div>
	)
}
