import { extractVideoId } from '@app/media-providers'
import {
	DEFAULT_TEMPLATE_ID,
	listTemplates,
	type RemotionTemplateId,
} from '@app/remotion-project/templates'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
	CheckSquare,
	Copy,
	Download,
	Edit,
	ExternalLink,
	LanguagesIcon,
	Loader2,
	Play,
	Square,
	Trash2,
} from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { CloudJobProgress } from '~/components/business/jobs/cloud-job-progress'
import { RemotionPreviewCardStart } from '~/components/business/media/remotion-preview-card-start'
import { Button } from '~/components/ui/button'
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
import { getUserFriendlyErrorMessage } from '~/lib/errors/client'
import { useCloudJob } from '~/lib/hooks/useCloudJob'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { MEDIA_SOURCES } from '~/lib/media/source'
import { formatHostPort } from '~/lib/proxy/host'
import { useLocale, useTranslations } from '~/lib/i18n'
import { queryOrpc } from '~/lib/orpc/client'

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

export type MediaCommentsTab = 'basics' | 'download' | 'translate' | 'render'

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

export function MediaCommentsPage({
	id,
	tab,
	onTabChange,
}: {
	id: string
	tab: MediaCommentsTab
	onTabChange: (tab: MediaCommentsTab) => void
}) {
	const t = useTranslations('MediaComments.page')
	const tCommon = useTranslations('Common')
	const locale = useLocale()
	const qc = useQueryClient()

	const mediaQuery = useQuery(
		queryOrpc.media.byId.queryOptions({ input: { id } }),
	)
	const proxiesQuery = useQuery(
		queryOrpc.proxy.getActiveProxiesForDownload.queryOptions(),
	)
	const llmModelsQuery = useQuery(
		queryOrpc.ai.listModels.queryOptions({
			input: { kind: 'llm', enabledOnly: true },
		}),
	)
	const llmDefaultQuery = useQuery(
		queryOrpc.ai.getDefaultModel.queryOptions({ input: { kind: 'llm' } }),
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
		queryOrpc.media.updateRenderSettings.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
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
		queryOrpc.media.updateTitles.mutationOptions({
			onSuccess: async () => {
				setEditDialogOpen(false)
				await qc.invalidateQueries({
					queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
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

	const handleCopyDisclaimer = () => {
		const dateLocale = locale === 'zh' ? 'zh-CN' : 'en-US'
		const collectedAt =
			mediaQuery.data?.comments &&
			(mediaQuery.data?.comments as any[])?.length > 0 &&
			(mediaQuery.data as any)?.commentsDownloadedAt
				? new Date(
						(mediaQuery.data as any).commentsDownloadedAt,
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
			t('disclaimer.sourceVideo', { sourceId: getVideoSourceId() }),
			collectedAt
				? t('disclaimer.collectedAt', { datetime: collectedAt })
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
	}

	const getVideoSourceId = () => {
		const url = (mediaQuery.data as any)?.url as string | undefined
		const source = (mediaQuery.data as any)?.source as string | undefined
		if (!url) return id
		if (source === MEDIA_SOURCES.YOUTUBE) return extractVideoId(url) || id
		return url
	}

	const getVideoSourceUrl = () => {
		return (mediaQuery.data as any)?.url as string | undefined
	}

	const getVideoSourceDisplay = () => {
		const url = getVideoSourceUrl()
		if (!url) return '—'
		try {
			return new URL(url).hostname.replace(/^www\./, '')
		} catch {
			return url
		}
	}

	// ---------- Proxy selection ----------
	const successProxies =
		proxiesQuery.data?.proxies?.filter(
			(p) => p.id !== 'none' && p.testStatus === 'success',
		) ?? []
	const hasSuccessProxies = successProxies.length > 0
	const successProxyIds = React.useMemo(
		() => new Set(successProxies.map((p) => p.id)),
		[successProxies],
	)

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

	React.useEffect(() => {
		setDownloadProxyId((cur) => {
			if (!cur || cur === 'none') return 'none'
			return successProxyIds.has(cur) ? cur : 'none'
		})
		setRenderProxyId((cur) => {
			if (!cur || cur === 'none') return 'none'
			return successProxyIds.has(cur) ? cur : 'none'
		})
	}, [successProxyIds])

	const canQueueCommentsDownload = hasSuccessProxies
	const canQueueRender = hasSuccessProxies

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
			queryOrpc.comment.getCloudCommentsStatus.queryOptions({
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
		queryOrpc.comment.startCloudCommentsDownload.mutationOptions({
			onSuccess: (data) => setCommentsCloudJobId(data.jobId),
		}),
		{
			successToast: t('toasts.cloudCommentsQueued'),
			errorToast: ({ error }) => getUserFriendlyErrorMessage(error),
		},
	)

	React.useEffect(() => {
		const jobId = commentsCloudJobId
		const status = cloudCommentsStatusQuery.data?.status
		if (!jobId) return
		if (status !== 'completed') return

		// Comments are now persisted by the orchestrator callback; just refresh UI state and clear the stored job.
		setCommentsCloudJobId(null)
		qc.invalidateQueries({
			queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
		})
	}, [
		cloudCommentsStatusQuery.data?.status,
		commentsCloudJobId,
		id,
		qc,
		setCommentsCloudJobId,
	])

	// ---------- Translation ----------
	const translateCommentsMutation = useEnhancedMutation(
		queryOrpc.comment.translateComments.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
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
		queryOrpc.comment.deleteComments.mutationOptions({
			onSuccess: async (data, variables) => {
				setSelectedCommentIds(new Set())
				await qc.invalidateQueries({
					queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
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
		queryOrpc.comment.deleteComment.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
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
				queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
			})
		},
		createQueryOptions: (jobId) =>
			queryOrpc.comment.getRenderStatus.queryOptions({
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
		queryOrpc.comment.startCloudRender.mutationOptions({
			onSuccess: (data) => setRenderJobId(data.jobId),
		}),
		{
			successToast: t('toasts.cloudRenderQueued'),
			errorToast: ({ error }) => getUserFriendlyErrorMessage(error),
		},
	)

	const hasRenderedCommentsVideo = Boolean(mediaQuery.data?.renderCommentsJobId)
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
		translateCommentsMutation.isPending ||
		deleteCommentsMutation.isPending ||
		startCloudRenderMutation.isPending

	return (
		<div className="min-h-screen bg-background font-sans text-foreground selection:bg-primary selection:text-primary-foreground">
			<Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
				<DialogContent className="rounded-none border-border font-mono">
					<DialogHeader>
						<DialogTitle className="text-sm uppercase tracking-widest">
							{t('editDialog.title')}
						</DialogTitle>
						<DialogDescription className="text-[10px] uppercase tracking-wider">
							{t('editDialog.description')}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label
								htmlFor="title"
								className="text-[10px] uppercase tracking-widest text-muted-foreground"
							>
								{t('editDialog.fields.originalLabel')}
							</Label>
							<Input
								id="title"
								value={editTitle}
								onChange={(e) => setEditTitle(e.target.value)}
								placeholder={t('editDialog.fields.originalPlaceholder')}
								className="h-9 rounded-none font-sans text-sm"
							/>
						</div>
						<div className="space-y-2">
							<Label
								htmlFor="translatedTitle"
								className="text-[10px] uppercase tracking-widest text-muted-foreground"
							>
								{t('editDialog.fields.translatedLabel')}
							</Label>
							<Input
								id="translatedTitle"
								value={editTranslatedTitle}
								onChange={(e) => setEditTranslatedTitle(e.target.value)}
								placeholder={t('editDialog.fields.translatedPlaceholder')}
								className="h-9 rounded-none font-sans text-sm"
							/>
						</div>
					</div>
					<DialogFooter className="sm:justify-start">
						<Button
							variant="outline"
							onClick={() => setEditDialogOpen(false)}
							className="rounded-none uppercase tracking-widest"
						>
							[ CANCEL ]
						</Button>
						<Button
							onClick={handleSaveTitles}
							disabled={updateTitlesMutation.isPending}
							className="rounded-none uppercase tracking-widest"
						>
							{updateTitlesMutation.isPending
								? 'SAVING...'
								: '[ COMMIT_CHANGES ]'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
				<DialogContent className="rounded-none border-border font-mono">
					<DialogHeader>
						<DialogTitle className="text-sm uppercase tracking-widest text-destructive">
							Security Warning: Destructive Action
						</DialogTitle>
						<DialogDescription className="text-[10px] uppercase tracking-wider">
							{t('bulkDelete.confirm.description', {
								count: confirmDeleteIds.length,
							})}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="sm:justify-start">
						<Button
							variant="outline"
							onClick={() => setConfirmDeleteOpen(false)}
							disabled={deleteCommentsMutation.isPending}
							className="rounded-none uppercase tracking-widest"
						>
							[ ABORT ]
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
							className="rounded-none uppercase tracking-widest"
						>
							{deleteCommentsMutation.isPending
								? t('bulkDelete.confirm.executing')
								: t('bulkDelete.confirm.action')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<div className="border-b border-border bg-card">
				<div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="space-y-1">
							<div className="flex flex-wrap items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
								<span className="flex items-center gap-1">
									<span className="h-1.5 w-1.5 rounded-full bg-primary" />
									{t('ui.breadcrumb.system')}
								</span>
								<span>/</span>
								<span>{t('ui.breadcrumb.section')}</span>
								{commentsCloudJobId || renderJobId ? (
									<>
										<span>/</span>
										<div className="flex items-center gap-2">
											{commentsCloudJobId && (
												<CloudJobProgress
													status={cloudCommentsStatusQuery.data?.status}
													progress={cloudCommentsStatusQuery.data?.progress}
													jobId={commentsCloudJobId}
													mediaId={id}
													showIds={false}
												/>
											)}
											{renderJobId && (
												<CloudJobProgress
													status={renderStatusQuery.data?.status}
													progress={renderStatusQuery.data?.progress}
													jobId={renderJobId}
													mediaId={id}
													showIds={false}
												/>
											)}
										</div>
									</>
								) : null}
							</div>
							<h1 className="font-mono text-xl font-bold uppercase tracking-tight">
								{t('header.title')}
							</h1>
							{mediaQuery.data?.translatedTitle || mediaQuery.data?.title ? (
								<div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
									ID: <span className="text-foreground">{id}</span>
									<span className="mx-2">|</span>
									TITLE:{' '}
									<span className="text-foreground">
										{mediaQuery.data?.translatedTitle || mediaQuery.data?.title}
									</span>
								</div>
							) : null}
						</div>

						<div className="flex flex-wrap gap-2">
							{mediaQuery.data?.translatedTitle ? (
								<Button
									variant="outline"
									size="sm"
									className="rounded-[2px] font-mono text-xs uppercase tracking-wider"
									onClick={handleEditClick}
									disabled={mediaQuery.isLoading}
								>
									<Edit className="mr-2 h-3 w-3" />
									{t('header.editTitles')}
								</Button>
							) : null}
							<Button
								variant="outline"
								size="sm"
								className="rounded-[2px] font-mono text-xs uppercase tracking-wider"
								asChild
							>
								<Link to="/media/$id" params={{ id }}>
									{t('header.back')}
								</Link>
							</Button>
							<Button
								variant="outline"
								size="sm"
								className="rounded-[2px] font-mono text-xs uppercase tracking-wider"
								disabled={mediaQuery.isLoading}
								onClick={() => mediaQuery.refetch()}
							>
								{t('ui.actions.refresh')}
							</Button>
						</div>
					</div>
				</div>
			</div>

			<div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
				<div className="space-y-6">
					{mediaQuery.isLoading ? (
						<div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
							<Loader2 className="h-3 w-3 animate-spin" />
							{t('ui.status.loading')}
						</div>
					) : null}

					{mediaQuery.isError || !mediaQuery.data ? (
						<div className="border border-destructive/50 bg-destructive/5 p-4 font-mono text-xs uppercase tracking-wider text-destructive">
							{t('ui.status.errorSync')}
						</div>
					) : (
						<div className="grid gap-8 lg:grid-cols-12">
							<div className="space-y-6 lg:col-span-5">
								<div className="border border-border bg-card p-1">
									<div className="border border-border/50 p-4">
										<RemotionPreviewCardStart
											videoInfo={previewVideoInfo}
											comments={comments as any}
											isLoading={mediaQuery.isLoading}
											templateId={templateId}
										/>
									</div>
								</div>

								<Tabs
									value={tab}
									onValueChange={(next) =>
										onTabChange(next as MediaCommentsTab)
									}
									className="w-full"
								>
									<TabsList className="h-auto w-full justify-start rounded-none border-b border-border bg-transparent p-0">
										{(
											['basics', 'download', 'translate', 'render'] as const
										).map((tValue) => (
											<TabsTrigger
												key={tValue}
												value={tValue}
												className="rounded-none border-b-2 border-transparent px-4 py-2 font-mono text-[10px] uppercase tracking-widest data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
											>
												{t(`tabs.${tValue}`)}
											</TabsTrigger>
										))}
									</TabsList>

									<div className="mt-4">
										<TabsContent value="basics" className="m-0 space-y-4">
											<div className="border border-border bg-card">
												<div className="border-b border-border bg-muted/30 px-4 py-2">
													<h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
														{t('tabs.basics')}
													</h3>
												</div>
												<div className="divide-y divide-border border-t-0 font-mono">
													{[
														{
															label: t('basics.translatedTitle.label'),
															value:
																mediaQuery.data?.translatedTitle ??
																t('basics.translatedTitle.empty'),
															copyValue: mediaQuery.data?.translatedTitle,
															copyLabel: t('labels.englishTitle'),
														},
														{
															label: t('basics.originalTitle.label'),
															value:
																mediaQuery.data?.title ??
																t('basics.originalTitle.empty'),
															copyValue: mediaQuery.data?.title,
															copyLabel: t('labels.originalTitle'),
														},
													].map((item, idx) => (
														<div
															key={idx}
															className="group flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
														>
															<div className="space-y-1">
																<div className="text-[10px] uppercase tracking-widest text-muted-foreground">
																	{item.label}
																</div>
																<div className="text-sm font-medium">
																	{item.value}
																</div>
															</div>
															<Button
																variant="ghost"
																size="icon"
																className="h-8 w-8 rounded-none border border-transparent opacity-0 group-hover:border-border group-hover:opacity-100"
																disabled={!item.copyValue}
																onClick={() =>
																	void copyTitleValue(
																		item.copyValue,
																		item.copyLabel,
																	)
																}
															>
																<Copy className="h-3 w-3" />
															</Button>
														</div>
													))}

													<div className="group px-4 py-3">
														<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
															<div className="space-y-2">
																<div className="text-[10px] uppercase tracking-widest text-muted-foreground">
																	Source Diagnostics
																</div>
																<div className="space-y-1">
																	<div className="text-sm font-medium">
																		{getVideoSourceDisplay()}
																	</div>
																	{getVideoSourceUrl() && (
																		<div className="truncate text-[10px] text-muted-foreground">
																			{getVideoSourceUrl()}
																		</div>
																	)}
																</div>
															</div>
															<div className="flex gap-2">
																{getVideoSourceUrl() && (
																	<Button
																		variant="outline"
																		size="icon"
																		className="h-8 w-8 rounded-none"
																		asChild
																	>
																		<a
																			href={getVideoSourceUrl()}
																			target="_blank"
																			rel="noreferrer"
																		>
																			<ExternalLink className="h-3 w-3" />
																		</a>
																	</Button>
																)}
																<Button
																	variant="outline"
																	size="icon"
																	className="h-8 w-8 rounded-none"
																	onClick={() =>
																		void copyTitleValue(
																			getVideoSourceUrl(),
																			t('videoInfo.sourceId'),
																		)
																	}
																	disabled={!getVideoSourceUrl()}
																>
																	<Copy className="h-3 w-3" />
																</Button>
															</div>
														</div>
														<Button
															variant="link"
															size="sm"
															onClick={handleCopyDisclaimer}
															className="mt-2 h-auto p-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
														>
															[ COPY_DISCLAIMER ]
														</Button>
													</div>
												</div>
											</div>
										</TabsContent>

										<TabsContent value="download" className="m-0 space-y-4">
											<div className="border border-border bg-card">
												<div className="border-b border-border bg-muted/30 px-4 py-2">
													<h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
														Extraction Parameters
													</h3>
												</div>
												<div className="space-y-6 p-4">
													<div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
														<div className="space-y-2">
															<Label
																htmlFor="pages"
																className="font-mono text-[10px] uppercase tracking-widest"
															>
																{t('download.pagesLabel')}
															</Label>
															<Input
																id="pages"
																value={pages}
																onChange={(e) => setPages(e.target.value)}
																inputMode="numeric"
																className="h-9 rounded-none font-mono"
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
																	!hasSuccessProxies
																		? t('errors.noProxiesAvailable')
																		: undefined
																}
															/>
														</div>
													</div>

													<div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
														<Button
															className="rounded-none font-mono text-[10px] uppercase tracking-widest"
															onClick={() => {
																const n = Math.max(
																	1,
																	Math.min(50, safeParseInt(pages, 3)),
																)
																setPages(String(n))
																if (!canQueueCommentsDownload) {
																	toast.error(t('errors.noProxiesAvailable'))
																	return
																}
																startCloudCommentsMutation.mutate({
																	mediaId: id,
																	pages: n,
																	proxyId:
																		downloadProxyId &&
																		downloadProxyId !== 'none'
																			? downloadProxyId
																			: undefined,
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
																	<Loader2 className="mr-2 h-3 w-3 animate-spin" />
																	Queuing...
																</>
															) : (
																<>
																	<Download className="mr-2 h-3 w-3" />
																	{t('download.start')}
																</>
															)}
														</Button>

														{commentsCloudJobId ? (
															<Button
																variant="outline"
																className="rounded-none font-mono text-[10px] uppercase tracking-widest"
																onClick={() => setCommentsCloudJobId(null)}
																disabled={isBusy}
															>
																[ TERMINATE_JOB ]
															</Button>
														) : null}
													</div>

													{commentsCloudJobId ? (
														<div className="border-t border-border pt-4 font-mono text-[10px] text-muted-foreground">
															JOB_ID:{' '}
															<span className="text-foreground">
																{commentsCloudJobId}
															</span>
														</div>
													) : null}
												</div>
											</div>
										</TabsContent>

										<TabsContent value="translate" className="m-0 space-y-4">
											<div className="border border-border bg-card">
												<div className="border-b border-border bg-muted/30 px-4 py-2">
													<h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
														Translation Engine
													</h3>
												</div>
												<div className="space-y-6 p-4">
													<div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
														<ModelSelect
															label={t('fields.aiModel')}
															value={model}
															onValueChange={(v) => setModel(v as ChatModelId)}
															options={llmModelOptions}
															disabled={isBusy}
														/>
														<div className="flex items-center justify-between border border-border p-3">
															<Label className="font-mono text-[10px] uppercase tracking-widest">
																{t('fields.overwriteExisting')}
															</Label>
															<Switch
																checked={forceTranslate}
																onCheckedChange={setForceTranslate}
																disabled={isBusy}
															/>
														</div>
													</div>
													<div className="border-t border-border pt-4">
														<Button
															className="rounded-none font-mono text-[10px] uppercase tracking-widest"
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
															disabled={
																translateCommentsMutation.isPending || isBusy
															}
														>
															{translateCommentsMutation.isPending ? (
																<>
																	<Loader2 className="mr-2 h-3 w-3 animate-spin" />
																	Processing...
																</>
															) : (
																<>
																	<LanguagesIcon className="mr-2 h-3 w-3" />
																	{t('translate.translate')}
																</>
															)}
														</Button>
													</div>
												</div>
											</div>
										</TabsContent>

										<TabsContent value="render" className="m-0 space-y-4">
											<div className="border border-border bg-card">
												<div className="border-b border-border bg-muted/30 px-4 py-2">
													<h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
														Rendering Pipeline
													</h3>
												</div>
												<div className="space-y-6 p-4">
													<div className="space-y-2">
														<Label className="font-mono text-[10px] uppercase tracking-widest">
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
															disabled={isBusy}
														>
															<SelectTrigger className="h-9 rounded-none font-mono">
																<SelectValue />
															</SelectTrigger>
															<SelectContent className="rounded-none">
																{listTemplates().map((tpl) => (
																	<SelectItem
																		key={tpl.id}
																		value={tpl.id}
																		className="rounded-none font-mono"
																	>
																		{tpl.name}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
													</div>

													<div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
														<div className="space-y-2">
															<Label className="font-mono text-[10px] uppercase tracking-widest">
																{t('render.sourcePolicy.label')}
															</Label>
															<Select
																value={sourcePolicy}
																onValueChange={(v) =>
																	setSourcePolicy(v as SourcePolicy)
																}
																disabled={isBusy}
															>
																<SelectTrigger className="h-9 rounded-none font-mono">
																	<SelectValue />
																	<span className="sr-only">
																		{tCommon('actions.toggle')}
																	</span>
																</SelectTrigger>
																<SelectContent className="rounded-none">
																	<SelectItem
																		value="auto"
																		className="font-mono text-sm"
																	>
																		{t('render.sourcePolicy.auto')}
																	</SelectItem>
																	<SelectItem
																		value="original"
																		className="font-mono text-sm"
																	>
																		{t('render.sourcePolicy.original')}
																	</SelectItem>
																	<SelectItem
																		value="subtitles"
																		className="font-mono text-sm"
																	>
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
																!hasSuccessProxies
																	? t('errors.noProxiesAvailable')
																	: undefined
															}
														/>
													</div>

													<div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
														<Button
															className="rounded-none font-mono text-[10px] uppercase tracking-widest"
															onClick={() => {
																if (!canQueueRender) {
																	toast.error(t('errors.noProxiesAvailable'))
																	return
																}
																startCloudRenderMutation.mutate({
																	mediaId: id,
																	proxyId:
																		renderProxyId && renderProxyId !== 'none'
																			? renderProxyId
																			: undefined,
																	sourcePolicy,
																	templateId,
																	templateConfig: null,
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
																	<Loader2 className="mr-2 h-3 w-3 animate-spin" />
																	Queuing...
																</>
															) : (
																<>
																	<Play className="mr-2 h-3 w-3" />
																	{t('render.start')}
																</>
															)}
														</Button>

														{hasRenderedCommentsVideo ? (
															<Button
																variant="outline"
																className="rounded-none font-mono text-[10px] uppercase tracking-widest"
																asChild
															>
																<a href={renderedDownloadUrl}>
																	{t('render.output.download')}
																</a>
															</Button>
														) : null}

														{renderJobId ? (
															<Button
																variant="outline"
																className="rounded-none font-mono text-[10px] uppercase tracking-widest"
																onClick={() => setRenderJobId(null)}
																disabled={isBusy}
															>
																[ TERMINATE_RENDER ]
															</Button>
														) : null}
													</div>
												</div>
											</div>
										</TabsContent>
									</div>
								</Tabs>
							</div>

							<div className="space-y-6 lg:col-span-7 lg:sticky lg:top-6 lg:self-start">
								<div className="border border-border bg-card">
									<div className="border-b border-border bg-muted/30 px-4 py-3">
										<div className="flex flex-wrap items-center justify-between gap-6">
											<div className="space-y-1">
												<div className="font-mono text-[10px] font-bold uppercase tracking-widest">
													Data Stream Monitor
												</div>
												<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
													Status:{' '}
													<span className="text-foreground">
														{t('comments.title', { count: comments.length })}
													</span>
													{hasSelection && (
														<>
															<span className="mx-2">|</span>
															Selected:{' '}
															<span className="text-primary font-bold">
																{selectedCount}
															</span>
														</>
													)}
												</div>
											</div>

											<div className="flex flex-wrap items-center gap-2">
												<Button
													variant="outline"
													size="sm"
													className="h-8 rounded-none font-mono text-[10px] uppercase tracking-widest"
													onClick={toggleSelectAll}
													disabled={comments.length === 0}
												>
													{allVisibleSelected ? (
														<CheckSquare className="mr-2 h-3 w-3" />
													) : (
														<Square className="mr-2 h-3 w-3" />
													)}
													{allVisibleSelected ? 'DESELECT' : 'SELECT_ALL'}
												</Button>
												<Button
													variant="destructive"
													size="sm"
													className="h-8 rounded-none font-mono text-[10px] uppercase tracking-widest"
													onClick={handleBulkDelete}
													disabled={
														!hasSelection || deleteCommentsMutation.isPending
													}
												>
													<Trash2 className="mr-2 h-3 w-3" />
													PURGE_SELECTED
												</Button>
											</div>
										</div>
									</div>

									<div className="lg:max-h-[75vh] lg:overflow-y-auto">
										<div className="border-b border-border bg-muted/10 px-4 py-1.5">
											<span className="font-mono text-[8px] uppercase tracking-[0.3em] text-muted-foreground">
												Live_Comment_Buffer_Input
											</span>
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
									</div>
								</div>
							</div>
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
	const t = useTranslations('MediaComments.page')

	return (
		<div className="space-y-2">
			<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
				{label}
			</Label>
			<Select value={value} onValueChange={onValueChange} disabled={disabled}>
				<SelectTrigger className="h-9 rounded-none font-mono text-sm">
					<SelectValue placeholder={t('ui.placeholders.selectEngine')} />
				</SelectTrigger>
				<SelectContent className="rounded-none">
					{options.map((m) => (
						<SelectItem key={m.id} value={m.id} className="font-mono text-sm">
							{m.label.toUpperCase().replace(/\s+/g, '_')}
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
		testStatus?: 'pending' | 'success' | 'failed' | null
		responseTime?: number | null
	}>
	defaultProxyId: string | null
	value: string
	onValueChange: (value: string) => void
	disabled?: boolean
	help?: string
}) {
	const t = useTranslations('MediaComments.page')

	const successProxyIds = new Set(
		proxies
			.filter((p) => p.id !== 'none' && p.testStatus === 'success')
			.map((p) => p.id),
	)
	const options = proxies
	return (
		<div className="space-y-2 font-mono">
			<Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
				{label}
			</Label>
			<Select value={value} onValueChange={onValueChange} disabled={disabled}>
				<SelectTrigger className="h-9 rounded-none text-sm">
					<SelectValue placeholder={t('ui.placeholders.selectGateway')} />
				</SelectTrigger>
				<SelectContent className="rounded-none">
					{options.map((proxy) => {
						const isDefault = Boolean(
							defaultProxyId && proxy.id === defaultProxyId,
						)
						const display =
							proxy.name ||
							(proxy.id === 'none'
								? t('ui.placeholders.autoDiscovery')
								: `${proxy.protocol ?? 'http'}://${formatHostPort(proxy.server, proxy.port)}`)
						return (
							<SelectItem
								key={proxy.id}
								value={proxy.id}
								disabled={proxy.id !== 'none' && !successProxyIds.has(proxy.id)}
								className="font-mono text-xs"
							>
								<span className="flex items-center gap-3">
									<span className="truncate tracking-tighter">
										{display.toUpperCase()}
									</span>
									{proxy.id !== 'none' && (
										<span className="text-[10px] opacity-70">
											[{proxy.responseTime}ms]
										</span>
									)}
									{isDefault && (
										<span className="bg-primary px-1 text-[8px] font-bold text-primary-foreground">
											DEFAULT
										</span>
									)}
								</span>
							</SelectItem>
						)
					})}
				</SelectContent>
			</Select>
			{help && (
				<div className="text-[10px] uppercase tracking-wider text-destructive">
					!! {help}
				</div>
			)}
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
			<div className="border-t border-border p-8 text-center font-mono">
				<div className="text-[10px] uppercase tracking-widest text-muted-foreground">
					{emptyTitle}
				</div>
				<div className="mt-2 text-[10px] uppercase tracking-tighter opacity-50">
					{emptyDescription}
				</div>
			</div>
		)
	}

	return (
		<div className="divide-y divide-border">
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

	const selectionClass = selected ? 'bg-primary/5' : ''

	return (
		<div
			className={`group flex items-start gap-4 p-4 transition-colors hover:bg-muted/30 ${selectionClass}`}
		>
			<div className="mt-0.5">
				<button
					type="button"
					onClick={() => onSelectChange(!selected)}
					className={`h-4 w-4 border transition-colors ${
						selected
							? 'border-primary bg-primary text-primary-foreground'
							: 'border-border bg-background'
					}`}
				>
					{selected && <CheckSquare className="h-3 w-3" />}
				</button>
			</div>

			<div className="flex-shrink-0">
				<div className="h-8 w-8 overflow-hidden rounded-none border border-border bg-muted">
					{showFallback ? (
						<div className="flex h-full w-full items-center justify-center font-mono text-[10px] font-bold text-muted-foreground">
							{initials}
						</div>
					) : (
						<img
							src={comment.authorThumbnail}
							alt={comment.author}
							className="h-full w-full object-cover grayscale"
							loading="lazy"
							onError={() => setAvatarError(true)}
						/>
					)}
				</div>
			</div>

			<div className="min-w-0 flex-1 space-y-3">
				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
							<span className="truncate font-mono text-[10px] font-bold uppercase tracking-wider">
								{comment.author}
							</span>
							<div className="flex items-center gap-3 font-mono text-[8px] uppercase tracking-[0.2em] text-muted-foreground">
								<span>LIKES:{comment.likes ?? 0}</span>
								{(comment.replyCount ?? 0) > 0 && (
									<span>REPLIES:{comment.replyCount ?? 0}</span>
								)}
							</div>
						</div>
					</div>

					<Button
						variant="ghost"
						size="icon"
						onClick={onDelete}
						disabled={deleting}
						className="h-6 w-6 rounded-none text-destructive opacity-0 group-hover:opacity-100"
					>
						<Trash2 className="h-3 w-3" />
					</Button>
				</div>

				<div className="space-y-3">
					<p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/90">
						{comment.content}
					</p>
					{comment.translatedContent && (
						<div className="border-l border-primary/30 bg-primary/5 px-3 py-2">
							<div className="mb-2 flex items-center gap-2">
								<div className="bg-primary px-1 font-mono text-[8px] font-bold text-primary-foreground">
									TRANSLATED
								</div>
							</div>
							<p className="whitespace-pre-wrap break-words text-xs leading-relaxed">
								{comment.translatedContent}
							</p>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
