'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
	Calendar,
	Eye,
	FileText,
	HardDrive,
	Heart,
	MessageSquare,
	RefreshCw,
	User,
	Play,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { PageHeader } from '~/components/business/layout/page-header'
import { WorkspacePageShell } from '~/components/business/layout/workspace-page-shell'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { Skeleton } from '~/components/ui/skeleton'
import { queryOrpc } from '~/lib/orpc/query-client'
import { formatBytes, formatNumber } from '~/lib/utils/format/format'
import { getTimeAgo as formatTimeAgo } from '~/lib/utils/time'
import type { MediaItem } from '~/lib/media/types'
import { toast } from 'sonner'
import { ProxySelector } from '~/components/business/proxy/proxy-selector'

// Clean media thumbnail component
function MediaThumbnail({ media }: { media: MediaItem }) {
	const [thumbnailError, setThumbnailError] = useState(false)
	const t = useTranslations('MediaDetail.video')

	return (
		<div className="relative group">
			{media.thumbnail && !thumbnailError ? (
				<div className="relative aspect-[16/9] rounded-xl overflow-hidden bg-gradient-to-br from-muted to-muted/50 shadow-sm">
					<Image
						src={media.thumbnail}
						alt={media.title || t('thumbnailAlt')}
						fill
						className="object-cover transition-transform duration-300 group-hover:scale-105"
						priority
						unoptimized
						onError={() => setThumbnailError(true)}
					/>
					<div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
					<div className="absolute inset-0 flex items-center justify-center">
						<div className="w-14 h-14 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-90 group-hover:scale-100 shadow-lg">
							<Play className="w-6 h-6 text-gray-900 fill-gray-900 ml-1" />
						</div>
					</div>
				</div>
			) : (
				<div className="aspect-[16/9] rounded-xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
					<Play className="w-12 h-12 text-muted-foreground/50" />
				</div>
			)}
		</div>
	)
}

// Media metadata component
function MediaMetadata({ media }: { media: MediaItem }) {
	return (
		<div className="space-y-6">
			{/* Title Section */}
			<div className="space-y-3">
				<h1 className="text-2xl font-bold leading-tight text-balance">
					{media.title}
				</h1>
				{media.translatedTitle && (
					<p className="text-lg text-muted-foreground leading-tight text-balance">
						{media.translatedTitle}
					</p>
				)}
				{media.author && (
					<div className="flex items-center gap-3 text-muted-foreground">
						<User className="w-4 h-4" />
						<span className="font-medium">{media.author}</span>
					</div>
				)}
			</div>

			{/* Stats */}
			<div className="flex items-center gap-6 text-sm">
				<div className="flex items-center gap-2 text-muted-foreground">
					<Eye className="w-4 h-4" />
					<span className="font-medium">{formatNumber(media.viewCount ?? 0)}</span>
				</div>
				{media.likeCount && media.likeCount > 0 && (
					<div className="flex items-center gap-2 text-muted-foreground">
						<Heart className="w-4 h-4" />
						<span className="font-medium">{formatNumber(media.likeCount)}</span>
					</div>
				)}
				<div className="flex items-center gap-2 text-muted-foreground">
					<Calendar className="w-4 h-4" />
					<span className="font-medium">{formatTimeAgo(media.createdAt)}</span>
				</div>
			</div>

			{/* Tags */}
			<div className="flex flex-wrap gap-2">
				<Badge variant="secondary" className="text-xs font-medium px-3 py-1">
					{media.source}
				</Badge>
				<Badge variant="outline" className="text-xs font-medium px-3 py-1">
					{media.quality}
				</Badge>
			</div>
		</div>
	)
}

function MediaStorageInfo({ media }: { media: MediaItem }) {
	const t = useTranslations('MediaDetail.info')

	const rows: Array<{ label: string; value: string }> = [
		{
			label: t('labels.videoSize'),
			value: formatBytes(media.downloadVideoBytes),
		},
		{
			label: t('labels.processedAudioSize'),
			value: formatBytes(media.downloadAudioBytes),
		},
		{
			label: t('labels.videoKey'),
			value: media.remoteVideoKey || t('unknown'),
		},
		{
			label: t('labels.processedAudioKey'),
			value:
				media.remoteAudioProcessedKey || media.remoteAudioKey || t('unknown'),
		},
		{
			label: t('labels.sourceAudioKey'),
			value: media.remoteAudioSourceKey || t('unknown'),
		},
		{
			label: t('labels.metadataKey'),
			value: media.remoteMetadataKey || t('unknown'),
		},
	]

	return (
		<Card className="glass border-none shadow-sm">
			<CardContent className="p-6 space-y-4">
				<div className="flex items-center gap-2">
					<HardDrive className="w-4 h-4 text-primary" strokeWidth={1.5} />
					<h3 className="text-lg font-semibold text-foreground">{t('title')}</h3>
				</div>
				<div className="grid gap-3 sm:grid-cols-2">
					{rows.map((row) => (
						<div
							key={row.label}
							className="rounded-xl border border-border/40 bg-background/40 p-4"
						>
							<div className="text-xs text-muted-foreground">{row.label}</div>
							<div
								className="mt-1 text-sm font-medium text-foreground break-all"
								title={row.value}
							>
								{row.value}
							</div>
						</div>
					))}
				</div>
				<div className="text-[11px] font-light text-muted-foreground">
					{t('hint')}
				</div>
			</CardContent>
		</Card>
	)
}

// Video preview (prefers rendered-info > rendered-subtitles, falls back to thumbnail)
function MediaVideoPreview({ media, id }: { media: MediaItem; id: string }) {
	const previewUrl = media.videoWithInfoPath
		? `/api/media/${encodeURIComponent(id)}/rendered-info`
		: media.videoWithSubtitlesPath
			? `/api/media/${encodeURIComponent(id)}/rendered`
			: (media.filePath || media.remoteVideoKey || media.downloadJobId)
				? `/api/media/${encodeURIComponent(id)}/downloaded`
				: null

	if (!previewUrl) {
		return <MediaThumbnail media={media} />
	}

	return (
		<div className="relative">
			<video
				className="w-full aspect-[16/9] rounded-xl bg-black shadow-sm"
				controls
				playsInline
				preload="metadata"
				poster={media.thumbnail || undefined}
				src={previewUrl}
			/>
		</div>
	)
}

export function MediaDetailPageClient({ id }: { id: string }) {
	const queryClient = useQueryClient()
	const t = useTranslations('MediaDetail')
	const [selectedProxyId, setSelectedProxyId] = useState<string>('none')

	const mediaQuery = useQuery(
		queryOrpc.media.byId.queryOptions({
			input: { id },
		}),
	)

	const { data: media, isLoading, isError } = mediaQuery

	const refreshMetadataMutation = useMutation(
		queryOrpc.media.refreshMetadata.mutationOptions({
			onSuccess: async () => {
				toast.success(t('actions.syncSuccess'))
				await queryClient.invalidateQueries({
					queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
				})
				await queryClient.invalidateQueries({
					queryKey: queryOrpc.media.list.key(),
				})
			},
			onError: (error) => {
				toast.error(t('actions.syncError', { message: error.message }))
			},
		}),
	)

	return (
		<WorkspacePageShell
			header={
				<PageHeader
					backHref="/media"
					backText={t('back')}
					title={media?.title}
				/>
			}
		>
			{isLoading && (
				<div className="mx-auto grid max-w-6xl gap-8 animate-pulse lg:grid-cols-2">
					<div className="space-y-6">
						<Skeleton className="aspect-[16/9] rounded-2xl bg-secondary/50" />
					</div>
					<div className="space-y-6">
						<Skeleton className="h-10 w-3/4 bg-secondary/50" />
						<Skeleton className="h-6 w-1/2 bg-secondary/50" />
						<div className="flex gap-4">
							<Skeleton className="h-8 w-24 bg-secondary/50" />
							<Skeleton className="h-8 w-24 bg-secondary/50" />
						</div>
						<div className="flex gap-4 pt-4">
							<Skeleton className="h-12 flex-1 bg-secondary/50" />
							<Skeleton className="h-12 flex-1 bg-secondary/50" />
						</div>
					</div>
				</div>
			)}

			{isError && (
				<div className="mx-auto max-w-2xl">
					<Card className="glass border-destructive/20 bg-destructive/5">
						<CardContent className="p-12 text-center">
							<p className="text-destructive font-medium text-lg">
								{t('error')}
							</p>
						</CardContent>
					</Card>
				</div>
			)}

			{media && (
				<div className="mx-auto max-w-6xl space-y-10 pb-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
					<div className="grid gap-8 lg:grid-cols-2">
						<div className="rounded-2xl overflow-hidden shadow-lg ring-1 ring-border/50">
							<MediaVideoPreview media={media} id={id} />
						</div>

						<div className="flex flex-col justify-center p-6 glass rounded-3xl">
							<MediaMetadata media={media} />
						</div>
					</div>

					<MediaStorageInfo media={media} />

					<div>
						<div className="glass rounded-3xl p-6 space-y-6">
							<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
								<h3 className="text-lg font-semibold text-foreground">{t('actions.title')}</h3>
								<div className="grid w-full gap-3 sm:grid-flow-col sm:auto-cols-max sm:items-center sm:w-auto">
									<div className="w-full sm:w-64">
										<ProxySelector
											value={selectedProxyId}
											onValueChange={setSelectedProxyId}
											disabled={refreshMetadataMutation.isPending}
											allowDirect={true}
										/>
									</div>
									<Button
										variant="outline"
										size="lg"
										className="h-11 w-full sm:w-auto bg-transparent border-border/50 hover:bg-secondary/50 transition-all"
										onClick={() =>
											refreshMetadataMutation.mutate({
												id,
												proxyId: selectedProxyId === 'none' ? undefined : selectedProxyId,
											})
										}
										disabled={refreshMetadataMutation.isPending || !media?.url}
									>
										<RefreshCw className={`w-4 h-4 mr-2 ${refreshMetadataMutation.isPending ? 'animate-spin' : ''}`} strokeWidth={1.5} />
										{refreshMetadataMutation.isPending ? t('actions.syncing') : t('actions.sync')}
									</Button>
								</div>
							</div>

							<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
								<Link href={`/media/${id}/subtitles`} className="block">
									<Button
										variant="default"
										size="lg"
										className="h-12 w-full justify-start gap-3 shadow-sm hover:shadow-md transition-all"
									>
										<FileText className="w-4 h-4" strokeWidth={1.5} />
										<span className="font-semibold">{t('tabs.subtitlesAction')}</span>
									</Button>
								</Link>

								<Link href={`/media/${id}/comments`} className="block">
									<Button
									variant="outline"
									size="lg"
										className="h-12 w-full justify-start gap-3 bg-transparent border-border/50 hover:bg-secondary/50 transition-all"
									>
										<MessageSquare className="w-4 h-4" strokeWidth={1.5} />
										<span className="font-semibold">{t('tabs.commentsAction')}</span>
									</Button>
								</Link>
							</div>
						</div>
					</div>
				</div>
			)}
		</WorkspacePageShell>
	)
}
