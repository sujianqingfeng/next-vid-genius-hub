'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Loader2, Trash2 } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { CloudJobProgress } from '~/components/business/jobs/cloud-job-progress'
import { useConfirmDialog } from '~/components/business/layout/confirm-dialog-provider'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { type ChatModelId, DEFAULT_CHAT_MODEL_ID } from '~/lib/ai/models'
import { getUserFriendlyErrorMessage } from '~/lib/errors/client'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { getBcp47Locale, useLocale, useTranslations } from '~/lib/i18n'
import { queryOrpc } from '~/lib/orpc/client'

type ChannelRow = {
	id: string
	title: string | null
	channelUrl: string
	channelId: string | null
	thumbnail: string | null
	defaultProxyId: string | null
	lastSyncedAt: Date | null
	lastSyncStatus: 'queued' | 'running' | 'completed' | 'failed' | null
	lastJobId: string | null
}

const SYNC_VIDEO_LIMIT = 20

function channelLabel(ch: ChannelRow): string {
	return (
		ch.title ||
		ch.channelId ||
		(ch.channelUrl ? ch.channelUrl.replace(/^https?:\/\//, '') : '') ||
		ch.id
	)
}

function toDateLabel(input: unknown, locale: string): string {
	if (input instanceof Date) return input.toLocaleString(locale)
	if (typeof input === 'string' || typeof input === 'number') {
		const d = new Date(input)
		if (!Number.isNaN(d.getTime())) return d.toLocaleString(locale)
	}
	return ''
}

type ProxyOption = {
	id: string
	name: string
	testStatus?: 'pending' | 'success' | 'failed' | null
	responseTime?: number | null
}

export function ChannelsPage() {
	const t = useTranslations('Channels.page')
	const tVideos = useTranslations('Channels.videos')
	const tProxySelector = useTranslations('Proxy.selector')
	const tCommon = useTranslations('Common')
	const locale = useLocale()
	const dateLocale = getBcp47Locale(locale)

	const qc = useQueryClient()
	const confirmDialog = useConfirmDialog()

	const [newInput, setNewInput] = React.useState('')
	const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})
	const [selectedProxyByChannel, setSelectedProxyByChannel] = React.useState<
		Record<string, string>
	>({})
	const [selectedModelByChannel, setSelectedModelByChannel] = React.useState<
		Record<string, ChatModelId>
	>({})
	const [translatedTitleMapByChannel, setTranslatedTitleMapByChannel] =
		React.useState<Record<string, Record<string, string>>>({})
	const [showTranslationByChannel, setShowTranslationByChannel] =
		React.useState<Record<string, boolean>>({})

	const channelsQuery = useQuery(
		queryOrpc.channel.listChannels.queryOptions({}),
	)
	const channels = (channelsQuery.data?.channels ?? []) as ChannelRow[]

	const proxiesQuery = useQuery(
		queryOrpc.proxy.getActiveProxiesForDownload.queryOptions(),
	)
	const rawProxyRows = (proxiesQuery.data?.proxies ?? [
		{
			id: 'none',
			name: 'No Proxy',
			server: '',
			port: 0,
			protocol: 'http' as const,
			testStatus: null,
			responseTime: null,
		},
	]) as Array<{
		id: string
		name?: string | null
		server?: string | null
		testStatus?: 'pending' | 'success' | 'failed' | null
		responseTime?: number | null
	}>

	const successProxyIds = React.useMemo(
		() =>
			new Set(
				rawProxyRows
					.filter((p) => p.id !== 'none' && p.testStatus === 'success')
					.map((p) => p.id),
			),
		[rawProxyRows],
	)
	const hasSuccessProxy = successProxyIds.size > 0

	const proxies = React.useMemo(() => {
		const raw = (proxiesQuery.data?.proxies ?? [
			{
				id: 'none',
				name: 'No Proxy',
				server: '',
				port: 0,
				protocol: 'http' as const,
				testStatus: null,
				responseTime: null,
			},
		]) as Array<{
			id: string
			name?: string | null
			server?: string | null
			testStatus?: 'pending' | 'success' | 'failed' | null
			responseTime?: number | null
		}>

		return raw.map((p) => ({
			id: p.id,
			name:
				p.id === 'none' ? tProxySelector('auto') : (p.name ?? p.server ?? p.id),
			testStatus: p.testStatus,
			responseTime: p.responseTime,
		}))
	}, [proxiesQuery.data?.proxies, tProxySelector])

	const llmModelsQuery = useQuery(
		queryOrpc.ai.listModels.queryOptions({
			input: { kind: 'llm', enabledOnly: true },
		}),
	)
	const llmDefaultQuery = useQuery(
		queryOrpc.ai.getDefaultModel.queryOptions({ input: { kind: 'llm' } }),
	)

	const llmDefaultId =
		(llmDefaultQuery.data?.model?.id as ChatModelId | undefined) ??
		DEFAULT_CHAT_MODEL_ID

	const createMutation = useEnhancedMutation(
		queryOrpc.channel.createChannel.mutationOptions({
			onSuccess: async () => {
				setNewInput('')
				await qc.invalidateQueries({
					queryKey: queryOrpc.channel.listChannels.queryKey({}),
				})
			},
		}),
			{
				errorToast: ({ error }) =>
					error instanceof Error
						? error.message
						: t('deleteError', { message: tCommon('fallback.unknown') }),
			},
		)

	const deleteMutation = useEnhancedMutation(
		queryOrpc.channel.deleteChannel.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.channel.listChannels.queryKey({}),
				})
				toast.success(t('deleteSuccess'))
			},
		}),
			{
				errorToast: ({ error }) =>
					t('deleteError', {
						message:
							error instanceof Error ? error.message : tCommon('fallback.unknown'),
					}),
			},
		)

	const startSyncMutation = useEnhancedMutation(
		queryOrpc.channel.startCloudSync.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.channel.listChannels.queryKey({}),
				})
			},
		}),
		{
			errorToast: ({ error }) => getUserFriendlyErrorMessage(error),
		},
	)

	const translateMutation = useEnhancedMutation(
		queryOrpc.channel.translateVideoTitles.mutationOptions({
			onSuccess: (res, variables) => {
				const map: Record<string, string> = {}
				for (const item of res.items) {
					if (item.id && item.translation)
						map[String(item.id)] = item.translation
				}
				setTranslatedTitleMapByChannel((m) => ({
					...m,
					[variables.channelId]: map,
				}))
				setShowTranslationByChannel((m) => ({
					...m,
					[variables.channelId]: true,
				}))
			},
		}),
			{
				successToast: t('actions.translateSuccess'),
				errorToast: ({ error }) =>
					t('actions.translateError', {
						message:
							error instanceof Error ? error.message : tCommon('fallback.unknown'),
					}),
			},
		)

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

						<form
							onSubmit={(e) => {
								e.preventDefault()
								const trimmed = newInput.trim()
								if (!trimmed || createMutation.isPending) return
								createMutation.mutate({ channelUrlOrId: trimmed })
							}}
							className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center"
						>
							<div className="relative">
								<Input
									value={newInput}
									onChange={(e) => setNewInput(e.target.value)}
									placeholder={t('inputPlaceholder')}
									className="h-9 w-full min-w-0 rounded-none border-border bg-background font-mono text-xs sm:w-80"
								/>
								<div className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[8px] uppercase text-muted-foreground opacity-50 pointer-events-none">
									BUFFER_IN
								</div>
							</div>
							<Button
								type="submit"
								disabled={!newInput.trim() || createMutation.isPending}
								className="h-9 rounded-none font-mono text-xs uppercase tracking-widest px-6"
							>
								{createMutation.isPending ? t('adding') : `[ ${t('add')} ]`}
							</Button>
						</form>
					</div>
				</div>
			</div>

			<div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
				<div className="space-y-6">
					{channelsQuery.isLoading ? (
						<div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground py-12">
							<Loader2 className="h-3 w-3 animate-spin" />
							Syncing_Subscribed_Nodes...
						</div>
					) : null}

					{!channelsQuery.isLoading && channels.length === 0 ? (
						<div className="border border-dashed border-border p-12 text-center">
							<div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
								{t('empty')}
							</div>
						</div>
					) : null}

					{channels.length > 0 ? (
						<div className="grid gap-6">
							{channels.map((ch) => (
								<ChannelCard
									key={ch.id}
									ch={ch}
									proxies={proxies}
									successProxyIds={successProxyIds}
									hasSuccessProxy={hasSuccessProxy}
									selectedProxyId={
										selectedProxyByChannel[ch.id] ??
										(ch.defaultProxyId && successProxyIds.has(ch.defaultProxyId)
											? ch.defaultProxyId
											: 'none')
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
										setShowTranslationByChannel((m) => ({
											...m,
											[ch.id]: !m[ch.id],
										}))
									}
									onDelete={() => {
										if (deleteMutation.isPending) return
										void (async () => {
											const ok = await confirmDialog({
												description: t('deleteConfirm'),
												variant: 'destructive',
											})
											if (!ok) return
											deleteMutation.mutate({ id: ch.id })
										})()
									}}
									deleting={deleteMutation.isPending}
									onSync={() => {
										if (!hasSuccessProxy) return
										const sel =
											selectedProxyByChannel[ch.id] ??
											(ch.defaultProxyId &&
											successProxyIds.has(ch.defaultProxyId)
												? ch.defaultProxyId
												: null) ??
											'none'
										startSyncMutation.mutate({
											id: ch.id,
											limit: SYNC_VIDEO_LIMIT,
											proxyId: sel && sel !== 'none' ? sel : undefined,
										})
										}}
										syncing={startSyncMutation.isPending}
										onTranslate={() =>
											translateMutation.mutate({
												channelId: ch.id,
												limit: SYNC_VIDEO_LIMIT,
											model: (selectedModelByChannel[ch.id] ??
												llmDefaultId) as string,
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

function ChannelCard({
	ch,
	proxies,
	successProxyIds,
	hasSuccessProxy,
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
		onTranslate,
		translating,
		t,
		tVideos,
}: {
	ch: ChannelRow
	proxies: ProxyOption[]
	successProxyIds: ReadonlySet<string>
	hasSuccessProxy: boolean
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
	onTranslate: () => void
	translating: boolean
	t: ReturnType<typeof useTranslations>
	tVideos: ReturnType<typeof useTranslations>
}) {
	const jobId = ch.lastJobId || null
	const qc = useQueryClient()
	const tProxySelector = useTranslations('Proxy.selector')

	const polledStatusQuery = useQuery({
		...queryOrpc.channel.getCloudSyncStatus.queryOptions({
			input: { jobId: jobId || '' },
		}),
		enabled: Boolean(jobId),
		refetchInterval: (q) => {
			const status = (q.state.data as any)?.status
			if (!status) return 1500
			return ['completed', 'failed', 'canceled'].includes(status) ? false : 1500
		},
	})

	const effectiveStatus =
		(polledStatusQuery.data as any)?.status ?? ch.lastSyncStatus ?? 'idle'
	const effectivePhase = (polledStatusQuery.data as any)?.phase
	const effectiveProgress = (polledStatusQuery.data as any)?.progress
	const lastRefreshedJobIdRef = React.useRef<string | null>(null)

	const videosQuery = useQuery({
		...queryOrpc.channel.listChannelVideos.queryOptions({
			input: { id: ch.id, limit: SYNC_VIDEO_LIMIT },
		}),
		enabled: expanded,
	})

	React.useEffect(() => {
		if (!jobId) return
		if (effectiveStatus !== 'completed') return
		if (lastRefreshedJobIdRef.current === jobId) return
		lastRefreshedJobIdRef.current = jobId

		void (async () => {
			await qc.invalidateQueries({
				queryKey: queryOrpc.channel.listChannels.queryKey({}),
			})
			if (expanded) {
				await qc.invalidateQueries({
					queryKey: queryOrpc.channel.listChannelVideos.queryKey({
						input: { id: ch.id, limit: SYNC_VIDEO_LIMIT },
					}),
				})
			}
		})()
	}, [ch.id, effectiveStatus, expanded, jobId, qc])

	const videos = videosQuery.data?.videos ?? []

	const translationAvailable = Boolean(
		translatedTitleMap && Object.keys(translatedTitleMap).length,
	)
	const showTranslatedTitles = translationAvailable && translationVisible

	const isError = effectiveStatus === 'failed'
	const isSuccess = effectiveStatus === 'completed'

	return (
		<div className="border border-border bg-card">
			<div className="flex flex-col gap-6 p-5 lg:flex-row lg:items-start lg:justify-between">
				<div className="flex items-start gap-5">
					<div className="h-16 w-16 shrink-0 border border-border bg-muted p-0.5">
						{ch.thumbnail ? (
							<img
								src={ch.thumbnail}
								alt="thumb"
								className="h-full w-full object-cover grayscale"
							/>
						) : (
							<div className="h-full w-full flex items-center justify-center font-mono text-xs font-bold text-muted-foreground">
								NO_IMG
							</div>
						)}
					</div>
					<div className="min-w-0 space-y-2">
						<div className="truncate font-mono text-lg font-bold uppercase tracking-tight">
							{channelLabel(ch)}
						</div>
						<div className="flex flex-col gap-1">
							<div className="break-all font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
								URI: <span className="text-foreground">{ch.channelUrl}</span>
							</div>
							<div className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
								NODE_ID: <span className="text-foreground">{ch.id}</span>
							</div>
						</div>
						<div className="flex flex-wrap items-center gap-3">
							<div
								className={`px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider border ${
									isError
										? 'bg-destructive/10 border-destructive/20 text-destructive'
										: isSuccess
											? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
											: 'bg-primary/5 border-primary/10 text-primary'
								}`}
							>
								STATUS: {effectiveStatus}
							</div>
							{jobId && (
								<CloudJobProgress
									status={effectiveStatus}
									phase={effectivePhase}
									progress={
										typeof effectiveProgress === 'number'
											? effectiveProgress
											: null
									}
									jobId={jobId}
									mediaId={ch.id}
									showIds={false}
								/>
							)}
							{ch.lastSyncedAt && (
								<span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground border-l border-border pl-3">
									{t('ui.labels.lastSync', {
										datetime: toDateLabel(ch.lastSyncedAt, dateLocale),
									})}
								</span>
							)}
						</div>
					</div>
				</div>

				<div className="grid w-full gap-4 lg:w-[560px]">
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<div className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
								{t('actions.syncTitle')}
							</div>
							<Select
								name={`proxy-${ch.id}`}
								value={selectedProxyId}
								onValueChange={onSelectProxy}
								disabled={syncing}
							>
								<SelectTrigger className="h-9 rounded-none border-border font-mono text-[10px] uppercase">
									<SelectValue
										placeholder={tProxySelector('selectPlaceholder')}
									/>
								</SelectTrigger>
								<SelectContent className="rounded-none">
									{proxies.map((p) => (
										<SelectItem
											key={p.id}
											value={p.id}
											disabled={p.id !== 'none' && !successProxyIds.has(p.id)}
											className="font-mono text-[10px] uppercase"
										>
											<span className="flex w-full items-center justify-between gap-3">
												<span className="truncate">{p.name || p.id}</span>
												{p.id !== 'none' && (
													<span className="text-[8px] opacity-50">
														[{p.responseTime}ms]
													</span>
												)}
											</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{!hasSuccessProxy && (
								<div className="font-mono text-[9px] uppercase text-destructive">
									!! {tProxySelector('noneAvailable')}
								</div>
							)}
						</div>

						<div className="space-y-2">
							<div className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
								{t('actions.translateTitle')}
							</div>
							<Select
								name={`model-${ch.id}`}
								value={selectedModel}
								onValueChange={(v) => onSelectModel(v as ChatModelId)}
								disabled={translating}
							>
								<SelectTrigger className="h-9 rounded-none border-border font-mono text-[10px] uppercase">
									<SelectValue placeholder={t('actions.model')} />
								</SelectTrigger>
								<SelectContent className="rounded-none">
									{modelOptions.map((m) => (
										<SelectItem
											key={m.id}
											value={m.id}
											className="font-mono text-[10px] uppercase"
										>
											{m.label.replace(/\s+/g, '_')}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
						<Button
							variant="outline"
							size="sm"
							onClick={onToggleExpanded}
							className="rounded-none font-mono text-[10px] uppercase tracking-widest h-8"
						>
							{expanded ? (
								<>
									<ChevronUp className="mr-2 h-3 w-3" />
									CLOSE_LIST
								</>
							) : (
								<>
									<ChevronDown className="mr-2 h-3 w-3" />
									FETCH_LIST
								</>
							)}
						</Button>

						<Button
							variant="outline"
							size="sm"
							onClick={onSync}
							disabled={syncing || !hasSuccessProxy}
							className="rounded-none font-mono text-[10px] uppercase tracking-widest h-8"
						>
							{syncing ? (
								<>
									<Loader2 className="mr-2 h-3 w-3 animate-spin" />
									SYNCING...
								</>
							) : (
								`[ ${t('actions.sync')} ]`
							)}
						</Button>

						<Button
							variant="outline"
							size="sm"
							onClick={onTranslate}
							disabled={translating}
							className="rounded-none font-mono text-[10px] uppercase tracking-widest h-8"
						>
							{translating ? (
								<>
									<Loader2 className="mr-2 h-3 w-3 animate-spin" />
									TRANSLATING...
								</>
							) : (
								`[ ${t('actions.translate')} ]`
							)}
						</Button>

							{translationAvailable && (
								<Button
									variant="ghost"
									size="sm"
									onClick={onToggleTranslation}
									className="rounded-none font-mono text-[10px] uppercase tracking-widest h-8"
								>
									{translationVisible ? 'HIDE_TRANSL' : 'SHOW_TRANSL'}
								</Button>
							)}

							<Button
								variant="ghost"
								size="sm"
							onClick={onDelete}
							disabled={deleting}
							className="rounded-none font-mono text-[10px] uppercase tracking-widest h-8 text-destructive ml-auto"
						>
							<Trash2 className="mr-2 h-3 w-3" />
							PURGE
						</Button>
					</div>
				</div>
			</div>

			{expanded && (
				<div className="border-t border-border bg-muted/5">
					<div className="border-b border-border bg-muted/10 px-4 py-1.5 flex justify-between items-center">
						<span className="font-mono text-[8px] uppercase tracking-[0.3em] text-muted-foreground">
							Local_Video_Cache_Stream
						</span>
						<span className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground opacity-50">
							SYNC_LIMIT: {SYNC_VIDEO_LIMIT}
						</span>
					</div>

					{videosQuery.isLoading ? (
						<div className="p-6 font-mono text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-3">
							<Loader2 className="h-3 w-3 animate-spin" />
							Polling_Stream_Data...
						</div>
					) : null}

					{!videosQuery.isLoading && videos.length === 0 ? (
						<div className="p-8 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground opacity-50">
							{tVideos('empty')}
						</div>
					) : null}

					{videos.length > 0 ? (
						<div className="divide-y divide-border">
							{videos.map((v) => {
								const translated = showTranslatedTitles
									? translatedTitleMap?.[v.id]
									: undefined
								return (
									<div
										key={v.id}
										className="group flex items-center gap-4 p-3 transition-colors hover:bg-muted/20"
									>
										<div className="h-10 w-16 shrink-0 border border-border overflow-hidden bg-muted">
											{v.thumbnail ? (
												<img
													src={v.thumbnail}
													alt="thumb"
													className="h-full w-full object-cover grayscale opacity-80 group-hover:opacity-100 transition-opacity"
													loading="lazy"
												/>
											) : null}
										</div>
										<div className="min-w-0 flex-1 space-y-0.5">
											<div className="truncate font-mono text-xs font-bold uppercase tracking-tight">
												{translated ?? v.title}
											</div>
											{translated ? (
												<div className="truncate font-mono text-[9px] text-muted-foreground uppercase opacity-70">
													ORIG: {v.title}
												</div>
											) : (
												<div className="truncate font-mono text-[9px] text-muted-foreground uppercase opacity-70 tracking-tighter">
													URI: {v.url}
												</div>
											)}
										</div>
										<a
											href={v.url}
											target="_blank"
											rel="noreferrer"
											className="flex-shrink-0"
										>
											<Button
												size="sm"
												variant="outline"
												className="rounded-none font-mono text-[9px] uppercase tracking-widest h-7"
											>
												OPEN_URI
											</Button>
										</a>
									</div>
								)
							})}
						</div>
					) : null}

					<div className="border-t border-border bg-muted/5 px-4 py-1.5 font-mono text-[8px] uppercase tracking-widest text-muted-foreground text-right">
						Cache_Terminal_Active
					</div>
				</div>
			)}
		</div>
	)
}
