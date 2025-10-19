'use client'

import { hexToRgba } from '~/lib/utils/format/color'
import { UI_CONSTANTS } from '~/lib/subtitle/config/constants'
import type { HintTextConfig } from '~/lib/subtitle/types'

interface HintTextOverlayProps {
	config: HintTextConfig
	containerHeight: number
}

/**
 * 提示文本覆盖层组件
 */
export function HintTextOverlay({ config, containerHeight }: HintTextOverlayProps) {
	if (!config.enabled || !config.text.trim()) return null

	// 计算相对字体大小
	const baseFontSize = containerHeight
		? (config.fontSize / UI_CONSTANTS.CONTAINER_HEIGHT_REFERENCE) * containerHeight
		: config.fontSize

	const fontSize = Math.max(baseFontSize, UI_CONSTANTS.MIN_CHINESE_FONT_SIZE)

	// 计算样式
	const backgroundColor = hexToRgba(config.backgroundColor, config.backgroundOpacity)
	const textShadowBlur = Math.max(fontSize * UI_CONSTANTS.TEXT_SHADOW_BLUR_RATIO, UI_CONSTANTS.MIN_TEXT_SHADOW_BLUR)
	const outlineColor = hexToRgba(config.outlineColor, 0.9)
	const textShadow = `0 0 ${textShadowBlur}px ${outlineColor}, 0 0 ${textShadowBlur * 0.75}px ${outlineColor}`

	// 动画类
	let animationClass = ''
	if (config.animation === 'fade-in') {
		animationClass = 'animate-in fade-in duration-500'
	} else if (config.animation === 'slide-up') {
		animationClass = 'animate-in slide-in-from-bottom duration-500'
	}

	// 位置类
	const positionClasses = {
		center: 'items-center justify-center',
		top: 'items-start justify-center pt-[10%]',
		bottom: 'items-end justify-center pb-[15%]',
	}

	return (
		<div
			className={`pointer-events-none absolute inset-0 z-20 flex ${positionClasses[config.position]} ${animationClass}`}
		>
			<div
				className="max-w-[80%] rounded-lg px-8 py-4 text-center"
				style={{
					backgroundColor,
					color: config.textColor,
					textShadow,
					fontSize: `${fontSize}px`,
					lineHeight: 1.4,
				}}
			>
				{config.text}
			</div>
		</div>
	)
}
