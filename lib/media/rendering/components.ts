import { formatViewCount } from '~/lib/utils/format'
import { fillTextWithEmojis } from '../emoji'
import type { CanvasContext, Comment, VideoInfo } from '../types'
import { roundRect, wrapText } from '../utils'
import { renderLikeCount } from './ui'

/**
 * Render header section with video info - vertically aligned with video area
 */
export async function renderHeader(
	ctx: CanvasContext,
	videoInfo: VideoInfo,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_commentsCount: number,
): Promise<void> {
	// Video area position
	const videoY = 30
	const videoH = 506

	// Header area positioned to align with video center
	const headerX = 40
	const headerY = videoY
	const headerWidth = 880
	const headerHeight = videoH

	// Simple header background
	ctx.fillStyle = '#F5F5F5'
	roundRect(ctx, headerX, headerY, headerWidth, headerHeight, 12)
	ctx.fill()

	// Simple header border
	ctx.strokeStyle = '#E0E0E0'
	ctx.lineWidth = 1
	roundRect(ctx, headerX, headerY, headerWidth, headerHeight, 12)
	ctx.stroke()

	// Calculate content layout for vertical centering (aligned with video)
	ctx.fillStyle = '#000000'
	ctx.font = 'bold 56px "Noto Sans SC"'
	ctx.textAlign = 'left'
	ctx.textBaseline = 'middle'

	const title = videoInfo.translatedTitle || videoInfo.title
	const maxWidth = 800
	const wrappedTitle = wrapText(ctx, title, maxWidth)

	// Calculate total content height with proper text baseline consideration
	const titleHeight = wrappedTitle.length * 80
	const metadataHeight = 40
	const spacing = 20
	const totalContentHeight = titleHeight + spacing + metadataHeight

	// Starting Y position for vertical centering within the header area
	// Adjust offset to move content down for better visual balance
	let currentY = headerY + (headerHeight - totalContentHeight) / 2 + 30

	// Draw title
	for (let index = 0; index < wrappedTitle.length; index++) {
		await fillTextWithEmojis(
			ctx,
			wrappedTitle[index],
			headerX + 20,
			currentY + index * 80,
			{
				font: 'bold 56px "Noto Sans SC"',
				fillStyle: '#000000',
				emojiSize: 56,
			},
		)
	}

	currentY += titleHeight + 20

	// Draw metadata
	const viewText = `${formatViewCount(videoInfo.viewCount)} views`
	const authorText = videoInfo.author || 'Unknown Author'
	const metadataText = `${viewText} • ${authorText}`
	await fillTextWithEmojis(ctx, metadataText, headerX + 20, currentY, {
		font: '32px "Noto Sans SC"',
		fillStyle: '#666666',
		emojiSize: 32,
	})
}

/**
 * Render comment card with avatar and content - displays both original and translated content
 */
export async function renderCommentCard(
	ctx: CanvasContext,
	comment: Comment,
	_commentIndex: number,
	_totalComments: number,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	authorImage: any,
	width: number,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_height: number,
): Promise<void> {
	// Position comment card right below the header/video area
	const headerAreaHeight = 506 // Same as videoH
	const headerAreaBottom = 30 + headerAreaHeight // videoY + videoH
	const commentSpacing = 20 // Small spacing between sections
	const commentY = headerAreaBottom + commentSpacing

	// Calculate required comment height dynamically
	const avatarX = 60
	const avatarRadius = 35
	const textX = avatarX + avatarRadius * 2 + 40
	const maxCommentWidth = width - textX - 200
	const padding = 20

	// Set font for text measurement
	ctx.font = '28px "Noto Sans SC"'

	// Calculate content heights
	let totalContentHeight = 0
	const authorHeight = 40
	const counterHeight = 25
	const spacing = 15

	totalContentHeight += authorHeight + spacing

	// Calculate original content height (always shown)
	const wrappedOriginal = wrapText(ctx, comment.content, maxCommentWidth)
	const originalHeight = wrappedOriginal.length * 32
	totalContentHeight += originalHeight + spacing

	// Calculate translated content height (if different from original)
	let translatedHeight = 0
	let wrappedTranslated: string[] = []
	if (
		comment.translatedContent &&
		comment.translatedContent !== comment.content
	) {
		ctx.font = 'bold 40px "Noto Sans SC"' // Larger font for Chinese content
		wrappedTranslated = wrapText(
			ctx,
			comment.translatedContent,
			maxCommentWidth,
		)
		translatedHeight = wrappedTranslated.length * 45 // Larger line height
		totalContentHeight += translatedHeight + spacing
	}

	totalContentHeight += counterHeight + padding

	// Calculate final comment card height
	const commentHeight = totalContentHeight

	// Comment card background
	ctx.fillStyle = '#F9F9F9'
	roundRect(ctx, 20, commentY, width - 40, commentHeight, 12)
	ctx.fill()

	// Comment card border
	ctx.strokeStyle = '#E0E0E0'
	ctx.lineWidth = 1
	roundRect(ctx, 20, commentY, width - 40, commentHeight, 12)
	ctx.stroke()

	// Avatar
	const avatarY = commentY + 30

	if (authorImage) {
		ctx.save()
		ctx.beginPath()
		ctx.arc(
			avatarX + avatarRadius,
			avatarY + avatarRadius,
			avatarRadius,
			0,
			Math.PI * 2,
		)
		ctx.closePath()
		ctx.clip()
		ctx.drawImage(
			authorImage,
			avatarX,
			avatarY,
			avatarRadius * 2,
			avatarRadius * 2,
		)
		ctx.restore()
	} else {
		// Fallback avatar
		ctx.fillStyle = '#CCCCCC'
		ctx.beginPath()
		ctx.arc(
			avatarX + avatarRadius,
			avatarY + avatarRadius,
			avatarRadius,
			0,
			Math.PI * 2,
		)
		ctx.fill()

		ctx.fillStyle = '#FFFFFF'
		ctx.font = 'bold 32px "Noto Sans SC"'
		ctx.textAlign = 'center'
		ctx.textBaseline = 'middle'
		ctx.fillText(
			comment.author.charAt(0).toUpperCase(),
			avatarX + avatarRadius,
			avatarY + avatarRadius,
		)
	}

	// Comment content
	ctx.textAlign = 'left'
	ctx.textBaseline = 'top'

	let currentY = avatarY + 10

	// Author name
	ctx.textAlign = 'left'
	await fillTextWithEmojis(ctx, comment.author, textX, currentY, {
		font: 'bold 32px "Noto Sans SC"',
		fillStyle: '#000000',
		emojiSize: 32,
	})

	// Add likes on the right side of the comment card
	// Only show likes if count is greater than 0
	if (comment.likes > 0) {
		// Position likes on the right side with proper spacing
		const likesX = width - 60
		const likesY = currentY + 12 // Adjust Y position for better vertical alignment

		// Render like count with SVG icon
		renderLikeCount(ctx, likesX - 80, likesY, comment.likes, {
			size: 24,
			color: '#6b7280',
		})
	}

	// Reset text alignment for content
	ctx.textAlign = 'left'
	currentY += authorHeight + spacing

	// English content (primary) - original content first
	for (let index = 0; index < wrappedOriginal.length; index++) {
		await fillTextWithEmojis(
			ctx,
			wrappedOriginal[index],
			textX,
			currentY + index * 32,
			{
				font: '24px "Noto Sans SC"',
				fillStyle: '#666666',
				emojiSize: 24,
			},
		)
	}
	currentY += wrappedOriginal.length * 32 + spacing

	// Chinese content (secondary, more prominent) - translated content below
	if (
		comment.translatedContent &&
		comment.translatedContent !== comment.content
	) {
		for (let index = 0; index < wrappedTranslated.length; index++) {
			await fillTextWithEmojis(
				ctx,
				wrappedTranslated[index],
				textX,
				currentY + index * 45,
				{
					font: 'bold 40px "Noto Sans SC"',
					fillStyle: '#333333',
					emojiSize: 40,
				},
			)
		}
		currentY += wrappedTranslated.length * 36 + spacing
	}

	// Comment counter removed - no longer needed
}

/**
 * Render video cover section with author and Chinese title
 * This section appears for the first 3 seconds of the video
 */
export async function renderCoverSection(
	ctx: CanvasContext,
	videoInfo: VideoInfo,
	_comments: Comment[],
	_currentTime: number,
	_coverDuration: number,
	width: number,
	height: number,
): Promise<void> {
	// Clean white background
	ctx.fillStyle = '#FFFFFF'
	ctx.fillRect(0, 0, width, height)

	// Calculate total content height for proper vertical centering
	const centerX = width / 2
	const title = videoInfo.translatedTitle || videoInfo.title
	const wrappedTitle = wrapText(ctx, title, width - 200)

	// Calculate heights with larger content
	const titleHeight = wrappedTitle.length * 80
	const titleGap = 60
	const authorHeight = 42
	const authorGap = 40
	const seriesHeight = videoInfo.series ? 32 : 0
	const seriesGap = videoInfo.series ? 30 : 0
	const viewHeight = 28

	// Total content height
	const totalContentHeight =
		titleHeight +
		titleGap +
		authorHeight +
		authorGap +
		seriesHeight +
		seriesGap +
		viewHeight

	// Start Y position for vertical centering
	let currentY = (height - totalContentHeight) / 2

	// Main title - larger and prominent
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'

	for (let index = 0; index < wrappedTitle.length; index++) {
		await fillTextWithEmojis(
			ctx,
			wrappedTitle[index],
			centerX,
			currentY + index * 80,
			{
				font: '600 72px "Noto Sans SC"',
				fillStyle: '#000000',
				emojiSize: 72,
			},
		)
	}

	currentY += titleHeight + titleGap

	// Author info - larger @ symbol
	const authorText = videoInfo.author || 'Unknown Author'
	await fillTextWithEmojis(ctx, `@${authorText}`, centerX, currentY, {
		font: '500 42px "Noto Sans SC"',
		fillStyle: '#333333',
		emojiSize: 42,
	})

	currentY += authorHeight + authorGap

	// Series info (if available) - larger
	if (videoInfo.series) {
		const seriesText = videoInfo.seriesEpisode
			? `${videoInfo.series} 第${videoInfo.seriesEpisode}集`
			: videoInfo.series
		await fillTextWithEmojis(ctx, seriesText, centerX, currentY, {
			font: '400 32px "Noto Sans SC"',
			fillStyle: '#666666',
			emojiSize: 32,
		})
		currentY += seriesHeight + seriesGap
	}

	// View count - larger
	await fillTextWithEmojis(
		ctx,
		`${formatViewCount(videoInfo.viewCount)} 次观看`,
		centerX,
		currentY,
		{
			font: '400 28px "Noto Sans SC"',
			fillStyle: '#666666',
			emojiSize: 28,
		},
	)
}
