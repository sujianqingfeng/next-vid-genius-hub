'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LanguagesIcon, MessageCircle, ThumbsUp, Trash2 } from 'lucide-react'
import Image from 'next/image'
import { toast } from 'sonner'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { queryOrpc } from '~/lib/orpc/query-client'

interface Comment {
	id: string
	author: string
	authorThumbnail?: string
	content: string
	translatedContent?: string
	likes: number
	replyCount?: number
}

interface CommentCardProps {
	comment: Comment
	mediaId: string
}

export function CommentCard({ comment, mediaId }: CommentCardProps) {
	const queryClient = useQueryClient()

	const deleteCommentMutation = useMutation(
		queryOrpc.comment.deleteComment.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: queryOrpc.media.byId.queryKey({ input: { id: mediaId } }),
				})
				toast.success('Comment deleted!')
			},
			onError: (error) => {
				toast.error(`Failed to delete comment: ${error.message}`)
			},
		}),
	)

	return (
		<div className="group">
			<div className="flex items-start gap-4 p-4 rounded-lg hover:bg-muted/30 transition-colors border border-transparent hover:border-border/50">
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
					<div className="flex items-start justify-between mb-2">
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2 mb-1">
								<p className="font-semibold text-sm truncate">
									{comment.author}
								</p>
								<div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
									<span className="flex items-center gap-1 bg-muted px-2 py-1 rounded-full">
										<ThumbsUp className="w-3 h-3" />
										{comment.likes}
									</span>
									{(comment.replyCount || 0) > 0 && (
										<span className="flex items-center gap-1 bg-muted px-2 py-1 rounded-full">
											<MessageCircle className="w-3 h-3" />
											{comment.replyCount || 0}
										</span>
									)}
								</div>
							</div>
						</div>
						<Button
							variant="ghost"
							size="sm"
							onClick={() =>
								deleteCommentMutation.mutate({
									mediaId,
									commentId: comment.id,
								})
							}
							disabled={deleteCommentMutation.isPending}
							className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0 text-destructive hover:text-destructive"
						>
							<Trash2 className="w-4 h-4" />
						</Button>
					</div>
					<div className="space-y-3">
						<p className="text-sm leading-relaxed text-foreground">
							{comment.content}
						</p>
						{comment.translatedContent && (
							<div className="bg-gradient-to-r from-primary/5 to-primary/10 border-l-4 border-primary/30 pl-4 py-3 rounded-r-lg">
								<div className="flex items-center gap-2 mb-2">
									<LanguagesIcon className="w-4 h-4 text-primary" />
									<Badge variant="secondary" className="text-xs">
										Translated
									</Badge>
								</div>
								<p className="text-sm leading-relaxed text-muted-foreground">
									{comment.translatedContent}
								</p>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
