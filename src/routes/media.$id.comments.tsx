import { extractVideoId } from '@app/media-providers'
import {
	DEFAULT_TEMPLATE_ID,
	listTemplates,
	type RemotionTemplateId,
} from '@remotion/templates'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	notFound,
	redirect,
} from '@tanstack/react-router'
import {
	CheckSquare,
	Copy,
	Download,
	Edit,
	Info,
	LanguagesIcon,
	Loader2,
	MessageCircle,
	Play,
	Square,
	Trash2,
} from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { CloudJobProgress } from '~/components/business/jobs/cloud-job-progress'
import { RemotionPreviewCardStart } from '~/components/business/media/remotion-preview-card-start'
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
import { Switch } from '~/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'

import { type ChatModelId, DEFAULT_CHAT_MODEL_ID } from '~/lib/ai/models'
import { useCloudJob } from '~/lib/hooks/useCloudJob'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { MEDIA_SOURCES } from '~/lib/media/source'
import { useLocale, useTranslations } from '../integrations/i18n'
import { queryOrpcNext } from '../integrations/orpc/next-client'

type SourcePolicy = 'auto' | 'original' | 'subtitles'

type Comment = {
	id: string
	author: string
	authorThumbnail?: string
	content: string
	translatedContent?: string
	likes: number
	replyCount?: number
}

type CloudStatus = {
	status?: string
	progress?: number
	phase?: string
	outputs?: unknown
}

const SearchSchema = z.object({
	tab: z.preprocess(
		(value) => (value === 'moderate' ? 'basics' : value),
		z
			.enum(['basics', 'download', 'translate', 'render'])
			.optional()
			.default('basics'),
	),
})

export const Route = createFileRoute('/media/$id/comments')({
	validateSearch: SearchSchema,
	loader: async ({ context, params, location }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpcNext.auth.me.queryOptions(),
		)
		if (!me.user) {
			const next = location.href
			throw redirect({ to: '/login', search: { next } })
		}

		const item = await context.queryClient.ensureQueryData(
			queryOrpcNext.media.byId.queryOptions({ input: { id: params.id } }),
		)
		if (!item) throw notFound()

		await Promise.all([
			context.queryClient.prefetchQuery(
				queryOrpcNext.proxy.getActiveProxiesForDownload.queryOptions(),
			),
			context.queryClient.prefetchQuery(
				queryOrpcNext.ai.listModels.queryOptions({
					input: { kind: 'llm', enabledOnly: true },
				}),
			),
			context.queryClient.prefetchQuery(
				queryOrpcNext.ai.getDefaultModel.queryOptions({
					input: { kind: 'llm' },
				}),
			),
		])
	},
	component: MediaCommentsRoute,
})

function readLocalStorage(key: string): string | null {
	if (typeof window === 'undefined') return null
	try {
		return window.localStorage.getItem(key)
	} catch {
		return null
	}
}

function writeLocalStorage(key: string, value: string | null) {
	if (typeof window === 'undefined') return
	try {
		if (value) window.localStorage.setItem(key, value)
		else window.localStorage.removeItem(key)
	} catch {
		// ignore
	}
}

function safeParseInt(input: string, fallback: number): number {
	const n = Number.parseInt(input, 10)
	if (!Number.isFinite(n)) return fallback
	return n
}

function resolveAvatarFallback(author?: string) {
	const value = author?.trim() ?? ''
	if (!value) return '?'
	const parts = value.split(/\s+/).filter(Boolean)
	if (parts.length === 0) return '?'
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
	return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

async function copyToClipboard(
	value: string,
): Promise<'ok' | 'unavailable' | 'failed'> {
	if (typeof navigator === 'undefined' || !navigator.clipboard) {
		return 'unavailable'
	}
	try {
		await navigator.clipboard.writeText(value)
		return 'ok'
	} catch {
		return 'failed'
	}
}

function MediaCommentsRoute() {
	const t = useTranslations('MediaComments.page')
	const locale = useLocale()
	const qc = useQueryClient()
	const navigate = Route.useNavigate()

	const { id } = Route.useParams()
	const { tab: rawTab } = Route.useSearch()
	const tab = rawTab === 'moderate' ? 'basics' : rawTab

	const mediaQuery = useQuery(
		queryOrpcNext.media.byId.queryOptions({ input: { id } }),
	)
	const proxiesQuery = useQuery(
		queryOrpcNext.proxy.getActiveProxiesForDownload.queryOptions(),
	)
	const llmModelsQuery = useQuery(
		queryOrpcNext.ai.listModels.queryOptions({
			input: { kind: 'llm', enabledOnly: true },
		}),
	)
	const llmDefaultQuery = useQuery(
		queryOrpcNext.ai.getDefaultModel.queryOptions({ input: { kind: 'llm' } }),
	)

	const comments: Comment[] =
		(mediaQuery.data?.comments as Comment[] | undefined) ?? []

	const [selectedCommentIds, setSelectedCommentIds] = React.useState<
		Set<string>
	>(() => new Set())

	React.useEffect(() => {
		setSelectedCommentIds((prev) => {
			const visibleIds = new Set(comments.map((c) => c.id))
			const next = new Set<string>()
			let changed = false
			for (const cid of prev) {
				if (visibleIds.has(cid)) next.add(cid)
				else changed = true
			}
			if (!changed && next.size === prev.size) return prev
			return next
		})
	}, [comments])

	const allVisibleSelected =
		comments.length > 0 && selectedCommentIds.size === comments.length

	const toggleSelectAll = () => {
		if (comments.length === 0) return
		setSelectedCommentIds(
			allVisibleSelected ? new Set() : new Set(comments.map((c) => c.id)),
		)
	}

	const handleSelectComment = (commentId: string, checked: boolean) => {
		setSelectedCommentIds((prev) => {
			const next = new Set(prev)
			if (checked) next.add(commentId)
			else next.delete(commentId)
			return next
		})
	}

	// ---------- Model selection ----------
	const [model, setModel] = React.useState<ChatModelId>(DEFAULT_CHAT_MODEL_ID)
	const [forceTranslate, setForceTranslate] = React.useState(false)

	React.useEffect(() => {
		const defaultId = llmDefaultQuery.data?.model?.id
		if (!defaultId) return
		setModel((cur) =>
			cur === DEFAULT_CHAT_MODEL_ID ? (defaultId as ChatModelId) : cur,
		)
	}, [llmDefaultQuery.data?.model?.id])

	const llmModelOptions = (llmModelsQuery.data?.items ?? []).map((m) => ({
		id: m.id as ChatModelId,
		label: m.label,
	}))

	// ---------- Template + titles ----------
	const [templateId, setTemplateId] =
		React.useState<RemotionTemplateId>(DEFAULT_TEMPLATE_ID)

	React.useEffect(() => {
		const tid =
			(mediaQuery.data?.commentsTemplate as RemotionTemplateId | undefined) ||
			DEFAULT_TEMPLATE_ID
		setTemplateId(tid)
	}, [mediaQuery.data?.commentsTemplate])

	const updateRenderSettingsMutation = useEnhancedMutation(
		queryOrpcNext.media.updateRenderSettings.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpcNext.media.byId.queryKey({ input: { id } }),
				})
			},
		}),
		{
			successToast: t('toasts.templateSaved'),
			errorToast: ({ error }) =>
				t('errors.templateSaveFailed', {
					message: error instanceof Error ? error.message : String(error),
				}),
		},
	)

	const [editDialogOpen, setEditDialogOpen] = React.useState(false)
	const [editTitle, setEditTitle] = React.useState('')
	const [editTranslatedTitle, setEditTranslatedTitle] = React.useState('')

	const updateTitlesMutation = useEnhancedMutation(
		queryOrpcNext.media.updateTitles.mutationOptions({
			onSuccess: async () => {
				setEditDialogOpen(false)
				await qc.invalidateQueries({
					queryKey: queryOrpcNext.media.byId.queryKey({ input: { id } }),
				})
			},
		}),
		{
			successToast: t('toasts.titlesUpdated'),
			errorToast: ({ error }) =>
				t('errors.titlesUpdateFailed', {
					message: error instanceof Error ? error.message : String(error),
				}),
		},
	)

	const handleEditClick = () => {
		setEditTitle(String(mediaQuery.data?.title ?? ''))
		setEditTranslatedTitle(String(mediaQuery.data?.translatedTitle ?? ''))
		setEditDialogOpen(true)
	}

	const handleSaveTitles = () => {
		updateTitlesMutation.mutate({
			id,
			title: editTitle,
			translatedTitle: editTranslatedTitle,
		})
	}

	const copyTitleValue = async (
		value: string | null | undefined,
		label: string,
	) => {
		if (!value) {
			toast.error(t('toasts.valueMissing', { label }))
			return
		}
		const res = await copyToClipboard(value)
		if (res === 'ok') {
			toast.success(t('toasts.copiedToClipboard', { label }))
			return
		}
		if (res === 'unavailable') {
			toast.error(t('toasts.clipboardUnavailable'))
			return
		}
		toast.error(t('toasts.copyFailed', { label }))
	}

	const getVideoSourceId = () => {
		const url = (mediaQuery.data as any)?.url as string | undefined
		const source = (mediaQuery.data as any)?.source as string | undefined
		if (!url) return id
		if (source === MEDIA_SOURCES.YOUTUBE) return extractVideoId(url) || id
		return url
	}

	// ---------- Proxy selection ----------
	const availableProxies =
		proxiesQuery.data?.proxies?.filter((p) => p.id !== 'none') ?? []
	const hasAvailableProxies = availableProxies.length > 0

	const [downloadProxyId, setDownloadProxyId] = React.useState<string>('none')
	const [renderProxyId, setRenderProxyId] = React.useState<string>('none')

	React.useEffect(() => {
		const saved = readLocalStorage(`commentsRenderProxy:${id}`)
		if (saved) setRenderProxyId(saved)
	}, [id])

	React.useEffect(() => {
		writeLocalStorage(
			`commentsRenderProxy:${id}`,
			renderProxyId && renderProxyId !== 'none' ? renderProxyId : null,
		)
	}, [id, renderProxyId])

	const hasDownloadProxySelected =
		Boolean(downloadProxyId) && downloadProxyId !== 'none'
	const hasRenderProxySelected =
		Boolean(renderProxyId) && renderProxyId !== 'none'

	const canQueueCommentsDownload =
		hasAvailableProxies && hasDownloadProxySelected
	const canQueueRender = hasAvailableProxies && hasRenderProxySelected

	// ---------- Cloud comments download ----------
	const [pages, setPages] = React.useState('3')

	const {
		jobId: commentsCloudJobId,
		setJobId: setCommentsCloudJobId,
		statusQuery: cloudCommentsStatusQuery,
	} = useCloudJob<CloudStatus, Error>({
		storageKey: `commentsDownloadCloudJob:${id}`,
		enabled: true,
		autoClearOnComplete: false,
		completeStatuses: ['completed', 'failed', 'canceled'],
		createQueryOptions: (jobId) =>
			queryOrpcNext.comment.getCloudCommentsStatus.queryOptions({
				input: { jobId },
				enabled: !!jobId,
				refetchInterval: (q: { state: { data?: CloudStatus } }) => {
					const s = q.state.data?.status
					if (s === 'completed' || s === 'failed' || s === 'canceled')
						return false
					return 2000
				},
			}),
	})

	const startCloudCommentsMutation = useEnhancedMutation(
		queryOrpcNext.comment.startCloudCommentsDownload.mutationOptions({
			onSuccess: (data) => setCommentsCloudJobId(data.jobId),
		}),
		{
			successToast: t('toasts.cloudCommentsQueued'),
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : 'Error',
		},
	)

	const finalizeCloudCommentsMutation = useEnhancedMutation(
		queryOrpcNext.comment.finalizeCloudCommentsDownload.mutationOptions({
			onSuccess: async () => {
				setCommentsCloudJobId(null)
				await qc.invalidateQueries({
					queryKey: queryOrpcNext.media.byId.queryKey({ input: { id } }),
				})
			},
		}),
		{
			successToast: t('toasts.commentsDownloaded'),
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : 'Error',
		},
	)

	const finalizeAttemptedJobIdsRef = React.useRef<Set<string>>(new Set())
	React.useEffect(() => {
		const jobId = commentsCloudJobId
		const status = cloudCommentsStatusQuery.data?.status
		if (!jobId) return
		if (status !== 'completed') return
		if (finalizeCloudCommentsMutation.isPending) return
		if (finalizeAttemptedJobIdsRef.current.has(jobId)) return
		finalizeAttemptedJobIdsRef.current.add(jobId)
		finalizeCloudCommentsMutation.mutate({ mediaId: id, jobId })
	}, [
		cloudCommentsStatusQuery.data?.status,
		commentsCloudJobId,
		finalizeCloudCommentsMutation,
		id,
	])

	// ---------- Translation ----------
	const translateCommentsMutation = useEnhancedMutation(
		queryOrpcNext.comment.translateComments.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpcNext.media.byId.queryKey({ input: { id } }),
				})
			},
		}),
		{
			successToast: t('toasts.commentsTranslated'),
			errorToast: ({ error }) =>
				t('errors.translateFailed', {
					message: error instanceof Error ? error.message : String(error),
				}),
		},
	)

	// ---------- Delete ----------
	const deleteCommentsMutation = useEnhancedMutation(
		queryOrpcNext.comment.deleteComments.mutationOptions({
			onSuccess: async (data, variables) => {
				setSelectedCommentIds(new Set())
				await qc.invalidateQueries({
					queryKey: queryOrpcNext.media.byId.queryKey({ input: { id } }),
				})
				toast.success(
					t('toasts.commentsDeleted', { count: variables.commentIds.length }),
				)
			},
		}),
		{
			errorToast: ({ error }) =>
				t('errors.deleteFailed', {
					message: error instanceof Error ? error.message : String(error),
				}),
		},
	)

	const deleteOneMutation = useEnhancedMutation(
		queryOrpcNext.comment.deleteComment.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpcNext.media.byId.queryKey({ input: { id } }),
				})
				toast.success(t('toasts.commentsDeleted', { count: 1 }))
			},
		}),
		{
			errorToast: ({ error }) =>
				t('errors.deleteFailed', {
					message: error instanceof Error ? error.message : String(error),
				}),
		},
	)

	const selectedCount = selectedCommentIds.size
	const hasSelection = selectedCount > 0

	const handleBulkDelete = async () => {
		if (!hasSelection) return
		setConfirmDeleteIds(Array.from(selectedCommentIds))
		setConfirmDeleteOpen(true)
	}

	// ---------- Cloud render ----------
	const [sourcePolicy, setSourcePolicy] = React.useState<SourcePolicy>('auto')
	React.useEffect(() => {
		const saved = readLocalStorage(
			`commentsRenderSourcePolicy:${id}`,
		) as SourcePolicy | null
		if (saved === 'auto' || saved === 'original' || saved === 'subtitles') {
			setSourcePolicy(saved)
		}
	}, [id])
	React.useEffect(() => {
		writeLocalStorage(`commentsRenderSourcePolicy:${id}`, sourcePolicy)
	}, [id, sourcePolicy])

	const {
		jobId: renderJobId,
		setJobId: setRenderJobId,
		statusQuery: renderStatusQuery,
	} = useCloudJob<CloudStatus, Error>({
		storageKey: `commentsCloudJob:${id}`,
		enabled: true,
		completeStatuses: ['completed'],
		onCompleted: async () => {
			await qc.invalidateQueries({
				queryKey: queryOrpcNext.media.byId.queryKey({ input: { id } }),
			})
		},
		createQueryOptions: (jobId) =>
			queryOrpcNext.comment.getRenderStatus.queryOptions({
				input: { jobId },
				enabled: !!jobId,
				refetchInterval: (q: { state: { data?: CloudStatus } }) => {
					const s = q.state.data?.status
					if (s === 'completed' || s === 'failed' || s === 'canceled')
						return false
					return 2000
				},
			}),
	})

	const startCloudRenderMutation = useEnhancedMutation(
		queryOrpcNext.comment.startCloudRender.mutationOptions({
			onSuccess: (data) => setRenderJobId(data.jobId),
		}),
		{
			successToast: t('toasts.cloudRenderQueued'),
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : 'Error',
		},
	)

	const hasRenderedCommentsVideo = Boolean(mediaQuery.data?.videoWithInfoPath)
	const renderedDownloadUrl = `/api/media/${encodeURIComponent(id)}/rendered-info?download=1`

	const previewVideoInfo = mediaQuery.data
		? {
				title: mediaQuery.data.title ?? undefined,
				translatedTitle: mediaQuery.data.translatedTitle ?? undefined,
				viewCount: mediaQuery.data.viewCount ?? undefined,
				author: mediaQuery.data.author ?? undefined,
				thumbnail: mediaQuery.data.thumbnail ?? undefined,
			}
		: null

	const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false)
	const [confirmDeleteIds, setConfirmDeleteIds] = React.useState<string[]>([])

	const isBusy =
		mediaQuery.isLoading ||
		startCloudCommentsMutation.isPending ||
		finalizeCloudCommentsMutation.isPending ||
		translateCommentsMutation.isPending ||
		deleteCommentsMutation.isPending ||
		startCloudRenderMutation.isPending

	return (
		<div className="min-h-screen bg-background selection:bg-primary/10 selection:text-primary">
			<div className="px-4 py-10 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-6xl space-y-6">
					<Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>{t('editDialog.title')}</DialogTitle>
								<DialogDescription>
									{t('editDialog.description')}
								</DialogDescription>
							</DialogHeader>
							<div className="space-y-4 py-2">
								<div className="space-y-2">
									<Label htmlFor="title">
										{t('editDialog.fields.originalLabel')}
									</Label>
									<Input
										id="title"
										value={editTitle}
										onChange={(e) => setEditTitle(e.target.value)}
										placeholder={t('editDialog.fields.originalPlaceholder')}
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
									/>
								</div>
							</div>
							<DialogFooter>
								<Button
									variant="ghost"
									onClick={() => setEditDialogOpen(false)}
								>
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

					<Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>{t('bulkDelete.confirm.title')}</DialogTitle>
								<DialogDescription>
									{t('bulkDelete.confirm.description', {
										count: confirmDeleteIds.length,
									})}
								</DialogDescription>
							</DialogHeader>
							<DialogFooter>
								<Button
									variant="ghost"
									onClick={() => setConfirmDeleteOpen(false)}
									disabled={deleteCommentsMutation.isPending}
								>
									{t('editDialog.actions.cancel')}
								</Button>
								<Button
									variant="destructive"
									onClick={() => {
										const ids = confirmDeleteIds
										setConfirmDeleteOpen(false)
										if (ids.length === 0) return
										deleteCommentsMutation.mutate({
											mediaId: id,
											commentIds: ids,
										})
									}}
									disabled={
										deleteCommentsMutation.isPending ||
										confirmDeleteIds.length === 0
									}
								>
									{deleteCommentsMutation.isPending
										? t('comments.deleting')
										: t('comments.deleteSelected')}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>

					<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
						<div className="space-y-1">
							<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
								<span className="rounded-md bg-secondary px-2 py-1 text-foreground/80">
									{id}
								</span>
								{commentsCloudJobId ? (
									<CloudJobProgress
										status={cloudCommentsStatusQuery.data?.status}
										progress={cloudCommentsStatusQuery.data?.progress}
										jobId={commentsCloudJobId}
										mediaId={id}
									/>
								) : null}
								{renderJobId ? (
									<CloudJobProgress
										status={renderStatusQuery.data?.status}
										progress={renderStatusQuery.data?.progress}
										jobId={renderJobId}
										mediaId={id}
									/>
								) : null}
							</div>
							<h1 className="text-3xl font-semibold tracking-tight">
								{t('header.title')}
							</h1>
							<div className="text-sm text-muted-foreground">
								{mediaQuery.data?.translatedTitle || mediaQuery.data?.title
									? `${mediaQuery.data?.translatedTitle || mediaQuery.data?.title}`
									: null}
							</div>
						</div>

						<div className="flex flex-wrap gap-2">
							{mediaQuery.data?.translatedTitle ? (
								<Button
									variant="secondary"
									onClick={handleEditClick}
									disabled={mediaQuery.isLoading}
								>
									<Edit className="mr-2 h-4 w-4" />
									{t('header.editTitles')}
								</Button>
							) : null}
							<Button variant="secondary" asChild>
								<Link to="/media/$id" params={{ id }}>
									{t('header.back')}
								</Link>
							</Button>
							<Button variant="secondary" asChild>
								<Link to="/media">Media</Link>
							</Button>
							<Button
								variant="secondary"
								disabled={mediaQuery.isLoading}
								onClick={() => mediaQuery.refetch()}
							>
								Refresh
							</Button>
						</div>
					</div>

					{mediaQuery.isLoading ? (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							Loading…
						</div>
					) : null}

					{mediaQuery.isError || !mediaQuery.data ? (
						<div className="glass rounded-2xl p-6 text-sm text-muted-foreground">
							Failed to load media.
						</div>
					) : (
						<div className="space-y-4">
							<div className="glass rounded-2xl p-6">
								<RemotionPreviewCardStart
									videoInfo={previewVideoInfo}
									comments={comments as any}
									isLoading={mediaQuery.isLoading}
									templateId={templateId}
								/>
							</div>

							<Tabs
								value={tab}
								onValueChange={(next) =>
									navigate({
										search: (prev) => ({ ...prev, tab: next as any }),
										replace: true,
									})
								}
								className="space-y-4"
							>
								<TabsList>
									<TabsTrigger value="basics">{t('tabs.basics')}</TabsTrigger>
									<TabsTrigger value="download">
										{t('tabs.download')}
									</TabsTrigger>
									<TabsTrigger value="translate">
										{t('tabs.translate')}
									</TabsTrigger>
									<TabsTrigger value="render">{t('tabs.render')}</TabsTrigger>
								</TabsList>

								<TabsContent value="basics" className="space-y-4">
									<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
										<Card className="glass border-none shadow-sm">
											<CardHeader className="border-b border-border/40 pb-4">
												<CardTitle className="text-lg flex items-center gap-2">
													<Info className="h-5 w-5 text-primary" />
													{t('basics.translatedTitle.label')}
												</CardTitle>
											</CardHeader>
											<CardContent className="pt-6 space-y-4">
												<div className="space-y-2">
													<div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
														{t('basics.translatedTitle.label')}
													</div>
													<div className="rounded-lg bg-white/50 p-3 text-sm font-medium shadow-sm border border-white/20">
														{mediaQuery.data?.translatedTitle ??
															t('basics.translatedTitle.empty')}
													</div>
													<Button
														variant="ghost"
														size="sm"
														className="h-8 w-full justify-start text-xs text-muted-foreground hover:text-foreground"
														disabled={!mediaQuery.data?.translatedTitle}
														onClick={() =>
															void copyTitleValue(
																mediaQuery.data?.translatedTitle,
																t('labels.englishTitle'),
															)
														}
													>
														<Copy className="mr-2 h-3 w-3" />
														{t('basics.translatedTitle.copy')}
													</Button>
												</div>

												<div className="space-y-2 pt-2 border-t border-border/40">
													<div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
														{t('basics.originalTitle.label')}
													</div>
													<div className="rounded-lg bg-white/50 p-3 text-sm text-muted-foreground shadow-sm border border-white/20">
														{mediaQuery.data?.title ??
															t('basics.originalTitle.empty')}
													</div>
													<Button
														variant="ghost"
														size="sm"
														className="h-8 w-full justify-start text-xs text-muted-foreground hover:text-foreground"
														disabled={!mediaQuery.data?.title}
														onClick={() =>
															void copyTitleValue(
																mediaQuery.data?.title,
																t('labels.originalTitle'),
															)
														}
													>
														<Copy className="mr-2 h-3 w-3" />
														{t('basics.originalTitle.copy')}
													</Button>
												</div>
											</CardContent>
										</Card>

										<Card className="glass border-none shadow-sm">
											<CardHeader className="border-b border-border/40 pb-4">
												<CardTitle className="text-lg flex items-center gap-2">
													<MessageCircle className="h-5 w-5 text-primary" />
													{t('videoInfo.title')}
												</CardTitle>
											</CardHeader>
											<CardContent className="pt-6 space-y-4">
												<div className="space-y-2">
													<div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
														{t('videoInfo.sourceId')}
													</div>
													<div className="rounded-lg bg-white/50 p-3 text-sm font-mono shadow-sm border border-white/20 break-all">
														{getVideoSourceId()}
													</div>
												</div>

												<Button
													variant="ghost"
													size="sm"
													onClick={() => {
														const dateLocale =
															locale === 'zh' ? 'zh-CN' : 'en-US'
														const collectedAt =
															mediaQuery.data?.comments &&
															(mediaQuery.data?.comments as any[])?.length >
																0 &&
															(mediaQuery.data as any)?.commentsDownloadedAt
																? new Date(
																		(mediaQuery.data as any)
																			.commentsDownloadedAt,
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

														const text = disclaimerLines.join('\n')
														void (async () => {
															const res = await copyToClipboard(text)
															if (res === 'ok') {
																toast.success(t('toasts.disclaimerCopied'))
																return
															}
															if (res === 'unavailable') {
																toast.error(t('toasts.clipboardUnavailable'))
																return
															}
															toast.error(
																t('toasts.copyFailed', {
																	label: t('videoInfo.copyDisclaimer'),
																}),
															)
														})()
													}}
													className="w-full justify-start text-xs text-muted-foreground hover:text-foreground"
												>
													<Copy className="mr-2 h-3 w-3" />
													{t('videoInfo.copyDisclaimer')}
												</Button>
											</CardContent>
										</Card>
									</div>

									<div className="glass rounded-2xl p-5">
										<div className="flex flex-wrap items-center justify-between gap-3">
											<div className="text-sm font-semibold">
												{t('workflow.title')}
											</div>
											<div className="flex flex-wrap gap-2">
												<Button
													variant="secondary"
													size="sm"
													onClick={toggleSelectAll}
													disabled={comments.length === 0}
												>
													{allVisibleSelected ? (
														<CheckSquare className="mr-2 h-4 w-4" />
													) : (
														<Square className="mr-2 h-4 w-4" />
													)}
													{allVisibleSelected
														? t('comments.clearSelection')
														: t('comments.selectAll')}
												</Button>
												<Button
													variant="destructive"
													size="sm"
													onClick={handleBulkDelete}
													disabled={
														!hasSelection || deleteCommentsMutation.isPending
													}
												>
													<Trash2 className="mr-2 h-4 w-4" />
													{deleteCommentsMutation.isPending
														? t('comments.deleting')
														: t('comments.deleteSelected')}
												</Button>
											</div>
										</div>
										<div className="mt-2 text-xs text-muted-foreground">
											{t('comments.title', { count: comments.length })}
											{hasSelection
												? ` · ${t('comments.selected', { count: selectedCount })}`
												: null}
										</div>
									</div>

									<CommentsList
										comments={comments}
										selectedIds={selectedCommentIds}
										onSelectChange={handleSelectComment}
										onDelete={(commentId) =>
											deleteOneMutation.mutate({ mediaId: id, commentId })
										}
										deleting={deleteOneMutation.isPending || isBusy}
										emptyTitle={t('empty.title')}
										emptyDescription={t('empty.description')}
									/>
								</TabsContent>

								<TabsContent value="download" className="space-y-4">
									<div className="glass rounded-2xl p-5 space-y-4">
										<div className="text-sm font-semibold">
											{t('tabs.download')}
										</div>
										<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
											<div className="space-y-2">
												<Label htmlFor="pages">
													{t('download.pagesLabel')}
												</Label>
												<Input
													id="pages"
													value={pages}
													onChange={(e) => setPages(e.target.value)}
													inputMode="numeric"
												/>
											</div>
											<div className="sm:col-span-2">
												<ProxySelect
													label={t('fields.proxy')}
													proxies={proxiesQuery.data?.proxies ?? []}
													defaultProxyId={
														proxiesQuery.data?.defaultProxyId ?? null
													}
													value={downloadProxyId}
													onValueChange={setDownloadProxyId}
													disabled={isBusy}
													help={
														!hasAvailableProxies
															? t('errors.noProxiesAvailable')
															: undefined
													}
												/>
											</div>
										</div>

										<div className="flex flex-wrap items-center gap-2">
											<Button
												onClick={() => {
													const n = Math.max(
														1,
														Math.min(50, safeParseInt(pages, 3)),
													)
													setPages(String(n))
													if (!canQueueCommentsDownload) {
														toast.error(t('errors.selectProxyFirst'))
														return
													}
													startCloudCommentsMutation.mutate({
														mediaId: id,
														pages: n,
														proxyId: downloadProxyId,
													})
												}}
												disabled={
													startCloudCommentsMutation.isPending ||
													!canQueueCommentsDownload ||
													isBusy
												}
											>
												{startCloudCommentsMutation.isPending ? (
													<>
														<Loader2 className="mr-2 h-4 w-4 animate-spin" />
														{t('download.queuing')}
													</>
												) : (
													<>
														<Download className="mr-2 h-4 w-4" />
														{t('download.start')}
													</>
												)}
											</Button>

											{commentsCloudJobId ? (
												<Button
													variant="secondary"
													onClick={() => setCommentsCloudJobId(null)}
													disabled={finalizeCloudCommentsMutation.isPending}
												>
													Clear job
												</Button>
											) : null}
										</div>

										{commentsCloudJobId ? (
											<div className="text-xs text-muted-foreground">
												Job:{' '}
												<span className="font-mono">{commentsCloudJobId}</span>
											</div>
										) : null}
									</div>
								</TabsContent>

								<TabsContent value="translate" className="space-y-4">
									<div className="glass rounded-2xl p-5 space-y-4">
										<div className="text-sm font-semibold">
											{t('tabs.translate')}
										</div>
										<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
											<ModelSelect
												label={t('fields.aiModel')}
												value={model}
												onValueChange={(v) => setModel(v as ChatModelId)}
												options={llmModelOptions}
												disabled={isBusy}
											/>
											<div className="space-y-2">
												<div className="flex items-center justify-between gap-3">
													<Label>{t('fields.overwriteExisting')}</Label>
													<Switch
														checked={forceTranslate}
														onCheckedChange={setForceTranslate}
														disabled={isBusy}
													/>
												</div>
											</div>
										</div>
										<Button
											onClick={() => {
												if (comments.length === 0) {
													toast.error(t('empty.description'))
													return
												}
												translateCommentsMutation.mutate({
													mediaId: id,
													model,
													force: forceTranslate,
												})
											}}
											disabled={translateCommentsMutation.isPending || isBusy}
										>
											{translateCommentsMutation.isPending ? (
												<>
													<Loader2 className="mr-2 h-4 w-4 animate-spin" />
													{t('translate.translating')}
												</>
											) : (
												<>
													<LanguagesIcon className="mr-2 h-4 w-4" />
													{t('translate.translate')}
												</>
											)}
										</Button>
									</div>
								</TabsContent>

								<TabsContent value="render" className="space-y-4">
									<div className="glass rounded-2xl p-5 space-y-4">
										<div className="text-sm font-semibold">
											{t('tabs.render')}
										</div>

										<div className="space-y-2">
											<Label>{t('render.template')}</Label>
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
												disabled={isBusy}
											>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{listTemplates().map((tpl) => (
														<SelectItem key={tpl.id} value={tpl.id}>
															{tpl.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>

										<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
											<div className="space-y-2">
												<Label>{t('render.sourcePolicy.label')}</Label>
												<Select
													value={sourcePolicy}
													onValueChange={(v) =>
														setSourcePolicy(v as SourcePolicy)
													}
													disabled={isBusy}
												>
													<SelectTrigger>
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

											<ProxySelect
												label={t('fields.proxy')}
												proxies={proxiesQuery.data?.proxies ?? []}
												defaultProxyId={
													proxiesQuery.data?.defaultProxyId ?? null
												}
												value={renderProxyId}
												onValueChange={setRenderProxyId}
												disabled={isBusy}
												help={
													!hasAvailableProxies
														? t('errors.noProxiesAvailable')
														: undefined
												}
											/>
										</div>

										<div className="flex flex-wrap items-center gap-2">
											<Button
												onClick={() => {
													if (!canQueueRender) {
														toast.error(t('errors.selectProxyFirst'))
														return
													}
													startCloudRenderMutation.mutate({
														mediaId: id,
														proxyId: renderProxyId,
														sourcePolicy,
														templateId,
													})
												}}
												disabled={
													startCloudRenderMutation.isPending ||
													!canQueueRender ||
													isBusy
												}
											>
												{startCloudRenderMutation.isPending ? (
													<>
														<Loader2 className="mr-2 h-4 w-4 animate-spin" />
														{t('render.queuing')}
													</>
												) : (
													<>
														<Play className="mr-2 h-4 w-4" />
														{t('render.start')}
													</>
												)}
											</Button>

											{hasRenderedCommentsVideo ? (
												<Button variant="secondary" asChild>
													<a href={renderedDownloadUrl}>
														{t('render.output.download')}
													</a>
												</Button>
											) : null}

											{renderJobId ? (
												<Button
													variant="secondary"
													onClick={() => setRenderJobId(null)}
													disabled={isBusy}
												>
													Clear job
												</Button>
											) : null}
										</div>
									</div>
								</TabsContent>
							</Tabs>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}

function ModelSelect({
	label,
	value,
	onValueChange,
	options,
	disabled,
}: {
	label: string
	value: string
	onValueChange: (value: string) => void
	options: Array<{ id: string; label: string }>
	disabled?: boolean
}) {
	return (
		<div className="space-y-2">
			<Label>{label}</Label>
			<Select value={value} onValueChange={onValueChange} disabled={disabled}>
				<SelectTrigger>
					<SelectValue placeholder="Select a model" />
				</SelectTrigger>
				<SelectContent>
					{options.map((m) => (
						<SelectItem key={m.id} value={m.id}>
							{m.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	)
}

function ProxySelect({
	label,
	proxies,
	defaultProxyId,
	value,
	onValueChange,
	disabled,
	help,
}: {
	label: string
	proxies: Array<{
		id: string
		name?: string | null
		server?: string | null
		port?: number | null
		protocol?: string | null
	}>
	defaultProxyId: string | null
	value: string
	onValueChange: (value: string) => void
	disabled?: boolean
	help?: string
}) {
	const options = proxies
	return (
		<div className="space-y-2">
			<Label>{label}</Label>
			<Select value={value} onValueChange={onValueChange} disabled={disabled}>
				<SelectTrigger>
					<SelectValue placeholder="Select a proxy" />
				</SelectTrigger>
				<SelectContent>
					{options.map((proxy) => {
						const isDefault = Boolean(
							defaultProxyId && proxy.id === defaultProxyId,
						)
						const display =
							proxy.name ||
							(proxy.id === 'none'
								? 'No Proxy'
								: `${proxy.protocol ?? 'http'}://${proxy.server ?? ''}:${proxy.port ?? ''}`)
						return (
							<SelectItem key={proxy.id} value={proxy.id}>
								<span className="inline-flex items-center gap-2">
									<span className="truncate">{display}</span>
									{isDefault ? (
										<span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
											Default
										</span>
									) : null}
								</span>
							</SelectItem>
						)
					})}
				</SelectContent>
			</Select>
			{help ? (
				<div className="text-xs text-muted-foreground">{help}</div>
			) : null}
		</div>
	)
}

function CommentsList({
	comments,
	selectedIds,
	onSelectChange,
	onDelete,
	deleting,
	emptyTitle,
	emptyDescription,
}: {
	comments: Comment[]
	selectedIds: Set<string>
	onSelectChange: (commentId: string, checked: boolean) => void
	onDelete: (commentId: string) => void
	deleting?: boolean
	emptyTitle: string
	emptyDescription: string
}) {
	if (comments.length === 0) {
		return (
			<div className="glass rounded-2xl p-8 text-center">
				<div className="text-sm font-medium text-foreground">{emptyTitle}</div>
				<div className="mt-1 text-sm text-muted-foreground">
					{emptyDescription}
				</div>
			</div>
		)
	}

	return (
		<div className="space-y-3">
			{comments.map((comment) => (
				<CommentRow
					key={comment.id}
					comment={comment}
					selected={selectedIds.has(comment.id)}
					onSelectChange={(checked) => onSelectChange(comment.id, checked)}
					onDelete={() => onDelete(comment.id)}
					deleting={deleting}
				/>
			))}
		</div>
	)
}

function CommentRow({
	comment,
	selected,
	onSelectChange,
	onDelete,
	deleting,
}: {
	comment: Comment
	selected: boolean
	onSelectChange: (checked: boolean) => void
	onDelete: () => void
	deleting?: boolean
}) {
	const [avatarError, setAvatarError] = React.useState(false)
	const showFallback = avatarError || !comment.authorThumbnail
	const initials = resolveAvatarFallback(comment.author)

	const selectionClass = selected ? 'bg-primary/5 ring-1 ring-primary/20' : ''

	return (
		<div
			className={`group glass flex items-start gap-3 rounded-2xl px-4 py-3 transition-all duration-200 hover:bg-muted/40 ${selectionClass}`}
		>
			<Button
				variant="ghost"
				size="sm"
				aria-label={selected ? 'Deselect comment' : 'Select comment'}
				aria-pressed={selected}
				onClick={() => onSelectChange(!selected)}
				className="mt-1 h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
			>
				{selected ? (
					<CheckSquare className="h-4 w-4" />
				) : (
					<Square className="h-4 w-4" />
				)}
			</Button>

			<div className="flex-shrink-0">
				{showFallback ? (
					<div className="h-8 w-8 rounded-full border border-background bg-muted text-xs font-semibold uppercase text-muted-foreground shadow-sm flex items-center justify-center">
						{initials}
					</div>
				) : (
					<img
						src={comment.authorThumbnail}
						alt={comment.author}
						width={32}
						height={32}
						className="h-8 w-8 rounded-full border border-background shadow-sm object-cover"
						loading="lazy"
						onError={() => setAvatarError(true)}
					/>
				)}
			</div>

			<div className="min-w-0 flex-1 space-y-2">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 flex-1 space-y-1">
						<div className="flex items-center gap-2">
							<p className="truncate text-xs font-semibold">{comment.author}</p>
							<div className="flex flex-shrink-0 items-center gap-2 text-xs text-muted-foreground">
								<span>Likes: {comment.likes ?? 0}</span>
								{(comment.replyCount ?? 0) > 0 ? (
									<span>Replies: {comment.replyCount ?? 0}</span>
								) : null}
							</div>
						</div>
					</div>

					<Button
						variant="ghost"
						size="sm"
						onClick={onDelete}
						disabled={deleting}
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
	)
}
