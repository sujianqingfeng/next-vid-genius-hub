'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Copy, Download, Film, LanguagesIcon, MessageCircle } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CommentCard, RemotionPreviewCard } from '~/components/business/media'
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
import { ChatModelId, ChatModelIds } from '~/lib/ai'
import { extractVideoId } from '~/lib/providers/youtube'
import { queryOrpc } from '~/lib/orpc/query-client'
import { ProxySelector } from '~/components/business/proxy/proxy-selector'

export default function CommentsPage() {
	const params = useParams()
	const id = params.id as string
	const queryClient = useQueryClient()
	const [pages, setPages] = useState('3')
	const [model, setModel] = useState<ChatModelId>(ChatModelIds[0] as ChatModelId)

	// Download comments backend toggle (local/cloud)
	const [commentsBackend, setCommentsBackend] = useState<'local' | 'cloud'>('cloud')
	const [commentsCloudJobId, setCommentsCloudJobId] = useState<string | null>(null)
	const [selectedProxyId, setSelectedProxyId] = useState<string>('none')
	const [renderProxyId, setRenderProxyId] = useState<string>('none')

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

	// Persist render proxy selection for cloud renders
	useEffect(() => {
		if (typeof window === 'undefined') return
		const key = `commentsRenderProxy:${id}`
		try {
			const saved = window.localStorage.getItem(key)
			if (saved) setRenderProxyId(saved)
		} catch {}
	}, [id])

	useEffect(() => {
		if (typeof window === 'undefined') return
		const key = `commentsRenderProxy:${id}`
		try {
			if (renderProxyId && renderProxyId !== 'none') {
				window.localStorage.setItem(key, renderProxyId)
			} else {
				window.localStorage.removeItem(key)
			}
		} catch {}
	}, [id, renderProxyId])

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
			{/* Header */}
			<div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
				<div className="max-w-7xl mx-auto px-4 py-4">
					<Link
						href={`/media/${id}`}
						className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
					>
						<ArrowLeft className="w-4 h-4" />
						Back to Media
					</Link>
					<div className="flex items-center justify-between">
						<h1 className="text-2xl font-bold">Comments</h1>
						{mediaQuery.data && (
							<Badge variant="secondary" className="text-sm">
								{comments.length} comment{comments.length !== 1 ? 's' : ''}
							</Badge>
						)}
					</div>
					
					{/* Media Title */}
					{mediaQuery.data && (
						<div className="mt-4 space-y-2">
							{mediaQuery.data.title && (
								<div className="flex items-start gap-2">
									<p className="text-sm text-muted-foreground flex-1">
										{mediaQuery.data.title}
									</p>
								</div>
							)}
							{mediaQuery.data.translatedTitle && (
								<div className="flex items-start gap-2">
									<p className="text-sm font-medium flex-1">
										{mediaQuery.data.translatedTitle}
									</p>
									<Button
										variant="ghost"
										size="sm"
										className="h-auto py-1 px-2 -mt-1"
										onClick={() => {
											if (mediaQuery.data?.translatedTitle) {
												navigator.clipboard.writeText(mediaQuery.data.translatedTitle)
												toast.success('标题已复制到剪贴板')
											}
										}}
									>
										<Copy className="w-3.5 h-3.5" />
									</Button>
								</div>
							)}
						</div>
					)}
				</div>
			</div>

			{/* Main Content */}
			<div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
				{/* Preview - Full Width Top */}
				<RemotionPreviewCard
					videoInfo={previewVideoInfo}
					comments={comments}
					isLoading={mediaQuery.isLoading}
				/>

				{/* Actions & Comments Grid */}
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					{/* Left: Actions */}
					{mediaQuery.data && (
						<Card className="lg:col-span-1">
							<CardHeader>
								<CardTitle>Actions</CardTitle>
							</CardHeader>
							<CardContent className="space-y-6">
								{/* Download Comments */}
								<div className="space-y-3">
									<div className="flex items-center gap-2">
										<Download className="w-4 h-4 text-muted-foreground" />
										<h3 className="font-medium">Download Comments</h3>
									</div>
									<div className="flex flex-wrap items-center gap-3">
										<Select value={pages} onValueChange={setPages}>
											<SelectTrigger className="w-32">
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
										<div className="flex items-center gap-2">
											<Button
												variant={commentsBackend === 'cloud' ? 'default' : 'outline'}
												size="sm"
												onClick={() => setCommentsBackend('cloud')}
											>
												Cloud
											</Button>
											<Button
												variant={commentsBackend === 'local' ? 'default' : 'outline'}
												size="sm"
												onClick={() => setCommentsBackend('local')}
											>
												Local
											</Button>
										</div>
										<Button
											onClick={() => {
												const p = parseInt(pages, 10)
												if (commentsBackend === 'cloud') {
													startCloudCommentsMutation.mutate({
														mediaId: id,
														pages: p,
														proxyId: selectedProxyId === 'none' ? undefined : selectedProxyId,
													})
												} else {
													downloadCommentsMutation.mutate({ mediaId: id, pages: p })
												}
											}}
											disabled={downloadCommentsMutation.isPending || startCloudCommentsMutation.isPending}
										>
											{commentsBackend === 'cloud'
												? startCloudCommentsMutation.isPending
													? 'Queuing...'
													: 'Start'
												: downloadCommentsMutation.isPending
													? 'Downloading...'
													: 'Start'}
										</Button>
									</div>
									<ProxySelector
										value={selectedProxyId}
										onValueChange={setSelectedProxyId}
										disabled={startCloudCommentsMutation.isPending || downloadCommentsMutation.isPending}
									/>
									{commentsBackend === 'cloud' && commentsCloudJobId && (
										<p className="text-xs text-muted-foreground">
											Job: {commentsCloudJobId} — {cloudCommentsStatusQuery.data?.status ?? 'starting'}
											{typeof cloudCommentsStatusQuery.data?.progress === 'number' &&
												` (${Math.round((cloudCommentsStatusQuery.data?.progress ?? 0) * 100)}%)`}
										</p>
									)}
								</div>

								<div className="border-t" />
                            

								{/* Translate Comments */}
								<div className="space-y-3">
									<div className="flex items-center gap-2">
										<LanguagesIcon className="w-4 h-4 text-muted-foreground" />
										<h3 className="font-medium">Translate Comments</h3>
									</div>
									<div className="flex items-center gap-3">
										<Select value={model} onValueChange={(v) => setModel(v as ChatModelId)}>
											<SelectTrigger className="flex-1">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{ChatModelIds.map((modelId) => (
													<SelectItem key={modelId} value={modelId}>
														{modelId}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<Button
											onClick={() => translateCommentsMutation.mutate({ mediaId: id, model })}
											disabled={translateCommentsMutation.isPending}
										>
											{translateCommentsMutation.isPending ? 'Translating...' : 'Translate'}
										</Button>
									</div>
								</div>

								<div className="border-t" />

								{/* Render Video */}
								<div className="space-y-3">
									<div className="flex items-center gap-2">
										<Film className="w-4 h-4 text-muted-foreground" />
										<h3 className="font-medium">Render Video</h3>
									</div>
									<div className="flex items-center gap-3">
										<div className="flex items-center gap-2">
											<Button
												variant={renderBackend === 'cloud' ? 'default' : 'outline'}
												size="sm"
												onClick={() => setRenderBackend('cloud')}
											>
												Cloud
											</Button>
											<Button
												variant={renderBackend === 'local' ? 'default' : 'outline'}
												size="sm"
												onClick={() => setRenderBackend('local')}
											>
												Local
											</Button>
										</div>
										<Button
											onClick={() => {
												if (renderBackend === 'cloud') {
													startCloudRenderMutation.mutate({
														mediaId: id,
														proxyId: renderProxyId === 'none' ? undefined : renderProxyId,
													})
												} else {
													renderMutation.mutate({ mediaId: id })
												}
											}}
											disabled={startCloudRenderMutation.isPending || renderMutation.isPending}
										>
											{renderBackend === 'cloud'
												? startCloudRenderMutation.isPending
													? 'Queuing...'
													: 'Start'
												: renderMutation.isPending
													? 'Rendering...'
													: 'Start'}
										</Button>
									</div>
									{renderBackend === 'cloud' && cloudJobId && (
										<p className="text-xs text-muted-foreground">
											Job: {cloudJobId} — {cloudStatusQuery.data?.status ?? 'starting'}
											{typeof cloudStatusQuery.data?.progress === 'number' &&
												` (${Math.round((cloudStatusQuery.data?.progress ?? 0) * 100)}%)`}
										</p>
									)}
									{renderBackend === 'cloud' && (
										<ProxySelector
											value={renderProxyId}
											onValueChange={setRenderProxyId}
											disabled={startCloudRenderMutation.isPending || renderMutation.isPending}
										/>
									)}
								</div>

								<div className="border-t" />

								{/* Disclaimer */}
								<div className="space-y-2">
									<p className="text-xs text-muted-foreground">
										本视频仅用于娱乐目的，相关评论内容不代表本平台观点。来源:{' '}
										<code className="bg-muted px-1 rounded">{getVideoSourceId()}</code>
									</p>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => {
											const disclaimerText = `内容声明

本视频仅用于娱乐目的，相关评论内容不代表本平台观点。
请理性观看，请勿过度解读或传播不实信息。

来源视频: ${getVideoSourceId()}
${
	mediaQuery.data?.comments &&
	mediaQuery.data.comments.length > 0 &&
	mediaQuery.data.commentsDownloadedAt
		? `评论采集时间: ${new Date(mediaQuery.data.commentsDownloadedAt).toLocaleString('zh-CN', {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
			})}`
		: ''
}`;
											navigator.clipboard.writeText(disclaimerText)
											toast.success('声明已复制到剪贴板')
										}}
									>
										<Copy className="w-3.5 h-3.5 mr-2" />
										复制声明
									</Button>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Right: Comments List */}
					<Card className="lg:col-span-2">
						<CardHeader>
							<CardTitle>Comments</CardTitle>
						</CardHeader>
						<CardContent className="px-0">
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
									<div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
										<MessageCircle className="w-8 h-8 text-muted-foreground" />
									</div>
									<h3 className="text-lg font-semibold mb-2">No comments yet</h3>
									<p className="text-sm text-muted-foreground">
										Use the Download Comments action to get started.
									</p>
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

				{/* Rendered Video Preview - Full Width Bottom */}
				{mediaQuery.data?.videoWithInfoPath && (
					<Card>
						<CardHeader>
							<CardTitle>Rendered Video</CardTitle>
						</CardHeader>
						<CardContent>
							<video controls className="w-full rounded-md" src={`/api/media/${id}/rendered-info`} />
						</CardContent>
					</Card>
				)}
			</div>
		</div>
	)
}
