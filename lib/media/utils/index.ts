import type { CanvasContext } from '../types'

/**
 * Draw rounded rectangle on canvas
 */
export function roundRect(
	ctx: CanvasContext,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
) {
	ctx.beginPath()
	ctx.moveTo(x + radius, y)
	ctx.lineTo(x + width - radius, y)
	ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
	ctx.lineTo(x + width, y + height - radius)
	ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
	ctx.lineTo(x + radius, y + height)
	ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
	ctx.lineTo(x, y + radius)
	ctx.quadraticCurveTo(x, y, x + radius, y)
	ctx.closePath()
}

/**
 * Wrap text to fit within maxWidth
 */
export function wrapText(
	ctx: CanvasContext,
	text: string,
	maxWidth: number,
): string[] {
	const lines: string[] = []
	let currentLine = ''

	// Check if text contains Chinese characters
	const hasChinese = /[\u4e00-\u9fff]/.test(text)

	if (hasChinese) {
		// For Chinese text, use character-by-character wrapping
		for (let i = 0; i < text.length; i++) {
			const char = text[i]
			const testLine = currentLine + char
			const metrics = ctx.measureText(testLine)
			const testWidth = metrics.width

			if (testWidth > maxWidth && currentLine.length > 0) {
				lines.push(currentLine)
				currentLine = char
			} else {
				currentLine = testLine
			}
		}
	} else {
		// For English text, use word-based wrapping
		const words = text.split(' ')
		for (let i = 0; i < words.length; i++) {
			const testLine = currentLine + words[i] + ' '
			const metrics = ctx.measureText(testLine)
			const testWidth = metrics.width

			if (testWidth > maxWidth && i > 0) {
				lines.push(currentLine.trim())
				currentLine = words[i] + ' '
			} else {
				currentLine = testLine
			}
		}
	}

	if (currentLine.trim()) {
		lines.push(currentLine.trim())
	}

	return lines
}
