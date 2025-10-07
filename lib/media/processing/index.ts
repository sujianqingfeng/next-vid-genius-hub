import { execa } from 'execa'
import { promises as fs } from 'fs'
import * as path from 'path'
import {
	defaultSubtitleRenderConfig,
	type SubtitleRenderConfig,
	type TimeSegmentEffect,
	type HintTextConfig,
} from '../types'

async function runFfmpeg(args: string[]): Promise<void> {
	await execa('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args])
}

/**
 * Get video resolution (width and height) using FFmpeg
 */
async function getVideoResolution(videoPath: string): Promise<{ width: number; height: number }> {
	try {
		const { stdout } = await execa('ffprobe', [
			'-v', 'quiet',
			'-print_format', 'csv=p=0',
			'-select_streams', 'v:0',
			'-show_entries', 'stream=width,height',
			videoPath
		])

		const [width, height] = stdout.split(',').map(Number)
		if (!width || !height || Number.isNaN(width) || Number.isNaN(height)) {
			// Fallback to 1080p if we can't detect resolution
			return { width: 1920, height: 1080 }
		}

		return { width, height }
	} catch (error) {
		console.warn('Failed to get video resolution, using 1080p fallback:', error)
		// Fallback to 1080p if detection fails
		return { width: 1920, height: 1080 }
	}
}

/**
 * Escape a path for use in FFmpeg filters
 */
function escapeForFFmpegFilterPath(filePath: string): string {
	// For Windows, we need to escape backslashes and convert to forward slashes
	const normalizedPath = filePath.replace(/\\/g, '/')
	// For FFmpeg filter syntax, we need to escape colons and backslashes
	return normalizedPath.replace(/:/g, '\\:').replace(/\\/g, '\\\\')
}

export async function renderVideoWithSubtitles(
	videoPath: string,
	subtitleContent: string,
	outputPath: string,
	subtitleConfig: SubtitleRenderConfig = defaultSubtitleRenderConfig,
): Promise<void> {
	// Get video resolution for responsive font scaling
	const videoResolution = await getVideoResolution(videoPath)
	const scaleFactor = videoResolution.height / 1080 // Scale based on 1080p as reference

	const scaledFontSize = Math.round(subtitleConfig.fontSize * scaleFactor)
	const normalizedConfig: SubtitleRenderConfig = {
		fontSize: Math.min(Math.max(scaledFontSize, 12), 72),
		textColor: subtitleConfig.textColor || defaultSubtitleRenderConfig.textColor,
		backgroundColor:
			subtitleConfig.backgroundColor || defaultSubtitleRenderConfig.backgroundColor,
		backgroundOpacity: Math.min(Math.max(subtitleConfig.backgroundOpacity, 0), 1),
		outlineColor:
			subtitleConfig.outlineColor || defaultSubtitleRenderConfig.outlineColor,
		timeSegmentEffects: subtitleConfig.timeSegmentEffects || [],
		hintTextConfig: subtitleConfig.hintTextConfig || defaultSubtitleRenderConfig.hintTextConfig,
	}

	const tempDir = path.dirname(outputPath)

	// Convert VTT content to ASS format using requested styling
	const assContent = await convertWebVttToAss(subtitleContent, normalizedConfig)

	// Write ASS content to temporary file for FFmpeg
	const tempAssPath = path.join(tempDir, `temp_${Date.now()}.ass`)
	await fs.writeFile(tempAssPath, assContent, 'utf8')

	const escapedAssPath = escapeForFFmpegFilterPath(tempAssPath)

	try {
		const timeSegmentEffects = normalizedConfig.timeSegmentEffects

		if (!timeSegmentEffects || timeSegmentEffects.length === 0) {
			// Simple case: no time segment effects, just render subtitles
			await runFfmpeg([
				'-i',
				videoPath,
				'-vf',
				`subtitles=${escapedAssPath}`,
				outputPath,
			])
		} else {
			// Process with time segment effects
			await renderVideoWithEffects(videoPath, escapedAssPath, timeSegmentEffects, outputPath, subtitleConfig.hintTextConfig)
		}
	} catch (error) {
		console.error('Error rendering video with subtitles:', (error as Error).message)
		throw error
	} finally {
		// Clean up temporary file
		try {
			await fs.unlink(tempAssPath)
		} catch {
			// Ignore cleanup errors
		}
	}
}

async function renderVideoWithEffects(
	videoPath: string,
	assPath: string,
	timeSegmentEffects: TimeSegmentEffect[],
	outputPath: string,
	hintTextConfig?: HintTextConfig
): Promise<void> {
	const hasBlackScreen = timeSegmentEffects.some(effect => effect.blackScreen)
	const hasMuteAudio = timeSegmentEffects.some(effect => effect.muteAudio)

	if (!hasBlackScreen && !hasMuteAudio) {
		// Just render subtitles
		await runFfmpeg([
			'-i', videoPath,
			'-vf', `subtitles=${assPath}`,
			'-c:v', 'libx264', '-c:a', 'aac',
			'-y', outputPath
		])
		return
	}

	// Use two-pass approach to avoid complex filter issues
	const tempVideoPath = outputPath.replace(/(\.[^.]+)$/, '_temp_video$1')
	const tempAudioPath = outputPath.replace(/(\.[^.]+)$/, '_temp_audio$1')

	try {
		// Step 1: Render video with subtitles and black screen effects
		if (hasBlackScreen) {
			await renderVideoWithBlackScreen(videoPath, assPath, timeSegmentEffects, tempVideoPath, hintTextConfig)
		} else {
			// Just subtitles
			await runFfmpeg([
				'-i', videoPath,
				'-vf', `subtitles=${assPath}`,
				'-c:v', 'libx264',
				'-an', // No audio
				'-y', tempVideoPath
			])
		}

		// Step 2: Process audio with mute effects
		if (hasMuteAudio) {
			await processAudioWithMute(videoPath, timeSegmentEffects, tempAudioPath)
		} else {
			// Copy original audio
			await runFfmpeg([
				'-i', videoPath,
				'-vn', // No video
				'-c:a', 'aac',
				'-y', tempAudioPath
			])
		}

		// Step 3: Combine video and audio
		await runFfmpeg([
			'-i', tempVideoPath,
			'-i', tempAudioPath,
			'-c:v', 'copy',
			'-c:a', 'aac',
			'-y', outputPath
		])

	} finally {
		// Clean up temporary files
		try {
			await fs.unlink(tempVideoPath)
		} catch {
			// Ignore cleanup errors
		}
		try {
			await fs.unlink(tempAudioPath)
		} catch {
			// Ignore cleanup errors
		}
	}
}

async function renderVideoWithBlackScreen(
	videoPath: string,
	assPath: string,
	timeSegmentEffects: TimeSegmentEffect[],
	outputPath: string,
	hintTextConfig?: HintTextConfig
): Promise<void> {
	const blackScreenSegments = timeSegmentEffects.filter(effect => effect.blackScreen)

	if (blackScreenSegments.length === 0) {
		// Just render subtitles
		await runFfmpeg([
			'-i', videoPath,
			'-vf', `subtitles=${assPath}`,
			'-c:v', 'libx264',
			'-an',
			'-y', outputPath
		])
		return
	}

	if (!hintTextConfig?.enabled || !hintTextConfig.text.trim()) {
		// Render black screen without hint text
		await renderBlackScreenOnly(videoPath, assPath, blackScreenSegments, outputPath)
		return
	}

	// Render black screen with hint text
	await renderBlackScreenWithHintText(videoPath, assPath, blackScreenSegments, outputPath, hintTextConfig)
}

async function renderBlackScreenOnly(
	videoPath: string,
	assPath: string,
	blackScreenSegments: TimeSegmentEffect[],
	outputPath: string
): Promise<void> {
	const startTime = blackScreenSegments[0].startTime
	const endTime = blackScreenSegments[0].endTime

	await runFfmpeg([
		'-i', videoPath,
		'-filter_complex', [
			`[0:v]subtitles=${assPath}[subtitled]`,
			`[subtitled]colorchannelmixer=rr=0:gg=0:bb=0:enable='between(t,${startTime},${endTime})'[output]`
		].join(';'),
		'-map', '[output]',
		'-c:v', 'libx264',
		'-an',
		'-y', outputPath
	])
}

async function renderBlackScreenWithHintText(
	videoPath: string,
	assPath: string,
	blackScreenSegments: TimeSegmentEffect[],
	outputPath: string,
	hintTextConfig: HintTextConfig
): Promise<void> {
	const startTime = blackScreenSegments[0].startTime
	const endTime = blackScreenSegments[0].endTime

	// Get video resolution for text scaling
	const videoResolution = await getVideoResolution(videoPath)
	const scaleFactor = videoResolution.height / 1080
	const scaledFontSize = Math.round(hintTextConfig.fontSize * scaleFactor)

	// Create hint text drawtext filter
	const textPosition = getTextPosition(hintTextConfig.position)
	const textColor = convertHexToFfmpegColor(hintTextConfig.textColor)

	const drawtextFilter = `drawtext=text='${hintTextConfig.text.replace(/'/g, "\\'")}':` +
		`fontsize=${scaledFontSize}:` +
		`fontcolor=${textColor}:` +
		`x=${textPosition.x}:` +
		`y=${textPosition.y}:` +
		`enable='between(t,${startTime},${endTime})'`

	await runFfmpeg([
		'-i', videoPath,
		'-filter_complex', [
			`[0:v]subtitles=${assPath}[subtitled]`,
			`[subtitled]colorchannelmixer=rr=0:gg=0:bb=0:enable='between(t,${startTime},${endTime})'[blackscreen]`,
			`[blackscreen]${drawtextFilter}[output]`
		].join(';'),
		'-map', '[output]',
		'-c:v', 'libx264',
		'-an',
		'-y', outputPath
	])
}

function getTextPosition(position: 'center' | 'top' | 'bottom'): { x: string, y: string } {
	switch (position) {
		case 'center':
			return {
				x: `(w-text_w)/2`,
				y: `(h-text_h)/2`
			}
		case 'top':
			return {
				x: `(w-text_w)/2`,
				y: `h*0.1`
			}
		case 'bottom':
			return {
				x: `(w-text_w)/2`,
				y: `h*0.85`
			}
		default:
			return {
				x: `(w-text_w)/2`,
				y: `(h-text_h)/2`
			}
	}
}

function convertHexToFfmpegColor(hex: string): string {
	let normalized = hex.trim().replace('#', '')
	if (normalized.length === 3) {
		normalized = normalized
			.split('')
			.map((char) => char + char)
			.join('')
	}
	const int = Number.parseInt(normalized, 16)
	const r = (int >> 16) & 255
	const g = (int >> 8) & 255
	const b = int & 255
	return `0x${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

async function processAudioWithMute(
	videoPath: string,
	timeSegmentEffects: TimeSegmentEffect[],
	outputPath: string
): Promise<void> {
	const muteSegments = timeSegmentEffects.filter(effect => effect.muteAudio)

	if (muteSegments.length === 0) {
		// Copy original audio
		await runFfmpeg([
			'-i', videoPath,
			'-vn',
			'-c:a', 'aac',
			'-y', outputPath
		])
		return
	}

	if (muteSegments.length === 1) {
		// Single mute segment
		const segment = muteSegments[0]
		console.log(`Applying mute from ${segment.startTime} to ${segment.endTime}`)
		await runFfmpeg([
			'-i', videoPath,
			'-af', `volume=enable='between(t,${segment.startTime},${segment.endTime})':volume=0`,
			'-vn',
			'-c:a', 'aac',
			'-y', outputPath
		])
	} else {
		// Multiple mute segments - use a different approach
		console.log(`Applying ${muteSegments.length} mute segments`)
		const muteExpressions = muteSegments
			.map(segment => `between(t,${segment.startTime},${segment.endTime})`)
			.join('+')

		await runFfmpeg([
			'-i', videoPath,
			'-af', `volume=enable='${muteExpressions}':volume=0`,
			'-vn',
			'-c:a', 'aac',
			'-y', outputPath
		])
	}
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
	// Helper to convert WebVTT time (00:00:00.000 or 00:00.000) -> ASS (0:00:00.00)
	const toAssTime = (t: string): string => {
		// Try HH:MM:SS.mmm format first
		let match = t.match(/(\d+):(\d+):(\d+)\.(\d{1,3})/)
		if (match) {
			const [, hh, mm, ss, ms] = match
			const cs = String(Math.round(parseInt(ms) / 10)).padStart(2, '0')
			return `${parseInt(hh)}:${mm}:${ss}.${cs}`
		}

		// Try MM:SS.mmm format (no hours)
		match = t.match(/(\d+):(\d+)\.(\d{1,3})/)
		if (match) {
			const [, mm, ss, ms] = match
			const cs = String(Math.round(parseInt(ms) / 10)).padStart(2, '0')
			return `0:${mm}:${ss}.${cs}`
		}

		return '0:00:00.00'
	}

	const lines = vttContent.split(/\r?\n/)
	const events: Array<{
		start: string
		end: string
		eng: string
		zh: string
	}> = []

	for (let i = 0; i < lines.length; i++) {
		// Match both HH:MM:SS.mmm and MM:SS.mmm formats
		const timeMatch = lines[i].match(
			/^(\d{1,2}:\d{2}(?::\d{2})?\.\d{3}) --> (\d{1,2}:\d{2}(?::\d{2})?\.\d{3})/,
		)
		if (timeMatch) {
			const [, start, end] = timeMatch
			const engLine = lines[i + 1]?.trim() || ''
			const zhLine = lines[i + 2]?.trim().replace(/^- /, '') || ''

			if (engLine && zhLine) {
				events.push({ start: toAssTime(start), end: toAssTime(end), eng: engLine, zh: zhLine })
			} else if (engLine) {
				events.push({ start: toAssTime(start), end: toAssTime(end), eng: engLine, zh: '' })
			}

			i += 2
		}
	}

	const primaryColor = toAssColor(config.textColor, 1)
	const secondaryColor = primaryColor
	const outlineColor = toAssColor(config.outlineColor, 0.9)
	const backgroundColor = toAssColor(config.backgroundColor, config.backgroundOpacity)

	// Calculate vertical margin to add some space from bottom (1x font size seems more appropriate)
	const verticalMargin = Math.round(config.fontSize)

	// Build ASS file content
	const assContent = `[Script Info]
Title: Generated Subtitles
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: English,Arial,${Math.round(config.fontSize * 0.65)},${primaryColor},${secondaryColor},${outlineColor},${backgroundColor},0,0,0,0,100,100,0,0,1,1,0,2,0,0,${verticalMargin},1
Style: Chinese,Arial,${config.fontSize},${primaryColor},${secondaryColor},${outlineColor},${backgroundColor},0,0,0,0,100,100,0,0,1,1,0,2,0,0,${verticalMargin},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events
	.map(
		(event) =>
			`Dialogue: 0,${event.start},${event.end},Chinese,,0,0,0,,${event.zh}\n` +
			`Dialogue: 0,${event.start},${event.end},English,,0,0,0,,${event.eng}`
	)
	.join('\n')}`

	return assContent
}

function toAssColor(hex: string, opacity: number) {
	let normalized = hex.trim().replace('#', '')
	if (normalized.length === 3) {
		normalized = normalized
			.split('')
			.map((char) => char + char)
			.join('')
	}
	const int = Number.parseInt(normalized, 16)
	const r = (int >> 16) & 255
	const g = (int >> 8) & 255
	const b = int & 255
	const alpha = Number.isFinite(opacity) ? Math.min(Math.max(opacity, 0), 1) : 1
	return `&H${((1 - alpha) * 255).toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${r.toString(16).padStart(2, '0')}`
}

/**
 * Extract audio from video file and save as MP3
 */
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