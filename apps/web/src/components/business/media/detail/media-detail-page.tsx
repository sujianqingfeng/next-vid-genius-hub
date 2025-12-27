import {
	keepPreviousData,
	useQuery,
	useQueryClient,
} from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
	ArrowLeft,
	ExternalLink,
	Loader2,
	RefreshCw,
	Terminal,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import {
	Sheet,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from '~/components/ui/sheet'
import { Skeleton } from '~/components/ui/skeleton'
import { getUserFriendlyErrorMessage } from '~/lib/errors/client'
import { useCloudJob } from '~/lib/hooks/useCloudJob'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import type { MediaItem } from '~/lib/media/types'
import { useTranslations } from '~/lib/i18n'
import { queryOrpc } from '~/lib/orpc/client'

function toDateLabel(input: unknown): string {
	if (input instanceof Date) return input.toLocaleString()
	if (typeof input === 'string' || typeof input === 'number') {
		const d = new Date(input)
		if (!Number.isNaN(d.getTime())) return d.toLocaleString()
	}
	return ''
}

function mediaPreviewUrl(media: MediaItem, id: string): string | null {
	if (media.renderCommentsJobId)
		return `/api/media/${encodeURIComponent(id)}/rendered-info`
	if (media.renderSubtitlesJobId)
		return `/api/media/${encodeURIComponent(id)}/rendered`
	if (media.filePath || media.remoteVideoKey || media.downloadJobId) {
		return `/api/media/${encodeURIComponent(id)}/downloaded`
	}
	return null
}

export function MediaDetailPage({ id }: { id: string }) {
	const t = useTranslations('MediaDetail')
	const qc = useQueryClient()
	const [pointsOpen, setPointsOpen] = useState(false)
	const [txPage, setTxPage] = useState(1)
	const txLimit = 20

	const mediaQuery = useQuery(
		queryOrpc.media.byId.queryOptions({ input: { id } }),
	)

	const txOffset = (txPage - 1) * txLimit
	const transactionsQuery = useQuery({
		...queryOrpc.media.listPointTransactions.queryOptions({
			input: { id, limit: txLimit, offset: txOffset },
		}),
		placeholderData: keepPreviousData,
		enabled: mediaQuery.isSuccess && pointsOpen,
	})

	const terminalStatuses = useMemo(
		() => new Set(['completed', 'failed', 'canceled']),
		[],
	)
	const {
		jobId: metadataJobId,
		setJobId: setMetadataJobId,
		statusQuery: metadataStatusQuery,
	} = useCloudJob<any, Error>({
		storageKey: `metadataRefreshJob:${id}`,
		enabled: true,
		completeStatuses: ['completed', 'failed', 'canceled'],
		createQueryOptions: (jobId) => ({
			...queryOrpc.media.getMetadataRefreshStatus.queryOptions({
				input: { jobId },
			}),
			enabled: Boolean(jobId),
			refetchInterval: (q) => {
				const status = (q.state.data as any)?.status
				if (!status) return 1500
				return terminalStatuses.has(status) ? false : 1500
			},
		}),
		onCompleted: async ({ data }) => {
			const status = (data as any)?.status
			if (status === 'completed') {
				toast.success(t('actions.syncSuccess'))
			} else {
				const message =
					(data as any)?.error ||
					(data as any)?.message ||
					`status=${String(status || 'unknown')}`
				toast.error(t('actions.syncError', { message }))
			}

			await qc.invalidateQueries({
				queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
			})
			await qc.invalidateQueries({ queryKey: queryOrpc.media.list.key() })
		},
		autoClearOnComplete: true,
	})

	const refreshMutation = useEnhancedMutation(
		queryOrpc.media.refreshMetadata.mutationOptions({
			onSuccess: async (data: any) => {
				const jobId = data?.jobId
				if (typeof jobId === 'string' && jobId.trim()) {
					setMetadataJobId(jobId)
				}
			},
		}),
		{
			successToast: t('actions.syncQueued'),
			errorToast: ({ error }) => getUserFriendlyErrorMessage(error),
		},
	)

	if (mediaQuery.isLoading) {
		return (
			<div className="min-h-screen bg-background p-6 lg:p-12">
				<div className="mx-auto max-w-7xl border border-border bg-card p-6 space-y-6">
					<div className="flex gap-6">
						<Skeleton className="h-64 w-2/3 rounded-none" />
						<div className="w-1/3 space-y-4">
							<Skeleton className="h-8 w-full rounded-none" />
							<Skeleton className="h-4 w-1/2 rounded-none" />
							<Skeleton className="h-32 w-full rounded-none" />
						</div>
					</div>
				</div>
			</div>
		)
	}

	if (mediaQuery.isError || !mediaQuery.data) {
		return (
			<div className="min-h-screen bg-background p-6 lg:p-12">
				<div className="mx-auto max-w-7xl border border-destructive/50 bg-destructive/5 p-12 text-center">
					<div className="flex justify-center mb-4">
						<Terminal className="h-8 w-8 text-destructive" />
					</div>
					<div className="text-lg font-bold uppercase tracking-wide text-destructive mb-2">
						{t('error')}
					</div>
					<div className="flex justify-center gap-4 mt-8">
						<Button
							variant="outline"
							className="rounded-none border-destructive/50 text-destructive hover:bg-destructive/10 uppercase"
							asChild
						>
							<Link to="/media">{t('back')}</Link>
						</Button>
						<Button
							className="rounded-none uppercase"
							onClick={() => mediaQuery.refetch()}
						>
							Retry
						</Button>
					</div>
				</div>
			</div>
		)
	}

	const item = mediaQuery.data as MediaItem
	const createdAt = toDateLabel(item.createdAt)
	const previewUrl = mediaPreviewUrl(item, id)
	const title = item.translatedTitle || item.title || id
	const metadataStatus = (metadataStatusQuery.data as any)?.status as
		| string
		| undefined
	const isMetadataSyncing =
		Boolean(metadataJobId) && !terminalStatuses.has(metadataStatus || '')
	const txItems = transactionsQuery.data?.items ?? []
	const txTotal = transactionsQuery.data?.total ?? 0
	const txNetDelta = transactionsQuery.data?.netDelta ?? 0
	const txPageCount = Math.max(1, Math.ceil(txTotal / txLimit))

	const formattedTransactions = useMemo(
		() =>
			txItems.map((tx) => ({
				...tx,
				sign: tx.delta >= 0 ? '+' : '-',
				abs: Math.abs(tx.delta),
			})),
		[txItems],
	)

	return (
		<div className="min-h-screen bg-background text-foreground font-sans p-6 md:p-12">
			<div className="mx-auto max-w-7xl border border-border bg-card">
				{/* Header */}
				<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border p-6 bg-secondary/5">
					<Button
						variant="outline"
						size="sm"
						className="rounded-none border-border uppercase tracking-wide text-xs h-9 px-4"
						asChild
					>
						<Link to="/media">
							<ArrowLeft className="mr-2 h-3.5 w-3.5" />
							{t('back')}
						</Link>
					</Button>

					<div className="flex items-center gap-2">
						{item.url ? (
							<Button
								variant="outline"
								size="sm"
								className="rounded-none border-border uppercase tracking-wide text-xs h-9"
								asChild
							>
								<a href={item.url} target="_blank" rel="noreferrer">
									<ExternalLink className="mr-2 h-3.5 w-3.5" />
									{t('actions.open')}
								</a>
							</Button>
						) : null}
						<Button
							variant="outline"
							size="sm"
							className="rounded-none border-border uppercase tracking-wide text-xs h-9"
							disabled={
								refreshMutation.isPending || !item.url || isMetadataSyncing
							}
							onClick={() => refreshMutation.mutate({ id })}
						>
							{refreshMutation.isPending || isMetadataSyncing ? (
								<>
									<Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
									{t('actions.syncing')}
								</>
							) : (
								<>
									<RefreshCw className="mr-2 h-3.5 w-3.5" />
									{t('actions.sync')}
								</>
							)}
						</Button>
					</div>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] divide-y lg:divide-y-0 lg:divide-x divide-border">
					{/* Left Column: Video */}
					<div className="p-0 bg-black/5">
						{previewUrl ? (
							<video
								className="aspect-video w-full bg-black"
								controls
								playsInline
								preload="metadata"
								poster={item.thumbnail ?? undefined}
								src={previewUrl}
							/>
						) : item.thumbnail ? (
							<img
								src={item.thumbnail}
								alt={t('video.thumbnailAlt')}
								className="aspect-video w-full object-cover"
								loading="lazy"
							/>
						) : (
							<div className="aspect-video w-full flex items-center justify-center bg-secondary/10 text-muted-foreground uppercase tracking-widest font-mono text-sm">
								No Preview Available
							</div>
						)}
					</div>

					{/* Right Column: Details */}
					<div className="flex flex-col">
						{/* Meta Header */}
						<div className="p-6 border-b border-border space-y-4">
							<div className="space-y-1">
								<h1 className="text-xl font-bold uppercase leading-tight tracking-wide">
									{title}
								</h1>
								{item.translatedTitle && item.title ? (
									<div className="text-sm font-mono text-muted-foreground break-words">
										{item.translatedTitle === title
											? item.title
											: item.translatedTitle}
									</div>
								) : null}
							</div>

							<div className="grid grid-cols-2 gap-px bg-border border border-border">
								<div className="bg-background p-2">
									<span className="block text-[10px] uppercase text-muted-foreground mb-0.5">
										Source
									</span>
									<span className="text-xs font-bold uppercase">
										{item.source || '-'}
									</span>
								</div>
								<div className="bg-background p-2">
									<span className="block text-[10px] uppercase text-muted-foreground mb-0.5">
										Quality
									</span>
									<span className="text-xs font-bold uppercase">
										{item.quality || '-'}
									</span>
								</div>
								<div className="bg-background p-2">
									<span className="block text-[10px] uppercase text-muted-foreground mb-0.5">
										Status
									</span>
									<span className="text-xs font-bold uppercase">
										{item.downloadStatus || '-'}
									</span>
								</div>
								<div className="bg-background p-2">
									<span className="block text-[10px] uppercase text-muted-foreground mb-0.5">
										Date
									</span>
									<span className="text-xs font-mono">
										{createdAt ? createdAt.split(',')[0] : '-'}
									</span>
								</div>
							</div>
						</div>

						{/* Actions Panel */}
						<div className="p-6 flex-1 bg-secondary/5">
							<h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
								{t('actions.title')}
							</h2>
							<div className="space-y-3">
								<Button
									className="w-full justify-start rounded-none h-12 uppercase tracking-wide font-bold border border-border bg-background text-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
									variant="ghost"
									asChild
								>
									<Link to="/media/$id/subtitles" params={{ id }}>
										<span className="mr-auto">{t('tabs.subtitlesAction')}</span>
										<ArrowLeft className="h-4 w-4 rotate-180" />
									</Link>
								</Button>
								<Button
									className="w-full justify-start rounded-none h-12 uppercase tracking-wide font-bold border border-border bg-background text-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
									variant="ghost"
									asChild
								>
									<Link
										to="/media/$id/comments"
										params={{ id }}
										search={{ tab: 'basics' }}
									>
										<span className="mr-auto">{t('tabs.commentsAction')}</span>
										<ArrowLeft className="h-4 w-4 rotate-180" />
									</Link>
								</Button>

								<Sheet open={pointsOpen} onOpenChange={setPointsOpen}>
									<SheetTrigger asChild>
										<Button
											variant="ghost"
											className="w-full justify-start rounded-none h-12 uppercase tracking-wide font-bold border border-border bg-background text-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
										>
											<span className="mr-auto">{t('points.title')}</span>
											<Terminal className="h-4 w-4" />
										</Button>
									</SheetTrigger>
									<SheetContent className="flex flex-col p-0 border-l border-border bg-background sm:max-w-xl">
										<div className="h-14 flex items-center justify-between px-6 border-b border-border bg-secondary/5">
											<SheetTitle className="text-sm font-bold uppercase tracking-wider">
												{t('points.title')}
											</SheetTitle>
											<div className="flex items-center gap-2 text-xs font-mono">
												<span className="text-muted-foreground uppercase">
													{t('points.net')}:
												</span>
												{transactionsQuery.isFetching ? (
													<Skeleton className="h-4 w-12 rounded-none" />
												) : (
													<span
														className={
															txNetDelta >= 0
																? 'text-emerald-600 font-bold'
																: 'text-red-500 font-bold'
														}
													>
														{txNetDelta >= 0 ? '+' : ''}
														{txNetDelta}
													</span>
												)}
											</div>
										</div>

										<div className="flex-1 overflow-auto p-6">
											<div className="space-y-6">
												<div className="border border-border">
													<div className="grid grid-cols-[auto_1fr_auto] gap-px bg-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
														<div className="bg-secondary/10 p-2">
															{t('points.table.headers.time')}
														</div>
														<div className="bg-secondary/10 p-2">
															{t('points.table.headers.type')} /{' '}
															{t('points.table.headers.remark')}
														</div>
														<div className="bg-secondary/10 p-2 text-right">
															{t('points.table.headers.delta')}
														</div>
													</div>

													<div className="divide-y divide-border bg-background">
														{formattedTransactions.length === 0 ? (
															<div className="py-8 text-center text-xs font-mono text-muted-foreground uppercase">
																{transactionsQuery.isError
																	? t('points.table.error')
																	: transactionsQuery.isLoading ||
																		  transactionsQuery.isFetching
																		? t('points.table.loading')
																		: t('points.table.empty')}
															</div>
														) : null}
														{formattedTransactions.map((tx) => (
															<div
																key={tx.id}
																className="grid grid-cols-[auto_1fr_auto] items-center text-xs hover:bg-secondary/5 transition-colors"
															>
																<div className="p-3 font-mono text-muted-foreground border-r border-border/50">
																	<div className="whitespace-nowrap">
																		{new Date(
																			tx.createdAt,
																		).toLocaleDateString()}
																	</div>
																	<div className="whitespace-nowrap text-[10px] opacity-70">
																		{new Date(
																			tx.createdAt,
																		).toLocaleTimeString()}
																	</div>
																</div>
																<div className="p-3 border-r border-border/50 min-w-0">
																	<div className="flex items-center gap-2 mb-1">
																		<span className="inline-block border border-border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-secondary/20">
																			{String(tx.type).replace('_', ' ')}
																		</span>
																	</div>
																	<div className="text-[10px] text-muted-foreground truncate font-mono">
																		{tx.remark || tx.refType || '-'}
																	</div>
																</div>
																<div className="p-3 text-right font-mono">
																	<div
																		className={
																			tx.delta >= 0
																				? 'text-emerald-600 font-bold'
																				: 'text-red-500 font-bold'
																		}
																	>
																		{tx.sign}
																		{tx.abs}
																	</div>
																	<div className="text-[10px] text-muted-foreground">
																		Bal: {tx.balanceAfter}
																	</div>
																</div>
															</div>
														))}
													</div>
												</div>

												<div className="flex items-center justify-between border-t border-border pt-4">
													<div className="text-[10px] font-mono text-muted-foreground uppercase">
														{t('points.pagination', {
															page: txPage,
															pages: txPageCount,
															total: txTotal,
														})}
													</div>
													<div className="flex gap-2">
														<Button
															variant="outline"
															size="sm"
															className="rounded-none border-border h-7 text-xs uppercase"
															disabled={
																txPage <= 1 || transactionsQuery.isFetching
															}
															onClick={() =>
																setTxPage((p) => Math.max(1, p - 1))
															}
														>
															{t('points.prev')}
														</Button>
														<Button
															variant="outline"
															size="sm"
															className="rounded-none border-border h-7 text-xs uppercase"
															disabled={
																txPage >= txPageCount ||
																transactionsQuery.isFetching
															}
															onClick={() =>
																setTxPage((p) => Math.min(txPageCount, p + 1))
															}
														>
															{t('points.next')}
														</Button>
													</div>
												</div>
											</div>
										</div>
									</SheetContent>
								</Sheet>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
