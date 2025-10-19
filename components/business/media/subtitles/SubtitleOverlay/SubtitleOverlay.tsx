'use client'

import { hexToRgba } from '~/lib/utils/format/color'
import { UI_CONSTANTS } from '~/lib/subtitle/config/constants'
import type { SubtitleRenderConfig, VttCue } from '~/lib/subtitle/types'

interface SubtitleOverlayProps {
	cue: VttCue | null
	config: SubtitleRenderConfig
	containerHeight: number
}

/**
 * 字幕覆盖层组件
 */
export function SubtitleOverlay({ cue, config, containerHeight }: SubtitleOverlayProps) {
	if (!cue) return null

	// 计算相对字体大小
	const baseFontSize = containerHeight
		? (config.fontSize / UI_CONSTANTS.CONTAINER_HEIGHT_REFERENCE) * containerHeight
		: config.fontSize

	const chineseFontSize = Math.max(baseFontSize, UI_CONSTANTS.MIN_CHINESE_FONT_SIZE)
	const englishFontSize = Math.max(
		baseFontSize * UI_CONSTANTS.ENGLISH_FONT_SIZE_RATIO,
		UI_CONSTANTS.MIN_ENGLISH_FONT_SIZE
	)

	// 计算文本阴影和背景色
	const textShadowBlur = Math.max(chineseFontSize * UI_CONSTANTS.TEXT_SHADOW_BLUR_RATIO, UI_CONSTANTS.MIN_TEXT_SHADOW_BLUR)
	const outlineColor = hexToRgba(config.outlineColor, 0.9)
	const textShadow = `0 0 ${textShadowBlur}px ${outlineColor}, 0 0 ${textShadowBlur * 0.75}px ${outlineColor}`
	const backgroundColor = hexToRgba(config.backgroundColor, config.backgroundOpacity)

	// 分离英文和中文文本
	const [firstLine, ...remaining] = cue.lines
	const hasChinese = remaining.length > 0
	const englishLine = hasChinese ? firstLine : cue.lines.join('\n')
	const chineseText = hasChinese ? remaining.join('\n') : ''

	return (
		<div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-[8%]">
			<div
				className="max-w-[90%] flex flex-col items-center gap-1 rounded-lg px-6 py-3 text-center"
				style={{
					backgroundColor,
					color: config.textColor,
					textShadow,
				}}
			>
				{/* 英文字幕 */}
				{englishLine && (
					<div
						style={{
							fontSize: `${englishFontSize}px`,
							lineHeight: 1.2,
							opacity: 0.92,
							whiteSpace: 'pre-wrap',
						}}
					>
						{englishLine}
					</div>
				)}

				{/* 中文字幕 */}
				{chineseText && (
					<div
						style={{
							fontSize: `${chineseFontSize}px`,
							lineHeight: 1.25,
							fontWeight: 600,
							whiteSpace: 'pre-wrap',
						}}
					>
						{chineseText}
					</div>
				)}
			</div>
		</div>
	)
}
