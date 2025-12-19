'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
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
import { useParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useLocale, useTranslations } from '~/lib/i18n'
import { PageHeader } from '~/components/business/layout/page-header'
import { WorkspacePageShell } from '~/components/business/layout/workspace-page-shell'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { DEFAULT_CHAT_MODEL_ID, type ChatModelId } from '~/lib/ai/models'
import { extractVideoId } from '@app/media-providers'
import { STATUS_LABELS } from '~/lib/config/media-status'
import { queryOrpc } from '~/lib/orpc/query-client'
import { ProxySelector } from '~/components/business/proxy/proxy-selector'
import { Switch } from '~/components/ui/switch'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { useCloudJob } from '~/lib/hooks/useCloudJob'
import {
	listTemplates,
	DEFAULT_TEMPLATE_ID,
	type RemotionTemplateId,
} from '~/remotion/templates'
import type { Comment } from '~/lib/db/schema'
	import type { JobStatus } from '@app/media-domain'
import { MEDIA_SOURCES } from '~/lib/media/source'
import { useConfirmDialog } from '~/components/business/layout/confirm-dialog-provider'
import { CloudJobProgress } from '~/components/business/jobs/cloud-job-progress'

	type SourceStatus = {
		status?: JobStatus
		progress?: number
	}

export default function CommentsPage() {
	const t = useTranslations('MediaComments.page')
	const locale = useLocale()
	const params = useParams()
	const id = params.id as string
	const queryClient = useQueryClient()
	const [pages, setPages] = useState('3')
	const [model, setModel] = useState<ChatModelId>(DEFAULT_CHAT_MODEL_ID)
	const [forceTranslate, setForceTranslate] = useState(false)
	const [modModel, setModModel] = useState<ChatModelId>(DEFAULT_CHAT_MODEL_ID)
	const [overwriteModeration, setOverwriteModeration] = useState(false)
	const [selectedCommentIds, setSelectedCommentIds] = useState<Set<string>>(
		new Set(),
	)

	const [selectedProxyId, setSelectedProxyId] = useState<string>('none')
	const [renderProxyId, setRenderProxyId] = useState<string>('none')
	const [templateId, setTemplateId] =
		useState<RemotionTemplateId>(DEFAULT_TEMPLATE_ID)
	const confirmDialog = useConfirmDialog()

	const llmModelsQuery = useQuery(
		queryOrpc.ai.listModels.queryOptions({
			input: { kind: 'llm', enabledOnly: true },
		}),
	)
	const llmModelOptions = (llmModelsQuery.data?.items ?? []).map((m) => ({
		id: m.id as ChatModelId,
		label: m.label,
	}))
	const llmDefaultQuery = useQuery(
		queryOrpc.ai.getDefaultModel.queryOptions({
			input: { kind: 'llm' },
		}),
	)
	useEffect(() => {
		const defaultId = llmDefaultQuery.data?.model?.id
		if (!defaultId) return
		setModel((m) =>
			m === DEFAULT_CHAT_MODEL_ID ? (defaultId as ChatModelId) : m,
		)
		setModModel((m) =>
			m === DEFAULT_CHAT_MODEL_ID ? (defaultId as ChatModelId) : m,
		)
	}, [llmDefaultQuery.data?.model?.id])

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
						if (s === 'completed' || s === 'failed' || s === 'canceled') return false
						return 2000
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
			successToast: t('toasts.templateSaved'),
			errorToast: ({ error }) =>
				t('errors.templateSaveFailed', { message: error.message }),
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
			successToast: t('toasts.titlesUpdated'),
			errorToast: ({ error }) =>
				t('errors.titlesUpdateFailed', { message: error.message }),
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
			toast.error(t('toasts.valueMissing', { label }))
			return
		}
		if (typeof navigator === 'undefined' || !navigator.clipboard) {
			toast.error(t('toasts.clipboardUnavailable'))
			return
		}
		navigator.clipboard
			.writeText(value)
			.then(() => {
				toast.success(t('toasts.copiedToClipboard', { label }))
			})
			.catch(() => {
				toast.error(t('toasts.copyFailed', { label }))
			})
	}

	const startCloudCommentsMutation = useEnhancedMutation(
		queryOrpc.comment.startCloudCommentsDownload.mutationOptions({
			onSuccess: (data) => {
				setCommentsCloudJobId(data.jobId)
			},
		}),
		{
			successToast: t('toasts.cloudCommentsQueued'),
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
			successToast: t('toasts.commentsDownloaded'),
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
			successToast: t('toasts.commentsTranslated'),
			errorToast: ({ error }) =>
				t('errors.translateFailed', { message: error.message }),
		},
	)

	const moderateCommentsMutation = useEnhancedMutation(
		queryOrpc.comment.moderateComments.mutationOptions(),
		{
			invalidateQueries: {
				queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
			},
			successToast: ({ data }) =>
				t('toasts.moderationDone', { count: data?.flaggedCount ?? 0 }),
			errorToast: ({ error }) =>
				t('errors.moderateFailed', { message: error.message }),
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
				return t('toasts.commentsDeleted', { count })
			},
			errorToast: ({ error }) =>
				t('errors.deleteFailed', { message: error.message }),
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
						if (s === 'completed' || s === 'failed' || s === 'canceled') return false
						return 2000
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
			successToast: t('toasts.cloudRenderQueued'),
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
			const visibleIds = new Set(visibleComments.map((comment) => comment.id))
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
	const availableProxies =
		proxiesQuery.data?.proxies?.filter((proxy) => proxy.id !== 'none') ?? []
	const hasAvailableProxies = availableProxies.length > 0
	const hasDownloadProxySelected = Boolean(
		selectedProxyId && selectedProxyId !== 'none',
	)
	const hasRenderProxySelected = Boolean(
		renderProxyId && renderProxyId !== 'none',
	)
	const canQueueCommentsDownload =
		hasAvailableProxies && hasDownloadProxySelected
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
				return extractVideoId(mediaQuery.data.url) || id
			}

			// For TikTok or other sources, return the URL or a processed identifier
			return mediaQuery.data.url
		}

	const cloudRenderStatus = cloudStatusQuery.data as SourceStatus | undefined
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
				: new Set(visibleComments.map((comment) => comment.id)),
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

	const handleBulkDelete = async () => {
		if (!hasSelection) return
		const ids = Array.from(selectedCommentIds)
		const confirmed = await confirmDialog({
			title: t('bulkDelete.confirm.title'),
			description: t('bulkDelete.confirm.description', { count: ids.length }),
			variant: 'destructive',
		})
		if (!confirmed) return
		deleteCommentsMutation.mutate({
			mediaId: id,
			commentIds: ids,
		})
	}

	return (
		<WorkspacePageShell
			header={
				<PageHeader
					backHref={`/media/${id}`}
					backText={t('header.back')}
					title={t('header.title')}
					rightContent={
						mediaQuery.data?.translatedTitle ? (
							<Button
								variant="outline"
								size="sm"
								className="h-9 gap-2 shadow-sm"
								onClick={handleEditClick}
							>
								<Edit className="h-4 w-4" strokeWidth={1.5} />
								{t('header.editTitles')}
							</Button>
						) : null
					}
				/>
			}
		>
			<Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
				<DialogContent className="glass border-white/20">
					<DialogHeader>
						<DialogTitle>{t('editDialog.title')}</DialogTitle>
						<DialogDescription>{t('editDialog.description')}</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="title">
								{t('editDialog.fields.originalLabel')}
							</Label>
							<Input
								id="title"
								value={editTitle}
								onChange={(e) => setEditTitle(e.target.value)}
								placeholder={t('editDialog.fields.originalPlaceholder')}
								className="bg-white/50 border-white/20"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="translatedTitle">
								{t('editDialog.fields.translatedLabel')}
							</Label>
							<Input
								id="translatedTitle"
								value={editTranslatedTitle}
								onChange={(e) => setEditTranslatedTitle(e.target.value)}
								placeholder={t('editDialog.fields.translatedPlaceholder')}
								className="bg-white/50 border-white/20"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setEditDialogOpen(false)}>
							{t('editDialog.actions.cancel')}
						</Button>
						<Button
							onClick={handleSaveTitles}
							disabled={updateTitlesMutation.isPending}
						>
							{updateTitlesMutation.isPending
								? t('editDialog.actions.saving')
								: t('editDialog.actions.save')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<div className="pb-12">
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
										<Settings
											className="h-5 w-5 text-primary"
											strokeWidth={1.5}
										/>
										{t('workflow.title')}
									</CardTitle>
								</CardHeader>
								<CardContent className="pt-6">
									<Tabs defaultValue="download" className="w-full">
										<TabsList className="grid w-full grid-cols-5 bg-secondary/30 p-1 rounded-xl">
											<TabsTrigger
												value="basics"
												className="rounded-lg text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm"
											>
												{t('tabs.basics')}
											</TabsTrigger>
											<TabsTrigger
												value="download"
												className="rounded-lg text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm"
											>
												{t('tabs.download')}
											</TabsTrigger>
											<TabsTrigger
												value="translate"
												className="rounded-lg text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm"
											>
												{t('tabs.translate')}
											</TabsTrigger>
											<TabsTrigger
												value="moderate"
												className="rounded-lg text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm"
											>
												{t('tabs.moderate')}
											</TabsTrigger>
											<TabsTrigger
												value="render"
												className="rounded-lg text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm"
											>
												{t('tabs.render')}
											</TabsTrigger>
										</TabsList>

										<TabsContent
											value="basics"
											className="space-y-4 mt-6 animate-in fade-in slide-in-from-bottom-2"
										>
											<div className="space-y-4">
												<div className="space-y-2">
													<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
														{t('basics.translatedTitle.label')}
													</p>
													<div className="rounded-lg bg-white/50 p-3 text-sm font-medium shadow-sm border border-white/20">
														{mediaQuery.data.translatedTitle ??
															t('basics.translatedTitle.empty')}
													</div>
													<Button
														variant="ghost"
														size="sm"
														className="h-8 w-full justify-start text-xs text-muted-foreground hover:text-foreground"
														disabled={!mediaQuery.data.translatedTitle}
														onClick={() =>
															copyTitleValue(
																mediaQuery.data?.translatedTitle,
																t('labels.englishTitle'),
															)
														}
													>
														<Copy className="h-3 w-3 mr-2" strokeWidth={1.5} />
														{t('basics.translatedTitle.copy')}
													</Button>
												</div>

												<div className="space-y-2 pt-2 border-t border-border/40">
													<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
														{t('basics.originalTitle.label')}
													</p>
													<div className="rounded-lg bg-white/50 p-3 text-sm text-muted-foreground shadow-sm border border-white/20">
														{mediaQuery.data.title ??
															t('basics.originalTitle.empty')}
													</div>
													<Button
														variant="ghost"
														size="sm"
														className="h-8 w-full justify-start text-xs text-muted-foreground hover:text-foreground"
														disabled={!mediaQuery.data.title}
														onClick={() =>
															copyTitleValue(
																mediaQuery.data?.title,
																t('labels.originalTitle'),
															)
														}
													>
														<Copy className="h-3 w-3 mr-2" strokeWidth={1.5} />
														{t('basics.originalTitle.copy')}
													</Button>
												</div>
											</div>
										</TabsContent>

										<TabsContent
											value="download"
											className="space-y-4 mt-6 animate-in fade-in slide-in-from-bottom-2"
										>
											<div className="space-y-4">
												<div className="space-y-2">
													<Label className="text-xs font-medium text-muted-foreground">
														{t('download.pagesLabel')}
													</Label>
													<Select value={pages} onValueChange={setPages}>
														<SelectTrigger className="w-full bg-white/50 border-white/20">
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															{[...Array(10).keys()].map((i) => (
																<SelectItem key={i + 1} value={String(i + 1)}>
																	{t('download.pagesOption', { count: i + 1 })}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>
												<div className="space-y-2">
													<Label className="text-xs font-medium text-muted-foreground">
														{t('fields.proxy')}
													</Label>
													<ProxySelector
														value={selectedProxyId}
														onValueChange={setSelectedProxyId}
														disabled={startCloudCommentsMutation.isPending}
														allowDirect={false}
													/>
												</div>
												<div className="flex items-center gap-2">
													<Button
														onClick={() => {
															if (!canQueueCommentsDownload) {
																const message = hasAvailableProxies
																	? t('errors.selectProxyFirst')
																	: t('errors.noProxiesAvailable')
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
														disabled={
															startCloudCommentsMutation.isPending ||
															!canQueueCommentsDownload
														}
														className="flex-1 shadow-sm"
													>
														{startCloudCommentsMutation.isPending ? (
															<>
																<Loader2 className="mr-2 h-4 w-4 animate-spin" />
																{t('download.queuing')}
															</>
														) : (
															<>
																<Download
																	className="mr-2 h-4 w-4"
																	strokeWidth={1.5}
																/>
																{t('download.start')}
															</>
														)}
													</Button>

													{commentsCloudJobId && (
														<CloudJobProgress
															status={cloudCommentsStatus?.status}
															progress={
																typeof cloudCommentsStatus?.progress ===
																'number'
																	? cloudCommentsStatus.progress
																	: null
															}
															jobId={commentsCloudJobId}
															showPhase={false}
															showIds={true}
															showCompactLabel={false}
															labels={{ status: t('cloudJob.labels.status') }}
														/>
													)}
												</div>
											</div>
										</TabsContent>

										<TabsContent
											value="translate"
											className="space-y-4 mt-6 animate-in fade-in slide-in-from-bottom-2"
										>
											<div className="space-y-4">
												<div className="space-y-2">
													<Label className="text-xs font-medium text-muted-foreground">
														{t('fields.aiModel')}
													</Label>
													<Select
														value={model}
														onValueChange={(v) => setModel(v as ChatModelId)}
													>
														<SelectTrigger className="w-full bg-white/50 border-white/20">
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															{llmModelOptions.map((m) => (
																<SelectItem key={m.id} value={m.id}>
																	{m.label || m.id}
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
														{t('fields.overwriteExisting')}
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
															{t('translate.translating')}
														</>
													) : (
														<>
															<LanguagesIcon
																className="mr-2 h-4 w-4"
																strokeWidth={1.5}
															/>
															{t('translate.translate')}
														</>
													)}
												</Button>
											</div>
										</TabsContent>

										<TabsContent
											value="moderate"
											className="space-y-4 mt-6 animate-in fade-in slide-in-from-bottom-2"
										>
											<div className="space-y-4">
												<div className="space-y-2">
													<Label className="text-xs font-medium text-muted-foreground">
														{t('fields.aiModel')}
													</Label>
													<Select
														value={modModel}
														onValueChange={(v) => setModModel(v as ChatModelId)}
													>
														<SelectTrigger className="w-full bg-white/50 border-white/20">
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															{llmModelOptions.map((m) => (
																<SelectItem key={m.id} value={m.id}>
																	{m.label || m.id}
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
														{t('fields.overwriteExisting')}
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
															{t('moderate.moderating')}
														</>
													) : (
														<>
															<ShieldAlert
																className="mr-2 h-4 w-4"
																strokeWidth={1.5}
															/>
															{t('moderate.run')}
														</>
													)}
												</Button>
											</div>
										</TabsContent>

										<TabsContent
											value="render"
											className="space-y-4 mt-6 animate-in fade-in slide-in-from-bottom-2"
										>
											<div className="space-y-4">
												<div className="space-y-2">
													<Label className="text-xs font-medium text-muted-foreground">
														{t('render.template')}
													</Label>
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
													<Label className="text-xs font-medium text-muted-foreground">
														{t('render.sourcePolicy.label')}
													</Label>
													<Select
														value={sourcePolicy}
														onValueChange={(v) =>
															setSourcePolicy(v as SourcePolicy)
														}
													>
														<SelectTrigger className="w-full bg-white/50 border-white/20">
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="auto">
																{t('render.sourcePolicy.auto')}
															</SelectItem>
															<SelectItem value="original">
																{t('render.sourcePolicy.original')}
															</SelectItem>
															<SelectItem value="subtitles">
																{t('render.sourcePolicy.subtitles')}
															</SelectItem>
														</SelectContent>
													</Select>
												</div>

												<div className="space-y-2">
													<Label className="text-xs font-medium text-muted-foreground">
														{t('fields.proxy')}
													</Label>
													<ProxySelector
														value={renderProxyId}
														onValueChange={setRenderProxyId}
														disabled={startCloudRenderMutation.isPending}
														allowDirect={false}
													/>
												</div>

												<div className="flex items-center gap-2">
													<Button
														onClick={() => {
															if (!canQueueRender) {
																const message = hasAvailableProxies
																	? t('errors.selectProxyFirst')
																	: t('errors.noProxiesAvailable')
																toast.error(message)
																return
															}
															startCloudRenderMutation.mutate({
																mediaId: id,
																templateId,
																proxyId:
																	renderProxyId === 'none'
																		? undefined
																		: renderProxyId,
																sourcePolicy,
															})
														}}
														disabled={
															startCloudRenderMutation.isPending ||
															!canQueueRender
														}
														className="flex-1 shadow-sm"
													>
														{startCloudRenderMutation.isPending ? (
															<>
																<Loader2 className="mr-2 h-4 w-4 animate-spin" />
																{t('render.queuing')}
															</>
														) : (
															<>
																<Film
																	className="mr-2 h-4 w-4"
																	strokeWidth={1.5}
																/>
																{t('render.start')}
															</>
														)}
													</Button>

													{cloudJobId && (
														<CloudJobProgress
															status={cloudRenderStatus?.status}
															progress={
																typeof cloudRenderStatus?.progress === 'number'
																	? cloudRenderStatus.progress
																	: null
															}
															jobId={cloudJobId}
															showPhase={false}
															showIds={true}
															showCompactLabel={false}
															labels={{
																status: t('cloudJob.labels.renderStatus'),
															}}
														/>
													)}
												</div>

												<div className="space-y-2">
													<Label className="text-xs font-medium text-muted-foreground">
														{t('render.output.label')}
													</Label>
													{hasRenderedCommentsVideo ? (
														<Button
															asChild
															variant="outline"
															className="w-full shadow-sm"
														>
															<a href={renderedDownloadUrl}>
																<Download
																	className="mr-2 h-4 w-4"
																	strokeWidth={1.5}
																/>
																{t('render.output.download')}
															</a>
														</Button>
													) : (
														<div className="text-xs text-muted-foreground rounded-lg border border-dashed border-border/50 bg-secondary/30 px-3 py-2">
															{t('render.output.emptyHint')}
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
										{t('videoInfo.title')}
									</CardTitle>
								</CardHeader>
								<CardContent className="pt-6 space-y-4">
									<div className="space-y-2">
										<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
											{t('videoInfo.sourceId')}
										</p>
										<div className="rounded-lg bg-white/50 p-3 text-sm font-mono shadow-sm border border-white/20 break-all">
											{getVideoSourceId()}
										</div>
									</div>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => {
											const dateLocale = locale === 'zh' ? 'zh-CN' : 'en-US'
											const collectedAt =
												mediaQuery.data?.comments &&
												mediaQuery.data.comments.length > 0 &&
												mediaQuery.data.commentsDownloadedAt
													? new Date(
															mediaQuery.data.commentsDownloadedAt,
														).toLocaleString(dateLocale, {
															year: 'numeric',
															month: '2-digit',
															day: '2-digit',
															hour: '2-digit',
															minute: '2-digit',
														})
													: null

											const disclaimerLines = [
												t('disclaimer.title'),
												'',
												t('disclaimer.body1'),
												t('disclaimer.body2'),
												'',
												t('disclaimer.sourceVideo', {
													sourceId: getVideoSourceId(),
												}),
												collectedAt
													? t('disclaimer.collectedAt', {
															datetime: collectedAt,
														})
													: null,
											].filter((x): x is string => Boolean(x))

											const disclaimerText = disclaimerLines.join('\n')

											if (!navigator.clipboard) {
												toast.error(t('toasts.clipboardUnavailable'))
												return
											}

											navigator.clipboard.writeText(disclaimerText)
											toast.success(t('toasts.disclaimerCopied'))
										}}
										className="w-full justify-start text-xs text-muted-foreground hover:text-foreground"
									>
										<Copy className="mr-2 h-3 w-3" strokeWidth={1.5} />
										{t('videoInfo.copyDisclaimer')}
									</Button>
								</CardContent>
							</Card>
						</div>
					)}

					{/* Right: Comments List */}
					<div className="lg:col-span-2 space-y-6">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div className="flex items-center gap-2">
								<MessageCircle
									className="h-5 w-5 text-primary"
									strokeWidth={1.5}
								/>
								<h2 className="text-lg font-semibold">
									{t('comments.title', { count: comments.length })}
								</h2>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								{hasSelection ? (
									<Badge
										variant="secondary"
										className="h-7 rounded-full px-3 text-xs"
									>
										{t('comments.selected', { count: selectedCount })}
									</Badge>
								) : null}
								<Button
									variant="outline"
									size="sm"
									onClick={toggleSelectAll}
									disabled={visibleComments.length === 0}
									className="h-8"
								>
									{allVisibleSelected
										? t('comments.clearSelection')
										: t('comments.selectAll')}
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
											{t('comments.deleting')}
										</>
									) : (
										<>
											<Trash2 className="h-4 w-4" />
											{t('comments.deleteSelected')}
										</>
									)}
								</Button>
							</div>
						</div>

						{mediaQuery.isLoading ? (
							<div className="space-y-3">
								{[1, 2, 3, 4].map((i) => (
									<div
										key={i}
										className="h-40 rounded-2xl bg-secondary/30 animate-pulse"
									/>
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
									<MessageCircle
										className="h-8 w-8 text-muted-foreground/50"
										strokeWidth={1.5}
									/>
								</div>
								<h3 className="mb-2 text-lg font-semibold text-foreground">
									{t('empty.title')}
								</h3>
								<p className="text-muted-foreground font-light max-w-sm mx-auto">
									{t('empty.description')}
								</p>
							</div>
						)}
					</div>
				</div>
			</div>
		</WorkspacePageShell>
	)
}
