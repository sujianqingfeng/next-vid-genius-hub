'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { PageHeader } from '~/components/business/layout/page-header'
import { WorkspacePageShell } from '~/components/business/layout/workspace-page-shell'
import { ChannelVideoList } from '~/components/business/channels/channel-video-list'
import { ChatModelSelect } from '~/components/business/media/subtitles/ChatModelSelect'
import { ProxySelector } from '~/components/business/proxy/proxy-selector'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import {
	ChatModelIds,
	DEFAULT_CHAT_MODEL_ID,
	type ChatModelId,
} from '~/lib/ai/models'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { queryOrpc } from '~/lib/orpc/query-client'
import { TERMINAL_JOB_STATUSES } from '~/lib/job/status'
import { useConfirmDialog } from '~/components/business/layout/confirm-dialog-provider'

export default function ChannelsPage() {
	const t = useTranslations('Channels.page')
	const confirmDialog = useConfirmDialog()
	const qc = useQueryClient()
	const [newInput, setNewInput] = React.useState('')
	const [jobMap, setJobMap] = React.useState<Record<string, string>>({})
	const [statusMap, setStatusMap] = React.useState<Record<string, string>>({})
	const [selectedProxyByChannel, setSelectedProxyByChannel] = React.useState<
		Record<string, string>
	>({})
	const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})
	const defaultChannelModel = React.useMemo<ChatModelId>(() => {
		const configured =
			ChatModelIds.find((id) => id === DEFAULT_CHAT_MODEL_ID) ??
			ChatModelIds[0]
		return (configured ?? DEFAULT_CHAT_MODEL_ID) as ChatModelId
	}, [])
	const [selectedModelByChannel, setSelectedModelByChannel] = React.useState<
		Record<string, ChatModelId>
	>({})

	const listQuery = useQuery(queryOrpc.channel.listChannels.queryOptions({}))

	const createMutation = useMutation(
		queryOrpc.channel.createChannel.mutationOptions({
			onSuccess: () => {
				qc.invalidateQueries({
					queryKey: queryOrpc.channel.listChannels.queryKey({}),
				})
				setNewInput('')
			},
		}),
	)

	const deleteMutation = useMutation(
		queryOrpc.channel.deleteChannel.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.channel.listChannels.queryKey({}),
				})
				toast.success(t('deleteSuccess'))
			},
			onError: (error) => {
				toast.error(t('deleteError', { message: error.message }))
			},
		}),
	)

	const startSyncMutation = useMutation(
		queryOrpc.channel.startCloudSync.mutationOptions({
			onSuccess: (res, variables) => {
				const id = variables.id as string
				setJobMap((m) => ({ ...m, [id]: res.jobId }))
				setStatusMap((m) => ({ ...m, [id]: 'queued' }))
			},
		}),
	)

	const finalizeMutation = useMutation(
		queryOrpc.channel.finalizeCloudSync.mutationOptions({
			onSuccess: async (_res, variables) => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.channel.listChannels.queryKey({}),
				})
				const id = variables?.id as string | undefined
				if (id) {
					// refresh this channel's video list if it's open elsewhere
					await qc.invalidateQueries({
						queryKey: queryOrpc.channel.listChannelVideos.queryKey({
							input: { id, limit: 20 },
						}),
					})
					// auto-expand to show freshly synced list
					setExpanded((m) => ({ ...m, [id]: true }))
					setJobMap((m) => {
						const next = { ...m }
						delete next[id]
						return next
					})
				}
			},
		}),
	)

	const setStatusFor = React.useCallback((id: string, status: string) => {
		setStatusMap((m) => ({ ...m, [id]: status }))
	}, [])

	const finalizeJob = React.useCallback(
		(id: string, jobId: string) => {
			finalizeMutation.mutate({ id, jobId })
		},
		[finalizeMutation],
	)

	const handleDeleteChannel = React.useCallback(
		async (channelId: string) => {
			if (deleteMutation.isPending) return
			const confirmed = await confirmDialog({
				description: t('deleteConfirm'),
				variant: 'destructive',
			})
			if (!confirmed) return
			deleteMutation.mutate({ id: channelId })
		},
		[confirmDialog, deleteMutation, t],
	)

	const handleAddChannel = React.useCallback(
		(event?: React.FormEvent<HTMLFormElement>) => {
			event?.preventDefault()
			const trimmed = newInput.trim()
			if (!trimmed || createMutation.isPending) return
			createMutation.mutate({ channelUrlOrId: trimmed })
		},
		[createMutation, newInput],
	)

	return (
		<WorkspacePageShell
			header={
				<PageHeader
					backHref="/"
					showBackButton={false}
					title={t('title')}
					rightContent={
						<form
							onSubmit={handleAddChannel}
							className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center"
						>
							<Input
								value={newInput}
								onChange={(e) => setNewInput(e.target.value)}
								placeholder={t('inputPlaceholder')}
								className="h-10 w-full min-w-0 bg-background/50 backdrop-blur-sm border-border/50 focus:border-primary/50 transition-all sm:w-80"
							/>
							<Button
								type="submit"
								disabled={!newInput.trim() || createMutation.isPending}
								className="h-10 px-6 shadow-sm transition-all hover:shadow-md"
							>
								{createMutation.isPending ? t('adding') : t('add')}
							</Button>
						</form>
					}
				/>
			}
		>
			<main className="mx-auto max-w-6xl space-y-6">
				{listQuery.isLoading && (
					<div className="py-20 text-center text-muted-foreground animate-pulse">
						{t('loading')}
					</div>
				)}

				{!!listQuery.data?.channels?.length && (
					<div className="grid gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
						{listQuery.data.channels.map((ch: ChannelCardProps['ch']) => (
							<ChannelCard
								key={ch.id}
								ch={ch}
								selectedProxyId={
									selectedProxyByChannel[ch.id] ?? (ch.defaultProxyId || 'none')
								}
								selectedModel={
									selectedModelByChannel[ch.id] ?? defaultChannelModel
								}
								onSelectProxy={(v) =>
									setSelectedProxyByChannel((m) => ({ ...m, [ch.id]: v }))
								}
								onSelectModel={(v) =>
									setSelectedModelByChannel((m) => ({ ...m, [ch.id]: v }))
								}
								jobId={jobMap[ch.id]}
								status={statusMap[ch.id] ?? ch.lastSyncStatus}
								setStatus={(s) => setStatusFor(ch.id, s)}
								onSync={() => {
									const sel = selectedProxyByChannel[ch.id]
									startSyncMutation.mutate({
										id: ch.id,
										limit: 20,
										proxyId: sel && sel !== 'none' ? sel : undefined,
									})
								}}
								onFinalize={() => {
									const jid = jobMap[ch.id]
									if (jid) finalizeJob(ch.id, jid)
								}}
								expanded={!!expanded[ch.id]}
								onToggleExpanded={() =>
									setExpanded((m) => ({
										...m,
										[ch.id]: !m[ch.id],
											}))
										}
										onDelete={() => {
											void handleDeleteChannel(ch.id)
										}}
								deleting={deleteMutation.isPending}
							/>
						))}
					</div>
				)}

				{!listQuery.isLoading && !listQuery.data?.channels?.length && (
					<div className="rounded-2xl border border-dashed border-border/50 bg-background/30 py-20 text-center text-muted-foreground backdrop-blur-sm">
						{t('empty')}
					</div>
				)}
			</main>
		</WorkspacePageShell>
	)
}

interface ChannelCardProps {
	ch: {
		id: string
		title: string | null
		channelUrl: string
		channelId: string | null
		thumbnail: string | null
		defaultProxyId: string | null
		lastSyncStatus: string | null
	}
	selectedProxyId: string
	selectedModel: ChatModelId
	onSelectProxy: (v: string) => void
	onSelectModel: (v: ChatModelId) => void
	jobId?: string
	status?: string
	setStatus: (s: string) => void
	onSync: () => void
	onFinalize: () => void
	expanded: boolean
	onToggleExpanded: () => void
	onDelete: () => void
	deleting?: boolean
}

function ChannelCard({
	ch,
	selectedProxyId,
	selectedModel,
	onSelectProxy,
	onSelectModel,
	jobId,
	status,
	setStatus,
	onSync,
	onFinalize,
	expanded,
	onToggleExpanded,
	onDelete,
	deleting,
}: ChannelCardProps) {
	const t = useTranslations('Channels.page')
	const finalizeAttemptedRef = React.useRef(false)
	const [translatedMap, setTranslatedMap] = React.useState<Record<
		string,
		string
	> | null>(null)
	const [showTranslated, setShowTranslated] = React.useState(false)
	// Always call useQuery in same order
	const statusQuery = useQuery({
		...(jobId
			? queryOrpc.channel.getCloudSyncStatus.queryOptions({ input: { jobId } })
			: {
					queryKey: ['channel.noop', ch.id],
					queryFn: async () => null,
				}),
		enabled: !!jobId,
		refetchInterval: (q) => {
			if (!jobId) return false
			const s = (q.state?.data as { status?: string })?.status
			if (!s) return 1500
			return s && TERMINAL_JOB_STATUSES.includes(s) ? false : 1500
		},
	})
	const statusValue = (statusQuery?.data as { status?: string } | null)?.status

	// Only propagate status changes when the value actually changes to avoid update loops.
	React.useEffect(() => {
		const s = statusValue
		// Guard: update parent status map only when it differs from current prop
		if (s && s !== status) {
			setStatus(s)
		}
		if (s === 'completed' && jobId && !finalizeAttemptedRef.current) {
			finalizeAttemptedRef.current = true
			onFinalize()
		}
	}, [statusValue, jobId, status, setStatus, onFinalize])

	const translateMutation = useEnhancedMutation(
		queryOrpc.channel.translateVideoTitles.mutationOptions({
			onSuccess: (res) => {
				const map = Object.fromEntries(
					(res.items ?? []).map(
						(i: { id: string; translation: string }) => [i.id, i.translation],
					),
				)
				setTranslatedMap(map)
				// auto show translated when finished
				setShowTranslated(true)
			},
		}),
		{
			successToast: t('actions.translateSuccess'),
			errorToast: ({ error }) =>
				t('actions.translateError', { message: error.message }),
		},
	)

	const statusLabel = React.useMemo(() => {
		if (!status) return t('status.idle')
		const key = status.replace(/_/g, ' ')
		return t(`status.${status as keyof typeof STATUS_COLOR}`, {
			defaultValue: key,
		})
	}, [status, t])

	const isSyncing = status === 'running' || status === 'queued'

	return (
		<article className="glass rounded-2xl p-6 transition-all duration-300 hover:shadow-lg hover:bg-white/60 group">
			<div className="flex flex-col gap-8">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex min-w-0 items-center gap-4">
						{ch.thumbnail ? (
							// eslint-disable-next-line @next/next/no-img-element
							<img
								src={ch.thumbnail}
								alt="Channel thumbnail"
								className="h-14 w-14 rounded-xl object-cover shadow-sm ring-1 ring-border/50"
							/>
						) : (
							<div
								className="h-14 w-14 rounded-xl bg-secondary/50 ring-1 ring-border/50 flex items-center justify-center"
								aria-hidden="true"
							>
								<span className="text-2xl font-bold text-muted-foreground/30">
									{(ch.title || ch.id).charAt(0).toUpperCase()}
								</span>
							</div>
						)}
						<div className="min-w-0 space-y-1">
							<p className="truncate text-lg font-semibold tracking-tight text-foreground">
								{ch.title || ch.channelUrl || ch.channelId || ch.id}
							</p>
							<p className="truncate text-sm text-muted-foreground font-light">
								{ch.channelUrl}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-3">
						<Button 
							size="sm" 
							variant="outline" 
							onClick={onToggleExpanded}
							className="bg-transparent border-border/50 hover:bg-secondary/50 transition-colors"
						>
							{expanded ? t('actions.hide') : t('actions.view')}
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={onDelete}
							disabled={deleting}
									className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
							title={t('deleteConfirm')}
						>
							<Trash2 className="h-4 w-4" strokeWidth={1.5} />
							<span className="sr-only">{t('deleteConfirm')}</span>
						</Button>
					</div>
				</div>

				<div className="grid gap-6 md:grid-cols-2">
					<section className="rounded-xl border border-border/40 bg-white/30 p-5 backdrop-blur-sm transition-colors hover:bg-white/50">
						<div className="flex items-center justify-between gap-3 mb-4">
							<div className="space-y-1">
								<h3 className="text-sm font-semibold leading-none text-foreground">
									{t('actions.syncTitle')}
								</h3>
								<p className="text-xs text-muted-foreground font-light">
									{t('actions.syncDesc')}
								</p>
							</div>
							<span className="rounded-full border border-border/50 bg-background/50 px-3 py-1 text-xs font-medium capitalize text-foreground shadow-sm">
								{statusLabel}
							</span>
						</div>
						<div className="space-y-4">
							<ProxySelector
								value={selectedProxyId}
								onValueChange={onSelectProxy}
							/>
							<Button
								size="sm"
								className="w-full sm:w-auto shadow-sm"
								onClick={onSync}
								disabled={isSyncing}
							>
								{isSyncing ? t('actions.syncing') : t('actions.sync')}
							</Button>
						</div>
					</section>

					<section className="rounded-xl border border-border/40 bg-white/30 p-5 backdrop-blur-sm transition-colors hover:bg-white/50">
						<div className="space-y-1 mb-4">
							<h3 className="text-sm font-semibold leading-none text-foreground">
								{t('actions.translateTitle')}
							</h3>
							<p className="text-xs text-muted-foreground font-light">
								{t('actions.translateDesc')}
							</p>
						</div>
						<div className="space-y-4">
							<div className="space-y-2">
								<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
									{t('actions.model')}
								</span>
								<ChatModelSelect
									value={selectedModel}
									onChange={onSelectModel}
									disabled={translateMutation.isPending}
									triggerClassName="w-full bg-background/50 border-border/50"
								/>
							</div>
							<div className="flex flex-wrap gap-2">
								<Button
									size="sm"
									variant="secondary"
									onClick={() =>
										translateMutation.mutate({
											channelId: ch.id,
											limit: 20,
											model: selectedModel,
										})
									}
									disabled={translateMutation.isPending}
									className="bg-secondary/80 hover:bg-secondary shadow-sm"
									title={t('actions.translate')}
								>
									{translateMutation.isPending
										? t('actions.translating')
										: t('actions.translate')}
								</Button>
								{translatedMap && (
									<Button
										size="sm"
									variant="ghost"
									onClick={() => setShowTranslated((v) => !v)}
									className="hover:bg-secondary/50"
									title={
										showTranslated
											? t('actions.hideTranslation')
											: t('actions.showTranslation')
									}
								>
									{showTranslated
										? t('actions.hideTranslation')
										: t('actions.showTranslation')}
								</Button>
							)}
						</div>
					</div>
				</section>
				</div>

				{expanded && (
					<div className="rounded-xl border border-border/40 bg-white/20 p-4 animate-in fade-in slide-in-from-top-2 duration-300">
						<ChannelVideoList
							channelId={ch.id}
							limit={20}
							translatedTitleMap={
								showTranslated ? (translatedMap ?? undefined) : undefined
							}
						/>
					</div>
				)}
			</div>
		</article>
	)
}
