'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
	ArrowLeft,
	Copy,
	Download,
	Film,
	LanguagesIcon,
	MessageCircle,
	ThumbsUp,
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

	const copyToClipboard = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text)
			toast.success('Copied to clipboard!')
		} catch (err) {
			toast.error('Failed to copy to clipboard')
		}
	}

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
		<div className="container mx-auto py-6 px-4 max-w-6xl">
			{/* Header Section */}
			<div className="mb-6">
				<div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
					<div className="flex items-center gap-3">
						<Link href={`/media/${id}`}>
							<Button
								variant="outline"
								size="sm"
								className="flex items-center gap-2"
							>
								<ArrowLeft className="w-4 h-4" />
								Back
							</Button>
						</Link>
						<div className="h-4 w-px bg-border" />
						{mediaQuery.data && (
							<Badge variant="secondary" className="text-xs">
								{comments.length} comments
							</Badge>
						)}
					</div>

					{/* Actions */}
					<div className="flex flex-wrap items-center gap-2">
						<Select value={pages} onValueChange={setPages}>
							<SelectTrigger className="w-[120px] h-9">
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
							className="h-9"
						>
							<Download className="w-4 h-4 mr-2" />
							{downloadCommentsMutation.isPending
								? 'Downloading...'
								: 'Download'}
						</Button>
						<Select value={model} onValueChange={setModel}>
							<SelectTrigger className="w-[160px] h-9">
								<SelectValue placeholder="Model" />
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
							className="h-9"
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
							className="h-9"
						>
							<Film className="w-4 h-4 mr-2" />
							{renderMutation.isPending ? 'Rendering...' : 'Render'}
						</Button>
					</div>
				</div>

				{/* Media Info */}
				<div className="space-y-3">
					{mediaQuery.isLoading ? (
						<div className="space-y-2">
							<Skeleton className="h-8 w-2/3" />
							<Skeleton className="h-4 w-1/2" />
						</div>
					) : mediaQuery.data ? (
						<div className="space-y-3">
							<h1 className="text-xl sm:text-2xl font-bold text-foreground leading-tight">
								{mediaQuery.data.title}
							</h1>
							{mediaQuery.data.translatedTitle && (
								<div className="flex items-center gap-2">
									<p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
										{mediaQuery.data.translatedTitle}
									</p>
									<Button
										variant="ghost"
										size="sm"
										onClick={() =>
											copyToClipboard(mediaQuery.data.translatedTitle!)
										}
										className="flex-shrink-0 h-6 w-6 p-0"
									>
										<Copy className="w-3 h-3" />
									</Button>
								</div>
							)}
						</div>
					) : null}
				</div>
			</div>

			{/* Comments Section */}
			<Card className="shadow-sm">
				<CardHeader className="pb-3">
					<CardTitle className="text-lg">Comments</CardTitle>
				</CardHeader>
				<CardContent className="pt-0">
					{mediaQuery.isLoading && (
						<div className="space-y-4">
							{[...Array(3)].map((_, i) => (
								<div
									key={`skeleton-${i}`}
									className="flex items-start gap-3 p-3"
								>
									<Skeleton className="w-8 h-8 rounded-full" />
									<div className="flex-1 space-y-2">
										<Skeleton className="h-4 w-24" />
										<Skeleton className="h-3 w-full" />
										<Skeleton className="h-3 w-4/5" />
									</div>
								</div>
							))}
						</div>
					)}
					{mediaQuery.isError && (
						<div className="text-center py-8">
							<p className="text-destructive text-sm">
								Failed to load comments.
							</p>
						</div>
					)}
					{comments.length === 0 && !mediaQuery.isLoading && (
						<div className="text-center py-12">
							<div className="max-w-sm mx-auto">
								<div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
									<LanguagesIcon className="w-6 h-6 text-muted-foreground" />
								</div>
								<h3 className="text-base font-semibold mb-2">
									No comments yet
								</h3>
								<p className="text-muted-foreground text-sm mb-4">
									Download comments from YouTube to get started with analysis
									and translation.
								</p>
							</div>
						</div>
					)}
					{comments.length > 0 && (
						<div className="space-y-4">
							{comments.map((comment) => (
								<div key={comment.id} className="group">
									<div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors">
										<div className="flex-shrink-0">
											<Image
												src={comment.authorThumbnail || '/default-avatar.png'}
												alt={comment.author}
												width={32}
												height={32}
												className="w-8 h-8 rounded-full border border-background"
											/>
										</div>
										<div className="flex-1 min-w-0">
											<div className="flex items-center justify-between mb-1">
												<div className="flex items-center gap-2 min-w-0">
													<p className="font-medium text-sm truncate">
														{comment.author}
													</p>
													<div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
														<span className="flex items-center gap-1">
															<ThumbsUp className="w-3 h-3" /> {comment.likes}
														</span>
														<span className="flex items-center gap-1">
															<MessageCircle className="w-3 h-3" />{' '}
															{comment.replyCount}
														</span>
													</div>
												</div>
												<Button
													variant="ghost"
													size="sm"
													onClick={() =>
														deleteCommentMutation.mutate({
															mediaId: id,
															commentId: comment.id,
														})
													}
													disabled={deleteCommentMutation.isPending}
													className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
												>
													<Trash2 className="w-3 h-3 text-destructive" />
												</Button>
											</div>
											<div className="space-y-2">
												<p className="text-sm leading-relaxed">
													{comment.content}
												</p>
												{comment.translatedContent && (
													<div
														key={`translated-${comment.id}`}
														className="border-l-2 border-primary/20 pl-3 py-1 bg-primary/5 rounded-r-md"
													>
														<p className="text-sm text-muted-foreground leading-relaxed">
															{comment.translatedContent}
														</p>
														<Badge variant="outline" className="mt-1 text-xs">
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
					)}
				</CardContent>
			</Card>
		</div>
	)
}
