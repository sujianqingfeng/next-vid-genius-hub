import {
	keepPreviousData,
	useQuery,
	useQueryClient,
} from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '~/components/ui/sheet'
import { Skeleton } from '~/components/ui/skeleton'
import { getUserFriendlyErrorMessage } from '~/lib/errors/client'
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
	if (media.videoWithInfoPath)
		return `/api/media/${encodeURIComponent(id)}/rendered-info`
	if (media.videoWithSubtitlesPath)
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

	const refreshMutation = useEnhancedMutation(
		queryOrpc.media.refreshMetadata.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
				})
				await qc.invalidateQueries({ queryKey: queryOrpc.media.list.key() })
			},
		}),
		{
			successToast: t('actions.syncSuccess'),
			errorToast: ({ error }) => getUserFriendlyErrorMessage(error),
		},
	)

	if (mediaQuery.isLoading) {
		return (
			<div className="min-h-screen bg-background px-4 py-10 sm:px-6 lg:px-8">
				<div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
					<div className="space-y-4">
						<Skeleton className="aspect-video w-full rounded-2xl" />
						<Skeleton className="h-6 w-3/4" />
						<Skeleton className="h-4 w-1/2" />
					</div>
					<div className="space-y-4">
						<Skeleton className="h-10 w-3/4" />
						<Skeleton className="h-40 w-full rounded-2xl" />
					</div>
				</div>
			</div>
		)
	}

	if (mediaQuery.isError || !mediaQuery.data) {
		return (
			<div className="min-h-screen bg-background px-4 py-10 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-5xl">
					<div className="glass rounded-2xl p-6">
						<div className="text-sm text-muted-foreground">{t('error')}</div>
						<div className="mt-4 flex gap-2">
							<Button variant="secondary" asChild>
								<Link to="/media">{t('back')}</Link>
							</Button>
							<Button onClick={() => mediaQuery.refetch()}>Retry</Button>
						</div>
					</div>
				</div>
			</div>
		)
	}

	const item = mediaQuery.data as MediaItem
	const createdAt = toDateLabel(item.createdAt)
	const previewUrl = mediaPreviewUrl(item, id)
	const title = item.translatedTitle || item.title || id
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
		<div className="min-h-screen bg-background selection:bg-primary/10 selection:text-primary">
			<div className="px-4 py-10 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-5xl space-y-6">
					<div className="flex items-center justify-between gap-3">
						<Button variant="secondary" asChild>
							<Link to="/media">{t('back')}</Link>
						</Button>
						<div className="flex items-center gap-2">
							{item.url ? (
								<Button variant="secondary" asChild>
									<a href={item.url} target="_blank" rel="noreferrer">
										<ExternalLink className="mr-2 h-4 w-4" />
										{t('actions.open')}
									</a>
								</Button>
							) : null}
							<Button
								variant="secondary"
								disabled={refreshMutation.isPending || !item.url}
								onClick={() => refreshMutation.mutate({ id })}
							>
								{refreshMutation.isPending ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										{t('actions.syncing')}
									</>
								) : (
									<>
										<RefreshCw className="mr-2 h-4 w-4" />
										{t('actions.sync')}
									</>
								)}
							</Button>
						</div>
					</div>

					<div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
						<Card className="overflow-hidden">
							<CardContent className="p-0">
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
									<div className="aspect-video w-full bg-secondary/50" />
								)}
							</CardContent>
						</Card>

						<div className="space-y-4">
							<div className="space-y-2">
								<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
									<Badge variant="secondary" className="capitalize">
										{item.source}
									</Badge>
									<Badge variant="outline" className="capitalize">
										{item.quality}
									</Badge>
									{item.downloadStatus ? (
										<Badge variant="secondary" className="capitalize">
											{item.downloadStatus}
										</Badge>
									) : null}
									{createdAt ? (
										<span className="ml-auto">{createdAt}</span>
									) : null}
								</div>

								<h1 className="text-2xl font-semibold leading-snug tracking-tight">
									{title}
								</h1>
								{item.translatedTitle && item.title ? (
									<div className="text-sm text-muted-foreground">
										{item.translatedTitle === title
											? item.title
											: item.translatedTitle}
									</div>
								) : null}
							</div>

							<Card>
								<CardHeader>
									<CardTitle className="text-base">
										{t('actions.title')}
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-col gap-2">
									<Button className="w-full justify-start" asChild>
										<Link to="/media/$id/subtitles" params={{ id }}>
											{t('tabs.subtitlesAction')}
										</Link>
									</Button>
									<Button
										variant="secondary"
										className="w-full justify-start"
										asChild
									>
										<Link to="/media/$id/comments" params={{ id }}>
											{t('tabs.commentsAction')}
										</Link>
									</Button>
									<Sheet open={pointsOpen} onOpenChange={setPointsOpen}>
										<SheetTrigger asChild>
											<Button
												variant="outline"
												className="w-full justify-start"
											>
												{t('points.title')}
											</Button>
										</SheetTrigger>
										<SheetContent className="flex flex-col p-0">
											<div className="border-border/60 border-b p-6 pr-12">
												<SheetHeader>
													<SheetTitle>{t('points.title')}</SheetTitle>
													<div className="flex items-center gap-2 text-sm">
														<span className="text-muted-foreground">
															{t('points.net')}
														</span>
														{transactionsQuery.isFetching ? (
															<Skeleton className="h-4 w-16" />
														) : (
															<span
																className={
																	txNetDelta >= 0
																		? 'text-emerald-600'
																		: 'text-red-500'
																}
															>
																{txNetDelta >= 0 ? '+' : ''}
																{txNetDelta}
															</span>
														)}
													</div>
												</SheetHeader>
											</div>

											<div className="flex-1 overflow-auto p-6">
												<div className="space-y-4">
													<div className="overflow-x-auto">
														<div className="min-w-[560px]">
															<div className="grid grid-cols-5 border-border/60 border-b pb-2 text-xs font-medium text-muted-foreground">
																<div>{t('points.table.headers.time')}</div>
																<div>{t('points.table.headers.type')}</div>
																<div>{t('points.table.headers.delta')}</div>
																<div>{t('points.table.headers.balance')}</div>
																<div>{t('points.table.headers.remark')}</div>
															</div>
															<div className="divide-y divide-border/60">
																{formattedTransactions.length === 0 ? (
																	<div className="py-6 text-center text-sm text-muted-foreground">
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
																		className="grid grid-cols-5 items-center py-3 text-sm"
																	>
																		<div className="text-xs text-muted-foreground">
																			{new Date(tx.createdAt).toLocaleString()}
																		</div>
																		<div>
																			<Badge
																				variant="secondary"
																				className="capitalize"
																			>
																				{String(tx.type).replace('_', ' ')}
																			</Badge>
																		</div>
																		<div
																			className={
																				tx.delta >= 0
																					? 'text-emerald-600'
																					: 'text-red-500'
																			}
																		>
																			{tx.sign}
																			{tx.abs}
																		</div>
																		<div>{tx.balanceAfter}</div>
																		<div className="text-xs text-muted-foreground">
																			{tx.remark || tx.refType || '-'}
																		</div>
																	</div>
																))}
															</div>
														</div>
													</div>

													<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
														<p className="text-xs text-muted-foreground">
															{t('points.pagination', {
																page: txPage,
																pages: txPageCount,
																total: txTotal,
															})}
														</p>
														<div className="flex gap-2">
															<Button
																variant="outline"
																size="sm"
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
																disabled={
																	txPage >= txPageCount ||
																	transactionsQuery.isFetching
																}
																onClick={() =>
																	setTxPage((p) =>
																		Math.min(txPageCount, p + 1),
																	)
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
								</CardContent>
							</Card>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
