'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
	ArrowLeft,
	Copy,
	Download,
	Edit,
	Film,
	LanguagesIcon,
	MessageCircle,
	Trash2,
	Settings,
	ShieldAlert,
	Loader2,
	Info,
} from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CommentCard } from '~/components/business/media/comment-card'
import { RemotionPreviewCard } from '~/components/business/media/remotion-preview-card'
import { PublishTitleGenerator } from '~/components/business/media/publish-title-generator'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import {
	ChatModelIds,
	DEFAULT_CHAT_MODEL_ID,
	type ChatModelId,
} from '~/lib/ai/models'
import { extractVideoId } from '@app/media-providers'
import { STATUS_LABELS } from '~/lib/config/media-status.config'
import { queryOrpc } from '~/lib/orpc/query-client'
import { ProxySelector } from '~/components/business/proxy/proxy-selector'
import { Progress } from '~/components/ui/progress'
import { Switch } from '~/components/ui/switch'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { useCloudJob } from '~/lib/hooks/useCloudJob'
import {
	listTemplates,
	DEFAULT_TEMPLATE_ID,
	type RemotionTemplateId,
} from '~/remotion/templates'
import type { Comment } from '~/lib/db/schema'
import { TERMINAL_JOB_STATUSES } from '~/lib/job/status'
import { MEDIA_SOURCES } from '~/lib/media/source'

type SourceStatus = {
	status?: string
	progress?: number
}

export default function CommentsPage() {
	const params = useParams()
	const id = params.id as string
	const queryClient = useQueryClient()
	const [pages, setPages] = useState('3')
	const [model, setModel] = useState<ChatModelId>(DEFAULT_CHAT_MODEL_ID)
	const [forceTranslate, setForceTranslate] = useState(false)
	const [modModel, setModModel] = useState<ChatModelId>(
		DEFAULT_CHAT_MODEL_ID,
	)
	const [overwriteModeration, setOverwriteModeration] = useState(false)
	const [selectedCommentIds, setSelectedCommentIds] = useState<Set<string>>(
		new Set(),
	)

	const [selectedProxyId, setSelectedProxyId] = useState<string>('none')
	const [renderProxyId, setRenderProxyId] = useState<string>('none')
	const [templateId, setTemplateId] =
		useState<RemotionTemplateId>(DEFAULT_TEMPLATE_ID)

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
				refetchInterval: (q: { state: { data?: SourceStatus } }) => {
					const s = q.state.data?.status
					return s && TERMINAL_JOB_STATUSES.includes(s) ? false : 2000
				},
			}),
	})

	const proxiesQuery = useQuery({
		...queryOrpc.proxy.getActiveProxiesForDownload.queryOptions(),
	})

	const mediaQuery = useQuery(
		queryOrpc.media.byId.queryOptions({
			input: { id },
		}),
	)

	// Hydrate selected template from server record
	useEffect(() => {
		const tid =
			(mediaQuery.data?.commentsTemplate as RemotionTemplateId | undefined) ||
			DEFAULT_TEMPLATE_ID
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
			toast.error(`${label} does not exist`)
			return
		}
		if (typeof navigator === 'undefined' || !navigator.clipboard) {
			toast.error('Unable to access clipboard')
			return
		}
		navigator.clipboard
			.writeText(value)
			.then(() => {
				toast.success(`${label} copied to clipboard`)
			})
			.catch(() => {
				toast.error(`Failed to copy ${label}`)
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
	const { mutate: finalizeCommentsJob, isPending: finalizeIsPending } =
		finalizeCloudCommentsMutation
	const cloudCommentsStatus = cloudCommentsStatusQuery.data as
		| SourceStatus
		| undefined
	const cloudCommentsState = cloudCommentsStatus?.status

	useEffect(() => {
		if (
			commentsCloudJobId &&
			cloudCommentsState === 'completed' &&
			!finalizeIsPending
		) {
			if (!finalizeAttemptedJobIdsRef.current.has(commentsCloudJobId)) {
				finalizeAttemptedJobIdsRef.current.add(commentsCloudJobId)
				finalizeCommentsJob({
					mediaId: id,
					jobId: commentsCloudJobId,
				})
			}
		}
	}, [
		commentsCloudJobId,
		cloudCommentsState,
		finalizeCommentsJob,
		finalizeIsPending,
		id,
	])

	const translateCommentsMutation = useEnhancedMutation(
		queryOrpc.comment.translateComments.mutationOptions(),
		{
			invalidateQueries: {
				queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
			},
			successToast: 'Comments translated!',
			errorToast: ({ error }) =>
				`Failed to translate comments: ${error.message}`,
		},
	)

	const moderateCommentsMutation = useEnhancedMutation(
		queryOrpc.comment.moderateComments.mutationOptions(),
		{
			invalidateQueries: {
				queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
			},
			successToast: ({ data }) =>
				`Moderation done: ${data?.flaggedCount ?? 0} flagged`,
			errorToast: ({ error }) => `Failed to moderate: ${error.message}`,
		},
	)

	const deleteCommentsMutation = useEnhancedMutation(
		queryOrpc.comment.deleteComments.mutationOptions({
			onSuccess: () => {
				setSelectedCommentIds(new Set())
			},
		}),
		{
			invalidateQueries: {
				queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
			},
			successToast: ({ variables }) => {
				const count = variables.commentIds.length
				return `Deleted ${count} comment${count > 1 ? 's' : ''}`
			},
			errorToast: ({ error }) =>
				`Failed to delete comments: ${error.message}`,
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
				refetchInterval: (q: { state: { data?: SourceStatus } }) => {
					const s = q.state.data?.status
					return s && TERMINAL_JOB_STATUSES.includes(s) ? false : 2000
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

	const comments: Comment[] = mediaQuery.data?.comments || []
	const visibleComments = comments
	const allVisibleSelected =
		visibleComments.length > 0 &&
		selectedCommentIds.size === visibleComments.length
	const hasSelection = selectedCommentIds.size > 0
	const selectedCount = selectedCommentIds.size

	useEffect(() => {
		setSelectedCommentIds((prev) => {
			const visibleIds = new Set(
				visibleComments.map((comment) => comment.id),
			)
			const next = new Set<string>()
			let changed = false
			for (const id of prev) {
				if (visibleIds.has(id)) {
					next.add(id)
				} else {
					changed = true
				}
			}
			if (!changed && next.size === prev.size) return prev
			return next
		})
	}, [visibleComments])

	const hasRenderedCommentsVideo = Boolean(mediaQuery.data?.videoWithInfoPath)
	const renderedDownloadUrl = `/api/media/${encodeURIComponent(id)}/rendered-info?download=1`
	const availableProxies = proxiesQuery.data?.proxies?.filter((proxy) => proxy.id !== 'none') ?? []
	const hasAvailableProxies = availableProxies.length > 0
	const hasDownloadProxySelected = Boolean(selectedProxyId && selectedProxyId !== 'none')
	const hasRenderProxySelected = Boolean(renderProxyId && renderProxyId !== 'none')
	const canQueueCommentsDownload = hasAvailableProxies && hasDownloadProxySelected
	const canQueueRender = hasAvailableProxies && hasRenderProxySelected

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

		if (mediaQuery.data.source === MEDIA_SOURCES.YOUTUBE) {
			return extractVideoId(mediaQuery.data.url)
		}

		// For TikTok or other sources, return the URL or a processed identifier
		return mediaQuery.data.url
	}

	const cloudRenderStatus = cloudStatusQuery.data as SourceStatus | undefined
	const commentsStatusLabel = cloudCommentsStatus?.status
		? STATUS_LABELS[
				cloudCommentsStatus.status as keyof typeof STATUS_LABELS
			] ?? cloudCommentsStatus.status
		: 'Starting...'
	const commentsProgressValue =
		typeof cloudCommentsStatus?.progress === 'number'
			? Math.round((cloudCommentsStatus.progress ?? 0) * 100)
			: 0
	const renderStatusLabel = cloudRenderStatus?.status ?? 'Starting...'
	const renderProgressValue =
		typeof cloudRenderStatus?.progress === 'number'
			? Math.round((cloudRenderStatus.progress ?? 0) * 100)
			: 0

	const toggleSelectAll = () => {
		if (visibleComments.length === 0) return
		setSelectedCommentIds(
			allVisibleSelected
					? new Set()
					: new Set(
							visibleComments.map((comment) => comment.id),
						),
		)
	}

	const handleSelectComment = (commentId: string, checked: boolean) => {
		setSelectedCommentIds((prev) => {
			const next = new Set(prev)
			if (checked) {
				next.add(commentId)
			} else {
				next.delete(commentId)
			}
			return next
		})
	}

	const handleBulkDelete = () => {
		if (!hasSelection) return
		const ids = Array.from(selectedCommentIds)
		const confirmed =
			typeof window === 'undefined'
				? true
				: window.confirm(
						`Delete ${ids.length} selected comment${ids.length > 1 ? 's' : ''}?`,
					)
		if (!confirmed) return
		deleteCommentsMutation.mutate({
			mediaId: id,
			commentIds: ids,
		})
	}

	return (
		<div className="min-h-screen space-y-8">
			{/* Header */}
			<div className="px-6 pt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-4">
						<Link
							href={`/media/${id}`}
							className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-secondary/50 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
						>
							<ArrowLeft className="h-5 w-5" strokeWidth={1.5} />
						</Link>
						<div className="space-y-1">
							<h1 className="text-2xl font-bold tracking-tight text-foreground">Comments</h1>
							<p className="text-sm text-muted-foreground font-light">
								Manage, translate, and render comments for this video.
							</p>
						</div>
					</div>
					{mediaQuery.data?.translatedTitle && (
						<Button
							variant="outline"
							size="sm"
							className="h-9 gap-2 shadow-sm"
							onClick={handleEditClick}
						>
							<Edit className="h-4 w-4" strokeWidth={1.5} />
							Edit Titles
						</Button>
					)}
				</div>
			</div>

			{/* Edit Dialog */}
			<Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
				<DialogContent className="glass border-white/20">
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
								className="bg-white/50 border-white/20"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="translatedTitle">
								Translated Title (English)
							</Label>
							<Input
								id="translatedTitle"
								value={editTranslatedTitle}
								onChange={(e) => setEditTranslatedTitle(e.target.value)}
								placeholder="Enter translated title"
								className="bg-white/50 border-white/20"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setEditDialogOpen(false)}>
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
			<div className="px-6 pb-12">
				{/* Preview - Compact Top */}
				<div className="mb-8">
					<RemotionPreviewCard
						videoInfo={previewVideoInfo}
						comments={comments}
						isLoading={mediaQuery.isLoading}
						templateId={templateId}
					/>
				</div>

				{/* Actions & Comments Grid */}
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
					{/* Left: Workflow Actions */}
					{mediaQuery.data && (
						<div className="lg:col-span-1 space-y-6">
							<Card className="glass border-none shadow-sm">
								<CardHeader className="pb-4 border-b border-border/40">
									<CardTitle className="text-lg flex items-center gap-2">
										<Settings className="h-5 w-5 text-primary" strokeWidth={1.5} />
										Workflow
									</CardTitle>
								</CardHeader>
								<CardContent className="pt-6">
									<Tabs defaultValue="download" className="w-full">
										<TabsList className="grid w-full grid-cols-5 bg-secondary/30 p-1 rounded-xl">
											<TabsTrigger value="basics" className="rounded-lg text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
												Base
											</TabsTrigger>
											<TabsTrigger value="download" className="rounded-lg text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
												Get
											</TabsTrigger>
											<TabsTrigger value="translate" className="rounded-lg text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
												Trans
											</TabsTrigger>
											<TabsTrigger value="moderate" className="rounded-lg text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
												Mod
											</TabsTrigger>
											<TabsTrigger value="render" className="rounded-lg text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
												Render
											</TabsTrigger>
										</TabsList>

										<TabsContent value="basics" className="space-y-4 mt-6 animate-in fade-in slide-in-from-bottom-2">
											<div className="space-y-4">
												<div className="space-y-2">
													<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
														Translated Title
													</p>
													<div className="rounded-lg bg-white/50 p-3 text-sm font-medium shadow-sm border border-white/20">
														{mediaQuery.data.translatedTitle ?? 'No translated title'}
													</div>
													<Button
														variant="ghost"
														size="sm"
														className="h-8 w-full justify-start text-xs text-muted-foreground hover:text-foreground"
														disabled={!mediaQuery.data.translatedTitle}
														onClick={() =>
															copyTitleValue(
																mediaQuery.data?.translatedTitle,
																'English title',
															)
														}
													>
														<Copy className="h-3 w-3 mr-2" strokeWidth={1.5} />
														Copy English Title
													</Button>
												</div>

												{/* Publish Title Generator */}
												<div className="pt-2 border-t border-border/40">
													<PublishTitleGenerator
														mediaId={id}
														initialPublishTitle={mediaQuery.data.publishTitle}
													/>
												</div>

												<div className="space-y-2 pt-2 border-t border-border/40">
													<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
														Original Title
													</p>
													<div className="rounded-lg bg-white/50 p-3 text-sm text-muted-foreground shadow-sm border border-white/20">
														{mediaQuery.data.title ?? 'No original title'}
													</div>
													<Button
														variant="ghost"
														size="sm"
														className="h-8 w-full justify-start text-xs text-muted-foreground hover:text-foreground"
														disabled={!mediaQuery.data.title}
														onClick={() =>
															copyTitleValue(
																mediaQuery.data?.title,
																'Original title',
															)
														}
													>
														<Copy className="h-3 w-3 mr-2" strokeWidth={1.5} />
														Copy Original Title
													</Button>
												</div>
											</div>
										</TabsContent>

										<TabsContent value="download" className="space-y-4 mt-6 animate-in fade-in slide-in-from-bottom-2">
											<div className="space-y-4">
												<div className="space-y-2">
													<Label className="text-xs font-medium text-muted-foreground">
														Pages to fetch
													</Label>
													<Select value={pages} onValueChange={setPages}>
														<SelectTrigger className="w-full bg-white/50 border-white/20">
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
												<div className="space-y-2">
													<Label className="text-xs font-medium text-muted-foreground">
														Proxy
													</Label>
													<ProxySelector
														value={selectedProxyId}
														onValueChange={setSelectedProxyId}
														disabled={startCloudCommentsMutation.isPending}
														allowDirect={false}
													/>
												</div>
												<Button
													onClick={() => {
														if (!canQueueCommentsDownload) {
															const message = hasAvailableProxies
																? 'Please select a proxy first.'
																: 'No proxies available.'
															toast.error(message)
															return
														}
														const p = parseInt(pages, 10)
														startCloudCommentsMutation.mutate({
															mediaId: id,
															pages: p,
															proxyId:
																selectedProxyId === 'none'
																	? undefined
																	: selectedProxyId,
														})
													}}
													disabled={startCloudCommentsMutation.isPending || !canQueueCommentsDownload}
													className="w-full shadow-sm"
												>
													{startCloudCommentsMutation.isPending ? (
														<>
															<Loader2 className="mr-2 h-4 w-4 animate-spin" />
															Queuing...
														</>
													) : (
														<>
															<Download className="mr-2 h-4 w-4" strokeWidth={1.5} />
															Start Download
														</>
													)}
												</Button>
												
												{commentsCloudJobId && (
													<div className="rounded-lg bg-secondary/30 p-3 space-y-2">
														<div className="flex items-center justify-between text-xs">
															<span className="text-muted-foreground">Status</span>
															<span className="font-medium">
																{commentsStatusLabel}
															</span>
														</div>
														<Progress
															value={commentsProgressValue}
															className="h-1.5"
														/>
													</div>
												)}
											</div>
										</TabsContent>

										<TabsContent value="translate" className="space-y-4 mt-6 animate-in fade-in slide-in-from-bottom-2">
											<div className="space-y-4">
												<div className="space-y-2">
													<Label className="text-xs font-medium text-muted-foreground">AI Model</Label>
													<Select
														value={model}
														onValueChange={(v) => setModel(v as ChatModelId)}
													>
														<SelectTrigger className="w-full bg-white/50 border-white/20">
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
												</div>
												<div className="flex items-center justify-between rounded-lg border border-border/40 p-3 bg-white/30">
													<Label
														htmlFor="force-translate"
														className="text-sm font-medium"
													>
														Overwrite existing
													</Label>
													<Switch
														id="force-translate"
														checked={forceTranslate}
														onCheckedChange={setForceTranslate}
														disabled={translateCommentsMutation.isPending}
													/>
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
													className="w-full shadow-sm"
												>
													{translateCommentsMutation.isPending ? (
														<>
															<Loader2 className="mr-2 h-4 w-4 animate-spin" />
															Translating...
														</>
													) : (
														<>
															<LanguagesIcon className="mr-2 h-4 w-4" strokeWidth={1.5} />
															Translate
														</>
													)}
												</Button>
											</div>
										</TabsContent>

										<TabsContent value="moderate" className="space-y-4 mt-6 animate-in fade-in slide-in-from-bottom-2">
											<div className="space-y-4">
												<div className="space-y-2">
													<Label className="text-xs font-medium text-muted-foreground">AI Model</Label>
													<Select
														value={modModel}
														onValueChange={(v) => setModModel(v as ChatModelId)}
													>
														<SelectTrigger className="w-full bg-white/50 border-white/20">
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
												</div>

												<div className="flex items-center justify-between rounded-lg border border-border/40 p-3 bg-white/30">
													<Label
														htmlFor="overwrite-moderation"
														className="text-sm font-medium"
													>
														Overwrite existing
													</Label>
													<Switch
														id="overwrite-moderation"
														checked={overwriteModeration}
														onCheckedChange={setOverwriteModeration}
														disabled={moderateCommentsMutation.isPending}
													/>
												</div>

												<Button
													onClick={() =>
														moderateCommentsMutation.mutate({
															mediaId: id,
															model: modModel,
															overwrite: overwriteModeration,
														})
													}
													disabled={moderateCommentsMutation.isPending}
													className="w-full shadow-sm"
												>
													{moderateCommentsMutation.isPending ? (
														<>
															<Loader2 className="mr-2 h-4 w-4 animate-spin" />
															Moderating...
														</>
													) : (
														<>
															<ShieldAlert className="mr-2 h-4 w-4" strokeWidth={1.5} />
															Run Moderation
														</>
													)}
												</Button>
											</div>
										</TabsContent>

										<TabsContent value="render" className="space-y-4 mt-6 animate-in fade-in slide-in-from-bottom-2">
											<div className="space-y-4">
												<div className="space-y-2">
													<Label className="text-xs font-medium text-muted-foreground">Template</Label>
													<Select
														value={templateId}
														onValueChange={(v) => {
															const tid = v as RemotionTemplateId
															setTemplateId(tid)
															updateRenderSettingsMutation.mutate({
																id,
																commentsTemplate: tid,
															})
														}}
													>
														<SelectTrigger className="w-full bg-white/50 border-white/20">
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															{listTemplates().map((t) => (
																<SelectItem key={t.id} value={t.id}>
																	{t.name}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>

												<div className="space-y-2">
													<Label className="text-xs font-medium text-muted-foreground">Source Policy</Label>
													<Select
														value={sourcePolicy}
														onValueChange={(v) => setSourcePolicy(v as SourcePolicy)}
													>
														<SelectTrigger className="w-full bg-white/50 border-white/20">
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="auto">Auto (Best available)</SelectItem>
															<SelectItem value="original">Original Video</SelectItem>
															<SelectItem value="subtitles">Subtitle Render</SelectItem>
														</SelectContent>
													</Select>
												</div>

												<div className="space-y-2">
													<Label className="text-xs font-medium text-muted-foreground">Proxy</Label>
													<ProxySelector
														value={renderProxyId}
														onValueChange={setRenderProxyId}
														disabled={startCloudRenderMutation.isPending}
														allowDirect={false}
													/>
												</div>

												<Button
													onClick={() => {
														if (!canQueueRender) {
															const message = hasAvailableProxies
																? 'Please select a proxy first.'
																: 'No proxies available.'
															toast.error(message)
															return
														}
														startCloudRenderMutation.mutate({
															mediaId: id,
															templateId,
															proxyId:
																renderProxyId === 'none' ? undefined : renderProxyId,
															sourcePolicy,
														})
													}}
													disabled={startCloudRenderMutation.isPending || !canQueueRender}
													className="w-full shadow-sm"
												>
													{startCloudRenderMutation.isPending ? (
														<>
															<Loader2 className="mr-2 h-4 w-4 animate-spin" />
															Queuing...
														</>
													) : (
														<>
															<Film className="mr-2 h-4 w-4" strokeWidth={1.5} />
															Start Render
														</>
													)}
												</Button>

												{cloudJobId && (
													<div className="rounded-lg bg-secondary/30 p-3 space-y-2">
														<div className="flex items-center justify-between text-xs">
															<span className="text-muted-foreground">Status</span>
															<span className="font-medium">
																{renderStatusLabel}
															</span>
														</div>
														<Progress
															value={renderProgressValue}
															className="h-1.5"
														/>
													</div>
												)}

												<div className="space-y-2">
													<Label className="text-xs font-medium text-muted-foreground">Rendered Output</Label>
													{hasRenderedCommentsVideo ? (
														<Button asChild variant="outline" className="w-full shadow-sm">
															<a href={renderedDownloadUrl}>
																<Download className="mr-2 h-4 w-4" strokeWidth={1.5} />
																Download Rendered Video
															</a>
														</Button>
													) : (
														<div className="text-xs text-muted-foreground rounded-lg border border-dashed border-border/50 bg-secondary/30 px-3 py-2">
															Render completes here to enable download.
														</div>
													)}
												</div>
											</div>
										</TabsContent>
									</Tabs>
								</CardContent>
							</Card>
							<Card className="glass border-none shadow-sm">
								<CardHeader className="pb-4 border-b border-border/40">
									<CardTitle className="text-lg flex items-center gap-2">
										<Info className="h-5 w-5 text-primary" strokeWidth={1.5} />
										Video Info
									</CardTitle>
								</CardHeader>
								<CardContent className="pt-6 space-y-4">
									<div className="space-y-2">
										<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
											Source ID
										</p>
										<div className="rounded-lg bg-white/50 p-3 text-sm font-mono shadow-sm border border-white/20 break-all">
											{getVideoSourceId()}
										</div>
									</div>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => {
											const disclaimerText = `内容声明

本视频仅用于娱乐用途，所引用的评论不代表本平台的立场或观点。
请理性观看，避免传播不实信息。

原始视频：${getVideoSourceId()}
${
	mediaQuery.data?.comments &&
	mediaQuery.data.comments.length > 0 &&
	mediaQuery.data.commentsDownloadedAt
		? `评论采集时间：${new Date(
				mediaQuery.data.commentsDownloadedAt,
			).toLocaleString('zh-CN', {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
			})}`
		: ''
}`;
											if (navigator.clipboard) {
												navigator.clipboard.writeText(disclaimerText)
												toast.success('Disclaimer copied to clipboard')
											}
										}}
										className="w-full justify-start text-xs text-muted-foreground hover:text-foreground"
									>
										<Copy className="mr-2 h-3 w-3" strokeWidth={1.5} />
										Copy Disclaimer
									</Button>
								</CardContent>
							</Card>
						</div>
					)}

					{/* Right: Comments List */}
					<div className="lg:col-span-2 space-y-6">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div className="flex items-center gap-2">
								<MessageCircle className="h-5 w-5 text-primary" strokeWidth={1.5} />
								<h2 className="text-lg font-semibold">
									Comments ({comments.length})
								</h2>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								{hasSelection ? (
									<Badge variant="secondary" className="h-7 rounded-full px-3 text-xs">
										{selectedCount} selected
									</Badge>
								) : null}
								<Button
									variant="outline"
									size="sm"
									onClick={toggleSelectAll}
									disabled={visibleComments.length === 0}
									className="h-8"
								>
									{allVisibleSelected ? 'Clear selection' : 'Select all'}
								</Button>
								<Button
									variant="destructive"
									size="sm"
									onClick={handleBulkDelete}
									disabled={!hasSelection || deleteCommentsMutation.isPending}
									className="h-8 gap-2"
								>
									{deleteCommentsMutation.isPending ? (
										<>
											<Loader2 className="h-4 w-4 animate-spin" />
											Deleting...
										</>
									) : (
										<>
											<Trash2 className="h-4 w-4" />
											Delete Selected
										</>
									)}
								</Button>
							</div>
						</div>

							{mediaQuery.isLoading ? (
								<div className="space-y-3">
									{[1, 2, 3, 4].map((i) => (
										<div key={i} className="h-40 rounded-2xl bg-secondary/30 animate-pulse" />
									))}
								</div>
							) : visibleComments.length > 0 ? (
								<div className="space-y-3">
									{visibleComments.map((comment) => (
										<CommentCard
											key={comment.id}
											comment={comment}
											mediaId={id}
											selected={selectedCommentIds.has(comment.id)}
											onSelectChange={(checked) =>
												handleSelectComment(comment.id, checked)
										}
									/>
								))}
							</div>
						) : (
							<div className="rounded-2xl border border-dashed border-border/50 bg-background/30 py-20 text-center backdrop-blur-sm">
								<div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-secondary/50 flex items-center justify-center">
									<MessageCircle className="h-8 w-8 text-muted-foreground/50" strokeWidth={1.5} />
								</div>
								<h3 className="mb-2 text-lg font-semibold text-foreground">No comments found</h3>
								<p className="text-muted-foreground font-light max-w-sm mx-auto">
									Download comments to get started.
								</p>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
