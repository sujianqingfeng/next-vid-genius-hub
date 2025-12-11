/**
 * 字幕工作流管理 Hook
 * 统一管理字幕处理流程的状态和逻辑
 */

import { useEffect, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryOrpc } from '~/lib/orpc/query-client'
import type {
	SubtitleStepId,
	SubtitleWorkflowState,
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

	// 媒体数据查询（在没有转录结果时，定期轮询，获得 ASR 回调写入的最新状态）
	const mediaQuery = useQuery({
		...queryOrpc.media.byId.queryOptions({ input: { id: mediaId } }),
		refetchInterval: (data) => {
			const media = data as
				| { transcription?: string | null; optimizedTranscription?: string | null }
				| undefined
			const hasTranscription =
				!!media?.transcription || !!media?.optimizedTranscription
			// 若尚未有转录结果，每 3 秒刷新一次；一旦有结果则停止轮询
			return hasTranscription ? false : 3000
		},
	})

	// 切换活动步骤
	const setActiveStep = useCallback((stepId: SubtitleStepId) => {
		setWorkflowState(prev => ({ ...prev, activeStep: stepId }))
		onStepChange?.(stepId)
	}, [onStepChange])

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
		}

		// 更新翻译状态
		if (media.translation && !workflowState.translation) {
			updateWorkflowState({ translation: media.translation })
		}

		// 更新渲染状态
		if (media.videoWithSubtitlesPath && !workflowState.renderedVideoPath) {
			updateWorkflowState({ renderedVideoPath: media.videoWithSubtitlesPath })
		}
	}, [mediaQuery.data, workflowState, updateWorkflowState])

	// 重置工作流
	const resetWorkflow = useCallback(() => {
		setWorkflowState({
			activeStep: 'step1',
			transcriptionLanguage: DEFAULT_TRANSCRIPTION_LANGUAGE,
			subtitleConfig: { ...DEFAULT_SUBTITLE_RENDER_CONFIG },
		})
	}, [])

	// 检查预设匹配
	const currentPreset = findMatchingPreset(workflowState.subtitleConfig!)

	return {
		// 状态
		workflowState,
		currentPreset,
		isLoading: mediaQuery.isLoading,
		isError: mediaQuery.isError,
		error: mediaQuery.error,
		media: mediaQuery.data,

		// 操作
		setActiveStep,
		updateWorkflowState,
		resetWorkflow,

		// 便捷属性
		activeStep: workflowState.activeStep,
		hasTranscription: !!workflowState.transcription,
		hasTranslation: !!workflowState.translation,
		hasRenderedVideo: !!workflowState.renderedVideoPath,
		subtitleConfig: workflowState.subtitleConfig!,
	}
}
