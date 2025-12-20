import * as React from "react"
import { Link, createFileRoute, notFound, redirect } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, FileText, Languages, Loader2, Sparkles, Trash2, Video } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select"
import { Switch } from "~/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { Textarea } from "~/components/ui/textarea"
import { TRANSCRIPTION_LANGUAGE_OPTIONS, DEFAULT_TRANSCRIPTION_LANGUAGE } from "~/lib/subtitle/config/languages"
import { useEnhancedMutation } from "~/lib/hooks/useEnhancedMutation"
import { CloudJobProgress } from "~/components/business/jobs/cloud-job-progress"
import { useCloudJob } from "~/lib/hooks/useCloudJob"
import { parseVttCues } from "~/lib/subtitle/utils/vtt"
import { DEFAULT_SUBTITLE_RENDER_CONFIG } from "~/lib/subtitle/config/presets"
import type { SubtitleRenderConfig } from "~/lib/subtitle/types"
import { PreviewPane } from "~/components/business/media/subtitles/PreviewPane"
import { Step3Render } from "~/components/business/media/subtitles/Step3Render"

import { queryOrpcNext } from "../integrations/orpc/next-client"
import { useTranslations } from "../integrations/i18n"

const TERMINAL_STATUSES = new Set(["completed", "failed", "canceled"])

type StepId = "step1" | "step2" | "step3" | "step4"

type OptimizeParams = {
	pauseThresholdMs: number
	maxSentenceMs: number
	maxChars: number
	lightCleanup: boolean
	textCorrect: boolean
}

export const Route = createFileRoute("/media/$id/subtitles")({
	loader: async ({ context, params, location }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpcNext.auth.me.queryOptions(),
		)
		if (!me.user) {
			const next = location.href
			throw redirect({ to: "/login", search: { next } })
		}

		const item = await context.queryClient.ensureQueryData(
			queryOrpcNext.media.byId.queryOptions({ input: { id: params.id } }),
		)
		if (!item) throw notFound()

		await Promise.all([
			context.queryClient.prefetchQuery(
				queryOrpcNext.ai.listModels.queryOptions({
					input: { kind: "asr", enabledOnly: true },
				}),
			),
			context.queryClient.prefetchQuery(
				queryOrpcNext.ai.getDefaultModel.queryOptions({
					input: { kind: "asr" },
				}),
			),
			context.queryClient.prefetchQuery(
				queryOrpcNext.ai.listModels.queryOptions({
					input: { kind: "llm", enabledOnly: true },
				}),
			),
			context.queryClient.prefetchQuery(
				queryOrpcNext.ai.getDefaultModel.queryOptions({
					input: { kind: "llm" },
				}),
			),
		])
	},
	component: SubtitlesRoute,
})

function SubtitlesRoute() {
	const t = useTranslations("Subtitles")
	const qc = useQueryClient()

	const { id } = Route.useParams()

	const mediaQuery = useQuery({
		...queryOrpcNext.media.byId.queryOptions({ input: { id } }),
		refetchInterval: (q) => {
			const media = q.state.data as any
			const hasTranscription = Boolean(
				media?.optimizedTranscription || media?.transcription,
			)
			return hasTranscription ? false : 3000
		},
	})

	const asrModelsQuery = useQuery(
		queryOrpcNext.ai.listModels.queryOptions({
			input: { kind: "asr", enabledOnly: true },
		}),
	)
	const asrDefaultQuery = useQuery(
		queryOrpcNext.ai.getDefaultModel.queryOptions({ input: { kind: "asr" } }),
	)
	const llmModelsQuery = useQuery(
		queryOrpcNext.ai.listModels.queryOptions({
			input: { kind: "llm", enabledOnly: true },
		}),
	)
	const llmDefaultQuery = useQuery(
		queryOrpcNext.ai.getDefaultModel.queryOptions({ input: { kind: "llm" } }),
	)

	const asrDefaultId = String(asrDefaultQuery.data?.model?.id ?? "")
	const llmDefaultId = String(llmDefaultQuery.data?.model?.id ?? "")

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
		"step1",
		isStepId,
	)

	const [subtitleConfig, setSubtitleConfig] =
		useStateOrDefaultJson<SubtitleRenderConfig>(
			`subtitleRenderConfig:${id}`,
			{ ...DEFAULT_SUBTITLE_RENDER_CONFIG },
		)

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

	const [previewVersion, setPreviewVersion] = React.useState<number | undefined>(
		undefined,
	)

	const [previewDuration, setPreviewDuration] = React.useState(0)
	const [previewCurrentTime, setPreviewCurrentTime] = React.useState(0)
	const previewVideoRef = React.useRef<HTMLVideoElement | null>(null)

	const { jobId: asrJobId, setJobId: setAsrJobId, statusQuery: asrStatusQuery } =
		useCloudJob<any, Error>({
			storageKey: `subtitleAsrJob:${id}`,
			createQueryOptions: (jobId) => ({
				...queryOrpcNext.subtitle.getAsrStatus.queryOptions({
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
					queryKey: queryOrpcNext.media.byId.queryKey({ input: { id } }),
				})
				await qc.invalidateQueries({ queryKey: queryOrpcNext.media.list.key() })
			},
		})

	const transcribeMutation = useEnhancedMutation(
		queryOrpcNext.subtitle.transcribe.mutationOptions({
			onSuccess: (data) => {
				setAsrJobId(data.jobId)
			},
		}),
		{
			successToast: t("transcribe.started"),
			errorToast: ({ error }) => (error instanceof Error ? error.message : "Failed"),
		},
	)

	const translateMutation = useEnhancedMutation(
		queryOrpcNext.subtitle.translate.mutationOptions({
			onSuccess: async (data) => {
				setTranslationDraft(data.translation)
				await qc.invalidateQueries({
					queryKey: queryOrpcNext.media.byId.queryKey({ input: { id } }),
				})
			},
		}),
		{
			successToast: t("translate.completed"),
			errorToast: ({ error }) => (error instanceof Error ? error.message : "Failed"),
		},
	)

	const deleteCueMutation = useEnhancedMutation(
		queryOrpcNext.subtitle.deleteTranslationCue.mutationOptions({
			onSuccess: (data) => {
				setTranslationDraft(data.translation)
			},
		}),
		{
			errorToast: ({ error }) => (error instanceof Error ? error.message : "Failed"),
		},
	)

	const updateTranslationMutation = useEnhancedMutation(
		queryOrpcNext.subtitle.updateTranslation.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpcNext.media.byId.queryKey({ input: { id } }),
				})
			},
		}),
		{
			successToast: "Saved",
			errorToast: ({ error }) => (error instanceof Error ? error.message : "Failed"),
		},
	)

	const optimizeMutation = useEnhancedMutation(
		queryOrpcNext.subtitle.optimizeTranscription.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpcNext.media.byId.queryKey({ input: { id } }),
				})
			},
		}),
		{
			successToast: t("optimize.completed"),
			errorToast: ({ error }) => (error instanceof Error ? error.message : "Failed"),
		},
	)

	const clearOptimizedMutation = useEnhancedMutation(
		queryOrpcNext.subtitle.clearOptimizedTranscription.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpcNext.media.byId.queryKey({ input: { id } }),
				})
			},
		}),
		{
			successToast: t("optimize.restored"),
			errorToast: ({ error }) => (error instanceof Error ? error.message : "Failed"),
		},
	)

	const {
		jobId: renderJobId,
		setJobId: setRenderJobId,
		statusQuery: renderStatusQuery,
	} = useCloudJob<any, Error>({
		storageKey: `subtitleRenderJob:${id}`,
		createQueryOptions: (jobId) => ({
			...queryOrpcNext.subtitle.getRenderStatus.queryOptions({
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
			setActiveStep("step4")
			await qc.invalidateQueries({
				queryKey: queryOrpcNext.media.byId.queryKey({ input: { id } }),
			})
			await qc.invalidateQueries({ queryKey: queryOrpcNext.media.list.key() })
		},
	})

	const renderMutation = useEnhancedMutation(
		queryOrpcNext.subtitle.startCloudRender.mutationOptions({
			onSuccess: (data) => {
				setRenderJobId(data.jobId)
			},
		}),
		{
			successToast: t("render.started"),
			errorToast: ({ error }) => (error instanceof Error ? error.message : "Failed"),
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
	const [translationEditorValue, setTranslationEditorValue] =
		React.useState("")

	React.useEffect(() => {
		const media = mediaQuery.data as any
		const nextTranslation = String(media?.translation ?? "")
		if (!translationDraft && nextTranslation) {
			setTranslationDraft(nextTranslation)
		}
	}, [mediaQuery.data, translationDraft])

	if (mediaQuery.isLoading) {
		return (
			<div className="min-h-screen bg-background px-4 py-10 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-5xl text-sm text-muted-foreground">
					<Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
					Loading…
				</div>
			</div>
		)
	}

	if (mediaQuery.isError) {
		return (
			<div className="min-h-screen bg-background px-4 py-10 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-5xl space-y-4">
					<div className="text-sm text-muted-foreground">Failed to load media.</div>
					<Button variant="secondary" asChild>
						<Link to="/media/$id" params={{ id }}>
							{t("back")}
						</Link>
					</Button>
				</div>
			</div>
		)
	}

	const media = mediaQuery.data
	if (!media) {
		return (
			<div className="min-h-screen bg-background px-4 py-10 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-5xl text-sm text-muted-foreground">Not found.</div>
			</div>
		)
	}

	const transcriptionWords = (media as any)?.transcriptionWords
	const canOptimize =
		Array.isArray(transcriptionWords) && transcriptionWords.length > 0
	const hasOptimized = Boolean((media as any)?.optimizedTranscription)
	const hasRenderedVideo = Boolean((media as any)?.videoWithSubtitlesPath)

	const translationText = translationDraft ?? String((media as any)?.translation ?? "")
	const transcriptionText = String(
		(media as any)?.optimizedTranscription || (media as any)?.transcription || "",
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
		<div className="min-h-screen bg-background selection:bg-primary/10 selection:text-primary">
			<div className="px-4 py-10 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-5xl space-y-8">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="space-y-1">
							<h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
							<div className="text-sm text-muted-foreground">{media.title}</div>
						</div>
						<Button variant="secondary" asChild>
							<Link to="/media/$id" params={{ id }}>
								{t("back")}
							</Link>
						</Button>
					</div>

					<div className="glass rounded-2xl p-6">
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

					<div className="glass rounded-2xl p-6">
						<Tabs value={activeStep} onValueChange={(v) => setActiveStep(v as StepId)}>
							<TabsList className="w-full">
								<TabsTrigger value="step1" className="gap-2">
									<FileText className="h-4 w-4" />
									Transcribe
								</TabsTrigger>
								<TabsTrigger value="step2" className="gap-2">
									<Languages className="h-4 w-4" />
									Translate
								</TabsTrigger>
								<TabsTrigger value="step3" className="gap-2">
									<Video className="h-4 w-4" />
									Render
								</TabsTrigger>
								<TabsTrigger value="step4" className="gap-2">
									<Download className="h-4 w-4" />
									Export
								</TabsTrigger>
							</TabsList>

							<TabsContent value="step1" className="mt-6 space-y-6">
								<div className="rounded-xl border bg-card p-5">
									<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
										<div className="space-y-1">
											<div className="flex items-center gap-2 text-lg font-semibold">
												<FileText className="h-5 w-5" />
												{t("transcribe.title")}
											</div>
											<div className="text-sm text-muted-foreground">
												{t("transcribe.desc")}
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

									<div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
										<div className="space-y-2">
											<div className="text-xs font-medium text-muted-foreground">
												{t("transcribe.model")}
											</div>
											<Select
												value={asrModel}
												onValueChange={(v) => setAsrModel(v)}
												disabled={transcribeMutation.isPending}
											>
												<SelectTrigger className="w-full">
													<SelectValue placeholder={t("transcribe.model")} />
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
												<div className="text-xs font-medium text-muted-foreground">
													{t("transcribe.language")}
												</div>
												{!supportsLanguageHint ? (
													<Badge variant="secondary" className="text-[10px]">
														No hint
													</Badge>
												) : null}
											</div>
											<Select
												value={language}
												onValueChange={(v) => setLanguage(v as any)}
												disabled={transcribeMutation.isPending}
											>
												<SelectTrigger className="w-full">
													<SelectValue placeholder={t("transcribe.language")} />
												</SelectTrigger>
												<SelectContent>
													{TRANSCRIPTION_LANGUAGE_OPTIONS.map((opt) => (
														<SelectItem key={opt.value} value={opt.value}>
															{opt.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									</div>

									<div className="mt-4 flex flex-wrap gap-2">
										<Button
											onClick={() => {
												if (!asrModel) return
												transcribeMutation.mutate({
													mediaId: id,
													model: asrModel,
													language:
														supportsLanguageHint && language !== "auto"
															? language
															: undefined,
												})
											}}
											disabled={transcribeMutation.isPending || !asrModel}
										>
											{transcribeMutation.isPending ? (
												<>
													<Loader2 className="mr-2 h-4 w-4 animate-spin" />
													{t("transcribe.starting")}
												</>
											) : (
												t("transcribe.start")
											)}
										</Button>
									</div>

									{transcriptionText ? (
										<div className="mt-6 space-y-2">
											<div className="text-xs font-medium text-muted-foreground">
												{t("transcribe.output")}
											</div>
											<pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-secondary/30 p-4 text-sm">
												{transcriptionText}
											</pre>
										</div>
									) : null}
								</div>

								<div className="rounded-xl border bg-card p-5">
									<div className="flex items-start justify-between gap-4">
										<div className="space-y-1">
											<div className="flex items-center gap-2 text-lg font-semibold">
												<Sparkles className="h-5 w-5" />
												{t("optimize.title")}
											</div>
											<div className="text-sm text-muted-foreground">
												{t("optimize.desc")}
											</div>
										</div>
									</div>

									<div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
										<div className="space-y-2">
											<div className="text-xs font-medium text-muted-foreground">
												{t("optimize.model")}
											</div>
											<Select
												value={llmModel}
												onValueChange={(v) => setLlmModel(v)}
												disabled={
													optimizeMutation.isPending ||
													clearOptimizedMutation.isPending
												}
											>
												<SelectTrigger className="w-full">
													<SelectValue placeholder={t("optimize.model")} />
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

										<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
											<div className="space-y-1.5">
												<Label className="text-xs text-muted-foreground">
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
												/>
											</div>
											<div className="space-y-1.5">
												<Label className="text-xs text-muted-foreground">
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
												/>
											</div>
											<div className="space-y-1.5">
												<Label className="text-xs text-muted-foreground">
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
												/>
											</div>
										</div>
									</div>

									<div className="mt-4 flex flex-wrap items-center gap-6">
										<div className="flex items-center gap-2">
											<Switch
												id="optLightCleanup"
												checked={optParams.lightCleanup}
												onCheckedChange={(checked) =>
													setOptParams({ ...optParams, lightCleanup: checked })
												}
											/>
											<Label htmlFor="optLightCleanup" className="text-sm">
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
											<Label htmlFor="optTextCorrect" className="text-sm">
												Text correct
											</Label>
										</div>
									</div>

									{!canOptimize ? (
										<div className="mt-3 text-sm text-muted-foreground">
											{t("optimize.requiresWords")}
										</div>
									) : null}

									<div className="mt-4 flex flex-wrap gap-2">
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
										>
											{optimizeMutation.isPending ? (
												<>
													<Loader2 className="mr-2 h-4 w-4 animate-spin" />
													{t("optimize.starting")}
												</>
											) : (
												t("optimize.start")
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
											>
												{clearOptimizedMutation.isPending
													? t("optimize.restoring")
													: t("optimize.restore")}
											</Button>
										) : null}
									</div>
								</div>
							</TabsContent>

							<TabsContent value="step2" className="mt-6 space-y-6">
								<div className="rounded-xl border bg-card p-5">
									<div className="flex items-start justify-between gap-4">
										<div className="space-y-1">
											<div className="flex items-center gap-2 text-lg font-semibold">
												<Languages className="h-5 w-5" />
												{t("translate.title")}
											</div>
											<div className="text-sm text-muted-foreground">
												{t("translate.desc")}
											</div>
										</div>
										<div className="flex items-center gap-2">
											<Badge variant="secondary" className="text-xs">
												{cues.length} cues
											</Badge>
											<Button
												variant="secondary"
												onClick={() =>
													translateMutation.mutate({
														mediaId: id,
														model: llmModel || undefined,
														promptId: "bilingual-zh",
													})
												}
												disabled={translateMutation.isPending || !transcriptionText}
											>
												{translateMutation.isPending ? (
													<>
														<Loader2 className="mr-2 h-4 w-4 animate-spin" />
														{t("translate.starting")}
													</>
												) : (
													t("translate.start")
												)}
											</Button>
										</div>
									</div>

									<div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
										<div className="space-y-2">
											<div className="text-xs font-medium text-muted-foreground">
												{t("translate.model")}
											</div>
											<Select
												value={llmModel}
												onValueChange={(v) => setLlmModel(v)}
												disabled={translateMutation.isPending}
											>
												<SelectTrigger className="w-full">
													<SelectValue placeholder={t("translate.model")} />
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
												<div className="text-xs text-muted-foreground">
													{t("translate.defaultModel", { model: llmDefaultId })}
												</div>
											) : null}
										</div>

										<div className="space-y-2">
											<div className="text-xs font-medium text-muted-foreground">
												Download
											</div>
											<Button asChild variant="outline" className="w-full">
												<a href={`/api/media/${id}/subtitles`} target="_blank" rel="noreferrer">
													<Download className="mr-2 h-4 w-4" />
													VTT
												</a>
											</Button>
										</div>
									</div>

									{translationText ? (
										<div className="mt-6 overflow-hidden rounded-xl border bg-background">
											<div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
												<div className="text-sm font-semibold">Cues</div>
												<div className="flex items-center gap-2">
													<Button
														variant="ghost"
														size="sm"
														onClick={() => {
															setTranslationEditorOpen((v) => !v)
															setTranslationEditorValue(translationText)
														}}
													>
														{translationEditorOpen ? "Hide editor" : "Edit VTT"}
													</Button>
												</div>
											</div>
											<div className="max-h-[520px] overflow-auto divide-y">
												{cues.map((cue, idx) => (
													<div
														key={`${cue.start}-${cue.end}-${idx}`}
														className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
													>
														<div className="min-w-0 flex-1">
															<div className="text-xs font-mono text-muted-foreground">{`${cue.start} --> ${cue.end}`}</div>
															<div className="mt-2 space-y-1">
																{cue.lines.map((line, i) => (
																	<div key={i} className="text-sm font-mono break-words">
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
																deleteCueMutation.mutate({ mediaId: id, index: idx })
															}
															disabled={deleteCueMutation.isPending}
															aria-label="Delete cue"
															title="Delete this subtitle cue"
															className="text-destructive hover:text-destructive flex-shrink-0"
														>
															<Trash2 className="h-4 w-4" />
														</Button>
													</div>
												))}
											</div>

											{translationEditorOpen ? (
												<div className="border-t bg-muted/20 p-4 space-y-3">
													<Textarea
														value={translationEditorValue}
														onChange={(e) => setTranslationEditorValue(e.target.value)}
														className="min-h-[180px] font-mono text-xs"
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
														>
															Save
														</Button>
														<Button
															variant="outline"
															onClick={() => {
																setTranslationEditorValue(translationText)
															}}
														>
															Reset
														</Button>
													</div>
												</div>
											) : null}
										</div>
									) : (
										<div className="mt-6 text-sm text-muted-foreground">
											No translation yet. Start translation to generate cues.
										</div>
									)}
								</div>
							</TabsContent>

							<TabsContent value="step3" className="mt-6 space-y-6">
								<div className="rounded-xl border bg-card p-5">
									<Step3Render
										isRendering={isRenderBusy}
										onStart={(cfg) => {
											setSubtitleConfig(cfg)
											renderMutation.mutate({ mediaId: id, subtitleConfig: cfg })
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
														progress: (renderStatusQuery.data as any)?.progress ?? null,
														jobId: renderJobId ?? null,
													}
												: null
										}
									/>
								</div>
							</TabsContent>

							<TabsContent value="step4" className="mt-6 space-y-6">
								<div className="rounded-xl border bg-card p-5">
									<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
										<div className="space-y-1">
											<div className="flex items-center gap-2 text-lg font-semibold">
												<Download className="h-5 w-5" />
												Export
											</div>
											<div className="text-sm text-muted-foreground">
												Download the rendered MP4 and the VTT.
											</div>
										</div>
										{hasRenderedVideo ? (
											<Badge variant="secondary">Ready</Badge>
										) : (
											<Badge variant="secondary">Not rendered</Badge>
										)}
									</div>

									<div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
										{hasRenderedVideo ? (
											<Button asChild size="lg" className="h-11">
												<a
													href={`/api/media/${id}/rendered?download=1${previewVersion ? `&v=${previewVersion}` : ""}`}
												>
													<Video className="mr-2 h-4 w-4" />
													Download Video
												</a>
											</Button>
										) : (
											<Button size="lg" className="h-11" disabled>
												<Video className="mr-2 h-4 w-4" />
												Download Video
											</Button>
										)}
										{translationText ? (
											<Button asChild variant="outline" size="lg" className="h-11">
												<a href={`/api/media/${id}/subtitles?download=1`}>
													<FileText className="mr-2 h-4 w-4" />
													Download VTT
												</a>
											</Button>
										) : (
											<Button variant="outline" size="lg" className="h-11" disabled>
												<FileText className="mr-2 h-4 w-4" />
												Download VTT
											</Button>
										)}
									</div>

									{!hasRenderedVideo ? (
										<div className="mt-4 text-sm text-muted-foreground">
											Render the video first in the Render step.
										</div>
									) : null}
								</div>
							</TabsContent>
						</Tabs>
					</div>
				</div>
			</div>
		</div>
	)
}

function isStepId(value: string): value is StepId {
	return value === "step1" || value === "step2" || value === "step3" || value === "step4"
}

function useStateOrDefault<T extends string>(
	storageKey: string,
	defaultValue: T,
	validate?: (value: string) => value is T,
) {
	const [value, setValue] = React.useState<T>(() => defaultValue)

	React.useEffect(() => {
		if (typeof window === "undefined") return
		try {
			const saved = window.localStorage.getItem(storageKey)
			if (!saved) return
			if (validate && !validate(saved)) return
			setValue(saved as T)
		} catch {}
	}, [storageKey, validate])

	React.useEffect(() => {
		if (typeof window === "undefined") return
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
		if (typeof window === "undefined") return
		try {
			const saved = window.localStorage.getItem(storageKey)
			if (!saved) return
			const parsed = JSON.parse(saved) as T
			if (parsed) setValue(parsed)
		} catch {}
	}, [storageKey])

	React.useEffect(() => {
		if (typeof window === "undefined") return
		try {
			window.localStorage.setItem(storageKey, JSON.stringify(value))
		} catch {}
	}, [storageKey, value])

	return [value, setValue] as const
}
