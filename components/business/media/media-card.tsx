'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
	Calendar,
	Eye,
	MessageCircle,
	Play,
	ThumbsUp,
	Trash2,
	User,
	Video,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '~/components/ui/alert-dialog'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Skeleton } from '~/components/ui/skeleton'
import { type schema } from '~/lib/db'
import { queryOrpc } from '~/lib/orpc/query-client'

type MediaCardProps = {
	media: typeof schema.media.$inferSelect
}

// 格式化数字显示
function formatNumber(num: number): string {
	if (num >= 1000000) {
		return `${(num / 1000000).toFixed(1)}M`
	}
	if (num >= 1000) {
		return `${(num / 1000).toFixed(1)}K`
	}
	return num.toString()
}

// 格式化时间显示
function formatTimeAgo(date: Date): string {
	const now = new Date()
	const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

	if (diffInSeconds < 60) return 'Just now'
	if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
	if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
	if (diffInSeconds < 2592000)
		return `${Math.floor(diffInSeconds / 86400)}d ago`
	return `${Math.floor(diffInSeconds / 2592000)}mo ago`
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
						className={`object-cover transition-all duration-300 group-hover:scale-105 ${
							imageLoading ? 'blur-sm' : 'blur-0'
						}`}
						onLoad={() => setImageLoading(false)}
						onError={() => setImageError(true)}
						loading="lazy"
						sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
					/>
					{imageLoading && (
						<div className="absolute inset-0 flex items-center justify-center">
							<Skeleton className="h-full w-full" />
						</div>
					)}
					{/* 播放按钮覆盖层 */}
					<div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
						<div className="bg-black/50 rounded-full p-3">
							<Play className="h-6 w-6 text-white fill-white" />
						</div>
					</div>
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
				<CardTitle className="text-base font-semibold line-clamp-2 leading-tight group-hover:text-primary transition-colors">
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

// 删除按钮组件
function DeleteButton({
	media,
	onDelete,
}: {
	media: typeof schema.media.$inferSelect
	onDelete: (id: string) => void
}) {
	return (
		<div className="p-4 pt-0">
			<AlertDialog>
				<AlertDialogTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className="w-full flex items-center gap-2 text-destructive hover:text-destructive hover:bg-destructive/5 transition-colors"
						aria-label={`Delete ${media.title}`}
					>
						<Trash2 className="w-3 h-3" />
						Delete
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Media</AlertDialogTitle>
						<AlertDialogDescription>
							This action cannot be undone. This will permanently delete the
							media file and all associated data.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => onDelete(media.id)}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

export function MediaCard({ media }: MediaCardProps) {
	const queryClient = useQueryClient()

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

	const handleDelete = (id: string) => {
		deleteMediaMutation.mutate({ id })
	}

	return (
		<Card className="group overflow-hidden transition-all duration-300 hover:shadow-xl hover:scale-[1.02] border-border/50 bg-card/50 backdrop-blur-sm pt-0">
			<Link
				href={`/media/${media.id}`}
				className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
				aria-label={`View details for ${media.title}`}
			>
				<MediaThumbnail media={media} />
				<MediaInfo media={media} />
				<MediaMetadata media={media} />
			</Link>
			<DeleteButton media={media} onDelete={handleDelete} />
		</Card>
	)
}
