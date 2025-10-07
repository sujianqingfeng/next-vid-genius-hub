'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LanguagesIcon, MessageCircle, ThumbsUp, Trash2 } from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'
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



function getAuthorInitials(author?: string) {
	if (!author) {
		return '?'
	}

	const parts = author
		.trim()
		.split(/\s+/)
		.filter(Boolean)
	if (parts.length === 0) {
		return '?'
	}
	if (parts.length === 1) {
		return parts[0].slice(0, 2).toUpperCase()
	}
	const first = parts[0][0]
	const last = parts[parts.length - 1][0]
	return `${first}${last}`.toUpperCase()
}

export function CommentCard({ comment, mediaId }: CommentCardProps) {
	const queryClient = useQueryClient()
	const [avatarError, setAvatarError] = useState(false)
	const showFallback = avatarError || !comment.authorThumbnail
	const fallbackInitials = getAuthorInitials(comment.author)

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
			<div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-all duration-200">
				<div className="flex-shrink-0">
					{showFallback ? (
						<div className="w-8 h-8 rounded-full border border-background shadow-sm bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground uppercase" aria-hidden>
							{fallbackInitials}
						</div>
					) : (
						<Image
							src={comment.authorThumbnail!}
							alt={comment.author}
							width={32}
							height={32}
							className="w-8 h-8 rounded-full border border-background shadow-sm"
							loading="lazy"
							unoptimized
							onError={() => setAvatarError(true)}
						/>
					)}
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-start justify-between mb-1.5">
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2 mb-0.5">
								<p className="font-semibold text-xs truncate">
									{comment.author}
								</p>
								<div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
									<span className="flex items-center gap-1">
										<ThumbsUp className="w-3 h-3" />
										<span className="text-[11px]">{comment.likes}</span>
									</span>
									{(comment.replyCount || 0) > 0 && (
										<span className="flex items-center gap-1">
											<MessageCircle className="w-3 h-3" />
											<span className="text-[11px]">{comment.replyCount || 0}</span>
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
							aria-label="Delete comment"
							title="Delete comment"
							className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 text-destructive hover:text-destructive"
						>
							<Trash2 className="w-3.5 h-3.5" />
						</Button>
					</div>
					<div className="space-y-2">
						<p className="text-xs leading-snug text-foreground break-words whitespace-pre-wrap">
							{comment.content}
						</p>
						{comment.translatedContent && (
							<div className="bg-gradient-to-r from-primary/5 to-primary/10 border-l-2 border-primary/30 pl-2.5 py-2 rounded-r">
								<div className="flex items-center gap-1.5 mb-1">
									<LanguagesIcon className="w-3 h-3 text-primary" />
									<Badge variant="secondary" className="text-[10px] h-4 px-1.5">
										Translated
									</Badge>
								</div>
								<p className="text-xs leading-snug text-muted-foreground break-words whitespace-pre-wrap">
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
