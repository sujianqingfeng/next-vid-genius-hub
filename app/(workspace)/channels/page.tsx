'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { ChannelVideoList } from '~/components/business/channels/channel-video-list'
import { ChatModelSelect } from '~/components/business/media/subtitles/ChatModelSelect'
import { ProxySelector } from '~/components/business/proxy/proxy-selector'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { type ChatModelId, ChatModelIds } from '~/lib/ai/models'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { queryOrpc } from '~/lib/orpc/query-client'

export default function ChannelsPage() {
	const qc = useQueryClient()
	const [newInput, setNewInput] = React.useState('')
	const [jobMap, setJobMap] = React.useState<Record<string, string>>({})
	const [statusMap, setStatusMap] = React.useState<Record<string, string>>({})
	const [selectedProxyByChannel, setSelectedProxyByChannel] = React.useState<
		Record<string, string>
	>({})
	const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})
	const defaultChannelModel = React.useMemo<ChatModelId>(() => {
		const fallback = 'openai/gpt-4o-mini'
		const configured =
			ChatModelIds.find((id) => id === fallback) ?? ChatModelIds[0]
		return (configured ?? fallback) as ChatModelId
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
				toast.success('Channel deleted successfully')
			},
			onError: (error) => {
				toast.error(`Failed to delete channel: ${error.message}`)
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
		<div className="mx-auto max-w-6xl px-4 py-10">
			<header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div className="space-y-1">
					<h1 className="text-3xl font-semibold tracking-tight">Channels</h1>
					<p className="text-sm text-muted-foreground">
						Collect the creators you follow, keep their feeds in sync, and
						translate titles in one place.
					</p>
				</div>
				<form
					onSubmit={handleAddChannel}
					className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center"
				>
					<Input
						value={newInput}
						onChange={(e) => setNewInput(e.target.value)}
						placeholder="Paste a YouTube channel URL or ID"
						className="w-full min-w-0 sm:w-80"
					/>
					<Button
						type="submit"
						disabled={!newInput.trim() || createMutation.isPending}
					>
						{createMutation.isPending ? 'Adding…' : 'Add Channel'}
					</Button>
				</form>
			</header>

			<main className="space-y-6">
				{listQuery.isLoading && (
					<div className="py-10 text-center text-muted-foreground">
						Loading your channels…
					</div>
				)}

				{!!listQuery.data?.channels?.length && (
					<div className="grid gap-4">
						{listQuery.data.channels.map((ch) => (
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
									if (deleteMutation.isPending) return
									if (
										confirm(
											'Are you sure you want to delete this channel? This will remove all its videos locally.',
										)
									) {
										deleteMutation.mutate({ id: ch.id })
									}
								}}
								deleting={deleteMutation.isPending}
							/>
						))}
					</div>
				)}

				{!listQuery.isLoading && !listQuery.data?.channels?.length && (
					<div className="rounded-lg border border-dashed py-12 text-center text-muted-foreground">
						Add a channel to start tracking new uploads.
					</div>
				)}
			</main>
		</div>
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
			return ['completed', 'failed', 'canceled'].includes(s) ? false : 1500
		},
	})

	// Only propagate status changes when the value actually changes to avoid update loops.
	React.useEffect(() => {
		const s = (statusQuery?.data as { status?: string } | null)?.status
		// Guard: update parent status map only when it differs from current prop
		if (s && s !== status) {
			setStatus(s)
		}
		if (s === 'completed' && jobId && !finalizeAttemptedRef.current) {
			finalizeAttemptedRef.current = true
			onFinalize()
		}
	}, [statusQuery?.data?.status, jobId, status, setStatus, onFinalize])

	const translateMutation = useEnhancedMutation(
		queryOrpc.channel.translateVideoTitles.mutationOptions({
			onSuccess: (res) => {
				const map = Object.fromEntries(
					(res.items ?? []).map((i) => [i.id, i.translation]),
				)
				setTranslatedMap(map)
				// auto show translated when finished
				setShowTranslated(true)
			},
		}),
		{
			successToast: 'Titles translated!',
			errorToast: ({ error }) => `Failed to translate titles: ${error.message}`,
		},
	)

	const statusLabel = React.useMemo(() => {
		if (!status) return 'Idle'
		return status.replace(/_/g, ' ')
	}, [status])

	const isSyncing = status === 'running' || status === 'queued'

	return (
		<article className="rounded-xl border bg-background/60 p-6 shadow-sm transition-colors hover:border-primary/40">
			<div className="flex flex-col gap-6">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex min-w-0 items-center gap-3">
						{ch.thumbnail ? (
							// eslint-disable-next-line @next/next/no-img-element
							<img
								src={ch.thumbnail}
								alt="Channel thumbnail"
								className="h-12 w-12 rounded-lg object-cover"
							/>
						) : (
							<div
								className="h-12 w-12 rounded-lg bg-muted"
								aria-hidden="true"
							/>
						)}
						<div className="min-w-0 space-y-1">
							<p className="truncate text-base font-semibold">
								{ch.title || ch.channelUrl || ch.channelId || ch.id}
							</p>
							<p className="truncate text-xs text-muted-foreground">
								{ch.channelUrl}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<Button size="sm" variant="outline" onClick={onToggleExpanded}>
							{expanded ? 'Hide videos' : 'View videos'}
						</Button>
						<Button
							size="sm"
							variant="destructive"
							onClick={onDelete}
							disabled={deleting}
							title="Delete this channel and its local videos"
						>
							<Trash2 className="h-4 w-4" />
							{deleting ? 'Deleting…' : 'Delete'}
						</Button>
					</div>
				</div>

				<div className="grid gap-4 md:grid-cols-2">
					<section className="rounded-lg border bg-muted/10 p-4">
						<div className="flex items-center justify-between gap-3">
							<div className="space-y-1">
								<h3 className="text-sm font-semibold leading-none text-foreground">
									Sync
								</h3>
								<p className="text-xs text-muted-foreground">
									Select a proxy and fetch the newest uploads.
								</p>
							</div>
							<span className="rounded-full border border-border px-3 py-1 text-xs font-medium capitalize text-foreground">
								{statusLabel}
							</span>
						</div>
						<div className="mt-4 space-y-4">
							<ProxySelector
								value={selectedProxyId}
								onValueChange={onSelectProxy}
							/>
							<Button
								size="sm"
								className="w-full sm:w-auto"
								onClick={onSync}
								disabled={isSyncing}
							>
								{isSyncing ? 'Syncing…' : 'Sync latest'}
							</Button>
						</div>
					</section>

					<section className="rounded-lg border bg-muted/10 p-4">
						<div className="space-y-1">
							<h3 className="text-sm font-semibold leading-none text-foreground">
								Translate
							</h3>
							<p className="text-xs text-muted-foreground">
								Choose a model to localize the latest video titles.
							</p>
						</div>
						<div className="mt-4 space-y-3">
							<div className="space-y-2">
								<span className="text-sm font-medium text-muted-foreground">
									Model
								</span>
								<ChatModelSelect
									value={selectedModel}
									onChange={onSelectModel}
									disabled={translateMutation.isPending}
									triggerClassName="w-full"
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
									title="Translate the latest video titles to Chinese"
								>
									{translateMutation.isPending
										? 'Translating…'
										: 'Translate titles'}
								</Button>
								{translatedMap && (
									<Button
										size="sm"
										variant="ghost"
										onClick={() => setShowTranslated((v) => !v)}
										title={
											showTranslated
												? 'Hide translated titles'
												: 'Show translated titles'
										}
									>
										{showTranslated ? 'Hide translation' : 'Show translation'}
									</Button>
								)}
							</div>
						</div>
					</section>
				</div>

				{expanded && (
					<div className="rounded-lg border bg-muted/30 p-4">
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
