import { execa } from 'execa'
import { promises as fs } from 'fs'
import * as path from 'path'
import {
	defaultSubtitleRenderConfig,
	type SubtitleRenderConfig,
} from '../types'

async function runFfmpeg(args: string[]): Promise<void> {
	await execa('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args])
}

/**
 * Escape a filesystem path for safe use inside an ffmpeg filter argument.
 * - Wrap in single quotes to avoid colon/space parsing
 * - Escape single quotes within value
 * - On Windows, double backslashes for ffmpeg parsing
 */
function escapeForFFmpegFilterPath(filePath: string): string {
	let p = filePath
	// Double backslashes for Windows-style paths so ffmpeg does not treat them as escapes
	if (p.includes('\\')) {
		p = p.replace(/\\/g, '\\\\')
	}
	// Escape single quotes inside and wrap the whole path with single quotes
	p = p.replace(/'/g, "\\'")
	return `'${p}'`
}

/**
 * Sanitize text for ASS dialogue:
 * - Normalize newlines to \N (ASS line break)
 * - Escape ASS override block braces { }
 * - Remove ASCII control characters
 */
function sanitizeAssText(text: string): string {
	const unified = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
	const escapedBraces = unified.replace(/[{}]/g, (m) => `\\${m}`)
	const withoutControl = escapedBraces.replace(
		/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,
		' ',
	)
	return withoutControl.replace(/\n/g, '\\N')
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max)
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
	let normalized = hex.trim().replace('#', '')
	if (normalized.length === 3) {
		normalized = normalized
			.split('')
			.map((char) => char + char)
			.join('')
	}
	const int = Number.parseInt(normalized, 16)
	return {
		r: (int >> 16) & 255,
		g: (int >> 8) & 255,
		b: int & 255,
	}
}

function toAssColor(hex: string, opacity: number): string {
	const { r, g, b } = hexToRgb(hex)
	const transparent = clamp(1 - opacity, 0, 1)
	const alpha = Math.round(transparent * 255)
	const aa = alpha.toString(16).padStart(2, '0').toUpperCase()
	const bb = b.toString(16).padStart(2, '0').toUpperCase()
	const gg = g.toString(16).padStart(2, '0').toUpperCase()
	const rr = r.toString(16).padStart(2, '0').toUpperCase()
	return `&H${aa}${bb}${gg}${rr}`
}

export async function extractAudio(
	videoPath: string,
	audioPath: string,
): Promise<void> {
	await runFfmpeg([
		'-i',
		videoPath,
		'-vn',
		'-acodec',
		'libmp3lame',
		'-b:a',
		'128k',
		'-ar',
		'16000',
		audioPath,
	])
}

/**
 * Convert WebVTT subtitle content (bilingual, alternating English / Chinese lines)
 * into an ASS subtitle content with separate styles so that the Chinese text can be
 * rendered with a larger font size while keeping the English text smaller.
 *
 * The conversion logic assumes each cue contains the English line first and the
 * Chinese line beginning with a dash ("- ") on the following line.
 */
async function convertWebVttToAss(
	vttContent: string,
	config: SubtitleRenderConfig,
): Promise<string> {
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
	const mergedConfig: SubtitleRenderConfig = {
		fontSize: clamp(config.fontSize, 12, 72),
		textColor: config.textColor,
		backgroundColor: config.backgroundColor,
		backgroundOpacity: clamp(config.backgroundOpacity, 0, 1),
		outlineColor: config.outlineColor,
	}

	const primaryColor = toAssColor(mergedConfig.textColor, 1)
	const secondaryColor = primaryColor
	const outlineColor = toAssColor(mergedConfig.outlineColor, 1)
	const backgroundColor = toAssColor(
		mergedConfig.backgroundColor,
		mergedConfig.backgroundOpacity,
	)

	const chineseFontSize = Math.round(mergedConfig.fontSize)
	const englishFontSize = Math.max(Math.round(mergedConfig.fontSize * 0.65), 12)

	let ass = `[Script Info]\nScriptType: v4.00+\nCollisions: Normal\nPlayResX: 1920\nPlayResY: 1080\nTimer: 100.0000\n\n`
	ass +=
		`[V4+ Styles]\n` +
		'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, ' +
		'Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n' +
		`Style: Chinese,Noto Sans SC,${chineseFontSize},${primaryColor},${secondaryColor},${outlineColor},${backgroundColor},0,0,0,0,100,100,0,0,1,2,0,2,10,10,30,1\n` +
		`Style: English,Noto Sans,${englishFontSize},${primaryColor},${secondaryColor},${outlineColor},${backgroundColor},0,0,0,0,100,100,0,0,1,2,0,2,10,10,60,1\n\n`

	ass += `[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`

	for (const ev of events) {
		const start = toAssTime(ev.start)
		const end = toAssTime(ev.end)
		const zhText = ev.zh ? sanitizeAssText(ev.zh).replace(/,/g, '，') : ''
		const enText = ev.eng ? sanitizeAssText(ev.eng) : ''
		if (zhText) {
			ass += `Dialogue: 0,${start},${end},Chinese,,0,0,0,,${zhText}\n`
		}
		if (enText) {
			ass += `Dialogue: 0,${start},${end},English,,0,0,0,,${enText}\n`
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
	subtitleConfig: SubtitleRenderConfig = defaultSubtitleRenderConfig,
): Promise<void> {
	const normalizedConfig: SubtitleRenderConfig = {
		fontSize: clamp(subtitleConfig.fontSize, 12, 72),
		textColor: subtitleConfig.textColor || defaultSubtitleRenderConfig.textColor,
		backgroundColor:
			subtitleConfig.backgroundColor || defaultSubtitleRenderConfig.backgroundColor,
		backgroundOpacity: clamp(subtitleConfig.backgroundOpacity, 0, 1),
		outlineColor:
			subtitleConfig.outlineColor || defaultSubtitleRenderConfig.outlineColor,
	}

	// Convert VTT content to ASS format using requested styling
	const assContent = await convertWebVttToAss(subtitleContent, normalizedConfig)

	// Write ASS content to temporary file for FFmpeg
	const tempDir = path.dirname(outputPath)
	const tempAssPath = path.join(tempDir, `temp_${Date.now()}.ass`)
	await fs.writeFile(tempAssPath, assContent, 'utf8')

	const escapedAssPath = escapeForFFmpegFilterPath(tempAssPath)
	try {
		await runFfmpeg([
			'-i',
			videoPath,
			'-vf',
			`subtitles=${escapedAssPath}`,
			outputPath,
		])
	} catch (error) {
		console.error('Error rendering video with subtitles:', (error as Error).message)
		throw error
	} finally {
		await cleanupTempFile(tempAssPath, 'ASS')
	}
}
