'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Calendar, Eye, FileText, Heart, MessageSquare, RefreshCw, User, Play } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { Skeleton } from '~/components/ui/skeleton'
import { queryOrpc } from '~/lib/orpc/query-client'
import { formatNumber } from '~/lib/utils/format/format'
import { getTimeAgo as formatTimeAgo } from '~/lib/utils/time'
import type { MediaItem } from '~/lib/media/types'
import { toast } from 'sonner'
import { ProxySelector } from '~/components/business/proxy/proxy-selector'

// Clean media thumbnail component
function MediaThumbnail({ media }: { media: MediaItem }) {
	const [thumbnailError, setThumbnailError] = useState(false)

	return (
		<div className="relative group">
			{media.thumbnail && !thumbnailError ? (
				<div className="relative aspect-[16/9] rounded-xl overflow-hidden bg-gradient-to-br from-muted to-muted/50 shadow-sm">
					<Image
						src={media.thumbnail}
						alt={media.title}
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
				toast.success('Metadata synced from source.')
				await queryClient.invalidateQueries({
					queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
				})
				await queryClient.invalidateQueries({
					queryKey: queryOrpc.media.list.key(),
				})
			},
			onError: (error) => {
				toast.error(`Failed to sync metadata: ${error.message}`)
			},
		}),
	)

	return (
		<div className="min-h-screen space-y-8">
			{/* Back navigation */}
			<div className="px-6 py-6 animate-in fade-in slide-in-from-top-2 duration-500">
				<Link
					href="/media"
					className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
				>
					<ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" strokeWidth={1.5} />
					Back to Media Library
				</Link>
			</div>

			{/* Loading State */}
			{isLoading && (
				<div className="px-6 grid gap-8 lg:grid-cols-2 max-w-6xl mx-auto animate-pulse">
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

			{/* Error State */}
			{isError && (
				<div className="px-6 max-w-2xl mx-auto">
					<Card className="glass border-destructive/20 bg-destructive/5">
						<CardContent className="p-12 text-center">
							<p className="text-destructive font-medium text-lg">
								Failed to load media details. Please try again.
							</p>
						</CardContent>
					</Card>
				</div>
			)}

			{/* Media Content */}
			{media && (
				<div className="px-6 pb-12 space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
					{/* Header Section */}
					<div className="grid gap-8 lg:grid-cols-2 max-w-6xl mx-auto">
						{/* Preview (fallbacks to thumbnail) */}
						<div className="rounded-2xl overflow-hidden shadow-lg ring-1 ring-border/50">
							<MediaVideoPreview media={media} id={id} />
						</div>

						{/* Metadata */}
						<div className="flex flex-col justify-center p-6 glass rounded-3xl">
							<MediaMetadata media={media} />
						</div>
					</div>

					{/* Actions Section */}
					<div className="max-w-6xl mx-auto">
						<div className="glass rounded-3xl p-6 space-y-6">
							<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
								<h3 className="text-lg font-semibold text-foreground">Actions</h3>
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
										{refreshMetadataMutation.isPending ? 'Syncing…' : 'Sync info'}
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
										<span className="font-semibold">Generate Subtitles</span>
									</Button>
								</Link>

								<Link href={`/media/${id}/comments`} className="block">
									<Button
										variant="outline"
										size="lg"
										className="h-12 w-full justify-start gap-3 bg-transparent border-border/50 hover:bg-secondary/50 transition-all"
									>
										<MessageSquare className="w-4 h-4" strokeWidth={1.5} />
										<span className="font-semibold">View Comments</span>
									</Button>
								</Link>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
