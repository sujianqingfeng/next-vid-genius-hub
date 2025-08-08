'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
	Copy,
	Download,
	FileText,
	Film,
	LanguagesIcon,
	MessageCircle,
} from 'lucide-react'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import {
	CommentCard,
	MediaInfoCard,
	MobileDetailsCard,
} from '~/components/business/media'
import { PageHeader } from '~/components/layout'
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
import { AIModelId, AIModelIds } from '~/lib/ai'
import { queryOrpc } from '~/lib/orpc/query-client'

export default function CommentsPage() {
	const params = useParams()
	const id = params.id as string
	const queryClient = useQueryClient()
	const [pages, setPages] = useState('3')
	const [model, setModel] = useState<AIModelId>(AIModelIds[0] as AIModelId)
	const [isMobileDetailsOpen, setIsMobileDetailsOpen] = useState(false)

	const copyToClipboard = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text)
			toast.success('Copied to clipboard!')
		} catch {
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
			<PageHeader
				backHref={`/media/${id}`}
				backText="Back"
				title="Comments"
				withBackground
			/>

			{/* Main Content Grid */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Left Column - Media Info & Actions */}
				<div className="lg:col-span-1 space-y-6 lg:sticky lg:top-16 self-start">
					{/* Media Info Card */}
					{mediaQuery.isLoading ? (
						<div className="space-y-4">
							<Skeleton className="h-64 w-full rounded-lg" />
							<Skeleton className="h-8 w-2/3" />
							<Skeleton className="h-4 w-1/2" />
						</div>
					) : mediaQuery.data ? (
						<>
							{/* Desktop Media Info Card */}
							<div className="hidden lg:block">
								{mediaQuery.data && <MediaInfoCard media={mediaQuery.data} />}
							</div>

							{/* Mobile Details Card */}
							<div className="lg:hidden">
								{mediaQuery.data && (
									<MobileDetailsCard
										media={mediaQuery.data}
										isOpen={isMobileDetailsOpen}
										onClose={() => setIsMobileDetailsOpen(false)}
									/>
								)}
							</div>

							{/* Mobile Title Display */}
							{mediaQuery.data && (
								<div className="lg:hidden space-y-3">
									<h1 className="text-xl sm:text-2xl font-bold text-foreground leading-tight line-clamp-2">
										{mediaQuery.data.title}
									</h1>
									{mediaQuery.data.translatedTitle && (
										<div className="flex items-center gap-2">
											<p className="text-sm sm:text-base text-muted-foreground leading-relaxed line-clamp-2">
												{mediaQuery.data.translatedTitle}
											</p>
											<Button
												variant="ghost"
												size="icon"
												onClick={() =>
													copyToClipboard(mediaQuery.data!.translatedTitle!)
												}
												aria-label="Copy translated title"
												title="Copy translated title"
												className="flex-shrink-0"
											>
												<Copy className="w-4 h-4" />
											</Button>
										</div>
									)}
									<Button
										variant="outline"
										size="sm"
										onClick={() => setIsMobileDetailsOpen(true)}
										className="flex items-center gap-2"
									>
										<FileText className="w-4 h-4" />
										Show Details
									</Button>
								</div>
							)}
						</>
					) : null}

					{/* Actions Section */}
					{mediaQuery.data && (
						<Card className="shadow-sm">
							<CardHeader className="pb-3">
								<CardTitle className="text-lg">Actions</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="space-y-3">
									<div className="flex items-center gap-2">
										<Select value={pages} onValueChange={setPages}>
											<SelectTrigger className="w-full">
												<SelectValue placeholder="Pages" />
											</SelectTrigger>
											<SelectContent className="max-h-64">
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
											className="flex-shrink-0"
										>
											<Download className="w-4 h-4 mr-2" />
											{downloadCommentsMutation.isPending
												? 'Downloading...'
												: 'Download'}
										</Button>
									</div>

									<div className="space-y-2">
										<Select
											value={model}
											onValueChange={(v) => setModel(v as AIModelId)}
										>
											<SelectTrigger className="w-full">
												<SelectValue placeholder="Model" />
											</SelectTrigger>
											<SelectContent className="max-h-64">
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
											className="w-full"
										>
											<LanguagesIcon className="w-4 h-4 mr-2" />
											{translateCommentsMutation.isPending
												? 'Translating...'
												: 'Translate'}
										</Button>
									</div>

									<Button
										onClick={() => renderMutation.mutate({ mediaId: id })}
										disabled={renderMutation.isPending}
										size="sm"
										className="w-full"
									>
										<Film className="w-4 h-4 mr-2" />
										{renderMutation.isPending ? 'Rendering...' : 'Render'}
									</Button>
								</div>
							</CardContent>
						</Card>
					)}
				</div>

				{/* Right Column - Comments */}
				<div className="lg:col-span-2">
					<Card className="shadow-sm">
						<CardHeader className="pb-3">
							<div className="flex items-center justify-between">
								<CardTitle className="text-lg">Comments</CardTitle>
								{mediaQuery.data && (
									<Badge variant="secondary" className="text-sm">
										{comments.length} comment{comments.length !== 1 ? 's' : ''}
									</Badge>
								)}
							</div>
						</CardHeader>
						<CardContent className="pt-0">
							{mediaQuery.isLoading && (
								<div className="space-y-4">
									{[...Array(3)].map((_, i) => (
										<div
											key={`skeleton-${i}`}
											className="flex items-start gap-4 p-4"
										>
											<Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
											<div className="flex-1 space-y-3">
												<div className="flex items-center gap-2">
													<Skeleton className="h-4 w-32" />
													<Skeleton className="h-4 w-16" />
												</div>
												<Skeleton className="h-4 w-full" />
												<Skeleton className="h-4 w-3/4" />
											</div>
										</div>
									))}
								</div>
							)}
							{mediaQuery.isError && (
								<div className="text-center py-12">
									<div className="max-w-sm mx-auto">
										<div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
											<MessageCircle className="w-8 h-8 text-destructive" />
										</div>
										<h3 className="text-lg font-semibold mb-2 text-destructive">
											Failed to load comments
										</h3>
										<p className="text-muted-foreground text-sm">
											Please try refreshing the page or check your connection.
										</p>
									</div>
								</div>
							)}
							{comments.length === 0 && !mediaQuery.isLoading && (
								<div className="text-center py-16">
									<div className="max-w-sm mx-auto">
										<div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
											<MessageCircle className="w-8 h-8 text-muted-foreground" />
										</div>
										<h3 className="text-lg font-semibold mb-2">
											No comments yet
										</h3>
										<p className="text-muted-foreground text-sm mb-6">
											Download comments from YouTube to get started with
											analysis and translation.
										</p>
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
											Download Comments
										</Button>
									</div>
								</div>
							)}
							{comments.length > 0 && (
								<div className="divide-y divide-border">
									{comments.map((comment) => (
										<CommentCard
											key={comment.id}
											comment={comment}
											mediaId={id}
										/>
									))}
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	)
}
