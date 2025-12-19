import * as React from "react"
import { Link, createFileRoute, notFound, redirect } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { FileText, Languages, Loader2, Sparkles, Video } from "lucide-react"

import { Button } from "~/components/ui/button"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select"
import { TRANSCRIPTION_LANGUAGE_OPTIONS, DEFAULT_TRANSCRIPTION_LANGUAGE } from "~/lib/subtitle/config/languages"
import { useEnhancedMutation } from "~/lib/hooks/useEnhancedMutation"
import { CloudJobProgress } from "~/components/business/jobs/cloud-job-progress"

import { queryOrpcNext } from "../integrations/orpc/next-client"
import { useTranslations } from "../integrations/i18n"

const TERMINAL_STATUSES = new Set(["completed", "failed", "canceled"])

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

	const mediaQuery = useQuery(queryOrpcNext.media.byId.queryOptions({ input: { id } }))

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

	const [asrModel, setAsrModel] = useStateOrDefault(asrDefaultId)
	const [language, setLanguage] = useStateOrDefault(DEFAULT_TRANSCRIPTION_LANGUAGE)
	const [llmModel, setLlmModel] = useStateOrDefault(llmDefaultId)

	const [asrJobId, setAsrJobId] = React.useState<string | null>(null)
	const [renderJobId, setRenderJobId] = React.useState<string | null>(null)

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

	const asrStatusQuery = useQuery({
		...queryOrpcNext.subtitle.getAsrStatus.queryOptions({
			input: { jobId: asrJobId ?? "" },
		}),
		enabled: Boolean(asrJobId),
		refetchInterval: (q) => {
			const status = (q.state.data as any)?.status
			if (!status) return 1500
			return TERMINAL_STATUSES.has(status) ? false : 1500
		},
	})

	const translateMutation = useEnhancedMutation(
		queryOrpcNext.subtitle.translate.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({ queryKey: queryOrpcNext.media.byId.queryKey({ input: { id } }) })
			},
		}),
		{
			successToast: t("translate.completed"),
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

	const renderStatusQuery = useQuery({
		...queryOrpcNext.subtitle.getRenderStatus.queryOptions({
			input: { jobId: renderJobId ?? "" },
		}),
		enabled: Boolean(renderJobId),
		refetchInterval: (q) => {
			const status = (q.state.data as any)?.status
			if (!status) return 1500
			return TERMINAL_STATUSES.has(status) ? false : 1500
		},
	})

	React.useEffect(() => {
		const status = (asrStatusQuery.data as any)?.status
		if (!status) return
		if (!TERMINAL_STATUSES.has(status)) return
		qc.invalidateQueries({ queryKey: queryOrpcNext.media.byId.queryKey({ input: { id } }) })
		qc.invalidateQueries({ queryKey: queryOrpcNext.media.list.key() })
	}, [asrStatusQuery.data, id, qc])

	React.useEffect(() => {
		const status = (renderStatusQuery.data as any)?.status
		if (!status) return
		if (!TERMINAL_STATUSES.has(status)) return
		qc.invalidateQueries({ queryKey: queryOrpcNext.media.byId.queryKey({ input: { id } }) })
		qc.invalidateQueries({ queryKey: queryOrpcNext.media.list.key() })
	}, [id, qc, renderStatusQuery.data])

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
						<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
							<div className="space-y-1">
								<div className="flex items-center gap-2 text-lg font-semibold">
									<FileText className="h-5 w-5" />
									{t("transcribe.title")}
								</div>
								<div className="text-sm text-muted-foreground">{t("transcribe.desc")}</div>
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
								<div className="text-xs font-medium text-muted-foreground">{t("transcribe.model")}</div>
								<Select
									value={asrModel}
									onValueChange={setAsrModel}
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
								<div className="text-xs font-medium text-muted-foreground">{t("transcribe.language")}</div>
								<Select
									value={language}
									onValueChange={setLanguage}
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
										language: language === "auto" ? undefined : language,
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

						{media.transcription ? (
							<div className="mt-6 space-y-2">
								<div className="text-xs font-medium text-muted-foreground">{t("transcribe.output")}</div>
								<pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-secondary/30 p-4 text-sm">
									{media.optimizedTranscription || media.transcription}
								</pre>
							</div>
						) : null}
					</div>

					<div className="glass rounded-2xl p-6">
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

						<div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<div className="text-xs font-medium text-muted-foreground">
									{t("optimize.model")}
								</div>
								<Select
									value={llmModel}
									onValueChange={setLlmModel}
									disabled={
										optimizeMutation.isPending || clearOptimizedMutation.isPending
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
									optimizeMutation.mutate({ mediaId: id, model: llmModel || undefined })
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
									onClick={() => clearOptimizedMutation.mutate({ mediaId: id })}
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

					<div className="glass rounded-2xl p-6">
						<div className="flex items-start justify-between gap-4">
							<div className="space-y-1">
								<div className="flex items-center gap-2 text-lg font-semibold">
									<Languages className="h-5 w-5" />
									{t("translate.title")}
								</div>
								<div className="text-sm text-muted-foreground">{t("translate.desc")}</div>
							</div>
						</div>

						<div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<div className="text-xs font-medium text-muted-foreground">{t("translate.model")}</div>
								<Select value={llmModel} onValueChange={setLlmModel} disabled={translateMutation.isPending}>
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
						</div>

						<div className="mt-4 flex flex-wrap gap-2">
							<Button
								variant="secondary"
								onClick={() => translateMutation.mutate({ mediaId: id, model: llmModel || undefined })}
								disabled={translateMutation.isPending}
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

						{media.translation ? (
							<div className="mt-6 space-y-2">
								<div className="text-xs font-medium text-muted-foreground">{t("translate.output")}</div>
								<pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-secondary/30 p-4 text-sm">
									{media.translation}
								</pre>
							</div>
						) : null}
					</div>

					<div className="glass rounded-2xl p-6">
						<div className="flex items-center justify-between gap-4">
							<div className="space-y-1">
								<div className="flex items-center gap-2 text-lg font-semibold">
									<Video className="h-5 w-5" />
									{t("render.title")}
								</div>
								<div className="text-sm text-muted-foreground">{t("render.desc")}</div>
							</div>
							{renderJobId ? (
								<CloudJobProgress
									status={(renderStatusQuery.data as any)?.status}
									phase={(renderStatusQuery.data as any)?.phase}
									progress={(renderStatusQuery.data as any)?.progress ?? null}
									jobId={renderJobId}
									showIds={false}
								/>
							) : null}
						</div>

						<div className="mt-4 flex flex-wrap gap-2">
							<Button
								onClick={() => renderMutation.mutate({ mediaId: id })}
								disabled={renderMutation.isPending}
							>
								{renderMutation.isPending ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										{t("render.starting")}
									</>
								) : (
									t("render.start")
								)}
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

function useStateOrDefault(defaultValue: string) {
	const [value, setValue] = React.useState(defaultValue)
	React.useEffect(() => {
		if (!value && defaultValue) setValue(defaultValue)
	}, [defaultValue, value])
	return [value, setValue] as const
}
