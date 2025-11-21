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
import { Step1Transcribe } from '~/components/business/media/subtitles/Step1Transcribe'
import { Step2Translate } from '~/components/business/media/subtitles/Step2Translate'
import { Step3Render } from '~/components/business/media/subtitles/Step3Render'
import { Step4Preview } from '~/components/business/media/subtitles/Step4Preview'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '~/components/ui/tabs'
import { PageHeader } from '~/components/layout/page-header'
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
import { parseVttCues } from '~/lib/subtitle/utils/vtt'
import { parseVttTimestamp } from '~/lib/subtitle/utils/time'
import { PreviewPane } from '~/components/business/media/subtitles/PreviewPane'

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
		hasTranscription,
		hasTranslation,
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

	useEffect(() => {
		if (typeof media?.duration === 'number' && media.duration > 0) {
			setPreviewDuration((prev) => (prev > 0 ? prev : media.duration ?? 0))
		}
	}, [media?.duration])

	useEffect(() => {
		if (previewDuration > 0) return

		let derivedDuration = 0

		if (Array.isArray(media?.transcriptionWords) && media.transcriptionWords.length > 0) {
			for (const word of media.transcriptionWords) {
				const endTime = typeof word?.end === 'number' ? word.end : 0
				if (endTime > derivedDuration) {
					derivedDuration = endTime
				}
			}
		}

		if (derivedDuration <= 0 && workflowState.translation) {
			const cues = parseVttCues(workflowState.translation)
			if (cues.length > 0) {
				const lastCue = cues[cues.length - 1]
				const endTime = parseVttTimestamp(lastCue.end)
				if (Number.isFinite(endTime) && endTime > 0) {
					derivedDuration = endTime
				}
			}
		}

		if (derivedDuration > 0) {
			setPreviewDuration(derivedDuration)
		}
	}, [media?.transcriptionWords, previewDuration, workflowState.translation])
	const {
		selectedProvider,
		selectedModel,
		selectedAIModel,
		downsampleBackend,
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
			<div className="flex items-center justify-center min-h-[400px]">
				<Loader2 className="h-8 w-8 animate-spin" />
			</div>
		)
	}

	// 错误状态
	if (isError) {
		return (
			<div className="flex items-center justify-center min-h-[400px]">
				<div className="text-center">
					<AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
					<h2 className="text-xl font-semibold mb-2">Failed to load media</h2>
					<p className="text-muted-foreground mb-4">
						{error?.message}
					</p>
					<Button asChild>
						<Link href="/media">Back to Media</Link>
					</Button>
				</div>
			</div>
		)
	}

	return (
		<div className="p-4 space-y-4">
			{/* Header */}
			<PageHeader
				backHref={`/media/${mediaId}`}
				backText="Back to Video"
				title="Generate Subtitles"
			/>

			{/* Always-visible preview pane */}
			<PreviewPane
				mediaId={mediaId}
				translation={workflowState.translation ?? null}
				config={subtitleConfig}
				hasRenderedVideo={hasRenderedVideo}
				thumbnail={media?.thumbnail ?? undefined}
				cacheBuster={previewVersion}
				isRendering={
					startCloudRenderMutation.isPending || (['queued','preparing','running','uploading'] as readonly string[]).includes(cloudStatusQuery.data?.status ?? '')
				}
				cloudStatus={previewCloudStatus}
				onDurationChange={handleDurationChange}
				onCurrentTimeChange={handleCurrentTimeChange}
				onVideoRefChange={handleVideoRefChange}
			/>

			{/* Step Navigation under preview (Tabs) */}
			<Tabs
				value={activeStep}
				onValueChange={(v) => setActiveStep(v as SubtitleStepId)}
				className="w-full"
			>
				<TabsList>
					<TabsTrigger value="step1">
						<FileText className="h-4 w-4" />
						<span className="ml-1">Transcribe</span>
					</TabsTrigger>
					<TabsTrigger value="step2" disabled={!hasTranscription}>
						<Languages className="h-4 w-4" />
						<span className="ml-1">Translate</span>
					</TabsTrigger>
					<TabsTrigger value="step3" disabled={!hasTranslation}>
						<Video className="h-4 w-4" />
						<span className="ml-1">Render</span>
					</TabsTrigger>
					<TabsTrigger value="step4" disabled={!hasRenderedVideo}>
						<Play className="h-4 w-4" />
						<span className="ml-1">Export</span>
					</TabsTrigger>
				</TabsList>

			{/* Main Content */}
			<TabsContent value="step1">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<FileText className="h-5 w-5" />
							Step 1: Generate Subtitles
						</CardTitle>
						<CardDescription>
							Transcribe audio to text using Whisper AI
						</CardDescription>
					</CardHeader>
					<CardContent>
                            <Step1Transcribe
                                selectedModel={selectedModel}
                                selectedProvider={selectedProvider}
                                onModelChange={(model) => updateWorkflowState({ selectedModel: model })}
                                onProviderChange={(provider) => updateWorkflowState({ selectedProvider: provider })}
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
                                downsampleBackend={downsampleBackend}
                                onDownsampleBackendChange={(v) => updateWorkflowState({ downsampleBackend: v })}
                            />
					</CardContent>
				</Card>
			</TabsContent>

			

			<TabsContent value="step2">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Languages className="h-5 w-5" />
							Step 2: Translate Subtitles
						</CardTitle>
						<CardDescription>
							Translate subtitles to your target language
						</CardDescription>
					</CardHeader>
					<CardContent>
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

			<TabsContent value="step3">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Video className="h-5 w-5" />
							Step 3: Render Video
						</CardTitle>
						<CardDescription>
							Render the final video with embedded subtitles
						</CardDescription>
					</CardHeader>
					<CardContent>
							<Step3Render
								isRendering={
									startCloudRenderMutation.isPending || (['queued','preparing','running','uploading'] as readonly string[]).includes(cloudStatusQuery.data?.status ?? '')
								}
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

			<TabsContent value="step4">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Play className="h-5 w-5" />
							Step 4: Export
						</CardTitle>
						<CardDescription>
							Download your rendered video and subtitles
						</CardDescription>
					</CardHeader>
					<CardContent>
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

			{/* Close Tabs root after all contents */}
			</Tabs>
		</div>
	)
}
