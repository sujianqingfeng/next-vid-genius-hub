import { formatLikes } from '~/lib/utils/format'
import type { CanvasContext, LikeIconOptions } from '../types'
import { roundRect, wrapText } from '../utils'

/**
 * Render simple white background
 */
export function renderBackground(
	ctx: CanvasContext,
	width: number,
	height: number,
): void {
	ctx.fillStyle = '#FFFFFF'
	ctx.fillRect(0, 0, width, height)
}

/**
 * Render video placeholder area
 */
export function renderVideoArea(
	ctx: CanvasContext,
	videoX: number,
	videoY: number,
	videoW: number,
	videoH: number,
): void {
	// Simple video border
	ctx.strokeStyle = '#000000'
	ctx.lineWidth = 2
	roundRect(ctx, videoX, videoY, videoW, videoH, 8)
	ctx.stroke()

	// Clear area for actual video content
	ctx.clearRect(videoX + 3, videoY + 3, videoW - 6, videoH - 6)
}

/**
 * Render a thumbs up SVG icon directly on canvas
 */
export function renderLikeIcon(
	ctx: CanvasContext,
	x: number,
	y: number,
	options: LikeIconOptions = {},
): void {
	const {
		size = 24,
		color = '#6b7280',
		strokeWidth = 2,
		filled = true,
	} = options

	// Professional thumbs up icon using Carbon by IBM SVG path
	// This provides a more modern and polished look
	const scale = size / 32 // Scale based on 32x32 viewBox
	const scaledStrokeWidth = strokeWidth / scale

	// Draw the professional thumbs up icon
	ctx.save()
	ctx.translate(x, y)
	ctx.scale(scale, scale)

	// Draw the Carbon by IBM thumbs up icon using basic canvas operations
	// This approach is compatible with all environments including tests
	ctx.beginPath()

	// Main thumb shape (simplified version of the SVG path)
	// Base rectangle
	ctx.moveTo(2, 16)
	ctx.lineTo(7, 16)
	ctx.lineTo(7, 30)
	ctx.lineTo(2, 30)
	ctx.closePath()

	// Thumb tip with rounded corners
	ctx.moveTo(9, 15.2)
	ctx.lineTo(12.042, 10.637)
	ctx.lineTo(12.887, 4.72)
	ctx.quadraticCurveTo(13, 3.5, 14.868, 3)
	ctx.lineTo(15, 3)
	ctx.lineTo(18, 3)
	ctx.lineTo(18, 9)
	ctx.lineTo(26, 9)
	ctx.lineTo(30, 9)
	ctx.lineTo(30, 13)
	ctx.lineTo(30, 20)
	ctx.quadraticCurveTo(30, 27, 23, 30)
	ctx.lineTo(9, 30)
	ctx.closePath()

	if (filled) {
		// Fill the icon
		ctx.fillStyle = color
		ctx.fill()
	} else {
		// Stroke the icon outline
		ctx.strokeStyle = color
		ctx.lineWidth = scaledStrokeWidth
		ctx.stroke()
	}

	ctx.restore()
}

/**
 * Render like count with SVG icon
 */
export function renderLikeCount(
	ctx: CanvasContext,
	x: number,
	y: number,
	count: number,
	options: LikeIconOptions = {},
): void {
	const { size = 24, color = '#6b7280' } = options

	// Carbon icon dimensions in the 32x32 viewBox
	const iconHeight = 27 // From y=3 to y=30
	const iconCenterY = 18.5 // Adjusted visual center (moved up from 16.5)

	// Calculate the actual visual center of the scaled icon
	const scale = size / 32
	const actualIconCenterY = y + iconCenterY * scale

	// Render the like icon
	renderLikeIcon(ctx, x, y, { size, color })

	// Render the count text aligned with the icon's visual center
	const textX = x + size + 8 // 8px spacing between icon and text
	const textY = actualIconCenterY // Align text with icon's visual center

	ctx.save()
	ctx.fillStyle = color
	ctx.font = `${Math.floor(size * 0.75)}px "Noto Sans SC"`
	ctx.textAlign = 'left'
	ctx.textBaseline = 'middle'
	ctx.fillText(formatLikes(count), textX, textY)
	ctx.restore()
}
