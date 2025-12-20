/**
 * VTT（WebVTT）文件处理工具函数
 * 统一管理所有VTT相关的解析和序列化逻辑
 */

import { TIME_CONSTANTS } from '~/lib/subtitle/config/constants'
import { formatVttTimestamp, isValidTimeRange, parseVttTimestamp } from './time'

export interface VttCue {
	start: string
	end: string
	lines: string[]
}

interface VttCueWithTiming extends VttCue {
	startTime: number
	endTime: number
	duration: number
}

/**
 * 解析WebVTT文件内容为字幕片段数组
 */
export function parseVttCues(vttContent: string): VttCue[] {
	if (!vttContent || typeof vttContent !== 'string') {
		return []
	}

	const lines = vttContent.split(/\r?\n/)
	const cues: VttCue[] = []

	let i = 0
	while (i < lines.length) {
		const line = lines[i]?.trim()
		if (!line) {
			i++
			continue
		}

		// 跳过WEBVTT头部
		if (line.toUpperCase() === 'WEBVTT') {
			i++
			continue
		}

		// 查找时间戳行
		const timeMatch = line.match(TIME_CONSTANTS.VTT_TIMESTAMP_FORMAT)
		if (timeMatch) {
			const [, start, end] = timeMatch
			const cueLines: string[] = []
			i++

			// 收集时间戳后的文本行
			for (; i < lines.length; i++) {
				const textLine = lines[i]?.trim()
				if (!textLine) break
				cueLines.push(textLine)
			}

			if (cueLines.length > 0) {
				cues.push({ start, end, lines: cueLines })
			}
		} else {
			i++
		}
	}

	return cues
}

/**
 * 将字幕片段数组序列化为WebVTT格式
 */
export function serializeVttCues(cues: VttCue[]): string {
	if (!cues || cues.length === 0) {
		return ''
	}

	const content = cues
		.map((cue) => [
			`${cue.start} --> ${cue.end}`,
			...cue.lines.map((line) => line.replace(/\s+$/g, '')),
			'',
		])
		.flat()
		.join('\n')

	return content.trim()
}

/**
 * 创建完整的WebVTT文档（包含头部）
 */
export function createVttDocument(cues: VttCue[]): string {
	const content = serializeVttCues(cues)
	return content ? `WEBVTT\n\n${content}` : 'WEBVTT\n'
}

/**
 * 为字幕片段添加时间信息
 */
function enrichCuesWithTiming(cues: VttCue[]): VttCueWithTiming[] {
	return cues.map((cue) => {
		const startTime = parseVttTimestamp(cue.start)
		const endTime = parseVttTimestamp(cue.end)
		const duration = endTime - startTime

		return {
			...cue,
			startTime,
			endTime,
			duration,
		}
	})
}

/**
 * 在指定时间点查找当前活动的字幕片段
 */
export function findActiveCue(
	cues: VttCue[],
	currentTime: number,
): VttCue | null {
	const enrichedCues = enrichCuesWithTiming(cues)

	for (const cue of enrichedCues) {
		if (currentTime >= cue.startTime && currentTime <= cue.endTime) {
			const { ...originalCue } = cue
			return originalCue
		}
	}

	return null
}

/**
 * 验证VTT内容格式
 */
export function validateVttContent(vttContent: string): {
	isValid: boolean
	errors: string[]
	cues: VttCue[]
} {
	const errors: string[] = []

	if (!vttContent || typeof vttContent !== 'string') {
		errors.push('VTT content is empty or invalid')
		return { isValid: false, errors, cues: [] }
	}

	const cues = parseVttCues(vttContent)

	if (cues.length === 0) {
		errors.push('No valid cues found in VTT content')
	}

	// 验证每个字幕片段的时间范围
	cues.forEach((cue, index) => {
		const startTime = parseVttTimestamp(cue.start)
		const endTime = parseVttTimestamp(cue.end)

		if (!isValidTimeRange(startTime, endTime)) {
			errors.push(
				`Cue ${index + 1} has invalid time range: ${cue.start} --> ${cue.end}`,
			)
		}

		if (cue.lines.length === 0) {
			errors.push(`Cue ${index + 1} has no text content`)
		}
	})

	return {
		isValid: errors.length === 0,
		errors,
		cues,
	}
}

/**
 * 标准化VTT时间戳格式
 * 处理Cloudflare等服务的非标准格式（如 "00.000" 转换为 "00:00.000"）
 */
export function normalizeVttTimestamp(timestamp: string): string {
	// 检查是否已经是标准格式（包含冒号）
	if (timestamp.includes(':')) {
		return timestamp
	}

	// 处理 Cloudflare 格式: "00.000" -> "00:00.000"
	const match = timestamp.match(/^(\d+)\.(\d{3})$/)
	if (match) {
		const [, seconds, milliseconds] = match
		const totalSeconds = parseInt(seconds, 10)
		const minutes = Math.floor(totalSeconds / 60)
		const remainingSeconds = totalSeconds % 60
		return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}.${milliseconds}`
	}

	// 如果无法识别格式，返回原值
	return timestamp
}

/**
 * 标准化VTT内容格式
 * 自动检测并转换非标准的时间戳格式
 */
export function normalizeVttContent(vttContent: string): string {
	if (!vttContent || typeof vttContent !== 'string') {
		return vttContent
	}

	const lines = vttContent.split(/\r?\n/)
	const normalizedLines = lines.map((line) => {
		const trimmedLine = line.trim()

		// 首先检查是否包含Cloudflare格式的时间戳（简单格式，缺少冒号）
		const cloudflareTimeMatch = trimmedLine.match(
			/^(\d+)\.(\d{3})\s*-->\s*(\d+)\.(\d{3})$/,
		)
		if (cloudflareTimeMatch) {
			const [, startSec, startMs, endSec, endMs] = cloudflareTimeMatch
			const normalizedStart = normalizeVttTimestamp(`${startSec}.${startMs}`)
			const normalizedEnd = normalizeVttTimestamp(`${endSec}.${endMs}`)
			return `${normalizedStart} --> ${normalizedEnd}`
		}

		// 检查是否是标准时间戳行
		const timeMatch = trimmedLine.match(TIME_CONSTANTS.VTT_TIMESTAMP_FORMAT)
		if (timeMatch) {
			const [, start, end] = timeMatch
			const normalizedStart = normalizeVttTimestamp(start)
			const normalizedEnd = normalizeVttTimestamp(end)

			// 替换原始行中的时间戳
			return line.replace(start, normalizedStart).replace(end, normalizedEnd)
		}

		return line
	})

	const prelim = normalizedLines.join('\n')

	// Second pass: fix invalid or reversed ranges and enforce monotonic timings
	// Parse cues after timestamp normalization
	const cues = parseVttCues(prelim)
	if (!cues || cues.length === 0) return prelim

	// Enrich with numeric times
	type TmpCue = { startTime: number; endTime: number; lines: string[] }
	const tmp: TmpCue[] = cues.map((c) => ({
		startTime: parseVttTimestamp(c.start),
		endTime: parseVttTimestamp(c.end),
		lines: c.lines,
	}))

	// Sort by start time first
	tmp.sort((a, b) => a.startTime - b.startTime)

	// Fix reversed/invalid durations and enforce small positive gap
	const MIN_DUR = 0.35 // seconds
	const GAP = 0.02 // seconds, avoid zero-length overlap when tightening
	for (let i = 0; i < tmp.length; i++) {
		const cur = tmp[i]
		const next = tmp[i + 1]
		// If end <= start, stretch minimally or up to next.start - GAP
		if (!(cur.endTime > cur.startTime)) {
			const nextStart = next ? next.startTime : cur.startTime + 3
			const target = Math.max(
				cur.startTime + MIN_DUR,
				Math.min(cur.startTime + 3, nextStart - GAP),
			)
			cur.endTime =
				Number.isFinite(target) && target > cur.startTime
					? target
					: cur.startTime + MIN_DUR
		}
		// If overlaps with previous end (after sorting), push start forward slightly
		if (i > 0) {
			const prev = tmp[i - 1]
			if (cur.startTime < prev.endTime - GAP / 2) {
				cur.startTime = Math.max(prev.endTime + GAP, cur.startTime)
				if (cur.endTime <= cur.startTime) cur.endTime = cur.startTime + MIN_DUR
			}
		}
	}

	// Serialize back to VTT document
	const fixed = createVttDocument(
		tmp.map((t) => ({
			start: formatVttTimestamp(t.startTime),
			end: formatVttTimestamp(t.endTime),
			lines: t.lines,
		})),
	)

	return fixed
}
