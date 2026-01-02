/**
 * 字幕渲染预设配置
 * 统一管理所有预设样式和配置
 */

import { COLOR_CONSTANTS } from '~/lib/subtitle/config/constants'
import type {
	SubtitleRenderConfig,
	SubtitleRenderPreset,
} from '~/lib/subtitle/types'
import { areConfigsEqual } from '~/lib/subtitle/utils/config'

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
		text: '',
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
		label: 'Default',
		description: 'White subtitles with 65% black background.',
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
		label: 'High Contrast',
		description: 'Golden subtitles with 80% dark background.',
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
		label: 'Minimal',
		description: 'Transparent background with white text.',
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
		label: 'Large',
		description: '28px font size with 70% background opacity.',
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
export function findMatchingPreset(
	config: SubtitleRenderConfig,
): SubtitleRenderPreset | undefined {
	return SUBTITLE_RENDER_PRESETS.find((preset) =>
		areConfigsEqual(preset.config, config),
	)
}

// areConfigsEqual moved to ~/lib/subtitle/utils/config
