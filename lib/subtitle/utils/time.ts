/**
 * 时间处理工具函数
 * 统一管理所有时间相关的转换和格式化逻辑
 */

import { TIME_CONSTANTS } from '~/lib/subtitle/config/constants'

/**
 * 解析VTT时间戳为秒数
 * 支持格式: "00:00.000" 或 "00:00:00.000"
 */
export function parseVttTimestamp(timestamp: string): number {
	const match = timestamp.match(TIME_CONSTANTS.FULL_TIMESTAMP_FORMAT)
	if (!match) return 0

	const [, hours, minutes, seconds, milliseconds] = match
	const ms = milliseconds.padEnd(3, '0')

	return (
		parseInt(hours, 10) * 3600 +
		parseInt(minutes, 10) * 60 +
		parseInt(seconds, 10) +
		parseInt(ms, 10) / 1000
	)
}

/**
 * 将秒数格式化为VTT时间戳
 */
export function formatVttTimestamp(seconds: number): string {
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	const secs = Math.floor(seconds % 60)
	const ms = Math.floor((seconds % 1) * 1000)

	// 如果小时为0，使用简短格式
	if (hours === 0) {
		return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
	}

	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

/**
 * 解析时间字符串 "MM:SS.mmm" 为秒数
 */
export function parseTimeToSeconds(timeStr: string): number {
	const [minutes, secondsWithMs] = timeStr.split(':')
	const [seconds, milliseconds] = secondsWithMs.split('.')

	return (
		parseInt(minutes, 10) * 60 +
		parseInt(seconds, 10) +
		parseInt(milliseconds || '0', 10) / 1000
	)
}

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
export function formatDetailedTime(seconds: number): string {
	const hours = Math.floor(seconds / 3600)
	const mins = Math.floor((seconds % 3600) / 60)
	const secs = Math.floor(seconds % 60)

	if (hours > 0) {
		return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
	}

	return `${mins}:${secs.toString().padStart(2, '0')}`
}

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
export function getTimeRangeDuration(startTime: number, endTime: number): number {
	if (!isValidTimeRange(startTime, endTime)) return 0
	return endTime - startTime
}

/**
 * 检查时间点是否在范围内
 */
export function isTimeInRange(time: number, startTime: number, endTime: number): boolean {
	return time >= startTime && time <= endTime
}