/**
 * VTT (WebVTT) subtitle format utilities
 */

export interface VTTTimestamp {
	start: number
	end: number
	text: string
}

export interface VTTBlock {
	identifier?: string
	timestamp: string
	text: string
}

/**
 * Parse VTT content into structured data
 */
export function parseVTT(vttContent: string): VTTBlock[] {
	const blocks: VTTBlock[] = []
	const lines = vttContent.split('\n')
	let currentBlock: Partial<VTTBlock> = {}
	let textLines: string[] = []

	for (const line of lines) {
		const trimmedLine = line.trim()

		// Skip empty lines and WEBVTT header
		if (!trimmedLine || trimmedLine === 'WEBVTT') {
			continue
		}

		// Check if line is a timestamp
		if (trimmedLine.includes('-->')) {
			// Save previous block if exists
			if (currentBlock.timestamp) {
				currentBlock.text = textLines.join('\n')
				blocks.push(currentBlock as VTTBlock)
				currentBlock = {}
				textLines = []
			}
			currentBlock.timestamp = trimmedLine
		} else if (currentBlock.timestamp) {
			// This is text content
			textLines.push(trimmedLine)
		} else {
			// This is likely an identifier
			currentBlock.identifier = trimmedLine
		}
	}

	// Don't forget the last block
	if (currentBlock.timestamp && textLines.length > 0) {
		currentBlock.text = textLines.join('\n')
		blocks.push(currentBlock as VTTBlock)
	}

	return blocks
}

/**
 * Convert VTT blocks to timestamps array
 */
export function vttToTimestamps(blocks: VTTBlock[]): VTTTimestamp[] {
	return blocks.map(block => {
		const [startTime, endTime] = block.timestamp.split(' --> ')
		return {
			start: parseVTTTime(startTime),
			end: parseVTTTime(endTime),
			text: block.text
		}
	})
}

/**
 * Parse VTT time format (HH:MM:SS.mmm) to seconds
 */
export function parseVTTTime(timeString: string): number {
	const [time, milliseconds] = timeString.split('.')
	const [hours, minutes, seconds] = time.split(':').map(Number)

	let totalSeconds = 0
	if (hours !== undefined) totalSeconds += hours * 3600
	if (minutes !== undefined) totalSeconds += minutes * 60
	if (seconds !== undefined) totalSeconds += seconds

	if (milliseconds) {
		totalSeconds += parseFloat(`0.${milliseconds}`)
	}

	return totalSeconds
}

/**
 * Convert seconds to VTT time format
 */
export function secondsToVTTTime(seconds: number): string {
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	const secs = seconds % 60
	const ms = Math.floor((secs % 1) * 1000)

	return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${Math.floor(secs).toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
}

/**
 * Generate VTT content from timestamps
 */
export function generateVTT(timestamps: VTTTimestamp[]): string {
	let vttContent = 'WEBVTT\n\n'

	for (let i = 0; i < timestamps.length; i++) {
		const timestamp = timestamps[i]
		const startTime = secondsToVTTTime(timestamp.start)
		const endTime = secondsToVTTTime(timestamp.end)

		vttContent += `${i + 1}\n`
		vttContent += `${startTime} --> ${endTime}\n`
		vttContent += `${timestamp.text}\n\n`
	}

	return vttContent
}

/**
 * Merge overlapping VTT timestamps
 */
export function mergeVTTTimestamps(timestamps: VTTTimestamp[]): VTTTimestamp[] {
	if (timestamps.length === 0) return []

	const merged: VTTTimestamp[] = []
	let current = { ...timestamps[0] }

	for (let i = 1; i < timestamps.length; i++) {
		const next = timestamps[i]

		// Check if timestamps overlap
		if (next.start <= current.end) {
			// Merge them
			current.end = Math.max(current.end, next.end)
			// Combine text
			if (next.text && next.text !== current.text) {
				current.text = current.text ? `${current.text} ${next.text}` : next.text
			}
		} else {
			// No overlap, add current and start new
			merged.push(current)
			current = { ...next }
		}
	}

	// Add the last timestamp
	merged.push(current)

	return merged
}

/**
 * Split long VTT timestamps
 */
export function splitVTTTimestamps(
	timestamps: VTTTimestamp[],
	maxDuration: number = 7,
	maxChars: number = 42
): VTTTimestamp[] {
	const split: VTTTimestamp[] = []

	for (const timestamp of timestamps) {
		const duration = timestamp.end - timestamp.start

		// If within limits, keep as is
		if (duration <= maxDuration && timestamp.text.length <= maxChars) {
			split.push(timestamp)
			continue
		}

		// Need to split
		const words = timestamp.text.split(' ')
		const wordsPerSecond = words.length / duration
		const maxWordsPerSegment = Math.floor(maxDuration * wordsPerSecond)

		let currentWords: string[] = []
		let currentStart = timestamp.start
		let wordCount = 0

		for (const word of words) {
			currentWords.push(word)
			wordCount++

			// Check if we need to split
			if (
				currentWords.length >= maxWordsPerSegment ||
				currentWords.join(' ').length >= maxChars ||
				wordCount === words.length
			) {
				const currentEnd = currentStart + (currentWords.length / wordsPerSecond)

				split.push({
					start: currentStart,
					end: Math.min(currentEnd, timestamp.end),
					text: currentWords.join(' ')
				})

				currentStart = currentEnd
				currentWords = []
			}
		}
	}

	return split
}

/**
 * Shift VTT timestamps by offset
 */
export function shiftVTTTimestamps(timestamps: VTTTimestamp[], offsetSeconds: number): VTTTimestamp[] {
	return timestamps.map(timestamp => ({
		...timestamp,
		start: Math.max(0, timestamp.start + offsetSeconds),
		end: Math.max(0, timestamp.end + offsetSeconds)
	}))
}

/**
 * Scale VTT timestamps (change playback speed)
 */
export function scaleVTTTimestamps(timestamps: VTTTimestamp[], scaleFactor: number): VTTTimestamp[] {
	return timestamps.map(timestamp => ({
		...timestamp,
		start: timestamp.start / scaleFactor,
		end: timestamp.end / scaleFactor
	}))
}

/**
 * Validate VTT content
 */
export function validateVTT(vttContent: string): {
	isValid: boolean
	errors: string[]
} {
	const errors: string[] = []

	// Check for WEBVTT header
	if (!vttContent.trim().startsWith('WEBVTT')) {
		errors.push('Missing WEBVTT header')
	}

	// Parse VTT and check for issues
	try {
		const blocks = parseVTT(vttContent)
		let lastEnd = 0

		for (const block of blocks) {
			const [startTime, endTime] = block.timestamp.split(' --> ')

			// Validate timestamp format
			if (!startTime || !endTime) {
				errors.push(`Invalid timestamp format: ${block.timestamp}`)
				continue
			}

			const start = parseVTTTime(startTime)
			const end = parseVTTTime(endTime)

			// Check for negative timestamps
			if (start < 0) {
				errors.push(`Negative start time: ${startTime}`)
			}

			// Check if end is before start
			if (end < start) {
				errors.push(`End time before start time: ${block.timestamp}`)
			}

			// Check for overlapping timestamps
			if (start < lastEnd) {
				errors.push(`Overlapping timestamp: ${block.timestamp}`)
			}

			lastEnd = Math.max(lastEnd, end)

			// Check for empty text
			if (!block.text.trim()) {
				errors.push(`Empty text for timestamp: ${block.timestamp}`)
			}
		}
	} catch (error) {
		errors.push(`Failed to parse VTT: ${error instanceof Error ? error.message : 'Unknown error'}`)
	}

	return {
		isValid: errors.length === 0,
		errors
	}
}

/**
 * Convert SRT to VTT format
 */
export function srtToVTT(srtContent: string): string {
	const srtBlocks = srtContent.trim().split(/\n\s*\n/)
	const vttBlocks: string[] = []

	for (const block of srtBlocks) {
		const lines = block.split('\n')
		if (lines.length < 3) continue

		// Extract timestamp (second line) and text (remaining lines)
		const timestamp = lines[1].replace(',', '.') // Convert SRT comma to VTT dot
		const text = lines.slice(2).join('\n')

		vttBlocks.push(`${timestamp}\n${text}`)
	}

	return `WEBVTT\n\n${vttBlocks.join('\n\n')}`
}

/**
 * Convert VTT to SRT format
 */
export function vttToSRT(vttContent: string): string {
	const blocks = parseVTT(vttContent)
	const srtBlocks: string[] = []

	blocks.forEach((block, index) => {
		const [startTime, endTime] = block.timestamp.split(' --> ')
		// Convert VTT dot to SRT comma
		const srtTimestamp = `${startTime.replace('.', ',')} --> ${endTime.replace('.', ',')}`
		srtBlocks.push(`${index + 1}\n${srtTimestamp}\n${block.text}`)
	})

	return srtBlocks.join('\n\n')
}