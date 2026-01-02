import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
	ArrowLeft,
	Download,
	FileText,
	Languages,
	Loader2,
	Sparkles,
	Terminal,
	Trash2,
	Video,
} from 'lucide-react'
import * as React from 'react'
import { CloudJobProgress } from '~/components/business/jobs/cloud-job-progress'
import { PreviewPane } from '~/components/business/media/subtitles/PreviewPane'
import { Step3Render } from '~/components/business/media/subtitles/Step3Render'
import { Button } from '~/components/ui/button'
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
import { Textarea } from '~/components/ui/textarea'
import { useCloudJob } from '~/lib/hooks/useCloudJob'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import {
	DEFAULT_TRANSCRIPTION_LANGUAGE,
	TRANSCRIPTION_LANGUAGE_OPTIONS,
} from '~/lib/subtitle/config/languages'
import { DEFAULT_SUBTITLE_RENDER_CONFIG } from '~/lib/subtitle/config/presets'
import type { SubtitleRenderConfig } from '~/lib/subtitle/types'
import { parseVttCues } from '~/lib/subtitle/utils/vtt'
import { useTranslations } from '~/lib/i18n'
import { queryOrpc } from '~/lib/orpc/client'

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'canceled'])

type StepId = 'step1' | 'step2' | 'step3' | 'step4'

type OptimizeParams = {
	pauseThresholdMs: number
	maxSentenceMs: number
	maxChars: number
	lightCleanup: boolean
	textCorrect: boolean
}

export function MediaSubtitlesPage({ id }: { id: string }) {
	const t = useTranslations('Subtitles')
	const qc = useQueryClient()

	const mediaQuery = useQuery({
		...queryOrpc.media.byId.queryOptions({ input: { id } }),
		refetchInterval: (q) => {
			const media = q.state.data as any
			const hasTranscription = Boolean(
				media?.optimizedTranscription || media?.transcription,
			)
			return hasTranscription ? false : 3000
		},
	})

	const asrModelsQuery = useQuery(
		queryOrpc.ai.listModels.queryOptions({
			input: { kind: 'asr', enabledOnly: true },
		}),
	)
	const asrDefaultQuery = useQuery(
		queryOrpc.ai.getDefaultModel.queryOptions({ input: { kind: 'asr' } }),
	)
	const llmModelsQuery = useQuery(
		queryOrpc.ai.listModels.queryOptions({
			input: { kind: 'llm', enabledOnly: true },
		}),
	)
	const llmDefaultQuery = useQuery(
		queryOrpc.ai.getDefaultModel.queryOptions({ input: { kind: 'llm' } }),
	)

	const asrDefaultId = String(asrDefaultQuery.data?.model?.id ?? '')
	const llmDefaultId = String(llmDefaultQuery.data?.model?.id ?? '')

	const [asrModel, setAsrModel] = useStateOrDefault(
		`subtitleAsrModel:${id}`,
		asrDefaultId,
	)
	const [language, setLanguage] = useStateOrDefault(
		`subtitleLanguage:${id}`,
		DEFAULT_TRANSCRIPTION_LANGUAGE,
	)
	const [llmModel, setLlmModel] = useStateOrDefault(
		`subtitleLlmModel:${id}`,
		llmDefaultId,
	)

	const [activeStep, setActiveStep] = useStateOrDefault<StepId>(
		`subtitleStep:${id}`,
		'step1',
		isStepId,
	)

	const [subtitleConfig, setSubtitleConfig] =
		useStateOrDefaultJson<SubtitleRenderConfig>(`subtitleRenderConfig:${id}`, {
			...DEFAULT_SUBTITLE_RENDER_CONFIG,
		})

	const [optParams, setOptParams] = useStateOrDefaultJson<OptimizeParams>(
		`subtitleOptimizeParams:${id}`,
		{
			pauseThresholdMs: 480,
			maxSentenceMs: 8000,
			maxChars: 68,
			lightCleanup: false,
			textCorrect: false,
		},
	)

	const [previewVersion, setPreviewVersion] = React.useState<
		number | undefined
	>(undefined)

	const [previewDuration, setPreviewDuration] = React.useState(0)
	const [previewCurrentTime, setPreviewCurrentTime] = React.useState(0)
	const previewVideoRef = React.useRef<HTMLVideoElement | null>(null)

	const {
		jobId: asrJobId,
		setJobId: setAsrJobId,
		statusQuery: asrStatusQuery,
	} = useCloudJob<any, Error>({
		storageKey: `subtitleAsrJob:${id}`,
		createQueryOptions: (jobId) => ({
			...queryOrpc.subtitle.getAsrStatus.queryOptions({
				input: { jobId },
			}),
			enabled: Boolean(jobId),
			refetchInterval: (q) => {
				const status = (q.state.data as any)?.status
				if (!status) return 1500
				return TERMINAL_STATUSES.has(status) ? false : 1500
			},
		}),
		onCompleted: async () => {
			await qc.invalidateQueries({
				queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
			})
			await qc.invalidateQueries({ queryKey: queryOrpc.media.list.key() })
		},
	})

	const transcribeMutation = useEnhancedMutation(
		queryOrpc.subtitle.transcribe.mutationOptions({
			onSuccess: (data) => {
				setAsrJobId(data.jobId)
			},
		}),
		{
			successToast: t('transcribe.started'),
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : t('ui.toasts.failed'),
		},
	)

	const translateMutation = useEnhancedMutation(
		queryOrpc.subtitle.translate.mutationOptions({
			onSuccess: async (data) => {
				setTranslationDraft(data.translation)
				await qc.invalidateQueries({
					queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
				})
			},
		}),
		{
			successToast: t('translate.completed'),
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : t('ui.toasts.failed'),
		},
	)

	const deleteCueMutation = useEnhancedMutation(
		queryOrpc.subtitle.deleteTranslationCue.mutationOptions({
			onSuccess: (data) => {
				setTranslationDraft(data.translation)
			},
		}),
		{
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : t('ui.toasts.failed'),
		},
	)

	const updateTranslationMutation = useEnhancedMutation(
		queryOrpc.subtitle.updateTranslation.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
				})
			},
		}),
		{
			successToast: t('ui.toasts.saved'),
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : t('ui.toasts.failed'),
		},
	)

	const optimizeMutation = useEnhancedMutation(
		queryOrpc.subtitle.optimizeTranscription.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
				})
			},
		}),
		{
			successToast: t('optimize.completed'),
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : t('ui.toasts.failed'),
		},
	)

	const clearOptimizedMutation = useEnhancedMutation(
		queryOrpc.subtitle.clearOptimizedTranscription.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
				})
			},
		}),
		{
			successToast: t('optimize.restored'),
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : t('ui.toasts.failed'),
		},
	)

	const {
		jobId: renderJobId,
		setJobId: setRenderJobId,
		statusQuery: renderStatusQuery,
	} = useCloudJob<any, Error>({
		storageKey: `subtitleRenderJob:${id}`,
		createQueryOptions: (jobId) => ({
			...queryOrpc.subtitle.getRenderStatus.queryOptions({
				input: { jobId },
			}),
			enabled: Boolean(jobId),
			refetchInterval: (q) => {
				const status = (q.state.data as any)?.status
				if (!status) return 1500
				return TERMINAL_STATUSES.has(status) ? false : 1500
			},
		}),
		onCompleted: async () => {
			setPreviewVersion(Date.now())
			setActiveStep('step4')
			await qc.invalidateQueries({
				queryKey: queryOrpc.media.byId.queryKey({ input: { id } }),
			})
			await qc.invalidateQueries({ queryKey: queryOrpc.media.list.key() })
		},
	})

	const renderMutation = useEnhancedMutation(
		queryOrpc.subtitle.startCloudRender.mutationOptions({
			onSuccess: (data) => {
				setRenderJobId(data.jobId)
			},
		}),
		{
			successToast: t('render.started'),
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : t('ui.toasts.failed'),
		},
	)

	const renderStatusValue = (renderStatusQuery.data as any)?.status as
		| string
		| undefined
	const isRenderBusy =
		renderMutation.isPending ||
		(Boolean(renderJobId) &&
			(!renderStatusValue || !TERMINAL_STATUSES.has(renderStatusValue)))

	const previewCloudStatus = renderStatusQuery.data
		? {
				status: (renderStatusQuery.data as any)?.status,
				progress: (renderStatusQuery.data as any)?.progress,
			}
		: null

	const [translationDraft, setTranslationDraft] = React.useState<string | null>(
		null,
	)
	const [translationEditorOpen, setTranslationEditorOpen] =
		React.useState(false)
	const [translationEditorValue, setTranslationEditorValue] = React.useState('')

	React.useEffect(() => {
		const media = mediaQuery.data as any
		const nextTranslation = String(media?.translation ?? '')
		if (!translationDraft && nextTranslation) {
			setTranslationDraft(nextTranslation)
		}
	}, [mediaQuery.data, translationDraft])

	if (mediaQuery.isLoading) {
		return (
			<div className="min-h-screen bg-background p-6 lg:p-12">
				<div className="mx-auto max-w-7xl border border-border bg-card p-12 text-center">
					<div className="flex justify-center mb-4">
						<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
					</div>
					<div className="text-sm font-mono uppercase tracking-wide text-muted-foreground">
						{t('ui.status.loadingMediaData')}
					</div>
				</div>
			</div>
		)
	}

	if (mediaQuery.isError) {
		return (
			<div className="min-h-screen bg-background p-6 lg:p-12">
				<div className="mx-auto max-w-7xl border border-destructive/50 bg-destructive/5 p-12 text-center">
					<div className="flex justify-center mb-4">
						<Terminal className="h-8 w-8 text-destructive" />
					</div>
					<div className="text-lg font-bold uppercase tracking-wide text-destructive mb-2">
						{t('ui.status.errorLoadingMedia')}
					</div>
					<div className="flex justify-center gap-4 mt-8">
						<Button
							variant="outline"
							className="rounded-none border-destructive/50 text-destructive hover:bg-destructive/10 uppercase"
							asChild
						>
							<Link to="/media/$id" params={{ id }}>
								{t('back')}
							</Link>
						</Button>
					</div>
				</div>
			</div>
		)
	}

	const media = mediaQuery.data
	if (!media) {
		return (
			<div className="min-h-screen bg-background p-6 lg:p-12">
				<div className="mx-auto max-w-7xl border border-border bg-card p-12 text-center">
					<div className="text-sm font-mono uppercase tracking-wide text-muted-foreground">
						Media Not Found
					</div>
				</div>
			</div>
		)
	}

	const transcriptionWords = (media as any)?.transcriptionWords
	const canOptimize =
		Array.isArray(transcriptionWords) && transcriptionWords.length > 0
	const hasOptimized = Boolean((media as any)?.optimizedTranscription)
	const hasRenderedVideo = Boolean((media as any)?.renderSubtitlesJobId)

	const translationText =
		translationDraft ?? String((media as any)?.translation ?? '')
	const transcriptionText = String(
		(media as any)?.optimizedTranscription ||
			(media as any)?.transcription ||
			'',
	)
	const cues = React.useMemo(
		() => (translationText ? parseVttCues(translationText) : []),
		[translationText],
	)

	const supportsLanguageHint = React.useMemo(() => {
		const selected = (asrModelsQuery.data?.items ?? []).find(
			(m: any) => String(m.id) === String(asrModel),
		)
		return Boolean((selected?.capabilities as any)?.supportsLanguageHint)
	}, [asrModel, asrModelsQuery.data?.items])

	return (
		<div className="min-h-screen bg-background text-foreground font-sans p-6 md:p-12">
			<div className="mx-auto max-w-7xl border border-border bg-card">
				{/* Header */}
				<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border p-6 bg-secondary/5">
					<div className="space-y-1">
						<h1 className="text-xl font-bold uppercase tracking-wide">
							{t('title')}
						</h1>
						<div className="text-xs font-mono text-muted-foreground uppercase">
							{media.title}
						</div>
					</div>
					<Button
						variant="outline"
						size="sm"
						className="rounded-none border-border uppercase tracking-wide text-xs h-9 px-4"
						asChild
					>
						<Link to="/media/$id" params={{ id }}>
							<ArrowLeft className="mr-2 h-3.5 w-3.5" />
							{t('back')}
						</Link>
					</Button>
				</div>

				<div className="p-6 border-b border-border bg-background">
					<PreviewPane
						mediaId={id}
						translation={translationText || null}
						config={subtitleConfig}
						hasRenderedVideo={hasRenderedVideo}
						thumbnail={(media as any)?.thumbnail ?? undefined}
						cacheBuster={previewVersion}
						isRendering={isRenderBusy}
						cloudStatus={previewCloudStatus}
						onDurationChange={(d) => {
							if (Number.isFinite(d) && d > 0) setPreviewDuration(d)
						}}
						onCurrentTimeChange={(time) => {
							if (Number.isFinite(time)) setPreviewCurrentTime(time)
						}}
						onVideoRefChange={(ref) => {
							previewVideoRef.current = ref
						}}
					/>
				</div>

				<div className="p-6">
					<Tabs
						value={activeStep}
						onValueChange={(v) => setActiveStep(v as StepId)}
					>
						<TabsList className="w-full flex bg-secondary/10 border border-border p-0 h-auto rounded-none">
							<TabsTrigger
								value="step1"
								className="flex-1 rounded-none border-r border-border data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:font-bold py-3 uppercase text-xs tracking-wide"
							>
								<FileText className="h-3.5 w-3.5 mr-2" />
								Transcribe
							</TabsTrigger>
							<TabsTrigger
								value="step2"
								className="flex-1 rounded-none border-r border-border data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:font-bold py-3 uppercase text-xs tracking-wide"
							>
								<Languages className="h-3.5 w-3.5 mr-2" />
								Translate
							</TabsTrigger>
							<TabsTrigger
								value="step3"
								className="flex-1 rounded-none border-r border-border data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:font-bold py-3 uppercase text-xs tracking-wide"
							>
								<Video className="h-3.5 w-3.5 mr-2" />
								Render
							</TabsTrigger>
							<TabsTrigger
								value="step4"
								className="flex-1 rounded-none data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:font-bold py-3 uppercase text-xs tracking-wide"
							>
								<Download className="h-3.5 w-3.5 mr-2" />
								Export
							</TabsTrigger>
						</TabsList>

						<TabsContent
							value="step1"
							className="mt-8 space-y-8 animate-in fade-in duration-300"
						>
							<div className="border border-border bg-background p-6">
								<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-8 border-b border-border pb-6">
									<div className="space-y-1">
										<div className="flex items-center gap-2 text-base font-bold uppercase tracking-wide">
											<FileText className="h-4 w-4" />
											{t('transcribe.title')}
										</div>
										<div className="text-xs font-mono text-muted-foreground">
											{t('transcribe.desc')}
										</div>
									</div>
									{asrJobId ? (
										<CloudJobProgress
											status={(asrStatusQuery.data as any)?.status}
											phase={(asrStatusQuery.data as any)?.phase}
											progress={(asrStatusQuery.data as any)?.progress ?? null}
											jobId={asrJobId}
											showIds={false}
										/>
									) : null}
								</div>

								<div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
									<div className="space-y-2">
										<div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
											{t('transcribe.model')}
										</div>
										<Select
											value={asrModel}
											onValueChange={(v) => setAsrModel(v)}
											disabled={transcribeMutation.isPending}
										>
											<SelectTrigger className="w-full rounded-none border-border h-10 font-mono text-xs">
												<SelectValue placeholder={t('transcribe.model')} />
											</SelectTrigger>
											<SelectContent>
												{(asrModelsQuery.data?.items ?? []).map((m) => (
													<SelectItem key={m.id} value={String(m.id)}>
														{m.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									<div className="space-y-2">
										<div className="flex items-center justify-between gap-2">
											<div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
												{t('transcribe.language')}
											</div>
											{!supportsLanguageHint ? (
												<span className="border border-border px-1.5 py-0.5 text-[10px] font-mono uppercase text-muted-foreground">
													{t('transcribe.noHint')}
												</span>
											) : null}
										</div>
										<Select
											value={language}
											onValueChange={(v) => setLanguage(v as any)}
											disabled={transcribeMutation.isPending}
										>
											<SelectTrigger className="w-full rounded-none border-border h-10 font-mono text-xs">
												<SelectValue placeholder={t('transcribe.language')} />
											</SelectTrigger>
											<SelectContent>
												{TRANSCRIPTION_LANGUAGE_OPTIONS.map((opt) => (
													<SelectItem key={opt.value} value={opt.value}>
														{t(`transcribe.languages.${opt.value}`)}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</div>

								<div className="mt-6 flex flex-wrap gap-2">
									<Button
										onClick={() => {
											if (!asrModel) return
											transcribeMutation.mutate({
												mediaId: id,
												model: asrModel,
												language:
													supportsLanguageHint && language !== 'auto'
														? language
														: undefined,
											})
										}}
										disabled={transcribeMutation.isPending || !asrModel}
										className="rounded-none h-10 uppercase tracking-wide text-xs font-bold px-6"
									>
										{transcribeMutation.isPending ? (
											<>
												<Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
												{t('transcribe.starting')}
											</>
										) : (
											t('transcribe.start')
										)}
									</Button>
								</div>

								{transcriptionText ? (
									<div className="mt-8 space-y-2">
										<div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
											{t('transcribe.output')}
										</div>
										<div className="max-h-64 overflow-auto rounded-none border border-border bg-secondary/5 p-4">
											<pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
												{transcriptionText}
											</pre>
										</div>
									</div>
								) : null}
							</div>

							<div className="border border-border bg-background p-6">
								<div className="flex items-start justify-between gap-4 mb-8 border-b border-border pb-6">
									<div className="space-y-1">
										<div className="flex items-center gap-2 text-base font-bold uppercase tracking-wide">
											<Sparkles className="h-4 w-4" />
											{t('optimize.title')}
										</div>
										<div className="text-xs font-mono text-muted-foreground">
											{t('optimize.desc')}
										</div>
									</div>
								</div>

								<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
									<div className="space-y-2">
										<div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
											{t('optimize.model')}
										</div>
										<Select
											value={llmModel}
											onValueChange={(v) => setLlmModel(v)}
											disabled={
												optimizeMutation.isPending ||
												clearOptimizedMutation.isPending
											}
										>
											<SelectTrigger className="w-full rounded-none border-border h-10 font-mono text-xs">
												<SelectValue placeholder={t('optimize.model')} />
											</SelectTrigger>
											<SelectContent>
												{(llmModelsQuery.data?.items ?? []).map((m) => (
													<SelectItem key={m.id} value={String(m.id)}>
														{m.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
										<div className="space-y-2">
											<Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
												Pause ms
											</Label>
											<Input
												type="number"
												value={optParams.pauseThresholdMs}
												onChange={(e) =>
													setOptParams({
														...optParams,
														pauseThresholdMs: Number(e.target.value),
													})
												}
												min={0}
												max={5000}
												className="rounded-none border-border h-10 font-mono text-xs"
											/>
										</div>
										<div className="space-y-2">
											<Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
												Max sentence ms
											</Label>
											<Input
												type="number"
												value={optParams.maxSentenceMs}
												onChange={(e) =>
													setOptParams({
														...optParams,
														maxSentenceMs: Number(e.target.value),
													})
												}
												min={1000}
												max={30000}
												className="rounded-none border-border h-10 font-mono text-xs"
											/>
										</div>
										<div className="space-y-2">
											<Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
												Max chars
											</Label>
											<Input
												type="number"
												value={optParams.maxChars}
												onChange={(e) =>
													setOptParams({
														...optParams,
														maxChars: Number(e.target.value),
													})
												}
												min={10}
												max={160}
												className="rounded-none border-border h-10 font-mono text-xs"
											/>
										</div>
									</div>
								</div>

								<div className="mt-6 flex flex-wrap items-center gap-6">
									<div className="flex items-center gap-2">
										<Switch
											id="optLightCleanup"
											checked={optParams.lightCleanup}
											onCheckedChange={(checked) =>
												setOptParams({ ...optParams, lightCleanup: checked })
											}
										/>
										<Label
											htmlFor="optLightCleanup"
											className="text-xs font-bold uppercase tracking-wide"
										>
											Light cleanup
										</Label>
									</div>
									<div className="flex items-center gap-2">
										<Switch
											id="optTextCorrect"
											checked={optParams.textCorrect}
											onCheckedChange={(checked) =>
												setOptParams({ ...optParams, textCorrect: checked })
											}
										/>
										<Label
											htmlFor="optTextCorrect"
											className="text-xs font-bold uppercase tracking-wide"
										>
											Text correct
										</Label>
									</div>
								</div>

								{!canOptimize ? (
									<div className="mt-4 text-xs font-mono text-muted-foreground border border-dashed border-border p-3">
										{t('optimize.requiresWords')}
									</div>
								) : null}

								<div className="mt-6 flex flex-wrap gap-2">
									<Button
										variant="secondary"
										onClick={() =>
											optimizeMutation.mutate({
												mediaId: id,
												model: llmModel || undefined,
												...optParams,
											})
										}
										disabled={
											optimizeMutation.isPending ||
											clearOptimizedMutation.isPending ||
											!canOptimize
										}
										className="rounded-none h-10 uppercase tracking-wide text-xs font-bold px-6"
									>
										{optimizeMutation.isPending ? (
											<>
												<Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
												{t('optimize.starting')}
											</>
										) : (
											t('optimize.start')
										)}
									</Button>

									{hasOptimized ? (
										<Button
											variant="outline"
											onClick={() =>
												clearOptimizedMutation.mutate({ mediaId: id })
											}
											disabled={
												optimizeMutation.isPending ||
												clearOptimizedMutation.isPending
											}
											className="rounded-none border-border h-10 uppercase tracking-wide text-xs font-bold px-6"
										>
											{clearOptimizedMutation.isPending
												? t('optimize.restoring')
												: t('optimize.restore')}
										</Button>
									) : null}
								</div>
							</div>
						</TabsContent>

						<TabsContent
							value="step2"
							className="mt-8 space-y-6 animate-in fade-in duration-300"
						>
							<div className="border border-border bg-background p-6">
								<div className="flex items-start justify-between gap-4 mb-8 border-b border-border pb-6">
									<div className="space-y-1">
										<div className="flex items-center gap-2 text-base font-bold uppercase tracking-wide">
											<Languages className="h-4 w-4" />
											{t('translate.title')}
										</div>
										<div className="text-xs font-mono text-muted-foreground">
											{t('translate.desc')}
										</div>
									</div>
									<div className="flex items-center gap-3">
										<span className="border border-border px-2 py-1 text-[10px] font-mono uppercase bg-secondary/10">
											{cues.length} CUES
										</span>
										<Button
											variant="secondary"
											onClick={() =>
												translateMutation.mutate({
													mediaId: id,
													model: llmModel || undefined,
													promptId: 'bilingual-zh',
												})
											}
											disabled={
												translateMutation.isPending || !transcriptionText
											}
											className="rounded-none h-9 uppercase tracking-wide text-xs font-bold"
										>
											{translateMutation.isPending ? (
												<>
													<Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
													{t('translate.starting')}
												</>
											) : (
												t('translate.start')
											)}
										</Button>
									</div>
								</div>

								<div className="grid grid-cols-1 gap-4 mb-6">
									<div className="space-y-2">
										<div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
											{t('translate.model')}
										</div>
										<Select
											value={llmModel}
											onValueChange={(v) => setLlmModel(v)}
											disabled={translateMutation.isPending}
										>
											<SelectTrigger className="w-full rounded-none border-border h-10 font-mono text-xs">
												<SelectValue placeholder={t('translate.model')} />
											</SelectTrigger>
											<SelectContent>
												{(llmModelsQuery.data?.items ?? []).map((m) => (
													<SelectItem key={m.id} value={String(m.id)}>
														{m.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										{!llmModel && llmDefaultId ? (
											<div className="text-[10px] font-mono text-muted-foreground">
												{t('translate.defaultModel', { model: llmDefaultId })}
											</div>
										) : null}
									</div>
								</div>

								{translationText ? (
									<div className="border border-border bg-background">
										<div className="flex items-center justify-between border-b border-border bg-secondary/5 px-4 py-3">
											<div className="text-xs font-bold uppercase tracking-wide">
												{t('ui.cues.title')}
											</div>
											<div className="flex items-center gap-2">
												<Button
													variant="ghost"
													size="sm"
													onClick={() => {
														setTranslationEditorOpen((v) => !v)
														setTranslationEditorValue(translationText)
													}}
													className="rounded-none h-8 text-[10px] uppercase font-bold border border-transparent hover:border-border"
												>
													{translationEditorOpen
														? t('ui.translationEditor.hideEditor')
														: t('ui.translationEditor.editVtt')}
												</Button>
											</div>
										</div>
										<div className="max-h-[520px] overflow-auto divide-y divide-border">
											{cues.map((cue, idx) => (
												<div
													key={`${cue.start}-${cue.end}-${idx}`}
													className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-secondary/5 transition-colors group"
												>
													<div className="min-w-0 flex-1">
														<div className="text-[10px] font-mono text-muted-foreground mb-1 border-l-2 border-primary/20 pl-2">{`${cue.start} --> ${cue.end}`}</div>
														<div className="pl-2 space-y-1">
															{cue.lines.map((line, i) => (
																<div
																	key={i}
																	className="text-xs font-mono break-words"
																>
																	{line}
																</div>
															))}
														</div>
													</div>
													<Button
														type="button"
														variant="ghost"
														size="sm"
														onClick={() =>
															deleteCueMutation.mutate({
																mediaId: id,
																index: idx,
															})
														}
														disabled={deleteCueMutation.isPending}
														aria-label={t('ui.cues.deleteAria')}
														title={t('ui.cues.deleteTitle')}
														className="text-muted-foreground hover:text-destructive flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-none h-8 w-8 p-0"
													>
														<Trash2 className="h-4 w-4" />
													</Button>
												</div>
											))}
										</div>

										{translationEditorOpen ? (
											<div className="border-t border-border bg-secondary/5 p-4 space-y-3">
												<Textarea
													value={translationEditorValue}
													onChange={(e) =>
														setTranslationEditorValue(e.target.value)
													}
													className="min-h-[180px] font-mono text-xs rounded-none border-border bg-background"
												/>
												<div className="flex gap-2">
													<Button
														onClick={() => {
															updateTranslationMutation.mutate({
																mediaId: id,
																translation: translationEditorValue,
															})
															setTranslationDraft(translationEditorValue)
														}}
														disabled={updateTranslationMutation.isPending}
														className="rounded-none h-8 uppercase text-xs font-bold"
													>
														{t('ui.actions.save')}
													</Button>
													<Button
														variant="outline"
														onClick={() => {
															setTranslationEditorValue(translationText)
														}}
														className="rounded-none h-8 uppercase text-xs font-bold border-border"
													>
														{t('ui.actions.reset')}
													</Button>
												</div>
											</div>
										) : null}
									</div>
								) : (
									<div className="mt-6 text-sm font-mono text-muted-foreground border border-dashed border-border p-8 text-center uppercase">
										{t('ui.translationEditor.noTranslationYet')}
									</div>
								)}
							</div>
						</TabsContent>

						<TabsContent
							value="step3"
							className="mt-8 space-y-6 animate-in fade-in duration-300"
						>
							<div className="border border-border bg-background p-6">
								<Step3Render
									isRendering={isRenderBusy}
									onStart={(cfg) => {
										setSubtitleConfig(cfg)
										renderMutation.mutate({
											mediaId: id,
											subtitleConfig: cfg,
										})
									}}
									errorMessage={
										renderMutation.isError
											? (renderMutation.error as any)?.message
											: undefined
									}
									translationAvailable={Boolean(translationText)}
									config={subtitleConfig}
									onConfigChange={setSubtitleConfig}
									mediaDuration={previewDuration}
									currentPreviewTime={previewCurrentTime}
									onPreviewSeek={(time) => {
										const el = previewVideoRef.current
										if (!el) return
										el.currentTime = Math.max(0, time)
										el.play?.()
									}}
									cloudStatus={
										renderStatusQuery.data
											? {
													status: (renderStatusQuery.data as any)?.status,
													phase: (renderStatusQuery.data as any)?.phase,
													progress:
														(renderStatusQuery.data as any)?.progress ?? null,
													jobId: renderJobId ?? null,
												}
											: null
									}
								/>
							</div>
						</TabsContent>

						<TabsContent
							value="step4"
							className="mt-8 space-y-6 animate-in fade-in duration-300"
						>
							<div className="border border-border bg-background p-6">
								<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8 border-b border-border pb-6">
									<div className="space-y-1">
										<div className="flex items-center gap-2 text-base font-bold uppercase tracking-wide">
											<Download className="h-4 w-4" />
											Export
										</div>
										<div className="text-xs font-mono text-muted-foreground">
											Download the rendered MP4.
										</div>
									</div>
									{hasRenderedVideo ? (
										<span className="border border-emerald-500/50 text-emerald-600 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider">
											Ready
										</span>
									) : (
										<span className="border border-border text-muted-foreground px-2 py-1 text-[10px] font-bold uppercase tracking-wider">
											Not Rendered
										</span>
									)}
								</div>

								<div className="mt-6 grid grid-cols-1 gap-3">
									{hasRenderedVideo ? (
										<Button
											asChild
											size="lg"
											className="rounded-none h-12 uppercase tracking-wide font-bold"
										>
											<a
												href={`/api/media/${id}/rendered?download=1${previewVersion ? `&v=${previewVersion}` : ''}`}
											>
												<Video className="mr-2 h-4 w-4" />
												Download Video
											</a>
										</Button>
									) : (
										<Button
											size="lg"
											className="rounded-none h-12 uppercase tracking-wide font-bold"
											disabled
										>
											<Video className="mr-2 h-4 w-4" />
											Download Video
										</Button>
									)}
								</div>

								{!hasRenderedVideo ? (
									<div className="mt-4 text-xs font-mono text-muted-foreground border-l-2 border-primary/50 pl-3">
										Render the video first in the Render step.
									</div>
								) : null}
							</div>
						</TabsContent>
					</Tabs>
				</div>
			</div>
		</div>
	)
}

function isStepId(value: string): value is StepId {
	return (
		value === 'step1' ||
		value === 'step2' ||
		value === 'step3' ||
		value === 'step4'
	)
}

function useStateOrDefault<T extends string>(
	storageKey: string,
	defaultValue: T,
	validate?: (value: string) => value is T,
) {
	const [value, setValue] = React.useState<T>(() => defaultValue)

	React.useEffect(() => {
		if (typeof window === 'undefined') return
		try {
			const saved = window.localStorage.getItem(storageKey)
			if (!saved) return
			if (validate && !validate(saved)) return
			setValue(saved as T)
		} catch {}
	}, [storageKey, validate])

	React.useEffect(() => {
		if (typeof window === 'undefined') return
		try {
			if (!value) return
			window.localStorage.setItem(storageKey, value)
		} catch {}
	}, [storageKey, value])

	React.useEffect(() => {
		setValue((prev) => (prev ? prev : defaultValue))
	}, [defaultValue])

	return [value, setValue] as const
}

function useStateOrDefaultJson<T>(storageKey: string, defaultValue: T) {
	const [value, setValue] = React.useState<T>(() => defaultValue)

	React.useEffect(() => {
		if (typeof window === 'undefined') return
		try {
			const saved = window.localStorage.getItem(storageKey)
			if (!saved) return
			const parsed = JSON.parse(saved) as T
			if (parsed) setValue(parsed)
		} catch {}
	}, [storageKey])

	React.useEffect(() => {
		if (typeof window === 'undefined') return
		try {
			window.localStorage.setItem(storageKey, JSON.stringify(value))
		} catch {}
	}, [storageKey, value])

	return [value, setValue] as const
}
