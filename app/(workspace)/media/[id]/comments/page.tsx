'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, Film } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
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
import { queryOrpc } from '~/lib/orpc/query-client'

export default function CommentsPage() {
	const params = useParams()
	const id = params.id as string
	const queryClient = useQueryClient()
	const [pages, setPages] = useState('3')

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
		<div className="container mx-auto py-8">
			<div className="mb-6 flex justify-between items-center">
				<Link href={`/media/${id}`}>
					<Button variant="outline" className="flex items-center gap-2">
						<ArrowLeft className="w-4 h-4" />
						Back to Media
					</Button>
				</Link>
				<div className="flex items-center gap-2">
					<Select value={pages} onValueChange={setPages}>
						<SelectTrigger className="w-[180px]">
							<SelectValue placeholder="Select pages" />
						</SelectTrigger>
						<SelectContent>
							{[...Array(10).keys()].map((i) => (
								<SelectItem key={i + 1} value={String(i + 1)}>
									Download {i + 1} page{i > 0 ? 's' : ''}
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
					>
						<Download className="w-4 h-4 mr-2" />
						{downloadCommentsMutation.isPending
							? 'Downloading...'
							: 'Download Comments'}
					</Button>
					<Button
						onClick={() => renderMutation.mutate({ mediaId: id })}
						disabled={renderMutation.isPending}
						className="flex items-center gap-2"
					>
						<Film className="w-4 h-4" />
						{renderMutation.isPending ? 'Rendering...' : 'Render Video'}
					</Button>
				</div>
			</div>

			{mediaQuery.isLoading && <Skeleton className="h-8 w-1/2 mb-4" />}
			{mediaQuery.data && (
				<h1 className="text-3xl font-bold mb-6">
					Comments for {mediaQuery.data.title}
				</h1>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Comments ({comments.length || 0})</CardTitle>
				</CardHeader>
				<CardContent>
					{mediaQuery.isLoading && <p>Loading comments...</p>}
					{mediaQuery.isError && <p>Failed to load comments.</p>}
					{comments.length === 0 && !mediaQuery.isLoading && (
						<div className="text-center py-12">
							<p className="text-gray-500">No comments yet.</p>
							<p className="text-sm text-gray-400 mt-2">
								Click the download button to fetch comments from YouTube.
							</p>
						</div>
					)}
					<div className="space-y-4">
						{comments.map((comment) => (
							<div key={comment.id} className="flex items-start gap-4">
								<img
									src={comment.authorThumbnail || '/default-avatar.png'}
									alt={comment.author}
									className="w-10 h-10 rounded-full"
								/>
								<div className="flex-1">
									<p className="font-semibold">{comment.author}</p>
									<p className="text-sm">{comment.content}</p>
									<div className="text-xs text-gray-500 flex items-center gap-4 mt-1">
										<span>Likes: {comment.likes}</span>
										<span>Replies: {comment.replyCount}</span>
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
