/**
 * 字幕模块类型定义
 * 统一管理所有字幕相关的类型和接口
 */

import { z } from 'zod'
import { COLOR_CONSTANTS } from '~/lib/subtitle/config/constants'

// =============================================================================
// 基础类型定义
// =============================================================================

/**
 * 品牌化类型，提供更好的类型安全性
 */
export type MediaId = string & { readonly brand: unique symbol }
export type VttContent = string & { readonly brand: unique symbol }
export type ModelId = string & { readonly brand: unique symbol }

/**
 * 时间段效果配置
 */
export interface TimeSegmentEffect {
	id: string
	startTime: number // 开始时间（秒）
	endTime: number   // 结束时间（秒）
	muteAudio: boolean    // 是否消音
	blackScreen: boolean  // 是否黑屏
	description?: string  // 可选描述
}

/**
 * 提示文本配置
 */
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

/**
 * 字幕渲染配置
 */
export interface SubtitleRenderConfig {
	fontSize: number
	textColor: string
	backgroundColor: string
	backgroundOpacity: number
	outlineColor: string
	timeSegmentEffects: TimeSegmentEffect[]
	hintTextConfig?: HintTextConfig
}

// =============================================================================
// Zod 验证 Schema
// =============================================================================

/**
 * 时间段效果验证 Schema
 */
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
	}
)

/**
 * 提示文本配置验证 Schema
 */
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

/**
 * 字幕渲染配置验证 Schema
 */
export const subtitleRenderConfigSchema = z.object({
	fontSize: z.number().min(COLOR_CONSTANTS.FONT_SIZE_MIN).max(COLOR_CONSTANTS.FONT_SIZE_MAX),
	textColor: z.string().regex(COLOR_CONSTANTS.HEX_COLOR_REGEX, 'Invalid text color format'),
	backgroundColor: z.string().regex(COLOR_CONSTANTS.HEX_COLOR_REGEX, 'Invalid background color format'),
	backgroundOpacity: z.number().min(COLOR_CONSTANTS.OPACITY_MIN).max(COLOR_CONSTANTS.OPACITY_MAX),
	outlineColor: z.string().regex(COLOR_CONSTANTS.HEX_COLOR_REGEX, 'Invalid outline color format'),
	timeSegmentEffects: z.array(timeSegmentEffectSchema).default([]),
	hintTextConfig: hintTextConfigSchema.optional(),
})

// =============================================================================
// 预设配置类型
// =============================================================================

/**
 * 字幕渲染预设 ID
 */
export type SubtitleRenderPresetId = 'default' | 'contrast' | 'minimal' | 'bold'

/**
 * 字幕渲染预设
 */
export interface SubtitleRenderPreset {
	id: SubtitleRenderPresetId
	label: string
	description: string
	config: SubtitleRenderConfig
}

// =============================================================================
// 工作流状态类型
// =============================================================================

/**
 * 字幕工作流步骤 ID
 */
export type SubtitleStepId = 'step1' | 'step2' | 'step3' | 'step4'

/**
 * 字幕工作流状态
 */
export interface SubtitleWorkflowState {
    activeStep: SubtitleStepId
    transcription?: string
    translation?: string
    renderedVideoPath?: string
    selectedModel?: string
    selectedProvider?: string
    selectedAIModel?: string
    subtitleConfig?: SubtitleRenderConfig
    downsampleBackend?: 'auto' | 'local' | 'cloud'
}

/**
 * 工作流步骤状态
 */
export interface StepState {
	isCompleted: boolean
	isEnabled: boolean
	isLoading: boolean
	error?: string
}

// =============================================================================
// 验证函数
// =============================================================================

/**
 * 验证字幕渲染配置
 */
export function validateSubtitleRenderConfig(config: unknown): config is SubtitleRenderConfig {
	const result = subtitleRenderConfigSchema.safeParse(config)
	return result.success
}

/**
 * 验证时间段效果
 */
export function validateTimeSegmentEffect(effect: unknown): effect is TimeSegmentEffect {
	const result = timeSegmentEffectSchema.safeParse(effect)
	return result.success
}

/**
 * 验证提示文本配置
 */
export function validateHintTextConfig(config: unknown): config is HintTextConfig {
	const result = hintTextConfigSchema.safeParse(config)
	return result.success
}

// =============================================================================
// 类型推断和导出
// =============================================================================

/**
 * 从 Schema 推断类型
 */
export type TimeSegmentEffectInput = z.input<typeof timeSegmentEffectSchema>
export type TimeSegmentEffectOutput = z.output<typeof timeSegmentEffectSchema>

export type HintTextConfigInput = z.input<typeof hintTextConfigSchema>
export type HintTextConfigOutput = z.output<typeof hintTextConfigSchema>

export type SubtitleRenderConfigInput = z.input<typeof subtitleRenderConfigSchema>
export type SubtitleRenderConfigOutput = z.output<typeof subtitleRenderConfigSchema>

// 重新导出常用类型
export type { VttCue, VttCueWithTiming } from '~/lib/subtitle/utils/vtt'
