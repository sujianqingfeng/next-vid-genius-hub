'use client'

import { useMutation } from '@tanstack/react-query'
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
import {
	Stepper,
} from '~/components/business/media/subtitles/Stepper'
import { PageHeader } from '~/components/layout'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { type AIModelId, AIModelIds } from '~/lib/ai/models'
import { logger } from '~/lib/logger'
import { queryOrpc } from '~/lib/orpc/query-client'
import { getDefaultModel } from '~/lib/subtitle/config/models'
import { useSubtitleWorkflow } from '~/lib/subtitle/hooks'
import type {
	TranscriptionProvider,
	WhisperModel
} from '~/lib/subtitle/config/models'
import type { SubtitleRenderConfig } from '~/lib/subtitle/types'

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
	const selectedModel = workflowState.selectedModel as WhisperModel || getDefaultModel('local')
	const selectedProvider = workflowState.selectedProvider as TranscriptionProvider || 'local'
	const selectedAIModel = workflowState.selectedAIModel as AIModelId || AIModelIds[0]

	// 转录mutation
	const transcribeMutation = useMutation(
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
	)

	// 翻译mutation
	const translateMutation = useMutation(
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
	const deleteCueMutation = useMutation(
		queryOrpc.subtitle.deleteTranslationCue.mutationOptions({
			onSuccess: (data) => {
				if (data.translation) {
					updateWorkflowState({ translation: data.translation })
				}
			},
		}),
	)

	// 渲染mutation
	const renderMutation = useMutation(
		queryOrpc.subtitle.render.mutationOptions({
			onSuccess: () => {
				// 渲染成功，Hook会自动更新状态
			},
		}),
	)

	// 事件处理器
	const handleStartTranscription = () => {
		logger.info('transcription', `User started transcription: ${selectedProvider}/${selectedModel} for media ${mediaId}`)
		updateWorkflowState({ selectedModel, selectedProvider })
		transcribeMutation.mutate({
			mediaId,
			model: selectedModel,
			provider: selectedProvider
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
		renderMutation.mutate({ mediaId, subtitleConfig: config })
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

			{/* Step Navigation - Always Visible */}
			<Stepper
				activeTab={activeStep}
				hasTranscription={hasTranscription}
				hasTranslation={hasTranslation}
				hasRenderedVideo={hasRenderedVideo}
				onChange={(step) => setActiveStep(step)}
			/>

			{/* Main Content */}
			{activeStep === 'step1' && (
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
							transcription={workflowState.transcription || ''}
							errorMessage={
								transcribeMutation.isError
									? transcribeMutation.error.message
									: undefined
							}
						/>
					</CardContent>
				</Card>
			)}

			{activeStep === 'step2' && (
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
			)}

			{activeStep === 'step3' && (
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
							isRendering={renderMutation.isPending}
							onStart={handleRenderStart}
							errorMessage={renderMutation.error?.message}
							mediaId={mediaId}
							translationAvailable={!!workflowState.translation}
							translation={workflowState.translation}
							config={subtitleConfig}
							onConfigChange={handleConfigChange}
						/>
					</CardContent>
				</Card>
			)}

			{activeStep === 'step4' && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Play className="h-5 w-5" />
							Step 4: Preview Video
						</CardTitle>
						<CardDescription>
							Preview and download your rendered video
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Step4Preview
							mediaId={mediaId}
							hasRenderedVideo={hasRenderedVideo}
							thumbnail={media?.thumbnail ?? undefined}
							cacheBuster={Date.now()}
						/>
					</CardContent>
				</Card>
			)}
		</div>
	)
}