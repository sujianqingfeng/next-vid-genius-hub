import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
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

	const mediaQuery = useQuery(
		queryOrpc.media.byId.queryOptions({ input: { id } }),
	)

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
								</CardContent>
							</Card>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
