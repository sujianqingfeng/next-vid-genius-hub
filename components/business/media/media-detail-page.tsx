'use client'

import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Calendar, Download, Eye, FileText, Heart, MessageSquare, User, Play } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { Skeleton } from '~/components/ui/skeleton'
import { queryOrpc } from '~/lib/orpc/query-client'
import { formatNumber, formatTimeAgo } from '~/lib/utils'
import type { MediaItem } from '~/lib/types/media.types'

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


export function MediaDetailPageClient({ id }: { id: string }) {
	const mediaQuery = useQuery(
		queryOrpc.media.byId.queryOptions({
			input: { id },
		}),
	)

	const { data: media, isLoading, isError } = mediaQuery

	return (
		<div className="min-h-screen bg-background">
			{/* Back navigation */}
			<div className="px-4 py-6">
				<Link
					href="/media"
					className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
				>
					<ArrowLeft className="w-4 h-4" />
					Back to Media Library
				</Link>
			</div>

			{/* Loading State */}
			{isLoading && (
				<div className="px-4 grid gap-6 lg:grid-cols-2">
					<div className="space-y-4">
						<Skeleton className="aspect-[16/9] rounded-lg" />
						<Skeleton className="h-7 w-3/4" />
						<Skeleton className="h-4 w-1/2" />
						<div className="flex gap-4">
							<Skeleton className="h-4 w-20" />
							<Skeleton className="h-4 w-16" />
						</div>
					</div>
					<div className="flex gap-3">
						{Array.from({ length: 3 }).map((_, i) => (
							<Skeleton key={i} className="h-10 flex-1" />
						))}
					</div>
				</div>
			)}

			{/* Error State */}
			{isError && (
				<div className="px-4">
					<Card className="border-destructive/50 bg-destructive/5">
						<CardContent className="p-8 text-center">
							<p className="text-destructive font-medium">
								Failed to load media details. Please try again.
							</p>
						</CardContent>
					</Card>
				</div>
			)}

			{/* Media Content */}
			{media && (
				<div className="px-4 pb-8 space-y-8">
					{/* Header Section */}
					<div className="grid gap-6 lg:grid-cols-2 max-w-5xl mx-auto">
						{/* Thumbnail */}
						<div>
							<MediaThumbnail media={media} />
						</div>

						{/* Metadata */}
						<div className="flex flex-col justify-center">
							<MediaMetadata media={media} />
						</div>
					</div>

					{/* Actions Section */}
					<div className="flex flex-wrap gap-3 max-w-5xl mx-auto">
						<Link href={`/media/${id}/subtitles`}>
							<Button variant="default" size="lg" className="flex items-center gap-2">
								<FileText className="w-4 h-4" />
								Generate Subtitles
							</Button>
						</Link>

						<Link href={`/media/${id}/comments`}>
							<Button variant="outline" size="lg" className="flex items-center gap-2">
								<MessageSquare className="w-4 h-4" />
								View Comments
							</Button>
						</Link>

						<Link href={`/media/download?id=${id}`}>
							<Button variant="secondary" size="lg" className="flex items-center gap-2">
								<Download className="w-4 h-4" />
								Download
							</Button>
						</Link>
					</div>
				</div>
			)}
		</div>
	)
}
