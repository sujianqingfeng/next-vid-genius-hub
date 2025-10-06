/**
 * 字幕渲染预设配置
 * 统一管理所有预设样式和配置
 */

import { COLOR_CONSTANTS } from '~/lib/subtitle/config/constants'
import type { SubtitleRenderPreset, SubtitleRenderConfig } from '~/lib/subtitle/types'

/**
 * 默认字幕渲染配置
 */
export const DEFAULT_SUBTITLE_RENDER_CONFIG: SubtitleRenderConfig = {
	fontSize: COLOR_CONSTANTS.DEFAULT_FONT_SIZE,
	textColor: COLOR_CONSTANTS.DEFAULT_TEXT_COLOR,
	backgroundColor: COLOR_CONSTANTS.DEFAULT_BACKGROUND_COLOR,
	backgroundOpacity: COLOR_CONSTANTS.DEFAULT_BACKGROUND_OPACITY,
	outlineColor: COLOR_CONSTANTS.DEFAULT_OUTLINE_COLOR,
	timeSegmentEffects: [],
	hintTextConfig: {
		enabled: false,
		text: 'Please wait...',
		fontSize: 24,
		textColor: COLOR_CONSTANTS.DEFAULT_TEXT_COLOR,
		backgroundColor: COLOR_CONSTANTS.DEFAULT_BACKGROUND_COLOR,
		backgroundOpacity: 0.8,
		outlineColor: COLOR_CONSTANTS.DEFAULT_OUTLINE_COLOR,
		position: 'center',
		animation: 'fade-in',
	},
}

/**
 * 字幕渲染预设配置
 */
export const SUBTITLE_RENDER_PRESETS: readonly SubtitleRenderPreset[] = [
	{
		id: 'default',
		label: '标准',
		description: '白色字幕，65% 黑底，通用场景。',
		config: {
			...DEFAULT_SUBTITLE_RENDER_CONFIG,
			fontSize: 18,
			textColor: '#ffffff',
			backgroundColor: '#000000',
			backgroundOpacity: 0.65,
			outlineColor: '#000000',
			timeSegmentEffects: [],
		},
	},
	{
		id: 'contrast',
		label: '高对比',
		description: '金黄色字幕 + 80% 深色底，适合复杂背景。',
		config: {
			...DEFAULT_SUBTITLE_RENDER_CONFIG,
			fontSize: 20,
			textColor: '#ffd54f',
			backgroundColor: '#0f172a',
			backgroundOpacity: 0.8,
			outlineColor: '#000000',
			timeSegmentEffects: [],
		},
	},
	{
		id: 'minimal',
		label: '轻量',
		description: '透明底 + 白色文字，适合简洁风格。',
		config: {
			...DEFAULT_SUBTITLE_RENDER_CONFIG,
			fontSize: 18,
			textColor: '#f8fafc',
			backgroundColor: '#0f172a',
			backgroundOpacity: 0.2,
			outlineColor: '#111827',
			timeSegmentEffects: [],
		},
	},
	{
		id: 'bold',
		label: '大字幕',
		description: '28px 字号 + 70% 底色，移动端更清晰。',
		config: {
			...DEFAULT_SUBTITLE_RENDER_CONFIG,
			fontSize: 28,
			textColor: '#ffffff',
			backgroundColor: '#020617',
			backgroundOpacity: 0.7,
			outlineColor: '#020617',
			timeSegmentEffects: [],
		},
	},
] as const

/**
 * 获取预设配置
 */
export function getSubtitleRenderPreset(presetId: SubtitleRenderPreset['id']): SubtitleRenderPreset | undefined {
	return SUBTITLE_RENDER_PRESETS.find(preset => preset.id === presetId)
}

/**
 * 获取所有预设标签
 */
export function getSubtitleRenderPresetLabels(): Record<SubtitleRenderPreset['id'], string> {
	return SUBTITLE_RENDER_PRESETS.reduce((acc, preset) => {
		acc[preset.id] = preset.label
		return acc
	}, {} as Record<SubtitleRenderPreset['id'], string>)
}

/**
 * 检查配置是否匹配预设
 */
export function findMatchingPreset(config: SubtitleRenderConfig): SubtitleRenderPreset | undefined {
	return SUBTITLE_RENDER_PRESETS.find(preset => areConfigsEqual(preset.config, config))
}

/**
 * 比较两个字幕配置是否相等
 */
function areConfigsEqual(configA: SubtitleRenderConfig, configB: SubtitleRenderConfig): boolean {
	// 基础配置比较
	const basicConfigEqual =
		configA.fontSize === configB.fontSize &&
		Math.abs(configA.backgroundOpacity - configB.backgroundOpacity) < 0.001 &&
		configA.textColor.toLowerCase() === configB.textColor.toLowerCase() &&
		configA.backgroundColor.toLowerCase() === configB.backgroundColor.toLowerCase() &&
		configA.outlineColor.toLowerCase() === configB.outlineColor.toLowerCase() &&
		configA.timeSegmentEffects.length === configB.timeSegmentEffects.length

	if (!basicConfigEqual) return false

	// 提示文本配置比较
	const hintConfigA = configA.hintTextConfig
	const hintConfigB = configB.hintTextConfig

	if (!hintConfigA && !hintConfigB) return true
	if (!hintConfigA || !hintConfigB) return false

	return (
		hintConfigA.enabled === hintConfigB.enabled &&
		hintConfigA.text === hintConfigB.text &&
		hintConfigA.fontSize === hintConfigB.fontSize &&
		hintConfigA.textColor.toLowerCase() === hintConfigB.textColor.toLowerCase() &&
		hintConfigA.backgroundColor.toLowerCase() === hintConfigB.backgroundColor.toLowerCase() &&
		Math.abs((hintConfigA.backgroundOpacity ?? 0.8) - (hintConfigB.backgroundOpacity ?? 0.8)) < 0.001 &&
		hintConfigA.outlineColor.toLowerCase() === hintConfigB.outlineColor.toLowerCase() &&
		hintConfigA.position === hintConfigB.position &&
		hintConfigA.animation === hintConfigB.animation
	)
}