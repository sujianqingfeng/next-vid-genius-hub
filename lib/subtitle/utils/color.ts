/**
 * 颜色处理工具函数
 * 统一管理所有颜色相关的转换和验证逻辑
 */

import { COLOR_CONSTANTS } from '~/lib/subtitle/config/constants'

/**
 * 验证十六进制颜色值
 */
export function isValidHexColor(color: string): boolean {
	return COLOR_CONSTANTS.HEX_COLOR_REGEX.test(color)
}

/**
 * 将十六进制颜色转换为RGBA
 */
export function hexToRgba(hex: string, opacity: number): string {
	let normalized = hex.trim().replace('#', '')

	// 处理3位十六进制颜色
	if (normalized.length === 3) {
		normalized = normalized
			.split('')
			.map((char) => char + char)
			.join('')
	}

	const int = Number.parseInt(normalized, 16)
	if (Number.isNaN(int)) {
		// 返回默认值
		return `rgba(0, 0, 0, ${Math.min(Math.max(opacity, 0), 1)})`
	}

	const r = (int >> 16) & 255
	const g = (int >> 8) & 255
	const b = int & 255
	const alpha = Number.isFinite(opacity) ? Math.min(Math.max(opacity, 0), 1) : 1

	return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * 标准化十六进制颜色值
 */
export function normalizeHex(hex: string): string {
	const normalized = hex.trim().toLowerCase()
	return normalized.startsWith('#') ? normalized : `#${normalized}`
}

/**
 * 比较两个十六进制颜色值是否相同
 */
export function areHexColorsEqual(color1: string, color2: string): boolean {
	return normalizeHex(color1) === normalizeHex(color2)
}

/**
 * 获取颜色的对比色（用于文本颜色选择）
 */
export function getContrastColor(hexColor: string): string {
	const normalized = normalizeHex(hexColor).replace('#', '')
	const int = Number.parseInt(normalized, 16)

	const r = (int >> 16) & 255
	const g = (int >> 8) & 255
	const b = int & 255

	// 计算亮度
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255

	// 返回黑色或白色，取决于背景亮度
	return luminance > 0.5 ? '#000000' : '#ffffff'
}

/**
 * 调整颜色亮度
 */
export function adjustColorBrightness(hexColor: string, factor: number): string {
	const normalized = normalizeHex(hexColor).replace('#', '')
	const int = Number.parseInt(normalized, 16)

	let r = (int >> 16) & 255
	let g = (int >> 8) & 255
	let b = int & 255

	// 调整亮度
	r = Math.min(255, Math.max(0, Math.round(r * factor)))
	g = Math.min(255, Math.max(0, Math.round(g * factor)))
	b = Math.min(255, Math.max(0, Math.round(b * factor)))

	return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}