'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
	Calendar,
	Eye,
	MessageCircle,
	ThumbsUp,
	Trash2,
	User,
	Video,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Skeleton } from '~/components/ui/skeleton'
import { type schema } from '~/lib/db'
import { queryOrpc } from '~/lib/orpc/query-client'
import { formatNumber } from '~/lib/utils/format/format'
import { getTimeAgo as formatTimeAgo } from '~/lib/utils/time'
import { useConfirmDialog } from '~/components/business/layout/confirm-dialog-provider'

type MediaCardProps = {
	media: typeof schema.media.$inferSelect
}

// 缩略图组件
function MediaThumbnail({
	media,
}: {
	media: typeof schema.media.$inferSelect
}) {
	const [imageError, setImageError] = useState(false)
	const [imageLoading, setImageLoading] = useState(true)

	return (
		<div className="relative aspect-video overflow-hidden bg-muted rounded-t-lg">
			{media.thumbnail && !imageError ? (
				<>
						<Image
							src={media.thumbnail}
							alt={media.title}
							fill
							className={`object-cover ${
								imageLoading ? 'blur-sm' : 'blur-0'
							}`}
							onLoad={() => setImageLoading(false)}
							onError={() => setImageError(true)}
							loading="lazy"
							unoptimized
							sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
						/>
					{imageLoading && (
						<div className="absolute inset-0 flex items-center justify-center">
							<Skeleton className="h-full w-full" />
						</div>
					)}
					</>
			) : (
				<div className="flex h-full items-center justify-center">
					<Video className="h-12 w-12 text-muted-foreground" />
				</div>
			)}

			{/* 质量标签 */}
			{media.quality && (
				<div className="absolute top-2 right-2">
					<Badge variant="secondary" className="text-xs font-medium">
						{media.quality}
					</Badge>
				</div>
			)}
		</div>
	)
}

// 媒体信息组件
function MediaInfo({ media }: { media: typeof schema.media.$inferSelect }) {
	return (
		<CardHeader className="p-4 pb-2">
			<div className="space-y-2">
				<CardTitle className="text-base font-semibold line-clamp-2 leading-tight">
					{media.title}
				</CardTitle>
				{media.translatedTitle && (
					<CardTitle className="text-sm font-medium line-clamp-2 leading-tight text-muted-foreground">
						{media.translatedTitle}
					</CardTitle>
				)}
			</div>
		</CardHeader>
	)
}

// 媒体元数据组件
function MediaMetadata({ media }: { media: typeof schema.media.$inferSelect }) {
	return (
		<CardContent className="p-4 pt-0 space-y-3">
			{/* 作者信息 */}
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<User className="h-3 w-3 flex-shrink-0" />
				<span className="line-clamp-1 font-medium">{media.author}</span>
			</div>

			{/* 统计信息 */}
			<div className="flex items-center gap-4 text-xs text-muted-foreground">
				<div className="flex items-center gap-1">
					<Eye className="h-3 w-3" />
					<span>{formatNumber(media.viewCount ?? 0)}</span>
				</div>
				{media.likeCount && media.likeCount > 0 && (
					<div className="flex items-center gap-1">
						<ThumbsUp className="h-3 w-3" />
						<span>{formatNumber(media.likeCount)}</span>
					</div>
				)}
				{media.commentCount && media.commentCount > 0 && (
					<div className="flex items-center gap-1">
						<MessageCircle className="h-3 w-3" />
						<span>{formatNumber(media.commentCount)}</span>
					</div>
				)}
			</div>

			{/* 时间信息 */}
			<div className="flex items-center gap-2 text-xs text-muted-foreground">
				<Calendar className="h-3 w-3" />
				<span>{formatTimeAgo(media.createdAt)}</span>
			</div>
		</CardContent>
	)
}

export function MediaCard({ media }: MediaCardProps) {
	const queryClient = useQueryClient()
	const confirmDialog = useConfirmDialog()

	const deleteMediaMutation = useMutation({
		...queryOrpc.media.deleteById.mutationOptions(),
		onSuccess: () => {
			toast.success('Media deleted successfully.')
			queryClient.invalidateQueries({
				queryKey: queryOrpc.media.list.key(),
			})
		},
		onError: (error) => {
			toast.error(`Failed to delete media: ${error.message}`)
		},
	})

	const handleDelete = async (e: React.MouseEvent, id: string) => {
		e.preventDefault() // Prevent navigation
		e.stopPropagation()
		const confirmed = await confirmDialog({
			title: 'Delete media',
			description: 'Are you sure you want to delete this media?',
			variant: 'destructive',
		})
		if (!confirmed) return
		deleteMediaMutation.mutate({ id })
	}

	return (
		<Card className="group relative overflow-hidden glass border-none shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
			<Link
				href={`/media/${media.id}`}
				className="block h-full focus-visible:outline-none"
				aria-label={`View details for ${media.title}`}
			>
				<div className="relative aspect-video overflow-hidden bg-secondary/20">
					{media.thumbnail ? (
						<Image
							src={media.thumbnail}
							alt={media.title}
							fill
							className="object-cover transition-transform duration-500 group-hover:scale-105"
							loading="lazy"
							unoptimized
							sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
						/>
					) : (
						<div className="flex h-full items-center justify-center">
							<Video className="h-10 w-10 text-muted-foreground/30" strokeWidth={1.5} />
						</div>
					)}
					
					{/* Overlay Gradient */}
					<div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

					{/* Quality Badge */}
					{media.quality && (
						<div className="absolute top-3 right-3">
							<Badge variant="secondary" className="glass border-none text-xs font-medium backdrop-blur-md bg-black/30 text-white hover:bg-black/40">
								{media.quality}
							</Badge>
						</div>
					)}

					{/* Delete Button (Visible on Hover) */}
					<div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
						<Button
							variant="destructive"
							size="icon"
							className="h-8 w-8 rounded-full shadow-sm"
							onClick={(e) => handleDelete(e, media.id)}
							disabled={deleteMediaMutation.isPending}
							aria-label={`Delete ${media.title}`}
						>
							<Trash2 className="w-4 h-4" strokeWidth={1.5} />
						</Button>
					</div>
				</div>

				<div className="p-5 space-y-4">
					<div className="space-y-1.5">
						<h3 className="text-base font-semibold leading-snug line-clamp-2 text-foreground group-hover:text-primary transition-colors">
							{media.title}
						</h3>
						{media.translatedTitle && (
							<p className="text-sm text-muted-foreground line-clamp-1 font-light">
								{media.translatedTitle}
							</p>
						)}
					</div>

					<div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
						<div className="flex items-center gap-2">
							<User className="h-3.5 w-3.5" strokeWidth={1.5} />
							<span className="line-clamp-1 max-w-[100px]">{media.author}</span>
						</div>
						<div className="flex items-center gap-1.5">
							<Calendar className="h-3.5 w-3.5" strokeWidth={1.5} />
							<span>{formatTimeAgo(media.createdAt)}</span>
						</div>
					</div>

					<div className="flex items-center gap-4 pt-2 border-t border-border/40 text-xs text-muted-foreground/80">
						<div className="flex items-center gap-1.5">
							<Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
							<span>{formatNumber(media.viewCount ?? 0)}</span>
						</div>
						{(media.likeCount ?? 0) > 0 && (
							<div className="flex items-center gap-1.5">
								<ThumbsUp className="h-3.5 w-3.5" strokeWidth={1.5} />
								<span>{formatNumber(media.likeCount ?? 0)}</span>
							</div>
						)}
						{(media.commentCount ?? 0) > 0 && (
							<div className="flex items-center gap-1.5">
								<MessageCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
								<span>{formatNumber(media.commentCount ?? 0)}</span>
							</div>
						)}
					</div>
				</div>
			</Link>
		</Card>
	)
}
