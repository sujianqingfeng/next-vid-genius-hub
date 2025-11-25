/**
 * 字幕工作流管理 Hook
 * 统一管理字幕处理流程的状态和逻辑
 */

import { useEffect, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { logger } from '~/lib/logger'
import { queryOrpc } from '~/lib/orpc/query-client'
import type {
	SubtitleStepId,
	SubtitleWorkflowState,
	StepState
} from '~/lib/subtitle/types'
import { DEFAULT_SUBTITLE_RENDER_CONFIG, findMatchingPreset } from '~/lib/subtitle/config/presets'
import { DEFAULT_TRANSCRIPTION_LANGUAGE } from '~/lib/subtitle/config/languages'

interface UseSubtitleWorkflowOptions {
	mediaId: string
	onStepChange?: (step: SubtitleStepId) => void
}

/**
 * 字幕工作流管理 Hook
 */
export function useSubtitleWorkflow({ mediaId, onStepChange }: UseSubtitleWorkflowOptions) {
	// 工作流状态
	const [workflowState, setWorkflowState] = useState<SubtitleWorkflowState>(() => ({
		activeStep: 'step1',
		transcriptionLanguage: DEFAULT_TRANSCRIPTION_LANGUAGE,
		subtitleConfig: { ...DEFAULT_SUBTITLE_RENDER_CONFIG },
	}))

	// 各步骤状态
	const [stepStates, setStepStates] = useState<Record<SubtitleStepId, StepState>>({
		step1: { isCompleted: false, isEnabled: true, isLoading: false },
		step2: { isCompleted: false, isEnabled: false, isLoading: false },
		step3: { isCompleted: false, isEnabled: false, isLoading: false },
		step4: { isCompleted: false, isEnabled: false, isLoading: false },
	})

	// 媒体数据查询
	const mediaQuery = useQuery(
		queryOrpc.media.byId.queryOptions({ input: { id: mediaId } }),
	)

	// 更新步骤状态
	const updateStepState = useCallback((
		stepId: SubtitleStepId,
		updates: Partial<StepState>
	) => {
		setStepStates(prev => ({
			...prev,
			[stepId]: { ...prev[stepId], ...updates }
		}))
	}, [])

	// 切换活动步骤
	const setActiveStep = useCallback((stepId: SubtitleStepId) => {
		if (!stepStates[stepId].isEnabled) {
			logger.warn('media', `Attempted to switch to disabled step: ${stepId}`)
			return
		}

		setWorkflowState(prev => ({ ...prev, activeStep: stepId }))
		onStepChange?.(stepId)
	}, [stepStates, onStepChange])

	// 更新工作流状态
	const updateWorkflowState = useCallback((updates: Partial<SubtitleWorkflowState>) => {
		setWorkflowState(prev => ({ ...prev, ...updates }))
	}, [])

	// 根据媒体数据更新状态（优先使用 optimizedTranscription）
	useEffect(() => {
		if (!mediaQuery.data) return

		const media = mediaQuery.data

		// 更新转录状态
		const preferredTranscription = media?.optimizedTranscription || media?.transcription
		if (preferredTranscription && !workflowState.transcription) {
			updateWorkflowState({ transcription: preferredTranscription })
			updateStepState('step1', { isCompleted: true })
			updateStepState('step2', { isEnabled: true })
			// 保持在 step1，让用户可在转录后先进行“优化”
		}

		// 更新翻译状态
		if (media.translation && !workflowState.translation) {
			updateWorkflowState({ translation: media.translation })
			updateStepState('step2', { isCompleted: true })
			updateStepState('step3', { isEnabled: true })

			if (workflowState.activeStep === 'step2') {
				setActiveStep('step3')
			}
		}

		// 更新渲染状态
		if (media.videoWithSubtitlesPath && !workflowState.renderedVideoPath) {
			updateWorkflowState({ renderedVideoPath: media.videoWithSubtitlesPath })
			updateStepState('step3', { isCompleted: true })
			updateStepState('step4', { isEnabled: true, isCompleted: true })

			if (workflowState.activeStep === 'step3') {
				setActiveStep('step4')
			}
		}
	}, [mediaQuery.data, workflowState, updateWorkflowState, updateStepState, setActiveStep])

	// 重置工作流
	const resetWorkflow = useCallback(() => {
		setWorkflowState({
			activeStep: 'step1',
			transcriptionLanguage: DEFAULT_TRANSCRIPTION_LANGUAGE,
			subtitleConfig: { ...DEFAULT_SUBTITLE_RENDER_CONFIG },
		})
		setStepStates({
			step1: { isCompleted: false, isEnabled: true, isLoading: false },
			step2: { isCompleted: false, isEnabled: false, isLoading: false },
			step3: { isCompleted: false, isEnabled: false, isLoading: false },
			step4: { isCompleted: false, isEnabled: false, isLoading: false },
		})
	}, [])

	// 检查预设匹配
	const currentPreset = findMatchingPreset(workflowState.subtitleConfig!)

	return {
		// 状态
		workflowState,
		stepStates,
		currentPreset,
		isLoading: mediaQuery.isLoading,
		isError: mediaQuery.isError,
		error: mediaQuery.error,
		media: mediaQuery.data,

		// 操作
		setActiveStep,
		updateWorkflowState,
		updateStepState,
		resetWorkflow,

		// 便捷属性
		activeStep: workflowState.activeStep,
		hasTranscription: !!workflowState.transcription,
		hasTranslation: !!workflowState.translation,
		hasRenderedVideo: !!workflowState.renderedVideoPath,
		subtitleConfig: workflowState.subtitleConfig!,
	}
}
