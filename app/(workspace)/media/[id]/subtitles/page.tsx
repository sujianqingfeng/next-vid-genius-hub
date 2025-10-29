'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
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
import { type ChatModelId, ChatModelIds } from '~/lib/ai/models'
import { logger } from '~/lib/logger'
import { queryOrpc } from '~/lib/orpc/query-client'
import { getDefaultModel } from '~/lib/subtitle/config/models'
import { useSubtitleWorkflow } from '~/lib/subtitle/hooks/useSubtitleWorkflow'
import type {
	TranscriptionProvider,
	WhisperModel
} from '~/lib/subtitle/config/models'
import type { SubtitleRenderConfig } from '~/lib/subtitle/types'
import { TIME_CONSTANTS } from '~/lib/subtitle/config/constants'
import { usePageVisibility } from '~/lib/hooks/usePageVisibility'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { useCloudJob } from '~/lib/hooks/useCloudJob'
import { PreviewPane } from '~/components/business/media/subtitles/PreviewPane'
import type { SubtitleStepId } from '~/lib/subtitle/types'

export default function SubtitlesPage() {
	const params = useParams()
	const mediaId = params.id as string

	// 使用新的工作流Hook管理状态
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

	// 设置默认值
	const selectedProvider =
		(workflowState.selectedProvider as TranscriptionProvider) || 'cloudflare'
	const selectedModel =
		(workflowState.selectedModel as WhisperModel) ||
		(selectedProvider === 'cloudflare'
			? 'whisper-tiny-en'
			: getDefaultModel(selectedProvider))
	const selectedAIModel =
		(workflowState.selectedAIModel as ChatModelId) || ChatModelIds[0]
	const downsampleBackend =
		((workflowState.downsampleBackend as ('auto' | 'local' | 'cloud')) ||
			'cloud')

	// 渲染默认使用云端
	const [previewVersion, setPreviewVersion] = useState<number | undefined>(undefined)
	const queryClient = useQueryClient()
  const isVisible = usePageVisibility()

  const handleCloudRenderComplete = useCallback(() => {
		queryClient.invalidateQueries({
			queryKey: queryOrpc.media.byId.queryKey({ input: { id: mediaId } }),
		})
		if (activeStep === 'step3') {
			setActiveStep('step4')
		}
		setPreviewVersion((v) => v ?? Date.now())
  }, [activeStep, mediaId, queryClient, setActiveStep])

	const {
		setJobId: setCloudJobId,
		statusQuery: cloudStatusQuery,
	} = useCloudJob({
		storageKey: `subtitleCloudJob:${mediaId}`,
		enabled: isVisible && activeStep === 'step3',
		completeStatuses: ['completed'],
		onCompleted: handleCloudRenderComplete,
		createQueryOptions: (jobId) =>
			queryOrpc.subtitle.getRenderStatus.queryOptions({
				input: { jobId },
				enabled: !!jobId,
				refetchInterval: (q: { state: { data?: { status?: string } } }) => {
					const s = q.state.data?.status
					return s && ['completed', 'failed', 'canceled'].includes(s)
						? false
						: TIME_CONSTANTS.RENDERING_POLL_INTERVAL
				},
			}),
	})

	// 转录mutation
	const transcribeMutation = useEnhancedMutation(
		queryOrpc.subtitle.transcribe.mutationOptions({
			onSuccess: (data) => {
				if (data.transcription) {
					logger.info('transcription', 'Transcription completed successfully on client')
					updateWorkflowState({
						transcription: data.transcription,
						selectedModel,
						selectedProvider
					})
				}
			},
			onError: (error) => {
				logger.error('transcription', `Transcription failed: ${error.message}`)
			},
		}),
		{
			invalidateQueries: {
				queryKey: queryOrpc.media.byId.queryKey({ input: { id: mediaId } }),
			},
		},
	)

	// 优化转录 mutation（覆盖 transcription）
	const optimizeMutation = useEnhancedMutation(
		queryOrpc.subtitle.optimizeTranscription.mutationOptions(),
		{
			invalidateQueries: {
				queryKey: queryOrpc.media.byId.queryKey({ input: { id: mediaId } }),
			},
		},
	)


	// 清除优化后的转录
	const clearOptimizedMutation = useEnhancedMutation(
		queryOrpc.subtitle.clearOptimizedTranscription.mutationOptions(),
		{
			invalidateQueries: {
				queryKey: queryOrpc.media.byId.queryKey({ input: { id: mediaId } }),
			},
		},
	)

	// 翻译mutation
	const translateMutation = useEnhancedMutation(
		queryOrpc.subtitle.translate.mutationOptions({
			onSuccess: (data) => {
				if (data.translation) {
					updateWorkflowState({
						translation: data.translation,
						selectedAIModel
					})
				}
			},
		}),
	)

	// 删除字幕片段mutation
	const deleteCueMutation = useEnhancedMutation(
		queryOrpc.subtitle.deleteTranslationCue.mutationOptions({
			onSuccess: (data) => {
				if (data.translation) {
					updateWorkflowState({ translation: data.translation })
				}
			},
		}),
	)

	// 云端渲染：启动
	const startCloudRenderMutation = useEnhancedMutation(
		queryOrpc.subtitle.startCloudRender.mutationOptions({
			onSuccess: (data) => {
				setCloudJobId(data.jobId)
			},
		}),
	)

	// 预览用的云端渲染状态（避免 any）
	const previewCloudStatus = cloudStatusQuery.data
		? {
				status: (cloudStatusQuery.data as { status?: string }).status,
				progress: (cloudStatusQuery.data as { progress?: number }).progress,
			}
		: null

	// 事件处理器
	const handleStartTranscription = () => {
		logger.info('transcription', `User started transcription: ${selectedProvider}/${selectedModel} for media ${mediaId}`)
		updateWorkflowState({ selectedModel, selectedProvider })
        transcribeMutation.mutate({
            mediaId,
            model: selectedModel,
            provider: selectedProvider,
            downsampleBackend,
        })
    }

	const handleStartTranslation = () => {
		if (workflowState.transcription) {
			updateWorkflowState({ selectedAIModel })
			translateMutation.mutate({
				mediaId,
				model: selectedAIModel,
				promptId: 'bilingual-zh' // 使用配置化的提示词ID
			})
		}
	}

	const handleDeleteCue = (index: number) => {
		if (workflowState.translation) {
			deleteCueMutation.mutate({ mediaId, index })
		}
	}

	const handleRenderStart = (config: SubtitleRenderConfig) => {
		updateWorkflowState({ subtitleConfig: config })
		startCloudRenderMutation.mutate({ mediaId, subtitleConfig: config })
	}

	const handleConfigChange = (config: SubtitleRenderConfig) => {
		updateWorkflowState({ subtitleConfig: config })
	}

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
