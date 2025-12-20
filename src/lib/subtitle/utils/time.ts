/**
 * 时间处理工具函数
 * 统一管理所有时间相关的转换和格式化逻辑
 */

import { TIME_CONSTANTS } from '~/lib/subtitle/config/constants'

/**
 * 解析VTT时间戳为秒数
 * 支持格式: "MM:SS.mmm" 或 "HH:MM:SS.mmm"
 */
export function parseVttTimestamp(timestamp: string): number {
	// 首先尝试完整格式 HH:MM:SS.mmm
	const match = timestamp.match(TIME_CONSTANTS.FULL_TIMESTAMP_FORMAT)
	if (match) {
		const [, hours, minutes, seconds, milliseconds] = match
		const ms = milliseconds.padEnd(3, '0')

		return (
			parseInt(hours, 10) * 3600 +
			parseInt(minutes, 10) * 60 +
			parseInt(seconds, 10) +
			parseInt(ms, 10) / 1000
		)
	}

	// 尝试简短格式 MM:SS.mmm
	const shortMatch = timestamp.match(/^(\d+):(\d+)\.(\d{1,3})$/)
	if (shortMatch) {
		const [, minutes, seconds, milliseconds] = shortMatch
		const ms = milliseconds.padEnd(3, '0')

		return (
			parseInt(minutes, 10) * 60 +
			parseInt(seconds, 10) +
			parseInt(ms, 10) / 1000
		)
	}

	// 如果都无法匹配，返回0
	return 0
}

/**
 * 将秒数格式化为VTT时间戳
 */
export function formatVttTimestamp(seconds: number): string {
	// Round to nearest millisecond to avoid 12.940 -> 12.939 drift
	let totalMs = Math.round(seconds * 1000)
	if (totalMs < 0) totalMs = 0
	const hours = Math.floor(totalMs / 3600000)
	const minutes = Math.floor((totalMs % 3600000) / 60000)
	const secs = Math.floor((totalMs % 60000) / 1000)
	const ms = totalMs % 1000

	// 如果小时为0，使用简短格式
	if (hours === 0) {
		return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
	}

	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

/**
 * 解析时间字符串 "MM:SS.mmm" 为秒数
 */
// Removed: parseTimeToSeconds (unused)

/**
 * 格式化秒数为可读时间字符串
 */
export function formatTimeForDisplay(seconds: number): string {
	const mins = Math.floor(seconds / 60)
	const secs = Math.floor(seconds % 60)
	return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * 格式化秒数为详细时间字符串（包含小时）
 */
// Removed: formatDetailedTime (unused)

/**
 * 检查时间范围是否有效
 */
export function isValidTimeRange(startTime: number, endTime: number): boolean {
	return (
		Number.isFinite(startTime) &&
		Number.isFinite(endTime) &&
		startTime >= 0 &&
		endTime > 0 &&
		startTime < endTime
	)
}

/**
 * 获取时间范围的持续时间
 */
// Removed: getTimeRangeDuration (unused)

/**
 * 检查时间点是否在范围内
 */
// Removed: isTimeInRange (unused)
