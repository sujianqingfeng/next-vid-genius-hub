import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
	Calendar,
	ExternalLink,
	Eye,
	HardDrive,
	Heart,
	Loader2,
	MessageSquare,
	RefreshCw,
} from 'lucide-react'
import * as React from 'react'
import { ProxyStatusPill } from '~/components/business/proxy/proxy-status-pill'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { Skeleton } from '~/components/ui/skeleton'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import type { MediaItem } from '~/lib/media/types'
import { classifyHost, formatHostPort, hostKindLabel } from '~/lib/proxy/host'
import { formatBytes, formatNumber } from '~/lib/utils/format/format'
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

type ProxyRow = {
	id: string
	name?: string | null
	server?: string | null
	port?: number | null
	protocol?: string | null
	testStatus?: 'pending' | 'success' | 'failed' | null
	responseTime?: number | null
}

export function MediaDetailPage({ id }: { id: string }) {
	const t = useTranslations('MediaDetail')
	const tProxySelector = useTranslations('Proxy.selector')
	const qc = useQueryClient()

	const mediaQuery = useQuery(
		queryOrpc.media.byId.queryOptions({ input: { id } }),
	)
	const proxiesQuery = useQuery(
		queryOrpc.proxy.getActiveProxiesForDownload.queryOptions(),
	)

	const proxies = (proxiesQuery.data?.proxies ?? []) as ProxyRow[]
	const defaultProxyId = proxiesQuery.data?.defaultProxyId ?? 'none'

	const [selectedProxyId, setSelectedProxyId] = React.useState<string>('none')

	React.useEffect(() => {
		setSelectedProxyId((cur) => {
			if (cur && cur !== 'none') return cur
			if (defaultProxyId && proxies.some((p) => p.id === defaultProxyId))
				return defaultProxyId
			return cur
		})
	}, [defaultProxyId, proxies])

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
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : t('error'),
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

	return (
		<div className="min-h-screen bg-background selection:bg-primary/10 selection:text-primary">
			<div className="px-4 py-10 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-6xl space-y-6">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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

							<h1 className="text-3xl font-semibold tracking-tight">
								{item.title}
							</h1>
							{item.translatedTitle ? (
								<div className="text-base text-muted-foreground">
									{item.translatedTitle}
								</div>
							) : null}

							{item.url ? (
								<a
									href={item.url}
									target="_blank"
									rel="noreferrer"
									className="inline-flex items-center gap-2 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
								>
									<ExternalLink className="h-4 w-4" />
									{item.url}
								</a>
							) : null}
						</div>

						<div className="flex flex-wrap gap-2">
							<Button variant="secondary" asChild>
								<Link to="/media">{t('back')}</Link>
							</Button>
							<Button
								variant="secondary"
								disabled={refreshMutation.isPending}
								onClick={() => {
									refreshMutation.mutate({
										id,
										proxyId:
											selectedProxyId && selectedProxyId !== 'none'
												? selectedProxyId
												: undefined,
									})
								}}
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
						<div className="space-y-6">
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

							<Card>
								<CardHeader>
									<CardTitle className="text-base">{t('info.title')}</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4 text-sm text-muted-foreground">
									<div className="flex flex-wrap items-center gap-5">
										<div className="inline-flex items-center gap-2">
											<Eye className="h-4 w-4" />
											<span>{formatNumber(item.viewCount ?? 0)}</span>
										</div>
										<div className="inline-flex items-center gap-2">
											<Heart className="h-4 w-4" />
											<span>{formatNumber(item.likeCount ?? 0)}</span>
										</div>
										<div className="inline-flex items-center gap-2">
											<MessageSquare className="h-4 w-4" />
											<span>{formatNumber(item.commentCount ?? 0)}</span>
										</div>
										<div className="inline-flex items-center gap-2">
											<Calendar className="h-4 w-4" />
											<span>{createdAt || '—'}</span>
										</div>
									</div>

									{item.author ? (
										<div>
											<span className="font-medium text-foreground/80">
												Author:
											</span>{' '}
											{item.author}
										</div>
									) : null}

									{typeof item.duration === 'number' ? (
										<div>
											<span className="font-medium text-foreground/80">
												Duration:
											</span>{' '}
											{item.duration}s
										</div>
									) : null}
								</CardContent>
							</Card>

							<Card>
								<CardHeader className="flex flex-row items-center justify-between">
									<CardTitle className="flex items-center gap-2 text-base">
										<HardDrive className="h-4 w-4" />
										{t('info.title')}
									</CardTitle>
								</CardHeader>
								<CardContent className="grid gap-3 sm:grid-cols-2">
									<div className="rounded-xl border border-border/60 p-4">
										<div className="text-xs text-muted-foreground">
											{t('info.labels.videoSize')}
										</div>
										<div className="mt-1 text-sm font-medium text-foreground">
											{formatBytes(item.downloadVideoBytes)}
										</div>
									</div>
									<div className="rounded-xl border border-border/60 p-4">
										<div className="text-xs text-muted-foreground">
											{t('info.labels.processedAudioSize')}
										</div>
										<div className="mt-1 text-sm font-medium text-foreground">
											{formatBytes(item.downloadAudioBytes)}
										</div>
									</div>
									<div className="rounded-xl border border-border/60 p-4">
										<div className="text-xs text-muted-foreground">
											{t('info.labels.videoKey')}
										</div>
										<div className="mt-1 break-all text-sm font-medium text-foreground">
											{item.remoteVideoKey || t('info.unknown')}
										</div>
									</div>
									<div className="rounded-xl border border-border/60 p-4">
										<div className="text-xs text-muted-foreground">
											{t('info.labels.processedAudioKey')}
										</div>
										<div className="mt-1 break-all text-sm font-medium text-foreground">
											{item.remoteAudioProcessedKey ||
												item.remoteAudioKey ||
												t('info.unknown')}
										</div>
									</div>
									<div className="rounded-xl border border-border/60 p-4">
										<div className="text-xs text-muted-foreground">
											{t('info.labels.sourceAudioKey')}
										</div>
										<div className="mt-1 break-all text-sm font-medium text-foreground">
											{item.remoteAudioSourceKey || t('info.unknown')}
										</div>
									</div>
									<div className="rounded-xl border border-border/60 p-4">
										<div className="text-xs text-muted-foreground">
											{t('info.labels.metadataKey')}
										</div>
										<div className="mt-1 break-all text-sm font-medium text-foreground">
											{item.remoteMetadataKey || t('info.unknown')}
										</div>
									</div>
								</CardContent>
							</Card>
						</div>

						<div className="space-y-4">
							<Card>
								<CardHeader>
									<CardTitle className="text-base">
										{t('actions.title')}
									</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-col gap-2">
									<Button
										variant="secondary"
										className="w-full justify-start"
										asChild
									>
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
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle className="text-base">
										{t('actions.sync')}
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="space-y-2">
										<div className="text-sm font-medium">
											{tProxySelector('label.optional')}
										</div>
										<Select
											value={selectedProxyId}
											onValueChange={setSelectedProxyId}
											disabled={
												refreshMutation.isPending || proxiesQuery.isLoading
											}
										>
											<SelectTrigger id="proxySelect">
												<SelectValue
													placeholder={tProxySelector('selectPlaceholder')}
												/>
											</SelectTrigger>
											<SelectContent>
												{proxies.map((p) => (
													<SelectItem key={p.id} value={p.id}>
														<span className="flex w-full items-center justify-between gap-2">
															<span className="truncate">
																{p.id === 'none'
																	? tProxySelector('direct')
																	: p.name ||
																		(() => {
																			const label = hostKindLabel(
																				classifyHost(p.server),
																			)
																			const addr = formatHostPort(
																				p.server,
																				p.port,
																			)
																			const base = `${p.protocol ?? 'http'}://${addr}`
																			return label ? `${base} (${label})` : base
																		})()}
															</span>
															{p.id !== 'none' ? (
																<ProxyStatusPill
																	status={p.testStatus}
																	responseTime={p.responseTime}
																/>
															) : null}
														</span>
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										{proxiesQuery.isLoading ? (
											<div className="text-xs text-muted-foreground">
												{tProxySelector('loading')}
											</div>
										) : null}
									</div>

									<Button
										type="button"
										variant="outline"
										disabled={refreshMutation.isPending || !item.url}
										onClick={() =>
											refreshMutation.mutate({
												id,
												proxyId:
													selectedProxyId && selectedProxyId !== 'none'
														? selectedProxyId
														: undefined,
											})
										}
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
								</CardContent>
							</Card>

							{item.transcription ? (
								<Card>
									<CardHeader>
										<CardTitle className="text-base">Transcription</CardTitle>
									</CardHeader>
									<CardContent className="text-sm text-muted-foreground">
										<div className="line-clamp-6">{item.transcription}</div>
									</CardContent>
								</Card>
							) : null}
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
