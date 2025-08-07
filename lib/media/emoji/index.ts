import { loadImage } from 'canvas'
import type { EmojiImage } from '../types'

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
export async function getEmojiImage(emoji: string): Promise<EmojiImage> {
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
export function splitTextAndEmojis(
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
export async function fillTextWithEmojis(
	ctx: any,
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
