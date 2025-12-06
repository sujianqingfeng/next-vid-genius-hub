'use client'

import { useCallback, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
	ChatModelIds,
	DEFAULT_CHAT_MODEL_ID,
	type ChatModelId,
} from '~/lib/ai/models'
import { logger } from '~/lib/logger'
import { queryOrpc } from '~/lib/orpc/query-client'
import { getDefaultModel, WHISPER_MODELS, type WhisperModel } from '~/lib/subtitle/config/models'
import type {
	DownsampleBackend,
	SubtitleRenderConfig,
	SubtitleStepId,
	SubtitleWorkflowState,
} from '~/lib/subtitle/types'
import { TIME_CONSTANTS } from '~/lib/subtitle/config/constants'
import { usePageVisibility } from '~/lib/hooks/usePageVisibility'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { useCloudJob } from '~/lib/hooks/useCloudJob'
import {
	DEFAULT_TRANSCRIPTION_LANGUAGE,
	type TranscriptionLanguage,
} from '~/lib/subtitle/config/languages'

interface UseSubtitleActionsOptions {
	mediaId: string
	activeStep: SubtitleStepId
	workflowState: SubtitleWorkflowState
	updateWorkflowState: (updates: Partial<SubtitleWorkflowState>) => void
	setActiveStep: (step: SubtitleStepId) => void
}

export function useSubtitleActions({
	mediaId,
	activeStep,
	workflowState,
	updateWorkflowState,
	setActiveStep,
}: UseSubtitleActionsOptions) {
	const queryClient = useQueryClient()

	const selectedModel: WhisperModel =
		workflowState.selectedModel ?? getDefaultModel('cloudflare')
	const selectedModelConfig = WHISPER_MODELS[selectedModel]

	const initialChatModel = useMemo<ChatModelId>(() => {
		const configured =
			(ChatModelIds as readonly ChatModelId[]).find(
				(id) => id === DEFAULT_CHAT_MODEL_ID,
			) ?? (ChatModelIds[0] as ChatModelId | undefined)
		return configured ?? DEFAULT_CHAT_MODEL_ID
	}, [])

	const selectedAIModel: ChatModelId =
		workflowState.selectedAIModel ?? initialChatModel

	const downsampleBackend: DownsampleBackend =
		workflowState.downsampleBackend ?? 'cloud'
	const selectedLanguage: TranscriptionLanguage =
		workflowState.transcriptionLanguage ?? DEFAULT_TRANSCRIPTION_LANGUAGE

	const [previewVersion, setPreviewVersion] = useState<number | undefined>(
		undefined,
	)
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

	const transcribeMutation = useEnhancedMutation(
		queryOrpc.subtitle.transcribe.mutationOptions({
			onSuccess: (data) => {
				if (data.transcription) {
					logger.info(
						'transcription',
						'Transcription completed successfully on client',
					)
					updateWorkflowState({
						transcription: data.transcription,
						selectedModel,
						transcriptionLanguage: selectedLanguage,
					})
				}
			},
			onError: (error) => {
				logger.error(
					'transcription',
					`Transcription failed: ${error.message}`,
				)
			},
		}),
		{
			invalidateQueries: {
				queryKey: queryOrpc.media.byId.queryKey({ input: { id: mediaId } }),
			},
		},
	)

	const optimizeMutation = useEnhancedMutation(
		queryOrpc.subtitle.optimizeTranscription.mutationOptions(),
		{
			invalidateQueries: {
				queryKey: queryOrpc.media.byId.queryKey({ input: { id: mediaId } }),
			},
		},
	)

	const clearOptimizedMutation = useEnhancedMutation(
		queryOrpc.subtitle.clearOptimizedTranscription.mutationOptions(),
		{
			invalidateQueries: {
				queryKey: queryOrpc.media.byId.queryKey({ input: { id: mediaId } }),
			},
		},
	)

	const translateMutation = useEnhancedMutation(
		queryOrpc.subtitle.translate.mutationOptions({
			onSuccess: (data) => {
				if (data.translation) {
					updateWorkflowState({
						translation: data.translation,
						selectedAIModel,
					})
				}
			},
		}),
	)

	const deleteCueMutation = useEnhancedMutation(
		queryOrpc.subtitle.deleteTranslationCue.mutationOptions({
			onSuccess: (data) => {
				if (data.translation) {
					updateWorkflowState({ translation: data.translation })
				}
			},
		}),
	)

	const startCloudRenderMutation = useEnhancedMutation(
		queryOrpc.subtitle.startCloudRender.mutationOptions({
			onSuccess: (data) => {
				setCloudJobId(data.jobId)
			},
		}),
	)

	const previewCloudStatus = cloudStatusQuery.data
		? {
				status: (cloudStatusQuery.data as { status?: string }).status,
				progress: (cloudStatusQuery.data as { progress?: number }).progress,
			}
		: null

	const handleStartTranscription = () => {
			const canHintLanguage = Boolean(WHISPER_MODELS[selectedModel]?.supportsLanguageHint)
			const cloudflareInputFormat = selectedModelConfig?.cloudflareInputFormat ?? 'binary'
			logger.info(
				'transcription',
				`User started transcription: cloudflare/${selectedModel} for media ${mediaId}`,
			)
			updateWorkflowState({
				selectedModel,
				downsampleBackend,
				transcriptionLanguage: selectedLanguage,
			})
			transcribeMutation.mutate({
				mediaId,
				model: selectedModel,
				downsampleBackend,
				inputFormat: cloudflareInputFormat,
				language:
					canHintLanguage && selectedLanguage && selectedLanguage !== DEFAULT_TRANSCRIPTION_LANGUAGE
						? selectedLanguage
						: undefined,
			})
	}

	const handleStartTranslation = () => {
		if (workflowState.transcription) {
			updateWorkflowState({ selectedAIModel })
			translateMutation.mutate({
				mediaId,
				model: selectedAIModel,
				promptId: 'bilingual-zh',
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

		return {
			// derived selections
			selectedModel,
			selectedAIModel,
			selectedLanguage,
			downsampleBackend,

		// cloud render + preview
		cloudStatusQuery,
		previewCloudStatus,
		previewVersion,
		startCloudRenderMutation,

		// mutations
		transcribeMutation,
		optimizeMutation,
		clearOptimizedMutation,
		translateMutation,
		deleteCueMutation,

		// handlers
		handleStartTranscription,
		handleStartTranslation,
		handleDeleteCue,
		handleRenderStart,
		handleConfigChange,
	}
}
