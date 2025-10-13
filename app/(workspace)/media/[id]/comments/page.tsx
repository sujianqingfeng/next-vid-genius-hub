'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Calendar, Copy, Download, Eye, FileText, Film, Heart, LanguagesIcon, MessageCircle, User } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
	CommentCard,
	MobileDetailsCard,
	RemotionPreviewCard,
} from '~/components/business/media'
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
import { extractVideoId } from '~/lib/providers/youtube'
import { queryOrpc } from '~/lib/orpc/query-client'
import { formatNumber } from '~/lib/utils'
import { ProxySelector } from '~/components/business/proxy/proxy-selector'

export default function CommentsPage() {
	const params = useParams()
	const id = params.id as string
	const queryClient = useQueryClient()
	const [pages, setPages] = useState('3')
	const [model, setModel] = useState<AIModelId>(AIModelIds[0] as AIModelId)
	const [isMobileDetailsOpen, setIsMobileDetailsOpen] = useState(false)
	const [thumbnailError, setThumbnailError] = useState(false)

	// Download comments backend toggle (local/cloud)
	const [commentsBackend, setCommentsBackend] = useState<'local' | 'cloud'>('cloud')
	const [commentsCloudJobId, setCommentsCloudJobId] = useState<string | null>(null)
	const [selectedProxyId, setSelectedProxyId] = useState<string>('none')

	// Persist comments cloud job id across reloads
	useEffect(() => {
		const key = `commentsDownloadCloudJob:${id}`
		if (!commentsCloudJobId) {
			const saved = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
			if (saved) setCommentsCloudJobId(saved)
		}
		if (commentsCloudJobId) {
			try { window.localStorage.setItem(key, commentsCloudJobId) } catch {}
		}
	}, [id, commentsCloudJobId])

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

	const startCloudCommentsMutation = useMutation(
		queryOrpc.comment.startCloudCommentsDownload.mutationOptions({
			onSuccess: (data) => {
				setCommentsCloudJobId(data.jobId)
				toast.success('Cloud comments download queued')
			},
			onError: (e) => toast.error(e.message),
		}),
	)

    const cloudCommentsStatusQuery = useQuery(
        queryOrpc.comment.getCloudCommentsStatus.queryOptions({
            input: { jobId: commentsCloudJobId ?? '' },
            enabled: !!commentsCloudJobId,
            refetchInterval: (q: { state: { data?: { status?: string } } }) => {
                const s = q.state.data?.status
                return s && ['completed', 'failed', 'canceled'].includes(s) ? false : 2000
            },
        }),
    )

	const finalizeCloudCommentsMutation = useMutation(
		queryOrpc.comment.finalizeCloudCommentsDownload.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: queryOrpc.media.byId.queryKey({ input: { id } }) })
				try { window.localStorage.removeItem(`commentsDownloadCloudJob:${id}`) } catch {}
				setCommentsCloudJobId(null)
				toast.success('Comments downloaded!')
			},
			onError: (e) => toast.error(e.message),
		}),
	)

	useEffect(() => {
		if (commentsBackend === 'cloud' && commentsCloudJobId && cloudCommentsStatusQuery.data?.status === 'completed') {
			finalizeCloudCommentsMutation.mutate({ mediaId: id, jobId: commentsCloudJobId })
		}
	}, [commentsBackend, commentsCloudJobId, cloudCommentsStatusQuery.data?.status, finalizeCloudCommentsMutation, id])

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

	const previewVideoInfo = mediaQuery.data
		? {
				title: mediaQuery.data.title ?? undefined,
				translatedTitle: mediaQuery.data.translatedTitle ?? undefined,
				viewCount: mediaQuery.data.viewCount ?? undefined,
				author: mediaQuery.data.author ?? undefined,
				thumbnail: mediaQuery.data.thumbnail ?? undefined,
		  }
		: null

	const renderMutation = useMutation({
		...queryOrpc.comment.renderWithInfo.mutationOptions(),
		onSuccess: () => {
			toast.success('Video rendering started!')
		},
		onError: (error) => {
			toast.error(`Failed to start rendering: ${error.message}`)
		},
	})

	// Cloud rendering (Remotion) — start
	const [renderBackend, setRenderBackend] = useState<'local' | 'cloud'>('cloud')
	const [cloudJobId, setCloudJobId] = useState<string | null>(null)

	useEffect(() => {
		const key = `commentsCloudJob:${id}`
		if (!cloudJobId) {
			const saved = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
			if (saved) setCloudJobId(saved)
		}
		if (cloudJobId) {
			window.localStorage.setItem(key, cloudJobId)
		}
	}, [id, cloudJobId])

	const startCloudRenderMutation = useMutation(
		queryOrpc.comment.startCloudRender.mutationOptions({
			onSuccess: (data) => {
				setCloudJobId(data.jobId)
				toast.success('Cloud render queued')
			},
			onError: (e) => toast.error(e.message),
		}),
	)

    const cloudStatusQuery = useQuery(
        queryOrpc.comment.getRenderStatus.queryOptions({
            input: { jobId: cloudJobId ?? '' },
            enabled: !!cloudJobId,
            refetchInterval: (q: { state: { data?: { status?: string } } }) => {
                const s = q.state.data?.status
                return s && ['completed', 'failed', 'canceled'].includes(s) ? false : 2000
            },
        }),
    )

	useEffect(() => {
		if (renderBackend === 'cloud' && cloudJobId && cloudStatusQuery.data?.status === 'completed') {
			queryClient.invalidateQueries({ queryKey: queryOrpc.media.byId.queryKey({ input: { id } }) })
			try { window.localStorage.removeItem(`commentsCloudJob:${id}`) } catch {}
			setCloudJobId(null)
		}
	}, [renderBackend, cloudJobId, cloudStatusQuery.data?.status, id, queryClient])

	const comments = mediaQuery.data?.comments || []

	// Extract video source ID from URL
	const getVideoSourceId = () => {
		if (!mediaQuery.data?.url) return id

		if (mediaQuery.data.source === 'youtube') {
			return extractVideoId(mediaQuery.data.url)
		}

		// For TikTok or other sources, return the URL or a processed identifier
		return mediaQuery.data.url
	}

	return (
		<div className="min-h-screen bg-background">
			{/* Back navigation - matching main media page style */}
			<div className="px-4 py-6">
				<Link
					href={`/media/${id}`}
					className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
				>
					<ArrowLeft className="w-4 h-4" />
					Back to Media
				</Link>
			</div>

			{/* Main Content */}
			<div className="px-4 pb-8 space-y-6">

			{/* Media Info Section - Full Width Top */}
			{mediaQuery.isLoading ? (
				<div className="flex gap-6">
					<Skeleton className="w-80 h-48 rounded-lg flex-shrink-0" />
					<div className="flex-1 space-y-4">
						<Skeleton className="h-8 w-3/4" />
						<Skeleton className="h-6 w-1/2" />
						<Skeleton className="h-4 w-1/3" />
						<div className="flex gap-2">
							<Skeleton className="h-6 w-20" />
							<Skeleton className="h-6 w-20" />
						</div>
					</div>
				</div>
			) : mediaQuery.data ? (
				<>
					{/* Desktop Media Info */}
					<div className="hidden lg:block">
						<div className="flex gap-6">
							{/* Thumbnail */}
							{mediaQuery.data.thumbnail && !thumbnailError ? (
								<div className="relative w-80 h-48 flex-shrink-0 rounded-lg overflow-hidden bg-muted shadow-md">
									<Image
										src={mediaQuery.data.thumbnail}
										alt={mediaQuery.data.title}
										fill
										className="object-cover"
										priority
										unoptimized
										onError={() => setThumbnailError(true)}
									/>
								</div>
							) : (
								<div className="w-80 h-48 flex-shrink-0 rounded-lg bg-muted flex items-center justify-center shadow-md">
									<FileText className="w-12 h-12 text-muted-foreground" />
								</div>
							)}

							{/* Info */}
							<div className="flex-1 space-y-4">
								{/* Title */}
								<div className="space-y-2">
									<h1 className="text-2xl font-bold leading-tight line-clamp-2">
										{mediaQuery.data.title}
									</h1>
									{mediaQuery.data.translatedTitle && (
										<p className="text-lg text-muted-foreground leading-tight line-clamp-2">
											{mediaQuery.data.translatedTitle}
										</p>
									)}
								</div>

								{/* Author */}
								{mediaQuery.data.author && (
									<div className="flex items-center gap-2 text-muted-foreground">
										<User className="w-4 h-4" />
										<span className="text-sm font-medium">
											{mediaQuery.data.author}
										</span>
									</div>
								)}

								{/* Stats & Meta */}
								<div className="flex flex-wrap items-center gap-4">
									{mediaQuery.data.viewCount !== null &&
										mediaQuery.data.viewCount !== undefined && (
											<div className="flex items-center gap-2 text-sm">
												<Eye className="w-4 h-4 text-muted-foreground" />
												<span className="font-medium">
													{formatNumber(mediaQuery.data.viewCount)} views
												</span>
											</div>
										)}
									{mediaQuery.data.likeCount !== null &&
										mediaQuery.data.likeCount !== undefined && (
											<div className="flex items-center gap-2 text-sm">
												<Heart className="w-4 h-4 text-muted-foreground" />
												<span className="font-medium">
													{formatNumber(mediaQuery.data.likeCount)} likes
												</span>
											</div>
										)}
									<div className="flex items-center gap-2 text-sm text-muted-foreground">
										<Calendar className="w-4 h-4" />
										<span>
											{new Date(mediaQuery.data.createdAt).toLocaleDateString(
												'en-US',
												{
													year: 'numeric',
													month: 'short',
													day: 'numeric',
												},
											)}
										</span>
									</div>
								</div>

								{/* Badges */}
								<div className="flex flex-wrap gap-2">
									<Badge variant="secondary" className="capitalize">
										{mediaQuery.data.source}
									</Badge>
									<Badge variant="outline">{mediaQuery.data.quality}</Badge>
								</div>
							</div>
						</div>
					</div>

					{/* Mobile Details Card */}
					<div className="lg:hidden">
						{mediaQuery.data && (
							<>
								<MobileDetailsCard
									media={mediaQuery.data}
									isOpen={isMobileDetailsOpen}
									onClose={() => setIsMobileDetailsOpen(false)}
								/>
								<Button
									variant="outline"
									size="sm"
									onClick={() => setIsMobileDetailsOpen(true)}
									className="w-full flex items-center justify-center gap-2"
								>
									<FileText className="w-4 h-4" />
									View Media Details
								</Button>
							</>
						)}
					</div>
				</>
			) : null}

			{/* Main Content Grid - Preview & Actions on Left, Comments on Right */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Left Column - Preview + Actions */}
				<div className="lg:col-span-1 space-y-4">
					{/* Preview Card */}
					<RemotionPreviewCard
						videoInfo={previewVideoInfo}
						comments={comments}
						isLoading={mediaQuery.isLoading}
					/>

					{/* Actions Section */}
					{mediaQuery.data && (
						<Card className="shadow-sm">
							<CardHeader className="pb-4">
								<CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
									Actions
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
                            

								{/* Translate Comments */}
								<div className="space-y-2">
									<div className="flex items-center gap-2 mb-2">
										<LanguagesIcon className="w-3.5 h-3.5 text-muted-foreground" />
										<span className="text-sm font-medium">Translate Comments</span>
									</div>
									<Select
										value={model}
										onValueChange={(v) => setModel(v as AIModelId)}
									>
										<SelectTrigger className="h-9">
											<SelectValue />
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
										className="w-full h-9"
									>
										{translateCommentsMutation.isPending
											? 'Translating...'
											: 'Translate'}
									</Button>
								</div>

					{/* Render Video */}
						<div className="space-y-2">
							<div className="flex items-center gap-2 mb-2">
								<Film className="w-3.5 h-3.5 text-muted-foreground" />
								<span className="text-sm font-medium">Render Video</span>
							</div>
							{/* Backend toggle */}
							<div className="flex items-center gap-2 mb-2">
								<span className="text-xs text-muted-foreground">Backend:</span>
								<div className="inline-flex gap-2">
									<Button variant={renderBackend === 'cloud' ? 'default' : 'outline'} size="sm" onClick={() => setRenderBackend('cloud')}>Cloud</Button>
									<Button variant={renderBackend === 'local' ? 'default' : 'outline'} size="sm" onClick={() => setRenderBackend('local')}>Local</Button>
                                        </div>
                                    </div>
							<Button
								onClick={() => {
									if (renderBackend === 'cloud') {
										startCloudRenderMutation.mutate({ mediaId: id })
									} else {
										renderMutation.mutate({ mediaId: id })
									}
								}}
								disabled={startCloudRenderMutation.isPending || renderMutation.isPending}
								size="sm"
								variant="default"
								className="w-full h-9"
							>
								{renderBackend === 'cloud'
									? (startCloudRenderMutation.isPending ? 'Queuing...' : 'Start Cloud Render')
									: (renderMutation.isPending ? 'Rendering...' : 'Start Local Render')}
							</Button>

							{/* Cloud progress */}
							{renderBackend === 'cloud' && cloudJobId && (
								<div className="mt-2 text-xs text-muted-foreground">
									Job: {cloudJobId} — Status: {cloudStatusQuery.data?.status ?? 'starting'} {typeof cloudStatusQuery.data?.progress === 'number' ? `(${Math.round((cloudStatusQuery.data?.progress ?? 0) * 100)}%)` : ''}
								</div>
							)}
						</div>

								{/* Disclaimer */}
								<div className="pt-4 border-t">
									<div className="space-y-2">
										<p className="text-xs text-muted-foreground leading-relaxed">
											本视频仅用于娱乐目的，相关评论内容不代表本平台观点。请理性观看。
										</p>
										<div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
											<span>来源: <code className="bg-muted px-1 rounded text-xs">{getVideoSourceId()}</code></span>
											{mediaQuery.data.comments && mediaQuery.data.comments.length > 0 && mediaQuery.data.commentsDownloadedAt && (
												<span>采集: {new Date(mediaQuery.data.commentsDownloadedAt).toLocaleDateString('zh-CN')}</span>
											)}
										</div>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => {
												const disclaimerText = `内容声明

本视频仅用于娱乐目的，相关评论内容不代表本平台观点。
请理性观看，请勿过度解读或传播不实信息。

来源视频: ${getVideoSourceId()}
${mediaQuery.data?.comments && mediaQuery.data.comments.length > 0 && mediaQuery.data.commentsDownloadedAt
	? `评论采集时间: ${new Date(mediaQuery.data.commentsDownloadedAt).toLocaleString('zh-CN', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	})}`
	: ''
}`;

												navigator.clipboard.writeText(disclaimerText);
												toast.success('声明已复制到剪贴板');
											}}
											className="h-7 px-2 text-xs"
										>
											<Copy className="w-3 h-3 mr-1" />
											复制声明
                                        </Button>
                                    </div>
								</div>
							</CardContent>
						</Card>
					)}
				</div>

				{/* Right Column - Comments List */}
				<div className="lg:col-span-1">

					<Card className="shadow-sm">
						<CardHeader className="pb-3 border-b">
							<div className="flex items-center justify-between">
								<CardTitle className="text-lg font-semibold">Comments</CardTitle>
								{mediaQuery.data && (
									<Badge variant="secondary" className="text-sm font-medium">
										{comments.length} comment{comments.length !== 1 ? 's' : ''}
									</Badge>
								)}
							</div>
						</CardHeader>
                        <CardContent className="pt-0 px-0">
                            {/* Download Comments toolbar near comments list */}
                            <div className="px-4 py-3 border-b space-y-2">
                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="flex items-center gap-2">
                                        <Download className="w-3.5 h-3.5 text-muted-foreground" />
                                        <span className="text-sm font-medium">Download Comments</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">Backend:</span>
                                        <div className="inline-flex gap-2">
                                            <Button variant={commentsBackend === 'cloud' ? 'default' : 'outline'} size="sm" onClick={() => setCommentsBackend('cloud')}>Cloud</Button>
                                            <Button variant={commentsBackend === 'local' ? 'default' : 'outline'} size="sm" onClick={() => setCommentsBackend('local')}>Local</Button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Select value={pages} onValueChange={setPages}>
                                            <SelectTrigger className="h-9 w-28">
                                                <SelectValue />
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
                                            onClick={() => {
                                                const p = parseInt(pages, 10)
                                                if (commentsBackend === 'cloud') {
                                                    startCloudCommentsMutation.mutate({ mediaId: id, pages: p, proxyId: selectedProxyId === 'none' ? undefined : selectedProxyId })
                                                } else {
                                                    downloadCommentsMutation.mutate({ mediaId: id, pages: p })
                                                }
                                            }}
                                            disabled={downloadCommentsMutation.isPending || startCloudCommentsMutation.isPending}
                                            size="sm"
                                            className="h-9 px-4"
                                        >
                                            {commentsBackend === 'cloud'
                                                ? (startCloudCommentsMutation.isPending ? 'Queuing...' : 'Go')
                                                : (downloadCommentsMutation.isPending ? 'Loading...' : 'Go')}
                                        </Button>
                                    </div>
                                </div>
                                {/* Proxy selector under toolbar */}
                                <div>
                                    <ProxySelector value={selectedProxyId} onValueChange={setSelectedProxyId} disabled={startCloudCommentsMutation.isPending || downloadCommentsMutation.isPending} />
                                </div>
                                {/* Cloud job status */}
                                {commentsBackend === 'cloud' && commentsCloudJobId && (
                                    <div className="text-xs text-muted-foreground">
                                        Job: {commentsCloudJobId} — Status: {cloudCommentsStatusQuery.data?.status ?? 'starting'} {typeof cloudCommentsStatusQuery.data?.progress === 'number' ? `(${Math.round((cloudCommentsStatusQuery.data?.progress ?? 0) * 100)}%)` : ''}
                                    </div>
                                )}
                            </div>
							{mediaQuery.isLoading && (
								<div className="space-y-1 px-4 py-3">
									{[...Array(3)].map((_, i) => (
										<div
											key={`skeleton-${i}`}
											className="flex items-start gap-3 p-3 rounded-lg"
										>
											<Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
											<div className="flex-1 space-y-2">
												<div className="flex items-center gap-2">
													<Skeleton className="h-3 w-24" />
													<Skeleton className="h-3 w-12" />
												</div>
												<Skeleton className="h-3 w-full" />
												<Skeleton className="h-3 w-3/4" />
											</div>
										</div>
									))}
								</div>
							)}
							{mediaQuery.isError && (
								<div className="text-center py-16 px-6">
									<div className="max-w-md mx-auto">
										<div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
											<MessageCircle className="w-8 h-8 text-destructive" />
										</div>
										<h3 className="text-lg font-semibold mb-2 text-destructive">
											Failed to load comments
										</h3>
										<p className="text-muted-foreground text-sm leading-relaxed">
											Please try refreshing the page or check your connection.
										</p>
									</div>
								</div>
							)}
							{comments.length === 0 && !mediaQuery.isLoading && (
								<div className="text-center py-20 px-6">
									<div className="max-w-md mx-auto">
										<div className="w-16 h-16 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-primary/10">
											<MessageCircle className="w-8 h-8 text-primary/70" />
										</div>
										<h3 className="text-lg font-semibold mb-2">
											No comments yet
										</h3>
										<p className="text-muted-foreground text-sm mb-6 leading-relaxed">
											Download comments to get started with analysis and
											translation.
										</p>
											<Button
												onClick={() => {
													const p = parseInt(pages, 10)
                                        if (commentsBackend === 'cloud') {
                                            startCloudCommentsMutation.mutate({ mediaId: id, pages: p, proxyId: selectedProxyId === 'none' ? undefined : selectedProxyId })
                                        } else {
                                            downloadCommentsMutation.mutate({ mediaId: id, pages: p })
                                        }
												}}
												disabled={downloadCommentsMutation.isPending || startCloudCommentsMutation.isPending}
												size="sm"
											>
                                        <Download className="w-4 h-4 mr-2" />
                                        {commentsBackend === 'cloud' ? 'Start Cloud Download' : 'Download Comments'}
										</Button>
									</div>
								</div>
							)}
							{comments.length > 0 && (
								<div>
									{comments.map((comment, index) => (
										<div key={comment.id}>
											<CommentCard comment={comment} mediaId={id} />
											{index < comments.length - 1 && (
												<div className="border-b mx-4" />
											)}
										</div>
									))}
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</div>

			{/* Rendered Info Video Preview */}
			{mediaQuery.data?.videoWithInfoPath && (
				<div className="mt-4">
					<Card className="shadow-sm">
						<CardHeader className="pb-3">
							<div className="flex items-center justify-between">
								<CardTitle className="text-lg font-semibold">Rendered Video (Comments)</CardTitle>
							</div>
						</CardHeader>
						<CardContent>
							<video controls className="w-full rounded-md" src={`/api/media/${id}/rendered-info`} />
						</CardContent>
					</Card>
				</div>
			)}
			</div>
		</div>
	)
}
