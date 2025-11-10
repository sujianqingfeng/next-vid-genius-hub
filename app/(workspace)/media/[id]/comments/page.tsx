'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Copy, Download, Edit, Film, LanguagesIcon, MessageCircle, Settings, Play, ShieldAlert, Filter } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CommentCard } from '~/components/business/media/comment-card'
import { RemotionPreviewCard } from '~/components/business/media/remotion-preview-card'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { Skeleton } from '~/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { ChatModelId, ChatModelIds } from '~/lib/ai/models'
import { extractVideoId } from '@app/media-providers'
import { STATUS_LABELS } from '~/lib/config/media-status.config'
import { queryOrpc } from '~/lib/orpc/query-client'
import { ProxySelector } from '~/components/business/proxy/proxy-selector'
import { Progress } from '~/components/ui/progress'
import { Switch } from '~/components/ui/switch'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { useCloudJob } from '~/lib/hooks/useCloudJob'
import { listTemplates, DEFAULT_TEMPLATE_ID, type RemotionTemplateId } from '~/remotion/templates'

export default function CommentsPage() {
	const params = useParams()
	const id = params.id as string
	const queryClient = useQueryClient()
	const [pages, setPages] = useState('3')
	const [model, setModel] = useState<ChatModelId>(ChatModelIds[0] as ChatModelId)
	const [forceTranslate, setForceTranslate] = useState(false)
    const [modModel, setModModel] = useState<ChatModelId>(ChatModelIds[0] as ChatModelId)
    const [overwriteModeration, setOverwriteModeration] = useState(false)
    const [onlyFlagged, setOnlyFlagged] = useState(false)

	const [selectedProxyId, setSelectedProxyId] = useState<string>('none')
	const [renderProxyId, setRenderProxyId] = useState<string>('none')
    const [templateId, setTemplateId] = useState<RemotionTemplateId>(DEFAULT_TEMPLATE_ID)

	// Edit titles dialog
	const [editDialogOpen, setEditDialogOpen] = useState(false)
	const [editTitle, setEditTitle] = useState('')
	const [editTranslatedTitle, setEditTranslatedTitle] = useState('')

	const {
		jobId: commentsCloudJobId,
		setJobId: setCommentsCloudJobId,
		statusQuery: cloudCommentsStatusQuery,
	} = useCloudJob({
		storageKey: `commentsDownloadCloudJob:${id}`,
		enabled: true,
		autoClearOnComplete: false,
		createQueryOptions: (jobId) =>
			queryOrpc.comment.getCloudCommentsStatus.queryOptions({
				input: { jobId },
				enabled: !!jobId,
				refetchInterval: (q: { state: { data?: { status?: string } } }) => {
					const s = q.state.data?.status
					return s && ['completed', 'failed', 'canceled'].includes(s) ? false : 2000
				},
			}),
	})

	const mediaQuery = useQuery(
		queryOrpc.media.byId.queryOptions({
			input: { id },
		}),
	)

    // Hydrate selected template from server record
    useEffect(() => {
        const tid = (mediaQuery.data?.commentsTemplate as RemotionTemplateId | undefined) || DEFAULT_TEMPLATE_ID
        setTemplateId(tid)
    }, [mediaQuery.data?.commentsTemplate])

    const updateRenderSettingsMutation = useEnhancedMutation(
        queryOrpc.media.updateRenderSettings.mutationOptions(),
        {
            invalidateQueries: {
                queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
            },
            successToast: 'Template saved!',
            errorToast: ({ error }) => `Failed to save template: ${error.message}`,
        },
    )

	const updateTitlesMutation = useEnhancedMutation(
		queryOrpc.media.updateTitles.mutationOptions({
			onSuccess: () => {
				setEditDialogOpen(false)
			},
		}),
		{
			invalidateQueries: {
				queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
			},
			successToast: 'Titles updated successfully!',
			errorToast: ({ error }) => `Failed to update titles: ${error.message}`,
		},
	)

	const handleEditClick = () => {
		setEditTitle(mediaQuery.data?.title || '')
		setEditTranslatedTitle(mediaQuery.data?.translatedTitle || '')
		setEditDialogOpen(true)
	}

	const handleSaveTitles = () => {
		updateTitlesMutation.mutate({
			id,
			title: editTitle,
			translatedTitle: editTranslatedTitle,
		})
	}

	const copyTitleValue = (value: string | null | undefined, label: string) => {
		if (!value) {
			toast.error(`${label}不存在`)
			return
		}
		if (typeof navigator === 'undefined' || !navigator.clipboard) {
			toast.error('无法访问剪贴板')
			return
		}
		navigator.clipboard
			.writeText(value)
			.then(() => {
				toast.success(`${label}已复制到剪贴板`)
			})
			.catch(() => {
				toast.error(`复制${label}失败`)
			})
	}

	const startCloudCommentsMutation = useEnhancedMutation(
		queryOrpc.comment.startCloudCommentsDownload.mutationOptions({
			onSuccess: (data) => {
				setCommentsCloudJobId(data.jobId)
			},
		}),
		{
			successToast: 'Cloud comments download queued',
			errorToast: ({ error }) => error.message,
		},
	)

	const finalizeCloudCommentsMutation = useEnhancedMutation(
		queryOrpc.comment.finalizeCloudCommentsDownload.mutationOptions({
			onSuccess: () => {
				setCommentsCloudJobId(null)
			},
		}),
		{
			invalidateQueries: {
				queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
			},
			successToast: 'Comments downloaded!',
			errorToast: ({ error }) => error.message,
		},
	)

	const finalizeAttemptedJobIdsRef = useRef<Set<string>>(new Set())

	useEffect(() => {
		if (
			commentsCloudJobId &&
			cloudCommentsStatusQuery.data?.status === 'completed' &&
			!finalizeCloudCommentsMutation.isPending
		) {
			if (!finalizeAttemptedJobIdsRef.current.has(commentsCloudJobId)) {
				finalizeAttemptedJobIdsRef.current.add(commentsCloudJobId)
				finalizeCloudCommentsMutation.mutate({ mediaId: id, jobId: commentsCloudJobId })
			}
		}
	}, [
		commentsCloudJobId,
		cloudCommentsStatusQuery.data?.status,
		finalizeCloudCommentsMutation,
		finalizeCloudCommentsMutation.isPending,
		id,
	])

	const translateCommentsMutation = useEnhancedMutation(
		queryOrpc.comment.translateComments.mutationOptions(),
		{
			invalidateQueries: {
				queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
			},
			successToast: 'Comments translated!',
			errorToast: ({ error }) => `Failed to translate comments: ${error.message}`,
		},
	)

    const moderateCommentsMutation = useEnhancedMutation(
        queryOrpc.comment.moderateComments.mutationOptions(),
        {
            invalidateQueries: {
                queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
            },
            successToast: ({ data }) => `Moderation done: ${data?.flaggedCount ?? 0} flagged`,
            errorToast: ({ error }) => `Failed to moderate: ${error.message}`,
        },
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

	// Cloud rendering (Remotion) — start

	const {
		jobId: cloudJobId,
		setJobId: setCloudJobId,
		statusQuery: cloudStatusQuery,
	} = useCloudJob({
		storageKey: `commentsCloudJob:${id}`,
		enabled: true,
		completeStatuses: ['completed'],
		onCompleted: () => {
			queryClient.invalidateQueries({
				queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
			})
		},
		createQueryOptions: (jobId) =>
			queryOrpc.comment.getRenderStatus.queryOptions({
				input: { jobId },
				enabled: !!jobId,
				refetchInterval: (q: { state: { data?: { status?: string } } }) => {
					const s = q.state.data?.status
					return s && ['completed', 'failed', 'canceled'].includes(s) ? false : 2000
				},
			}),
	})

	// Source policy selection for rendering
	type SourcePolicy = 'auto' | 'original' | 'subtitles'
	const [sourcePolicy, setSourcePolicy] = useState<SourcePolicy>('auto')

	const startCloudRenderMutation = useEnhancedMutation(
		queryOrpc.comment.startCloudRender.mutationOptions({
			onSuccess: (data) => {
				setCloudJobId(data.jobId)
			},
		}),
		{
			successToast: 'Cloud render queued',
			errorToast: ({ error }) => error.message,
		},
	)

	// Persist render source policy per media
	useEffect(() => {
		if (typeof window === 'undefined') return
		const key = `commentsRenderSourcePolicy:${id}`
		try {
			const saved = window.localStorage.getItem(key) as SourcePolicy | null
			if (saved) setSourcePolicy(saved)
		} catch {}
	}, [id])

	useEffect(() => {
		if (typeof window === 'undefined') return
		const key = `commentsRenderSourcePolicy:${id}`
		try {
			if (sourcePolicy) window.localStorage.setItem(key, sourcePolicy)
		} catch {}
	}, [id, sourcePolicy])

	const comments = mediaQuery.data?.comments || []
    const visibleComments = onlyFlagged ? comments.filter((c) => c?.moderation?.flagged) : comments

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
			{/* Compact Header */}
			<div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
					<div className="max-w-7xl mx-auto px-4 py-3">
						<div className="flex items-center justify-between gap-4">
							<div className="flex items-center gap-3">
								<Link
									href={`/media/${id}`}
									className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
								>
									<ArrowLeft className="w-4 h-4" />
									<span className="hidden sm:inline">Back to Media</span>
									<span className="sm:hidden">Back</span>
								</Link>
								<div className="h-4 w-px bg-border" />
								<h1 className="text-lg font-semibold">Comments</h1>
							</div>
							{mediaQuery.data?.translatedTitle && (
								<Button
									variant="ghost"
									size="sm"
									className="h-8 px-2"
									onClick={handleEditClick}
									title="Edit titles"
								>
									<Edit className="w-3.5 h-3.5" />
								</Button>
							)}
						</div>
					</div>
				</div>

			{/* Edit Dialog */}
			<Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit Titles</DialogTitle>
						<DialogDescription>
							Update the original and translated titles for this media.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="title">Original Title (Chinese)</Label>
							<Input
								id="title"
								value={editTitle}
								onChange={(e) => setEditTitle(e.target.value)}
								placeholder="Enter original title"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="translatedTitle">Translated Title (English)</Label>
							<Input
								id="translatedTitle"
								value={editTranslatedTitle}
								onChange={(e) => setEditTranslatedTitle(e.target.value)}
								placeholder="Enter translated title"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setEditDialogOpen(false)}
						>
							Cancel
						</Button>
						<Button
							onClick={handleSaveTitles}
							disabled={updateTitlesMutation.isPending}
						>
							{updateTitlesMutation.isPending ? 'Saving...' : 'Save'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Main Content */}
			<div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
				{/* Preview - Compact Top */}
				<RemotionPreviewCard
					videoInfo={previewVideoInfo}
					comments={comments}
					isLoading={mediaQuery.isLoading}
					templateId={templateId}
				/>

				{/* Actions & Comments Grid */}
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
					{/* Left: Workflow Actions */}
					{mediaQuery.data && (
						<Card className="lg:col-span-1">
							<CardHeader className="pb-3">
								<CardTitle className="text-base flex items-center gap-2">
									<Settings className="w-4 h-4" />
									Workflow
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<Tabs defaultValue="download" className="w-full">
										<TabsList className="grid w-full grid-cols-5">
											<TabsTrigger value="basics" className="text-xs">Base Data</TabsTrigger>
											<TabsTrigger value="download" className="text-xs">Download</TabsTrigger>
											<TabsTrigger value="translate" className="text-xs">Translate</TabsTrigger>
											<TabsTrigger value="moderate" className="text-xs">Moderate</TabsTrigger>
											<TabsTrigger value="render" className="text-xs">Render</TabsTrigger>
										</TabsList>

									<TabsContent value="basics" className="space-y-4 mt-4">
										<div className="space-y-3">
											<div className="flex items-center gap-2">
												<Film className="w-4 h-4 text-muted-foreground" />
												<h4 className="font-medium text-sm">Base Data</h4>
											</div>
											<div className="space-y-3 text-sm">
												<div className="space-y-2">
													<p className="text-xs uppercase text-muted-foreground">Translated Title</p>
													<p className="font-medium break-words">
														{mediaQuery.data.translatedTitle ?? '暂无翻译标题'}
													</p>
													<Button
														variant="outline"
														size="sm"
														className="h-8 px-2 text-xs"
														disabled={!mediaQuery.data.translatedTitle}
														onClick={() => copyTitleValue(mediaQuery.data?.translatedTitle, '英文标题')}
													>
														<Copy className="w-3 h-3 mr-2" />
														复制英文标题
													</Button>
												</div>
												<div className="space-y-2">
													<p className="text-xs uppercase text-muted-foreground">Original Title</p>
													<p className="break-words text-muted-foreground">
														{mediaQuery.data.title ?? '暂无原始标题'}
													</p>
													<Button
														variant="outline"
														size="sm"
														className="h-8 px-2 text-xs"
														disabled={!mediaQuery.data.title}
														onClick={() => copyTitleValue(mediaQuery.data?.title, '原始标题')}
													>
														<Copy className="w-3 h-3 mr-2" />
														复制原始标题
													</Button>
												</div>
											</div>
											<div className="border-t pt-3">
												<Button
													variant="default"
													size="sm"
													className="w-full text-xs"
													onClick={handleEditClick}
												>
													<Edit className="w-3 h-3 mr-2" />
													编辑标题
												</Button>
											</div>
										</div>
									</TabsContent>

									<TabsContent value="download" className="space-y-4 mt-4">
										<div className="space-y-3">
											<div className="flex items-center gap-2">
												<Download className="w-4 h-4 text-muted-foreground" />
												<h4 className="font-medium text-sm">Download Comments</h4>
											</div>
										<div className="space-y-2">
											<div>
												<Label className="text-xs text-muted-foreground">Pages:</Label>
												<Select value={pages} onValueChange={setPages}>
													<SelectTrigger className="w-full">
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
												</div>
												<div>
													<Label className="text-xs text-muted-foreground">Proxy:</Label>
													<ProxySelector
														value={selectedProxyId}
														onValueChange={setSelectedProxyId}
														disabled={startCloudCommentsMutation.isPending}
													/>
												</div>
											</div>
											<Button
												onClick={() => {
													const p = parseInt(pages, 10)
													startCloudCommentsMutation.mutate({
														mediaId: id,
														pages: p,
														proxyId: selectedProxyId === 'none' ? undefined : selectedProxyId,
													})
												}}
												disabled={startCloudCommentsMutation.isPending}
												className="w-full"
											>
												{startCloudCommentsMutation.isPending ? 'Queuing...' : 'Start Download'}
											</Button>
											{commentsCloudJobId && (
												<div className="space-y-2 pt-2 border-t">
													<Progress
														value={
															typeof cloudCommentsStatusQuery.data?.progress === 'number'
																? Math.round((cloudCommentsStatusQuery.data?.progress ?? 0) * 100)
																: 0
														}
														className="h-2"
													/>
													<div className="text-xs text-muted-foreground text-center">
														{(() => {
															const s = cloudCommentsStatusQuery.data?.status
															const label = s && s in STATUS_LABELS ? STATUS_LABELS[s as keyof typeof STATUS_LABELS] : s ?? 'Starting'
															const pct = typeof cloudCommentsStatusQuery.data?.progress === 'number'
																? `${Math.round((cloudCommentsStatusQuery.data?.progress ?? 0) * 100)}%`
																: '0%'
															return <span title={`Job ${commentsCloudJobId}`}>{label} • {pct}</span>
														})()}
													</div>
												</div>
											)}
										</div>
									</TabsContent>

									<TabsContent value="translate" className="space-y-4 mt-4">
										<div className="space-y-3">
											<div className="flex items-center gap-2">
												<LanguagesIcon className="w-4 h-4 text-muted-foreground" />
												<h4 className="font-medium text-sm">Translate Comments</h4>
											</div>
											<div className="space-y-2">
												<Select value={model} onValueChange={(v) => setModel(v as ChatModelId)}>
													<SelectTrigger className="w-full">
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
												<div className="flex items-center gap-2">
													<Switch
														id="force-translate"
														checked={forceTranslate}
														onCheckedChange={setForceTranslate}
														disabled={translateCommentsMutation.isPending}
													/>
													<Label htmlFor="force-translate" className="text-xs text-muted-foreground">
														Overwrite existing
													</Label>
												</div>
												<Button
													onClick={() =>
														translateCommentsMutation.mutate({
															mediaId: id,
															model,
															force: forceTranslate,
														})
													}
													disabled={translateCommentsMutation.isPending}
													className="w-full"
												>
													{translateCommentsMutation.isPending ? 'Translating...' : 'Translate'}
												</Button>
											</div>
										</div>
									</TabsContent>

									<TabsContent value="moderate" className="space-y-4 mt-4">
										<div className="space-y-3">
											<div className="flex items-center gap-2">
												<ShieldAlert className="w-4 h-4 text-muted-foreground" />
												<h4 className="font-medium text-sm">Moderate Comments</h4>
											</div>

											<div className="space-y-2">
												<Select value={modModel} onValueChange={(v) => setModModel(v as ChatModelId)}>
													<SelectTrigger className="w-full">
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

											<div className="flex items-center gap-2">
												<Switch
													id="overwrite-moderation"
													checked={overwriteModeration}
													onCheckedChange={setOverwriteModeration}
													disabled={moderateCommentsMutation.isPending}
												/>
												<Label htmlFor="overwrite-moderation" className="text-xs text-muted-foreground">
													Overwrite existing
												</Label>
											</div>

											<Button
												onClick={() =>
													moderateCommentsMutation.mutate({ mediaId: id, model: modModel, overwrite: overwriteModeration })
												}
												disabled={moderateCommentsMutation.isPending}
												className="w-full"
											>
												{moderateCommentsMutation.isPending ? 'Moderating...' : 'Run Moderation'}
											</Button>
										</div>
									</div>
								</TabsContent>

								<TabsContent value="render" className="space-y-4 mt-4">
										<div className="space-y-3">
											<div className="flex items-center gap-2">
												<Film className="w-4 h-4 text-muted-foreground" />
												<h4 className="font-medium text-sm">Render Video</h4>
											</div>
										<div className="space-y-2">
											<div>
												<Label className="text-xs text-muted-foreground">Template:</Label>
												<Select value={templateId} onValueChange={(v) => setTemplateId(v as RemotionTemplateId)}>
													<SelectTrigger className="w-full">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{listTemplates().map((t) => (
															<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
														))}
													</SelectContent>
												</Select>
												<div className="mt-2 flex justify-end">
													<Button
														variant="outline"
														size="sm"
														onClick={() => updateRenderSettingsMutation.mutate({ id, commentsTemplate: templateId })}
														disabled={updateRenderSettingsMutation.isPending}
													>
														{updateRenderSettingsMutation.isPending ? 'Saving…' : 'Save Template'}
													</Button>
												</div>
											</div>
											<div>
												<Label className="text-xs text-muted-foreground">Source:</Label>
													<Select value={sourcePolicy} onValueChange={(v) => setSourcePolicy(v as SourcePolicy)}>
														<SelectTrigger className="w-full">
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="auto">Auto</SelectItem>
															<SelectItem value="original">Original</SelectItem>
															<SelectItem value="subtitles" disabled={!mediaQuery.data?.videoWithSubtitlesPath}>With Subtitles</SelectItem>
														</SelectContent>
													</Select>
												</div>
												<div>
													<Label className="text-xs text-muted-foreground">Proxy:</Label>
													<ProxySelector
														value={renderProxyId}
														onValueChange={setRenderProxyId}
														disabled={startCloudRenderMutation.isPending}
													/>
												</div>
											</div>
											<Button
												onClick={() => {
														startCloudRenderMutation.mutate({
															mediaId: id,
															proxyId: renderProxyId === 'none' ? undefined : renderProxyId,
															sourcePolicy,
															templateId,
														})
												}}
												disabled={startCloudRenderMutation.isPending}
												className="w-full"
											>
												{startCloudRenderMutation.isPending ? 'Queuing...' : 'Start Render'}
											</Button>
											{cloudJobId && (
												<div className="space-y-2 pt-2 border-t">
													<Progress
														value={
															typeof cloudStatusQuery.data?.progress === 'number'
																? Math.round((cloudStatusQuery.data?.progress ?? 0) * 100)
																: 0
														}
														className="h-2"
													/>
													<div className="text-xs text-muted-foreground text-center">
														{(() => {
															const s = cloudStatusQuery.data?.status
															const label = s && s in STATUS_LABELS ? STATUS_LABELS[s as keyof typeof STATUS_LABELS] : s ?? 'Starting'
															const pct = typeof cloudStatusQuery.data?.progress === 'number'
																? `${Math.round((cloudStatusQuery.data?.progress ?? 0) * 100)}%`
																: '0%'
															return <span title={`Job ${cloudJobId}`}>{label} • {pct}</span>
														})()}
													</div>
												</div>
											)}
										</div>
									</TabsContent>
								</Tabs>

								<div className="border-t pt-4">
									<div className="space-y-2">
										<p className="text-xs text-muted-foreground">
											Source: <code className="bg-muted px-1 rounded text-xs">{getVideoSourceId()}</code>
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
											className="w-full text-xs"
										>
											<Copy className="w-3 h-3 mr-2" />
											复制声明
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>
					)}

						{/* Right: Comments List */}
						<Card className="lg:col-span-2">
							<CardHeader className="pb-3">
								<div className="flex items-center justify-between gap-3">
									<CardTitle className="text-base flex items-center gap-2">
										<MessageCircle className="w-4 h-4" />
										Comments
									</CardTitle>
										<div className="flex items-center gap-2">
											<Badge variant="secondary" className="text-xs">
												{visibleComments.length} / {comments.length}
											</Badge>
											<Button
												variant={onlyFlagged ? 'default' : 'outline'}
												size="sm"
												onClick={() => setOnlyFlagged((v) => !v)}
												className="h-7 px-2 text-xs"
												title="Toggle only flagged"
											>
												<Filter className="w-3 h-3 mr-1" />
												{onlyFlagged ? 'Only flagged' : 'All comments'}
											</Button>
										</div>
								</div>
							</CardHeader>
						<CardContent className="p-0">
							<div className="max-h-[600px] overflow-y-auto">
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
								{visibleComments.length > 0 && (
									<div>
										{visibleComments.map((comment, index) => (
											<div key={comment.id}>
												<CommentCard comment={comment} mediaId={id} />
												{index < visibleComments.length - 1 && (
													<div className="border-b mx-4" />
												)}
											</div>
										))}
									</div>
								)}
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Rendered Video Preview - Full Width Bottom */}
				{mediaQuery.data?.videoWithInfoPath && (
					<Card>
						<CardHeader className="pb-3">
							<div className="flex items-center justify-between">
								<CardTitle className="text-base flex items-center gap-2">
									<Play className="w-4 h-4" />
									Rendered Video
								</CardTitle>
								<Button
									variant="outline"
									size="sm"
									asChild
								>
									<a
										href={`/api/media/${id}/rendered-info`}
										download={`${mediaQuery.data.title || id}-rendered.mp4`}
										className="flex items-center gap-2"
									>
										<Download className="w-4 h-4" />
										Download
									</a>
								</Button>
							</div>
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
