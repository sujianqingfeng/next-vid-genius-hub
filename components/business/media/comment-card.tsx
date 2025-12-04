'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckSquare, LanguagesIcon, MessageCircle, Square, ThumbsUp, Trash2 } from 'lucide-react'
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
    moderation?: {
        flagged: boolean
        labels: string[]
        severity: 'low' | 'medium' | 'high'
        reason: string
        runId: string
        modelId: string
        moderatedAt: string
    }
}

interface CommentCardProps {
	comment: Comment
	mediaId: string
	selected?: boolean
	onSelectChange?: (checked: boolean) => void
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

export function CommentCard({
	comment,
	mediaId,
	selected = false,
	onSelectChange,
}: CommentCardProps) {
	const queryClient = useQueryClient()
	const [avatarError, setAvatarError] = useState(false)
	const showFallback = avatarError || !comment.authorThumbnail
	const fallbackInitials = getAuthorInitials(comment.author)
	const selectable = typeof onSelectChange === 'function'

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

	const flagged = Boolean(comment.moderation?.flagged)
	const severity = comment.moderation?.severity || 'low'
	const severityClass = flagged
		? severity === 'high'
			? 'bg-destructive/10 border-l-2 border-destructive/60'
			: severity === 'medium'
				? 'bg-amber-100/20 dark:bg-amber-900/10 border-l-2 border-amber-400/50'
				: 'bg-primary/5 border-l-2 border-primary/30'
		: ''
	const selectionClass = selected ? 'bg-primary/5 ring-1 ring-primary/20' : ''

	return (
		<div className="group">
			<div
				className={`flex items-start gap-3 rounded-xl px-4 py-3 transition-all duration-200 hover:bg-muted/40 ${severityClass} ${selectionClass}`}
			>
				{selectable ? (
					<Button
						variant="ghost"
						size="sm"
						aria-label={selected ? 'Deselect comment' : 'Select comment'}
						aria-pressed={selected}
						onClick={() => onSelectChange?.(!selected)}
						className="mt-1 h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
					>
						{selected ? (
							<CheckSquare className="h-4 w-4" />
						) : (
							<Square className="h-4 w-4" />
						)}
					</Button>
				) : null}
				<div className="flex-shrink-0">
					{showFallback ? (
						<div
							className="h-8 w-8 rounded-full border border-background bg-muted text-xs font-semibold uppercase text-muted-foreground shadow-sm flex items-center justify-center"
							aria-hidden
						>
							{fallbackInitials}
						</div>
					) : (
						<Image
							src={comment.authorThumbnail!}
							alt={comment.author}
							width={32}
							height={32}
							className="h-8 w-8 rounded-full border border-background shadow-sm"
							loading="lazy"
							unoptimized
							onError={() => setAvatarError(true)}
						/>
					)}
				</div>
				<div className="flex-1 min-w-0 space-y-2">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0 flex-1 space-y-1">
							<div className="mb-0.5 flex items-center gap-2">
								<p className="truncate text-xs font-semibold">{comment.author}</p>
								<div className="flex flex-shrink-0 items-center gap-2 text-xs text-muted-foreground">
									<span className="flex items-center gap-1">
										<ThumbsUp className="h-3 w-3" />
										<span className="text-[11px]">{comment.likes}</span>
									</span>
									{(comment.replyCount || 0) > 0 && (
										<span className="flex items-center gap-1">
											<MessageCircle className="h-3 w-3" />
											<span className="text-[11px]">{comment.replyCount || 0}</span>
										</span>
									)}
								</div>
							</div>
							<div className="flex items-center gap-2">
								{flagged && (
									<Badge
										variant={severity === 'high' ? 'destructive' : 'secondary'}
										className="h-4 px-1.5 text-[10px]"
										title={comment.moderation?.reason || ''}
									>
										{comment.moderation?.labels?.join(', ') || 'flagged'}
									</Badge>
								)}
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
							className="h-6 w-6 p-0 text-destructive opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
						>
							<Trash2 className="h-3.5 w-3.5" />
						</Button>
					</div>
					<div className="space-y-2">
						<p className="text-xs leading-snug text-foreground break-words whitespace-pre-wrap">
							{comment.content}
						</p>
						{comment.translatedContent ? (
							<div className="rounded-r border-l-2 border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10 pl-2.5 py-2">
								<div className="mb-1 flex items-center gap-1.5">
									<LanguagesIcon className="h-3 w-3 text-primary" />
									<Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
										Translated
									</Badge>
								</div>
								<p className="text-xs leading-snug text-muted-foreground break-words whitespace-pre-wrap">
									{comment.translatedContent}
								</p>
							</div>
						) : null}
					</div>
				</div>
			</div>
		</div>
	)
}
