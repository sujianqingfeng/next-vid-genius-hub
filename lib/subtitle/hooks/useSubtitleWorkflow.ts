/**
 * 字幕工作流管理 Hook
 * 统一管理字幕处理流程的状态和逻辑
 */

import { useEffect, useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { logger } from '~/lib/logger'
import { queryOrpc } from '~/lib/orpc/query-client'
import type {
	SubtitleStepId,
	SubtitleWorkflowState,
	StepState
} from '~/lib/subtitle/types'
import {
	DEFAULT_SUBTITLE_RENDER_CONFIG,
	findMatchingPreset
} from '~/lib/subtitle/config/presets'

interface UseSubtitleWorkflowOptions {
	mediaId: string
	onStepChange?: (step: SubtitleStepId) => void
}

/**
 * 字幕工作流管理 Hook
 */
export function useSubtitleWorkflow({ mediaId, onStepChange }: UseSubtitleWorkflowOptions) {
	const queryClient = useQueryClient()

	// 工作流状态
	const [workflowState, setWorkflowState] = useState<SubtitleWorkflowState>(() => ({
		activeStep: 'step1',
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
		queryOrpc.media.byId.queryOptions({ input: { id: mediaId } })
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

	// 根据媒体数据更新状态
	useEffect(() => {
		if (!mediaQuery.data) return

		const media = mediaQuery.data

		// 更新转录状态
		if (media.transcription && !workflowState.transcription) {
			updateWorkflowState({ transcription: media.transcription })
			updateStepState('step1', { isCompleted: true })
			updateStepState('step2', { isEnabled: true })

			if (workflowState.activeStep === 'step1') {
				setActiveStep('step2')
			}
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

	// 轮询渲染状态
	useEffect(() => {
		if (
			workflowState.activeStep === 'step3' &&
			workflowState.translation &&
			!workflowState.renderedVideoPath
		) {
			const interval = setInterval(() => {
				queryClient.invalidateQueries({
					queryKey: queryOrpc.media.byId.queryKey({ input: { id: mediaId } }),
				})
			}, 5000) // 每5秒轮询一次

			return () => clearInterval(interval)
		}
	}, [workflowState.activeStep, workflowState.translation, workflowState.renderedVideoPath, mediaId, queryClient])

	// 重置工作流
	const resetWorkflow = useCallback(() => {
		setWorkflowState({
			activeStep: 'step1',
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