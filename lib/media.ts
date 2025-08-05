import { createCanvas, loadImage } from 'canvas'
import ffmpeg from 'fluent-ffmpeg'
import { promises as fs } from 'fs'
import * as path from 'path'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CanvasContext = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EmojiImage = any

// Emoji rendering utilities
const EMOJI_REGEX =
	/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]|[\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F191}-\u{1F251}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F171}]|[\u{1F17E}-\u{1F17F}]|[\u{1F18E}]|[\u{3030}]|[\u{2B50}]|[\u{2B55}]|[\u{2934}-\u{2935}]|[\u{2194}-\u{2199}]|[\u{21A9}-\u{21AA}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23EC}]|[\u{23F0}]|[\u{23F3}]|[\u{25FD}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2692}-\u{2697}]|[\u{26A0}-\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26B0}-\u{26B1}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2705}]|[\u{270A}-\u{270B}]|[\u{2728}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2795}-\u{2797}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F171}]|[\u{1F17E}-\u{1F17F}]|[\u{1F18E}]|[\u{1F191}-\u{1F19A}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F201}-\u{1F202}]|[\u{1F21A}]|[\u{1F22F}]|[\u{1F232}-\u{1F23A}]|[\u{1F250}-\u{1F251}]|[\u{1F300}-\u{1F321}]|[\u{1F324}-\u{1F393}]|[\u{1F396}-\u{1F397}]|[\u{1F399}-\u{1F39B}]|[\u{1F39E}-\u{1F3F0}]|[\u{1F3F3}-\u{1F3F5}]|[\u{1F3F7}-\u{1F3FA}]|[\u{1F400}-\u{1F4FD}]|[\u{1F4FF}-\u{1F53D}]|[\u{1F549}-\u{1F54E}]|[\u{1F550}-\u{1F567}]|[\u{1F56F}-\u{1F570}]|[\u{1F573}-\u{1F57A}]|[\u{1F587}]|[\u{1F58A}-\u{1F58D}]|[\u{1F590}]|[\u{1F595}-\u{1F596}]|[\u{1F5A4}-\u{1F5A5}]|[\u{1F5A8}]|[\u{1F5B1}-\u{1F5B2}]|[\u{1F5BC}]|[\u{1F5C2}-\u{1F5C4}]|[\u{1F5D1}-\u{1F5D3}]|[\u{1F5DC}-\u{1F5DE}]|[\u{1F5E1}]|[\u{1F5E3}]|[\u{1F5E8}]|[\u{1F5EF}]|[\u{1F5F3}]|[\u{1F5FA}-\u{1F64F}]|[\u{1F680}-\u{1F6C5}]|[\u{1F6CB}-\u{1F6D2}]|[\u{1F6E0}-\u{1F6E5}]|[\u{1F6E9}]|[\u{1F6EB}-\u{1F6EC}]|[\u{1F6F0}]|[\u{1F6F3}-\u{1F6F9}]|[\u{1F910}-\u{1F93A}]|[\u{1F93C}-\u{1F93E}]|[\u{1F940}-\u{1F945}]|[\u{1F947}-\u{1F970}]|[\u{1F973}-\u{1F976}]|[\u{1F97A}]|[\u{1F97C}-\u{1F9A2}]|[\u{1F9B0}-\u{1F9B9}]|[\u{1F9C0}-\u{1F9C2}]|[\u{1F9D0}-\u{1F9FF}]/gu

// Cache for downloaded emoji images
const emojiCache = new Map<string, EmojiImage>()

/**
 * Convert emoji to Twemoji codepoint
 */
export function emojiToCodepoint(emoji: string): string {
	// Handle combined emojis (like ❤️ which is ❤ + U+FE0F)
	const codePoints: number[] = []

	for (let i = 0; i < emoji.length; i++) {
		const codePoint = emoji.codePointAt(i)!
		codePoints.push(codePoint)

		// Skip the next character if it's a surrogate pair
		if (codePoint > 0xffff) {
			i++
		}
	}

	// Filter out variation selectors and other combining characters
	const filteredCodePoints = codePoints.filter(
		(cp) =>
			cp !== 0xfe0f && // Variation selector
			cp !== 0x200d && // Zero width joiner
			cp !== 0x20e3, // Combining enclosing keycap
	)

	// Convert to hex string (lowercase for consistency with CDN)
	return filteredCodePoints
		.map((cp) => cp.toString(16).toLowerCase().padStart(4, '0'))
		.join('-')
}

/**
 * Download emoji image from Twemoji CDN with timeout and better error handling
 */
export async function downloadEmojiImage(
	codepoint: string,
): Promise<EmojiImage> {
	// Skip empty codepoints
	if (!codepoint || codepoint.trim() === '') {
		return null
	}

	// Use the reliable jsDelivr CDN as primary source
	const urls = [
		`https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${codepoint}.svg`,
		`https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/${codepoint}.svg`,
		`https://raw.githubusercontent.com/twitter/twemoji/master/assets/svg/${codepoint}.svg`,
		`https://twemoji.maxcdn.com/v/latest/svg/${codepoint}.svg`,
	]

	for (const url of urls) {
		try {
			// Add timeout to prevent hanging requests
			const image = await Promise.race([
				loadImage(url),
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error('Timeout')), 5000),
				),
			])
			return image
		} catch {
			// Continue to next URL if this one fails
			continue
		}
	}

	// If all SVG URLs fail, try with PNG format as fallback
	const pngUrls = [
		`https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/${codepoint}.png`,
		`https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/${codepoint}.png`,
		`https://twemoji.maxcdn.com/v/latest/72x72/${codepoint}.png`,
	]

	for (const url of pngUrls) {
		try {
			// Add timeout to prevent hanging requests
			const image = await Promise.race([
				loadImage(url),
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error('Timeout')), 5000),
				),
			])
			return image
		} catch {
			// Continue to next URL if this one fails
			continue
		}
	}

	// If all URLs fail, return null
	console.warn(`Failed to load emoji ${codepoint} from all sources`)
	return null
}

/**
 * Get emoji image (from cache or download)
 */
async function getEmojiImage(emoji: string): Promise<EmojiImage> {
	const codepoint = emojiToCodepoint(emoji)

	if (emojiCache.has(codepoint)) {
		return emojiCache.get(codepoint)
	}

	const image = await downloadEmojiImage(codepoint)
	if (image) {
		emojiCache.set(codepoint, image)
	}

	return image
}

/**
 * Split text into text and emoji parts
 */
function splitTextAndEmojis(
	text: string,
): Array<{ type: 'text' | 'emoji'; content: string }> {
	const parts: Array<{ type: 'text' | 'emoji'; content: string }> = []
	let lastIndex = 0

	for (const match of text.matchAll(EMOJI_REGEX)) {
		const emoji = match[0]
		const index = match.index!

		// Add text before emoji
		if (index > lastIndex) {
			parts.push({
				type: 'text',
				content: text.slice(lastIndex, index),
			})
		}

		// Add emoji
		parts.push({
			type: 'emoji',
			content: emoji,
		})

		lastIndex = index + emoji.length
	}

	// Add remaining text
	if (lastIndex < text.length) {
		parts.push({
			type: 'text',
			content: text.slice(lastIndex),
		})
	}

	return parts
}

/**
 * Render text with colored emojis
 */
async function fillTextWithEmojis(
	ctx: CanvasContext,
	text: string,
	x: number,
	y: number,
	options: {
		font?: string
		fillStyle?: string
		emojiSize?: number
	} = {},
): Promise<void> {
	const {
		font = '24px "Noto Sans SC"',
		fillStyle = '#000000',
		emojiSize = 24,
	} = options

	ctx.font = font
	ctx.fillStyle = fillStyle

	// Calculate text baseline for proper emoji alignment
	const textMetrics = ctx.measureText('Ag') // Use a character with descenders and ascenders
	const textHeight =
		textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent
	const baselineOffset = textMetrics.actualBoundingBoxAscent

	const parts = splitTextAndEmojis(text)
	let currentX = x

	for (const part of parts) {
		if (part.type === 'text') {
			ctx.fillText(part.content, currentX, y)
			currentX += ctx.measureText(part.content).width
		} else if (part.type === 'emoji') {
			const emojiImage = await getEmojiImage(part.content)
			if (emojiImage) {
				// Align emoji with text baseline
				const emojiY = y - baselineOffset + (textHeight - emojiSize) / 2
				ctx.drawImage(emojiImage, currentX, emojiY, emojiSize, emojiSize)
				currentX += emojiSize
			} else {
				// Fallback to regular text rendering if emoji image fails to load
				ctx.fillText(part.content, currentX, y)
				currentX += ctx.measureText(part.content).width
			}
		}
	}
}

export async function extractAudio(
	videoPath: string,
	audioPath: string,
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		ffmpeg(videoPath)
			.noVideo()
			.audioCodec('libmp3lame')
			.audioBitrate('128k')
			.audioFrequency(16000)
			.save(audioPath)
			.on('end', () => resolve())
			.on('error', reject)
	})
}

/**
 * Convert WebVTT subtitle content (bilingual, alternating English / Chinese lines)
 * into an ASS subtitle content with separate styles so that the Chinese text can be
 * rendered with a larger font size while keeping the English text smaller.
 *
 * The conversion logic assumes each cue contains the English line first and the
 * Chinese line beginning with a dash ("- ") on the following line.
 */
async function convertWebVttToAss(vttContent: string): Promise<string> {
	// Helper to convert WebVTT time (00:00:00.000) -> ASS (0:00:00.00)
	const toAssTime = (t: string): string => {
		const match = t.match(/(\d+):(\d+):(\d+)\.(\d{1,3})/)
		if (!match) return '0:00:00.00'
		const [, hh, mm, ss, ms] = match
		const cs = String(Math.round(parseInt(ms) / 10)).padStart(2, '0')
		return `${parseInt(hh)}:${mm}:${ss}.${cs}`
	}

	const lines = vttContent.split(/\r?\n/)
	const events: Array<{
		start: string
		end: string
		eng: string
		zh: string
	}> = []

	for (let i = 0; i < lines.length; i++) {
		const timeMatch = lines[i].match(
			/^(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/, // Добавлен комментарий для ясности
		)
		if (timeMatch) {
			const [, start, end] = timeMatch
			let eng = ''
			let zh = ''
			// read following lines until blank
			// Parse bilingual content: first line is English, second line is Chinese
			let lineCount = 0
			for (let j = i + 1; j < lines.length; j++) {
				if (!lines[j].trim()) {
					i = j
					break
				}
				const line = lines[j].trim()
				if (lineCount === 0) {
					// First line after timestamp is English
					eng += (eng ? '\n' : '') + line
				} else if (lineCount === 1) {
					// Second line after timestamp is Chinese
					zh += (zh ? '\n' : '') + line
				}
				lineCount++
			}
			events.push({ start, end, eng, zh })
		}
	}

	// Build ASS file
	let ass = `[Script Info]\nScriptType: v4.00+\nCollisions: Normal\nPlayResX: 1920\nPlayResY: 1080\nTimer: 100.0000\n\n`
	ass +=
		`[V4+ Styles]\n` +
		'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, ' +
		'Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n' +
		'Style: Chinese,Noto Sans SC,72,&H0000FFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,30,1\n' +
		'Style: English,Noto Sans,36,&H0000FFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,60,1\n\n' // Добавлен комментарий для ясности

	ass += `[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`

	for (const ev of events) {
		const start = toAssTime(ev.start)
		const end = toAssTime(ev.end)
		if (ev.zh) {
			ass += `Dialogue: 0,${start},${end},Chinese,,0,0,0,,${ev.zh.replace(/,/g, '，')}\n`
		}
		if (ev.eng) {
			ass += `Dialogue: 0,${start},${end},English,,0,0,0,,${ev.eng.replace(/,/g, ',')}\n`
		}
	}

	return ass
}

/**
 * Clean up temporary file with error handling
 */
async function cleanupTempFile(
	filePath: string,
	fileType: string,
): Promise<void> {
	try {
		await fs.unlink(filePath)
	} catch (err) {
		console.warn(
			`Failed to clean up temporary ${fileType} file:`,
			(err as Error).message,
		)
	}
}

export async function renderVideoWithSubtitles(
	videoPath: string,
	subtitleContent: string,
	outputPath: string,
): Promise<void> {
	// Convert VTT content to ASS format
	const assContent = await convertWebVttToAss(subtitleContent)

	// Write ASS content to temporary file for FFmpeg
	const tempDir = path.dirname(outputPath)
	const tempAssPath = path.join(tempDir, `temp_${Date.now()}.ass`)
	await fs.writeFile(tempAssPath, assContent, 'utf8')

	return new Promise<void>((resolve, reject) => {
		ffmpeg(videoPath)
			.outputOptions('-vf', `subtitles=${tempAssPath}`)
			.save(outputPath)
			.on('end', async () => {
				await cleanupTempFile(tempAssPath, 'ASS')
				resolve()
			})
			.on('error', async (err) => {
				await cleanupTempFile(tempAssPath, 'ASS')
				console.error('Error rendering video with subtitles:', err.message)
				reject(err)
			})
	})
}

/**
 * Format view count with K, M, B suffixes
 */
function formatViewCount(count: number): string {
	if (count >= 1000000000) {
		return `${(count / 1000000000).toFixed(1)}B`
	} else if (count >= 1000000) {
		return `${(count / 1000000).toFixed(1)}M`
	} else if (count >= 1000) {
		return `${(count / 1000).toFixed(1)}K`
	}
	return count.toString()
}

/**
 * Format likes count with K, M suffixes
 */
function formatLikes(count: number): string {
	if (count >= 1000000) {
		return `${(count / 1000000).toFixed(1)}M`
	} else if (count >= 1000) {
		return `${(count / 1000).toFixed(1)}K`
	}
	return count.toString()
}

// Extracted rendering functions for better testability

interface VideoInfo {
	title: string
	translatedTitle?: string
	viewCount: number
	author?: string
	thumbnail?: string
	series?: string
	seriesEpisode?: number
}

interface Comment {
	id: string
	author: string
	authorThumbnail?: string
	content: string
	translatedContent?: string
	likes: number
	replyCount?: number
	source?: 'youtube' | 'tiktok' | 'twitter' | 'instagram' | 'weibo'
	platform?: string
}

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

// Export functions for testing
export { renderCoverSection, renderLikeIcon, renderLikeCount }

export async function renderVideoWithCanvas(
	videoPath: string,
	outputPath: string,
	videoInfo: VideoInfo,
	comments: Comment[],
): Promise<void> {
	console.log('🎬 Starting modern video rendering with Canvas...')
	const width = 1920
	const height = 1080
	const fps = 30
	const commentDuration = 4
	const introDuration = 3
	const coverDuration = 3 // Additional 3 seconds for cover
	const totalDuration =
		coverDuration + introDuration + comments.length * commentDuration
	const totalFrames = totalDuration * fps

	const framesDir = path.join(path.dirname(outputPath), 'frames_overlay')
	await fs.mkdir(framesDir, { recursive: true })

	const canvas = createCanvas(width, height)
	const ctx = canvas.getContext('2d')

	// Pre-load all author thumbnails
	console.log('🖼️ Pre-loading author thumbnails...')
	const authorImages = await Promise.all(
		comments.map(async (comment) => {
			if (!comment.authorThumbnail) return null
			try {
				return await loadImage(comment.authorThumbnail)
			} catch (error) {
				console.warn(
					`Could not load thumbnail for ${comment.author}:`,
					(error as Error).message,
				)
				return null
			}
		}),
	)
	console.log('✅ Thumbnails pre-loaded.')

	console.log('🖼️ Generating modern overlay frames...')
	for (let i = 0; i < totalFrames; i++) {
		const time = i / fps

		// Render background
		renderBackground(ctx, width, height)

		// Render cover section (first 3 seconds) - no video area during cover
		if (time < coverDuration) {
			await renderCoverSection(
				ctx,
				videoInfo,
				comments,
				time,
				coverDuration,
				width,
				height,
			)
		} else {
			// Render video area (only after cover section)
			const videoX = 950
			const videoY = 30
			const videoW = 900
			const videoH = 506
			renderVideoArea(ctx, videoX, videoY, videoW, videoH)

			// Render header
			await renderHeader(ctx, videoInfo, comments.length)

			// Render comment if applicable
			if (time >= coverDuration + introDuration) {
				const commentIndex = Math.floor(
					(time - coverDuration - introDuration) / commentDuration,
				)
				if (commentIndex < comments.length) {
					const comment = comments[commentIndex]
					const authorImage = authorImages[commentIndex]
					await renderCommentCard(
						ctx,
						comment,
						commentIndex,
						comments.length,
						authorImage,
						width,
						height,
					)
				}
			}
		}

		const framePath = path.join(
			framesDir,
			`frame-${i.toString().padStart(6, '0')}.png`,
		)
		const buffer = canvas.toBuffer('image/png')
		await fs.writeFile(framePath, buffer)
	}
	console.log('✅ Modern overlay frames generated.')

	console.log('🎥 Starting FFmpeg processing...')
	return new Promise<void>((resolve, reject) => {
		ffmpeg(videoPath) // Input 0: Original video
			.input(path.join(framesDir, `frame-%06d.png`)) // Input 1: Overlay frames
			.inputFPS(fps)
			.complexFilter([
				// Scale the original video with modern border radius effect
				`[0:v]scale=900:506,tpad=stop_mode=clone:stop_duration=${totalDuration}[scaled_video]`,
				// Add audio delay to start after cover section (3 seconds)
				`[0:a]adelay=${coverDuration}000|${coverDuration}000[delayed_audio]`,
				// Take the canvas frames as the main background
				`[1:v]format=pix_fmts=yuva420p[overlay_bg]`,
				// Overlay the scaled video on top of the background frames starting after cover section
				`[overlay_bg][scaled_video]overlay=x=950:y=30:enable='between(t,${coverDuration},${totalDuration})'[final_video]`,
			])
			.outputOptions([
				'-map',
				'[final_video]',
				'-map',
				'[delayed_audio]?',
				'-c:v',
				'libx264',
				'-c:a',
				'aac',
				'-b:a',
				'192k',
				'-pix_fmt',
				'yuv420p',
				'-t',
				totalDuration.toString(),
				'-shortest',
			])
			.save(outputPath)
			.on('end', async () => {
				console.log('✅ FFmpeg processing finished.')
				console.log('🧹 Cleaning up temporary files...')
				await fs.rm(framesDir, { recursive: true, force: true })
				console.log('✅ Cleanup complete.')
				resolve()
			})
			.on('error', (err) => {
				console.error('❌ Error during ffmpeg processing:', err)
				reject(err)
			})
	})
}

/**
 * Render video cover section with author and Chinese title
 * This section appears for the first 3 seconds of the video
 */
async function renderCoverSection(
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

// Helper functions for modern UI elements

function roundRect(
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

function wrapText(
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

/**
 * SVG-based like icon rendering utilities
 */
interface LikeIconOptions {
	size?: number
	color?: string
	strokeWidth?: number
	filled?: boolean // Whether to render filled or outlined icon
}

/**
 * Render a thumbs up SVG icon directly on canvas
 */
function renderLikeIcon(
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

	// Set up canvas for icon rendering
	ctx.save()
	ctx.translate(x, y)
	ctx.scale(size / 16, size / 16) // Scale to desired size (16 is base size)

	if (filled) {
		// Fill the icon
		ctx.fillStyle = color
		ctx.fill(path)
	} else {
		// Stroke the icon outline
		ctx.strokeStyle = color
		ctx.lineWidth = strokeWidth / (size / 16) // Scale stroke width
		ctx.stroke(path)
	}

	ctx.restore()
}

/**
 * Render like count with SVG icon
 */
function renderLikeCount(
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
