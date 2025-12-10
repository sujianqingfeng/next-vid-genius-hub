'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
	AlertCircle,
	FileText,
	Languages,
	Loader2,
	Play,
	Video,
} from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { PageHeader } from '~/components/business/layout/page-header'
import { WorkspacePageShell } from '~/components/business/layout/workspace-page-shell'
import { Step1Transcribe } from '~/components/business/media/subtitles/Step1Transcribe'
import { Step2Translate } from '~/components/business/media/subtitles/Step2Translate'
import { Step3Render } from '~/components/business/media/subtitles/Step3Render'
import { Step4Preview } from '~/components/business/media/subtitles/Step4Preview'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '~/components/ui/tabs'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { logger } from '~/lib/logger'
import { useSubtitleWorkflow } from '~/lib/subtitle/hooks/useSubtitleWorkflow'
import { useSubtitleActions } from '~/lib/subtitle/hooks/useSubtitleActions'
import type { SubtitleStepId } from '~/lib/subtitle/types'
import { PreviewPane } from '~/components/business/media/subtitles/PreviewPane'
import { DEFAULT_TRANSCRIPTION_LANGUAGE } from '~/lib/subtitle/config/languages'

export default function SubtitlesPage() {
	const params = useParams()
	const mediaId = params.id as string
	const previewVideoRef = useRef<HTMLVideoElement | null>(null)
	const [previewDuration, setPreviewDuration] = useState(0)
	const [previewCurrentTime, setPreviewCurrentTime] = useState(0)

	// 使用工作流 Hook 管理状态
	const {
		workflowState,
		activeStep,
		hasRenderedVideo,
		subtitleConfig,
		setActiveStep,
		updateWorkflowState,
		media,
		isLoading,
		isError,
		error,
	} = useSubtitleWorkflow({
		mediaId,
		onStepChange: (step) => {
			logger.info('media', `Step changed to: ${step}`)
		}
	})
	const mediaDuration =
		typeof media === 'object' && media && 'duration' in media
			? (media as { duration?: number }).duration
			: undefined

	useEffect(() => {
		if (typeof mediaDuration === 'number' && mediaDuration > 0) {
			setPreviewDuration((prev) => (prev > 0 ? prev : mediaDuration ?? 0))
		}
	}, [mediaDuration])
	const {
		selectedModel,
		selectedAIModel,
		selectedLanguage,
		cloudStatusQuery,
		previewCloudStatus,
		previewVersion,
		startCloudRenderMutation,
		transcribeMutation,
		optimizeMutation,
		clearOptimizedMutation,
		translateMutation,
		handleStartTranscription,
		handleStartTranslation,
		handleDeleteCue,
		handleRenderStart,
		handleConfigChange,
	} = useSubtitleActions({
		mediaId,
		activeStep,
		workflowState,
		updateWorkflowState,
		setActiveStep,
	})
	const renderStatusValue =
		(cloudStatusQuery.data as { status?: string } | undefined)?.status ?? ''
	const renderActiveStatuses = ['queued', 'preparing', 'running', 'uploading'] as const
	const isRenderBusy =
		startCloudRenderMutation.isPending ||
		renderActiveStatuses.includes(
			renderStatusValue as (typeof renderActiveStatuses)[number],
		)

	const handleDurationChange = useCallback((duration: number) => {
		if (Number.isFinite(duration) && duration > 0) {
			setPreviewDuration(duration)
		}
	}, [])

	const handleCurrentTimeChange = useCallback((time: number) => {
		if (Number.isFinite(time)) {
			setPreviewCurrentTime(time)
		}
	}, [])

	const handleVideoRefChange = useCallback((ref: HTMLVideoElement | null) => {
		previewVideoRef.current = ref
	}, [])

	const handlePlayPreview = useCallback((time: number) => {
		if (previewVideoRef.current) {
			previewVideoRef.current.currentTime = Math.max(0, time)
			previewVideoRef.current.play?.()
		}
	}, [])

	// 加载状态
	if (isLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-primary" />
			</div>
		)
	}

	// 错误状态
	if (isError) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="space-y-4 text-center">
					<div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
						<AlertCircle className="h-8 w-8 text-destructive" strokeWidth={1.5} />
					</div>
					<h2 className="text-xl font-semibold">Failed to load media</h2>
					<p className="mx-auto max-w-md text-muted-foreground">
						{error?.message}
					</p>
					<Button asChild variant="outline" className="mt-4">
						<Link href="/media">Back to Media</Link>
					</Button>
				</div>
			</div>
		)
	}

	return (
		<WorkspacePageShell
			header={
				<PageHeader
					backHref={`/media/${mediaId}`}
					backText="Back"
					title="Generate Subtitles"
				/>
			}
		>
			<div className="pb-12">
				{/* Always-visible preview pane */}
				<div className="mb-8">
					<PreviewPane
						mediaId={mediaId}
						translation={workflowState.translation ?? null}
						config={subtitleConfig}
						hasRenderedVideo={hasRenderedVideo}
						thumbnail={media?.thumbnail ?? undefined}
						cacheBuster={previewVersion}
						isRendering={isRenderBusy}
						cloudStatus={previewCloudStatus}
						onDurationChange={handleDurationChange}
						onCurrentTimeChange={handleCurrentTimeChange}
						onVideoRefChange={handleVideoRefChange}
					/>
				</div>

				{/* Step Navigation under preview (Tabs) */}
				<Tabs
					value={activeStep}
					onValueChange={(v) => setActiveStep(v as SubtitleStepId)}
					className="w-full space-y-6"
				>
					<div className="flex justify-center">
						<TabsList className="glass h-14 p-1 rounded-full shadow-sm">
							<TabsTrigger value="step1" className="rounded-full px-6 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary transition-all">
								<FileText className="h-4 w-4 mr-2" strokeWidth={1.5} />
								Transcribe
							</TabsTrigger>
							<TabsTrigger value="step2" className="rounded-full px-6 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary transition-all">
								<Languages className="h-4 w-4 mr-2" strokeWidth={1.5} />
								Translate
							</TabsTrigger>
							<TabsTrigger value="step3" className="rounded-full px-6 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary transition-all">
								<Video className="h-4 w-4 mr-2" strokeWidth={1.5} />
								Render
							</TabsTrigger>
							<TabsTrigger value="step4" className="rounded-full px-6 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary transition-all">
								<Play className="h-4 w-4 mr-2" strokeWidth={1.5} />
								Export
							</TabsTrigger>
						</TabsList>
					</div>

					{/* Main Content - full width under preview */}
					<div className="w-full">
						<TabsContent value="step1" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
							<Card className="glass border-none shadow-sm">
								<CardHeader className="border-b border-border/40 pb-4">
									<CardTitle className="flex items-center gap-2 text-lg">
										<FileText className="h-5 w-5 text-primary" strokeWidth={1.5} />
										Step 1: Generate Subtitles
									</CardTitle>
									<CardDescription>
										Transcribe audio to text using Whisper AI
									</CardDescription>
								</CardHeader>
								<CardContent className="pt-6">
									<Step1Transcribe
										selectedModel={selectedModel}
										selectedLanguage={workflowState.transcriptionLanguage ?? selectedLanguage ?? DEFAULT_TRANSCRIPTION_LANGUAGE}
										onModelChange={(model) => updateWorkflowState({ selectedModel: model })}
										onLanguageChange={(language) => updateWorkflowState({ transcriptionLanguage: language })}
										isPending={transcribeMutation.isPending}
										onStart={handleStartTranscription}
										transcription={(media?.transcription ?? '')}
										optimizedTranscription={media?.optimizedTranscription ?? undefined}
										isClearingOptimized={clearOptimizedMutation.isPending}
										mediaId={mediaId}
										canOptimize={!!media?.transcriptionWords && Array.isArray(media.transcriptionWords) && media.transcriptionWords.length > 0}
										isOptimizing={optimizeMutation.isPending}
										selectedAIModel={selectedAIModel}
										onOptimizeModelChange={(m) => updateWorkflowState({ selectedAIModel: m })}
										onOptimize={(params) => {
											updateWorkflowState({ selectedAIModel })
											optimizeMutation.mutate({ mediaId, model: selectedAIModel, ...params })
										}}
										onRestoreOriginal={() => clearOptimizedMutation.mutate({ mediaId })}
										errorMessage={
											transcribeMutation.isError
												? transcribeMutation.error.message
												: undefined
										}
									/>
								</CardContent>
							</Card>
						</TabsContent>

						<TabsContent value="step2" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
							<Card className="glass border-none shadow-sm">
								<CardHeader className="border-b border-border/40 pb-4">
									<CardTitle className="flex items-center gap-2 text-lg">
										<Languages className="h-5 w-5 text-primary" strokeWidth={1.5} />
										Step 2: Translate Subtitles
									</CardTitle>
									<CardDescription>
										Translate subtitles to your target language
									</CardDescription>
								</CardHeader>
								<CardContent className="pt-6">
									<Step2Translate
										selectedAIModel={selectedAIModel}
										onModelChange={(model) => updateWorkflowState({ selectedAIModel: model })}
										isPending={translateMutation.isPending}
										onStart={handleStartTranslation}
										translation={workflowState.translation || ''}
										onDeleteCue={handleDeleteCue}
										canStart={!!workflowState.transcription}
										errorMessage={
											translateMutation.isError
												? translateMutation.error.message
												: undefined
										}
									/>
								</CardContent>
							</Card>
						</TabsContent>

						<TabsContent value="step3" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
							<Card className="glass border-none shadow-sm">
								<CardHeader className="border-b border-border/40 pb-4">
									<CardTitle className="flex items-center gap-2 text-lg">
										<Video className="h-5 w-5 text-primary" strokeWidth={1.5} />
										Step 3: Render Video
									</CardTitle>
									<CardDescription>
										Render the final video with embedded subtitles
									</CardDescription>
								</CardHeader>
								<CardContent className="pt-6">
									<Step3Render
										isRendering={isRenderBusy}
										onStart={handleRenderStart}
										errorMessage={startCloudRenderMutation.error?.message}
										translationAvailable={!!workflowState.translation}
										config={subtitleConfig}
										onConfigChange={handleConfigChange}
										mediaDuration={previewDuration}
										currentPreviewTime={previewCurrentTime}
										onPreviewSeek={handlePlayPreview}
									/>
								</CardContent>
							</Card>
						</TabsContent>

						<TabsContent value="step4" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
							<Card className="glass border-none shadow-sm">
								<CardHeader className="border-b border-border/40 pb-4">
									<CardTitle className="flex items-center gap-2 text-lg">
										<Play className="h-5 w-5 text-primary" strokeWidth={1.5} />
										Step 4: Export
									</CardTitle>
									<CardDescription>
										Download your rendered video and subtitles
									</CardDescription>
								</CardHeader>
								<CardContent className="pt-6">
									<Step4Preview
										mediaId={mediaId}
										hasRenderedVideo={hasRenderedVideo}
										thumbnail={media?.thumbnail ?? undefined}
										cacheBuster={previewVersion}
										showVideo={false}
									/>
								</CardContent>
							</Card>
						</TabsContent>
					</div>
				</Tabs>
			</div>
		</WorkspacePageShell>
	)
}
