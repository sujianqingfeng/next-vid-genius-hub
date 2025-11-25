import { z } from 'zod'
import { COLOR_CONSTANTS } from '~/lib/subtitle/config/constants'
import type { TranscriptionProvider, WhisperModel } from '~/lib/subtitle/config/models'
import type { TranscriptionLanguage } from '~/lib/subtitle/config/languages'
import type { ChatModelId } from '~/lib/ai/models'

export interface TimeSegmentEffect {
	id: string
	startTime: number
	endTime: number
	muteAudio: boolean
	blackScreen: boolean
	description?: string
}

export interface HintTextConfig {
	enabled: boolean
	text: string
	fontSize: number
	textColor: string
	backgroundColor: string
	backgroundOpacity: number
	outlineColor: string
	position: 'center' | 'top' | 'bottom'
	animation?: 'fade-in' | 'slide-up' | 'none'
}

export interface SubtitleRenderConfig {
	fontSize: number
	textColor: string
	backgroundColor: string
	backgroundOpacity: number
	outlineColor: string
	timeSegmentEffects: TimeSegmentEffect[]
	hintTextConfig?: HintTextConfig
}

export type SubtitleRenderPresetId = 'default' | 'contrast' | 'minimal' | 'bold'

export interface SubtitleRenderPreset {
	id: SubtitleRenderPresetId
	label: string
	description: string
	config: SubtitleRenderConfig
}

export type SubtitleStepId = 'step1' | 'step2' | 'step3' | 'step4'

export const DOWNSAMPLE_BACKEND_VALUES = ['auto', 'local', 'cloud'] as const
export type DownsampleBackend = (typeof DOWNSAMPLE_BACKEND_VALUES)[number]

export interface SubtitleWorkflowState {
	activeStep: SubtitleStepId
	transcription?: string
	translation?: string
	renderedVideoPath?: string
	selectedModel?: WhisperModel
	selectedProvider?: TranscriptionProvider
	selectedAIModel?: ChatModelId
	subtitleConfig?: SubtitleRenderConfig
	downsampleBackend?: DownsampleBackend
	transcriptionLanguage?: TranscriptionLanguage
}

export const timeSegmentEffectSchema = z.object({
	id: z.string().min(1, 'Effect ID is required'),
	startTime: z.number().min(0, 'Start time must be non-negative'),
	endTime: z.number().min(0, 'End time must be non-negative'),
	muteAudio: z.boolean(),
	blackScreen: z.boolean(),
	description: z.string().optional(),
}).refine(
	(data) => data.startTime < data.endTime,
	{
		message: 'Start time must be less than end time',
		path: ['endTime'],
	},
)

export const hintTextConfigSchema = z.object({
	enabled: z.boolean(),
	text: z.string().max(200, 'Hint text cannot exceed 200 characters'),
	fontSize: z.number().min(COLOR_CONSTANTS.FONT_SIZE_MIN).max(COLOR_CONSTANTS.FONT_SIZE_MAX),
	textColor: z.string().regex(COLOR_CONSTANTS.HEX_COLOR_REGEX, 'Invalid text color format'),
	backgroundColor: z.string().regex(COLOR_CONSTANTS.HEX_COLOR_REGEX, 'Invalid background color format'),
	backgroundOpacity: z.number().min(COLOR_CONSTANTS.OPACITY_MIN).max(COLOR_CONSTANTS.OPACITY_MAX),
	outlineColor: z.string().regex(COLOR_CONSTANTS.HEX_COLOR_REGEX, 'Invalid outline color format'),
	position: z.enum(['center', 'top', 'bottom']),
	animation: z.enum(['fade-in', 'slide-up', 'none']).optional(),
})

export const subtitleRenderConfigSchema = z.object({
	fontSize: z.number().min(COLOR_CONSTANTS.FONT_SIZE_MIN).max(COLOR_CONSTANTS.FONT_SIZE_MAX),
	textColor: z.string().regex(COLOR_CONSTANTS.HEX_COLOR_REGEX, 'Invalid text color format'),
	backgroundColor: z.string().regex(COLOR_CONSTANTS.HEX_COLOR_REGEX, 'Invalid background color format'),
	backgroundOpacity: z.number().min(COLOR_CONSTANTS.OPACITY_MIN).max(COLOR_CONSTANTS.OPACITY_MAX),
	outlineColor: z.string().regex(COLOR_CONSTANTS.HEX_COLOR_REGEX, 'Invalid outline color format'),
	timeSegmentEffects: z.array(timeSegmentEffectSchema).default([]),
	hintTextConfig: hintTextConfigSchema.optional(),
})

export const downsampleBackendSchema = z.enum(DOWNSAMPLE_BACKEND_VALUES)

export type { VttCue } from '~/lib/subtitle/utils/vtt'
