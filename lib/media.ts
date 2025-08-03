import ffmpeg from 'fluent-ffmpeg'
import { promises as fs } from 'fs'
import * as path from 'path'

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
 * Convert a WebVTT subtitle file (bilingual, alternating English / Chinese lines)
 * into an ASS subtitle file with separate styles so that the Chinese text can be
 * rendered with a larger font size while keeping the English text smaller.
 *
 * The conversion logic assumes each cue contains the English line first and the
 * Chinese line beginning with a dash ("- ") on the following line.
 */
async function convertWebVttToAss(vttPath: string): Promise<string> {
	const content = await fs.readFile(vttPath, 'utf8')

	// Prepare output .ass path (same directory, same basename)
	const assPath = path.format({
		...path.parse(vttPath),
		base: undefined,
		ext: '.ass',
	})

	// Helper to convert WebVTT time (00:00:00.000) -> ASS (0:00:00.00)
	const toAssTime = (t: string): string => {
		const match = t.match(/(\d+):(\d+):(\d+)\.(\d{1,3})/)
		if (!match) return '0:00:00.00'
		const [, hh, mm, ss, ms] = match
		const cs = String(Math.round(parseInt(ms) / 10)).padStart(2, '0')
		return `${parseInt(hh)}:${mm}:${ss}.${cs}`
	}

	const lines = content.split(/\r?\n/)
	const events: Array<{
		start: string
		end: string
		eng: string
		zh: string
	}> = []

	for (let i = 0; i < lines.length; i++) {
		const timeMatch = lines[i].match(
			/^(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/,
		)
		if (timeMatch) {
			const [, start, end] = timeMatch
			let eng = ''
			let zh = ''
			// read following lines until blank
			for (let j = i + 1; j < lines.length; j++) {
				if (!lines[j].trim()) {
					i = j
					break
				}
				const line = lines[j]
				if (line.trim().startsWith('-')) {
					zh += (zh ? '\n' : '') + line.replace(/^\s*-\s*/, '')
				} else {
					eng += (eng ? '\n' : '') + line.trim()
				}
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
		'Style: Chinese,Noto Sans SC,60,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,30,1\n' +
		'Style: English,Noto Sans,36,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,60,1\n\n'

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

	await fs.writeFile(assPath, ass, 'utf8')
	return assPath
}

export async function renderVideoWithSubtitles(
	videoPath: string,
	subtitlePath: string,
	outputPath: string,
): Promise<void> {
	// Convert WebVTT to ASS first so we can customise styles
	let assPath: string
	try {
		assPath = await convertWebVttToAss(subtitlePath)
	} catch (err) {
		console.warn(
			'Failed to convert VTT to ASS, falling back to original track:',
			(err as Error).message,
		)
		assPath = subtitlePath
	}

	return new Promise<void>((resolve, reject) => {
		ffmpeg(videoPath)
			.outputOptions('-vf', `subtitles=${assPath}`)
			.save(outputPath)
			.on('end', () => resolve())
			.on('error', (err) => {
				console.error('Error rendering video with subtitles:', err.message)
				reject(err)
			})
	})
}

/**
 * Render video with info overlay and comments
 * Creates a video with gradient background, video info on top, and scrolling comments below
 */
export async function renderVideoWithInfoAndComments(
	videoPath: string,
	outputPath: string,
	videoInfo: {
		title: string
		translatedTitle?: string
		viewCount: number
		author?: string
		thumbnail?: string
	},
	comments: Array<{
		id: string
		author: string
		authorThumbnail?: string
		content: string
		translatedContent?: string
		likes: number
		replyCount?: number
	}>,
): Promise<void> {
	// Calculate total duration based on comments
	const totalDuration = 3 + comments.length * 4 // 3s for info + 4s per comment

	// Create a complex filter that combines video with overlay
	// Note: filterComplex is defined but not used in the current implementation
	// const filterComplex = [
	// 	// Input video - loop it to match the total duration
	// 	`[0:v]loop=loop=-1:size=1,trim=duration=${totalDuration},scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black[video]`,

	// 	// Create gradient background with proper duration
	// 	`color=size=1920x1080:color=#1a1a2e:duration=${totalDuration}[bg]`,

	// 	// Create gradient overlay for top section (0-400px)
	// 	`color=size=1920x400:color=#16213e:duration=${totalDuration}[top_gradient]`,

	// 	// Create gradient overlay for bottom section (400-1080px)
	// 	`color=size=1920x680:color=#0f3460:duration=${totalDuration}[bottom_gradient]`,

	// 	// Overlay gradients on background
	// 	'[bg][top_gradient]overlay=0:0[bg_with_top]',
	// 	'[bg_with_top][bottom_gradient]overlay=0:400[bg_with_gradients]',

	// 	// Overlay video on background with transparency
	// 	'[bg_with_gradients][video]overlay=0:0:format=auto:shortest=1[final]',
	// ].join(';')

	// Create ASS subtitle file for better control over positioning and styling
	const assContent = await generateInfoAndCommentsAss(videoInfo, comments)
	const assPath = outputPath.replace('.mp4', '_info.ass')
	await fs.writeFile(assPath, assContent, 'utf8')

	// Ensure output directory exists
	const outputDir = path.dirname(outputPath)
	await fs.mkdir(outputDir, { recursive: true })

	return new Promise<void>((resolve, reject) => {
		// Use a simpler approach - just add subtitles to the video
		ffmpeg(videoPath)
			.videoFilters(`ass=${assPath}`)
			.outputOptions([
				'-c:v',
				'libx264',
				'-c:a',
				'aac',
				'-preset',
				'medium',
				'-crf',
				'23',
				'-t',
				totalDuration.toString(),
			])
			.save(outputPath)
			.on('end', () => {
				// Clean up subtitle file
				fs.unlink(assPath).catch(console.warn)
				resolve()
			})
			.on('error', (err) => {
				console.error(
					'Error rendering video with info and comments:',
					err.message,
				)
				reject(err)
			})
	})
}

/**
 * Generate ASS subtitle content for video info and comments with better positioning
 */
async function generateInfoAndCommentsAss(
	videoInfo: {
		title: string
		translatedTitle?: string
		viewCount: number
		author?: string
		thumbnail?: string
	},
	comments: Array<{
		id: string
		author: string
		authorThumbnail?: string
		content: string
		translatedContent?: string
		likes: number
		replyCount?: number
	}>,
): Promise<string> {
	// Build ASS file header
	let assContent = `[Script Info]\nScriptType: v4.00+\nCollisions: Normal\nPlayResX: 1920\nPlayResY: 1080\nTimer: 100.0000\n\n`

	// Define styles for different text elements
	assContent += `[V4+ Styles]\n`
	assContent += `Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n`
	assContent += `Style: Title,Noto Sans SC,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,1,2,20,20,50,1\n`
	assContent += `Style: Info,Noto Sans SC,32,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,20,20,100,1\n`
	assContent += `Style: Comment,Noto Sans SC,28,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,8,20,20,30,1\n`
	assContent += `Style: Likes,Noto Sans SC,24,&H00FF9999,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,8,20,20,60,1\n\n`

	assContent += `[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`

	let currentTime = 0

	// Video info section (0-3 seconds)
	const title = videoInfo.translatedTitle || videoInfo.title
	const viewCountText = formatViewCount(videoInfo.viewCount)
	const authorText = videoInfo.author || 'Unknown Author'

	// Title (top section, centered)
	assContent += `Dialogue: 0,${formatAssTime(currentTime)},${formatAssTime(currentTime + 3)},Title,,0,0,0,,${title.replace(/,/g, '，')}\n`

	// View count and author (top section, below title)
	assContent += `Dialogue: 0,${formatAssTime(currentTime)},${formatAssTime(currentTime + 3)},Info,,0,0,0,,${viewCountText} views • ${authorText.replace(/,/g, '，')}\n`

	currentTime += 3

	// Comments section - each comment shows for 4 seconds
	for (const comment of comments) {
		const commentText = comment.translatedContent || comment.content
		const authorName = comment.author
		const likesText = formatLikes(comment.likes)

		// Truncate long comments to fit better
		const truncatedComment =
			commentText.length > 80
				? commentText.substring(0, 80) + '...'
				: commentText

		// Comment author and content (bottom section, left aligned)
		assContent += `Dialogue: 0,${formatAssTime(currentTime)},${formatAssTime(currentTime + 4)},Comment,,0,0,0,,${authorName.replace(/,/g, '，')}: ${truncatedComment.replace(/,/g, '，')}\n`

		// Likes count (bottom section, right aligned)
		assContent += `Dialogue: 0,${formatAssTime(currentTime)},${formatAssTime(currentTime + 4)},Likes,,0,0,0,,❤️ ${likesText}\n`

		currentTime += 4
	}

	return assContent
}

/**
 * Format time in ASS format (H:MM:SS.cc)
 */
function formatAssTime(seconds: number): string {
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	const secs = Math.floor(seconds % 60)
	const cs = Math.floor((seconds % 1) * 100)
	return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`
}

/**
 * Format time in SRT format (HH:MM:SS,mmm)
 * Note: This function is currently unused but kept for potential future use
 */
// function formatTime(seconds: number): string {
// 	const hours = Math.floor(seconds / 3600)
// 	const minutes = Math.floor((seconds % 3600) / 60)
// 	const secs = Math.floor(seconds % 60)
// 	const ms = Math.floor((seconds % 1) * 1000)
// 	return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`
// }

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
