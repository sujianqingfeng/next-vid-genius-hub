'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
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
import { TIME_CONSTANTS } from '~/lib/subtitle/config/constants'
import { usePageVisibility } from '~/lib/hooks/usePageVisibility'

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

	// 渲染后端选择（local | cloud）
	const [renderBackend, setRenderBackend] = useState<'local' | 'cloud'>(
		'cloud',
	)
	const [cloudJobId, setCloudJobId] = useState<string | null>(null)
	const [previewVersion, setPreviewVersion] = useState<number | undefined>(undefined)
	const queryClient = useQueryClient()
  const isVisible = usePageVisibility()

  // 恢复/持久化 cloudJobId（按媒体维度）
  useEffect(() => {
    const key = `subtitleCloudJob:${mediaId}`
    // 恢复
    if (!cloudJobId) {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
      if (saved) setCloudJobId(saved)
    }
    // 持久化
    if (cloudJobId) {
      window.localStorage.setItem(key, cloudJobId)
    }
  }, [mediaId, cloudJobId])

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

	// 本地渲染mutation
	const renderMutation = useMutation(
		queryOrpc.subtitle.render.mutationOptions({
			onSuccess: () => {
				// 本地渲染：Hook会自动更新状态
			},
		}),
	)

	// 云端渲染：启动
	const startCloudRenderMutation = useMutation(
		queryOrpc.subtitle.startCloudRender.mutationOptions({
			onSuccess: (data) => {
				setCloudJobId(data.jobId)
			},
		}),
	)

	// 云端渲染：轮询状态
    const cloudStatusQuery = useQuery(
        queryOrpc.subtitle.getRenderStatus.queryOptions({
            input: { jobId: cloudJobId ?? '' },
            enabled: !!cloudJobId && isVisible && activeStep === 'step3',
            refetchInterval: (q: { state: { data?: { status?: string } } }) => {
                const s = q.state.data?.status
                return s && ['completed', 'failed', 'canceled'].includes(s)
                    ? false
                    : TIME_CONSTANTS.RENDERING_POLL_INTERVAL
            },
        }),
    )

	// 云端渲染完成后，刷新媒体数据并跳到预览（用 effect 避免在渲染期间触发副作用）
	useEffect(() => {
		if (renderBackend === 'cloud' && cloudJobId && cloudStatusQuery.data?.status === 'completed') {
			queryClient.invalidateQueries({
				queryKey: queryOrpc.media.byId.queryKey({ input: { id: mediaId } }),
			})
			if (activeStep === 'step3') {
				setActiveStep('step4')
			}
			// 生成一次性的预览版本号，避免无限刷新
			setPreviewVersion((v) => v ?? Date.now())
			// 完成后清理并停止后续状态查询
			try { window.localStorage.removeItem(`subtitleCloudJob:${mediaId}`) } catch {}
			setCloudJobId(null)
		}
	}, [renderBackend, cloudJobId, cloudStatusQuery.data?.status, activeStep, mediaId, queryClient, setActiveStep])

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
		if (renderBackend === 'cloud') {
			startCloudRenderMutation.mutate({ mediaId, subtitleConfig: config })
		} else {
			renderMutation.mutate({ mediaId, subtitleConfig: config, backend: 'local' })
		}
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
                        isRendering={
                            renderBackend === 'cloud'
                                ? startCloudRenderMutation.isPending || (['queued','preparing','running','uploading'] as readonly string[]).includes(cloudStatusQuery.data?.status ?? '')
                                : renderMutation.isPending
                        }
							onStart={handleRenderStart}
							errorMessage={(renderBackend === 'cloud' ? startCloudRenderMutation.error?.message : renderMutation.error?.message)}
							mediaId={mediaId}
							translationAvailable={!!workflowState.translation}
							translation={workflowState.translation}
							config={subtitleConfig}
							onConfigChange={handleConfigChange}
							renderBackend={renderBackend}
							onRenderBackendChange={setRenderBackend}
						/>

						{/* 云端渲染进度显示（简单版） */}
						{renderBackend === 'cloud' && cloudJobId && (
							<div className="mt-3 text-sm text-muted-foreground">
								Job: {cloudJobId} — Status: {cloudStatusQuery.data?.status ?? 'starting'} {typeof cloudStatusQuery.data?.progress === 'number' ? `(${Math.round((cloudStatusQuery.data?.progress ?? 0) * 100)}%)` : ''}
							</div>
						)}
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
							cacheBuster={previewVersion}
						/>
					</CardContent>
				</Card>
			)}
		</div>
	)
}
