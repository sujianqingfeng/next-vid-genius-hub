'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
	ArrowLeft,
	Download,
	Film,
	LanguagesIcon,
	MoreHorizontal,
	Trash2,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { Skeleton } from '~/components/ui/skeleton'
import { AIModelIds } from '~/lib/ai'
import { queryOrpc } from '~/lib/orpc/query-client'

export default function CommentsPage() {
	const params = useParams()
	const id = params.id as string
	const queryClient = useQueryClient()
	const [pages, setPages] = useState('3')
	const [model, setModel] = useState<string>(AIModelIds[0])

	const mediaQuery = useQuery(
		queryOrpc.media.byId.queryOptions({
			input: { id },
		}),
	)

	const downloadCommentsMutation = useMutation(
		queryOrpc.comment.downloadComments.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
				})
				toast.success('Comments downloaded!')
			},
			onError: (error) => {
				toast.error(`Failed to download comments: ${error.message}`)
			},
		}),
	)

	const translateCommentsMutation = useMutation(
		queryOrpc.comment.translateComments.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
				})
				toast.success('Comments translated!')
			},
			onError: (error) => {
				toast.error(`Failed to translate comments: ${error.message}`)
			},
		}),
	)

	const deleteCommentMutation = useMutation(
	queryOrpc.comment.deleteComment.mutationOptions({
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
			})
			toast.success('Comment deleted!')
		},
		onError: (error) => {
			toast.error(`Failed to delete comment: ${error.message}`)
		},
	}),
)

const renderMutation = useMutation({
		...queryOrpc.comment.renderWithInfo.mutationOptions(),
		onSuccess: () => {
			toast.success('Video rendering started!')
		},
		onError: (error) => {
			toast.error(`Failed to start rendering: ${error.message}`)
		},
	})

	const comments = mediaQuery.data?.comments || []

	return (
		<div className="container mx-auto py-6 px-4 max-w-7xl">
			{/* Header Section */}
			<div className="mb-8">
				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
					<Link href={`/media/${id}`}>
						<Button variant="outline" className="flex items-center gap-2">
							<ArrowLeft className="w-4 h-4" />
							Back to Media
						</Button>
					</Link>

					{/* Mobile Actions Dropdown */}
					<div className="sm:hidden">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" size="sm">
									<MoreHorizontal className="w-4 h-4" />
									Actions
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-48">
								<DropdownMenuItem
									onClick={() =>
										downloadCommentsMutation.mutate({
											mediaId: id,
											pages: parseInt(pages, 10),
										})
									}
									disabled={downloadCommentsMutation.isPending}
								>
									<Download className="w-4 h-4 mr-2" />
									{downloadCommentsMutation.isPending
										? 'Downloading...'
										: 'Download Comments'}
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() =>
										translateCommentsMutation.mutate({ mediaId: id, model })
									}
									disabled={translateCommentsMutation.isPending}
								>
									<LanguagesIcon className="w-4 h-4 mr-2" />
									{translateCommentsMutation.isPending
										? 'Translating...'
										: 'Translate Comments'}
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() => renderMutation.mutate({ mediaId: id })}
									disabled={renderMutation.isPending}
								>
									<Film className="w-4 h-4 mr-2" />
									{renderMutation.isPending ? 'Rendering...' : 'Render Video'}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>

					{/* Desktop Actions */}
					<div className="hidden sm:flex items-center gap-3">
						<Select value={pages} onValueChange={setPages}>
							<SelectTrigger className="w-[140px]">
								<SelectValue placeholder="Pages" />
							</SelectTrigger>
							<SelectContent>
								{[...Array(10).keys()].map((i) => (
									<SelectItem key={i + 1} value={String(i + 1)}>
										{i + 1} page{i > 0 ? 's' : ''}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button
							onClick={() =>
								downloadCommentsMutation.mutate({
									mediaId: id,
									pages: parseInt(pages, 10),
								})
							}
							disabled={downloadCommentsMutation.isPending}
							size="sm"
						>
							<Download className="w-4 h-4 mr-2" />
							{downloadCommentsMutation.isPending
								? 'Downloading...'
								: 'Download'}
						</Button>
						<Select value={model} onValueChange={setModel}>
							<SelectTrigger className="w-[200px]">
								<SelectValue placeholder="Select model" />
							</SelectTrigger>
							<SelectContent>
								{AIModelIds.map((modelId) => (
									<SelectItem key={modelId} value={modelId}>
										{modelId}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button
							onClick={() =>
								translateCommentsMutation.mutate({ mediaId: id, model })
							}
							disabled={translateCommentsMutation.isPending}
							size="sm"
						>
							<LanguagesIcon className="w-4 h-4 mr-2" />
							{translateCommentsMutation.isPending
								? 'Translating...'
								: 'Translate'}
						</Button>
						<Button
							onClick={() => renderMutation.mutate({ mediaId: id })}
							disabled={renderMutation.isPending}
							size="sm"
						>
							<Film className="w-4 h-4 mr-2" />
							{renderMutation.isPending ? 'Rendering...' : 'Render'}
						</Button>
					</div>
				</div>

				{/* Media Info */}
				{mediaQuery.isLoading && (
					<div className="space-y-2">
						<Skeleton className="h-8 w-2/3" />
						<Skeleton className="h-4 w-1/2" />
					</div>
				)}
				{mediaQuery.data && (
					<div className="space-y-2">
						<h1 className="text-2xl sm:text-3xl font-bold text-foreground">
							{mediaQuery.data.title}
						</h1>
						{mediaQuery.data.translatedTitle && (
							<p className="text-base sm:text-lg text-muted-foreground">
								{mediaQuery.data.translatedTitle}
							</p>
						)}
					</div>
				)}
			</div>

			{/* Comments Section */}
			<Card className="shadow-sm">
				<CardHeader className="pb-4">
					<div className="flex items-center justify-between">
						<CardTitle className="text-xl">Comments</CardTitle>
						<Badge variant="secondary" className="text-sm">
							{comments.length || 0} comments
						</Badge>
					</div>
				</CardHeader>
				<CardContent className="pt-0">
					{mediaQuery.isLoading && (
						<div className="space-y-4">
							{[...Array(3)].map((_, i) => (
								<div key={`skeleton-${i}`} className="flex items-start gap-4">
									<Skeleton className="w-10 h-10 rounded-full" />
									<div className="flex-1 space-y-2">
										<Skeleton className="h-4 w-32" />
										<Skeleton className="h-4 w-full" />
										<Skeleton className="h-4 w-3/4" />
									</div>
								</div>
							))}
						</div>
					)}
					{mediaQuery.isError && (
						<div className="text-center py-12">
							<p className="text-destructive">Failed to load comments.</p>
						</div>
					)}
					{comments.length === 0 && !mediaQuery.isLoading && (
						<div className="text-center py-16">
							<div className="max-w-md mx-auto">
								<div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
									<LanguagesIcon className="w-8 h-8 text-muted-foreground" />
								</div>
								<h3 className="text-lg font-semibold mb-2">No comments yet</h3>
								<p className="text-muted-foreground mb-4">
									Download comments from YouTube to get started with analysis
									and translation.
								</p>
								<Button
									onClick={() =>
										downloadCommentsMutation.mutate({
											mediaId: id,
											pages: parseInt(pages, 10),
										})
									}
									disabled={downloadCommentsMutation.isPending}
									className="sm:hidden"
								>
									<Download className="w-4 h-4 mr-2" />
									{downloadCommentsMutation.isPending
										? 'Downloading...'
										: 'Download Comments'}
								</Button>
							</div>
						</div>
					)}
					<div className="space-y-6">
						{comments.map((comment) => (
							<div key={comment.id} className="group">
								<div className="flex items-start gap-4 p-4 rounded-lg hover:bg-muted/50 transition-colors">
									<div className="flex-shrink-0">
										<Image
											src={comment.authorThumbnail || '/default-avatar.png'}
											alt={comment.author}
											width={40}
											height={40}
											className="w-10 h-10 rounded-full border-2 border-background shadow-sm"
										/>
									</div>
									<div className="flex-1 min-w-0">
										<div className="flex items-center justify-between mb-2">
											<div className="flex items-center gap-2">
												<p className="font-semibold text-sm truncate">
													{comment.author}
												</p>
												<div className="flex items-center gap-3 text-xs text-muted-foreground">
													<span className="flex items-center gap-1">
														👍 {comment.likes}
													</span>
													<span className="flex items-center gap-1">
														💬 {comment.replyCount}
													</span>
												</div>
											</div>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => deleteCommentMutation.mutate({ mediaId: id, commentId: comment.id })}
												disabled={deleteCommentMutation.isPending}
												className="opacity-0 group-hover:opacity-100 transition-opacity"
											>
												<Trash2 className="w-4 h-4 text-destructive" />
											</Button>
										</div>
										<div className="space-y-3">
											<p className="text-sm leading-relaxed">
												{comment.content}
											</p>
											{comment.translatedContent && (
												<div
													key={`translated-${comment.id}`}
													className="border-l-2 border-primary/20 pl-4 py-2 bg-primary/5 rounded-r-md"
												>
													<p className="text-sm text-muted-foreground leading-relaxed">
														{comment.translatedContent}
													</p>
													<Badge variant="outline" className="mt-2 text-xs">
														Translated
													</Badge>
												</div>
											)}
										</div>
									</div>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>
		</div>
	)
}
