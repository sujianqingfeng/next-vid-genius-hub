import { createCanvas, loadImage } from 'canvas'
import ffmpeg from 'fluent-ffmpeg'
import { promises as fs } from 'fs'
import * as path from 'path'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CanvasContext = any

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
		'Style: Chinese,Noto Sans SC,60,&H0000FFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,30,1\n' +
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
 * Creates a video with white background, video info on top left, small video on top right, and scrolling comments below
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
	console.log('🎬 Starting video rendering with info and comments...')
	console.log(`📁 Input video: ${videoPath}`)
	console.log(`📁 Output path: ${outputPath}`)
	console.log(`📊 Video info:`, {
		title: videoInfo.title,
		translatedTitle: videoInfo.translatedTitle,
		viewCount: videoInfo.viewCount,
		author: videoInfo.author,
		hasThumbnail: !!videoInfo.thumbnail,
	})
	console.log(`💬 Comments count: ${comments.length}`)

	// Calculate total duration based on comments
	const totalDuration = 3 + comments.length * 4 // 3s for info + 4s per comment
	console.log(`⏱️  Total duration: ${totalDuration} seconds`)
	console.log(
		`📊 Performance mode: ${totalDuration > 60 || comments.length > 20 ? 'Simplified' : 'Full layout'}`,
	)

	// Create ASS subtitle file for better control over positioning and styling
	console.log('📝 Generating ASS subtitle content...')
	const assContent = await generateInfoAndCommentsAss(videoInfo, comments)
	const assPath = outputPath.replace('.mp4', '_info.ass')
	console.log(`📄 ASS file path: ${assPath}`)

	console.log('💾 Writing ASS subtitle file...')
	await fs.writeFile(assPath, assContent, 'utf8')
	console.log('✅ ASS subtitle file written successfully')

	// Ensure output directory exists
	const outputDir = path.dirname(outputPath)
	console.log(`📂 Creating output directory: ${outputDir}`)
	await fs.mkdir(outputDir, { recursive: true })
	console.log('✅ Output directory ready')

	return new Promise<void>((resolve, reject) => {
		console.log('🎥 Starting FFmpeg processing...')

		// Create optimized filter for the new layout
		const filterComplex = [
			// Input video - use tpad instead of loop for better performance
			`[0:v]tpad=stop_mode=clone:stop_duration=${totalDuration},scale=900:506:force_original_aspect_ratio=decrease,pad=900:506:(ow-iw)/2:(oh-ih)/2:white[small_video]`,

			// Create white background
			`color=size=1920x1080:color=white:duration=${totalDuration}[bg]`,

			// Overlay small video on top right (position: 950, 30) - matching canvas layout
			`[bg][small_video]overlay=950:30[bg_with_video]`,

			// Add subtitle overlay
			`[bg_with_video]ass=${assPath}[final]`,
		].join(';')

		console.log('🔧 FFmpeg filter complex:', filterComplex)

		// Add fallback option for performance issues
		const useSimpleFilter = totalDuration > 60 || comments.length > 20
		let finalFilter = filterComplex

		if (useSimpleFilter) {
			console.log(
				'⚠️  Using simplified filter due to long duration or many comments',
			)
			finalFilter = `[0:v]tpad=stop_mode=clone:stop_duration=${totalDuration},scale=900:506:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:white,overlay=950:30,ass=${assPath}[final]`
		}

		const ffmpegProcess = ffmpeg(videoPath)
			.videoFilters(finalFilter)
			.outputOptions([
				'-c:v',
				'libx264',
				'-c:a',
				'aac',
				'-preset',
				'fast', // Use faster preset for better performance
				'-crf',
				'28', // Slightly lower quality for faster encoding
				'-threads',
				'4', // Limit threads to prevent resource exhaustion
				'-t',
				totalDuration.toString(),
			])
			.save(outputPath)

		console.log('🚀 FFmpeg process started, waiting for completion...')

		let lastProgressTime = 0
		let lastFrame = 0
		let progressCount = 0
		let lastProgressUpdate = Date.now()

		// Set up timeout detection
		const timeoutInterval = setInterval(() => {
			const timeSinceLastProgress = Date.now() - lastProgressUpdate
			if (timeSinceLastProgress > 30000) {
				// 30 seconds timeout
				console.log(
					'⚠️  Warning: No progress for 30 seconds, FFmpeg might be stuck',
				)
				console.log(
					'   Consider checking system resources or restarting the process',
				)
			}
		}, 10000) // Check every 10 seconds

		ffmpegProcess
			.on('start', (commandLine) => {
				console.log('🎯 FFmpeg command started:', commandLine)
			})
			.on('progress', (progress) => {
				// Calculate percentage based on current time vs total duration
				const currentTime = progress.timemark || '00:00:00'
				const timeInSeconds = parseTimeToSeconds(currentTime)
				const calculatedPercent =
					totalDuration > 0
						? Math.round((timeInSeconds / totalDuration) * 100)
						: 0

				const percent = progress.percent || calculatedPercent
				const timemark = progress.timemark || 'N/A'
				const fps = progress.currentFps || 'N/A'
				const frame = progress.frames || 'N/A'

				// Only log if there's actual progress or every 10th update
				const hasTimeProgress = timeInSeconds > lastProgressTime
				const hasFrameProgress = typeof frame === 'number' && frame > lastFrame
				const shouldLog =
					hasTimeProgress || hasFrameProgress || progressCount % 10 === 0

				if (shouldLog) {
					console.log(
						`📊 FFmpeg progress: ${percent}% | Time: ${timemark}/${formatTime(totalDuration)} | FPS: ${fps} | Frame: ${frame}`,
					)

					// Check for potential issues
					if (fps === 'N/A' && progressCount > 5) {
						console.log(
							'⚠️  Warning: FPS is N/A, processing might be slow or stuck',
						)
					}
					if (timeInSeconds === lastProgressTime && progressCount > 10) {
						console.log(
							'⚠️  Warning: Time not progressing, processing might be stuck',
						)
					}
				}

				lastProgressTime = timeInSeconds
				lastFrame = typeof frame === 'number' ? frame : lastFrame
				progressCount++
				lastProgressUpdate = Date.now()
			})
			.on('end', () => {
				clearInterval(timeoutInterval)
				console.log('✅ Video rendering completed successfully!')
				console.log(`📁 Final output: ${outputPath}`)

				// Clean up subtitle file
				console.log('🧹 Cleaning up temporary ASS file...')
				fs.unlink(assPath).catch((err) => {
					console.warn('⚠️  Warning: Failed to clean up ASS file:', err.message)
				})
				console.log('✅ Cleanup completed')
				resolve()
			})
			.on('error', (err) => {
				clearInterval(timeoutInterval)
				console.error('❌ Error rendering video with info and comments:')
				console.error('   Error message:', err.message)
				console.error('   Error stack:', err.stack)
				reject(err)
			})
	})
}

/**
 * Generate ASS subtitle content for video info and comments with new layout
 * Top section: title and view count on left, small video on right
 * Bottom section: comments with avatar, author, content, likes
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
	// Title style - large, bold, dark gray text with subtle shadow
	assContent += `Style: Title,Noto Sans SC,56,&H00222222,&H000000FF,&H00FFFFFF,&H80000000,1,0,0,0,100,100,0,0,1,2,1,7,80,80,60,1\n`
	// Info style - medium, gray text
	assContent += `Style: Info,Noto Sans SC,36,&H00666666,&H000000FF,&H00FFFFFF,&H80000000,0,0,0,0,100,100,0,0,1,1,1,7,80,80,120,1\n`
	// Comment author style - bold, dark text
	assContent += `Style: CommentAuthor,Noto Sans SC,32,&H00222222,&H000000FF,&H00FFFFFF,&H80000000,1,0,0,0,100,100,0,0,1,1,1,1,80,80,140,1\n`
	// Comment content style - regular, dark text (Chinese content)
	assContent += `Style: CommentContent,Noto Sans SC,36,&H00333333,&H000000FF,&H00FFFFFF,&H80000000,1,0,0,0,100,100,0,0,1,1,1,1,80,80,100,1\n`
	// English content style - italic, lighter text
	assContent += `Style: EnglishContent,Noto Sans SC,22,&H00666666,&H000000FF,&H00FFFFFF,&H80000000,0,1,0,0,100,100,0,0,1,1,1,1,80,80,80,1\n`
	// Likes style - small, red text
	assContent += `Style: Likes,Noto Sans SC,24,&H00e11d48,&H000000FF,&H00FFFFFF,&H80000000,0,0,0,0,100,100,0,0,1,1,1,3,80,80,140,1\n`
	// Avatar placeholder style - colored circle
	assContent += `Style: Avatar,Noto Sans SC,32,&H004f46e5,&H000000FF,&H00FFFFFF,&H80000000,0,0,0,0,100,100,0,0,1,1,1,1,80,80,140,1\n`
	// Comment background style - subtle background
	assContent += `Style: CommentBg,Arial,1,&H15FFFFFF,&H15FFFFFF,&H15FFFFFF,&H80000000,0,0,0,0,100,100,0,0,1,0,0,2,0,0,80,1\n`
	// Divider line style
	assContent += `Style: Divider,Arial,1,&H20CCCCCC,&H20CCCCCC,&H20CCCCCC,&H80000000,0,0,0,0,100,100,0,0,1,0,0,8,0,0,160,1\n\n`

	assContent += `[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`

	// Calculate total duration
	const totalDuration = 3 + comments.length * 4 // 3s for info + 4s per comment

	// Video info section - left side, persistent throughout the video
	const title = videoInfo.translatedTitle || videoInfo.title
	const viewCountText = formatViewCount(videoInfo.viewCount)
	const authorText = videoInfo.author || 'Unknown Author'

	// Title (左上角，MarginV=60) - with better spacing
	assContent += `Dialogue: 0,${formatAssTime(0)},${formatAssTime(totalDuration)},Title,,80,80,60,,${title.replace(/,/g, '，')}\n`

	// Info (左上角，MarginV=120) - with better spacing
	assContent += `Dialogue: 0,${formatAssTime(0)},${formatAssTime(totalDuration)},Info,,80,80,120,,${viewCountText} views • ${authorText.replace(/,/g, '，')}\n`

	// Divider line (horizontal line separating content areas)
	assContent += `Dialogue: 0,${formatAssTime(0)},${formatAssTime(totalDuration)},Divider,,0,0,160,,{\p1}m 0 0 l 1920 0{\p0}\n`

	// Comments section - each comment shows for 4 seconds in bottom area
	let currentTime = 3 // Start comments after 3 seconds

	for (const comment of comments) {
		const commentText = comment.translatedContent || comment.content
		const originalComment = comment.content
		const authorName = comment.author
		const likesText = formatLikes(comment.likes)

		// Truncate long comments to fit better
		const truncatedComment =
			commentText.length > 100
				? commentText.substring(0, 100) + '...'
				: commentText

		const truncatedOriginal =
			originalComment.length > 100
				? originalComment.substring(0, 100) + '...'
				: originalComment

		// Comment background (subtle background for better readability) - increased height for bilingual content
		assContent += `Dialogue: 0,${formatAssTime(currentTime)},${formatAssTime(currentTime + 4)},CommentBg,,0,0,80,,{\p1}m 0 0 l 1920 0 l 1920 180 l 0 180{\p0}\n`

		// Avatar (左下，MarginV=160) - using colored circle
		assContent += `Dialogue: 0,${formatAssTime(currentTime)},${formatAssTime(currentTime + 4)},Avatar,,80,80,160,,😊\n`

		// Author (左下，MarginV=160)
		assContent += `Dialogue: 0,${formatAssTime(currentTime)},${formatAssTime(currentTime + 4)},CommentAuthor,,130,80,160,,${authorName.replace(/,/g, '，')}\n`

		// Chinese content (左下，MarginV=120) - translated content
		assContent += `Dialogue: 0,${formatAssTime(currentTime)},${formatAssTime(currentTime + 4)},CommentContent,,130,80,120,,${truncatedComment.replace(/,/g, '，')}\n`

		// English content (左下，MarginV=80) - original content (only if different from translated)
		if (
			comment.translatedContent &&
			comment.translatedContent !== comment.content
		) {
			assContent += `Dialogue: 0,${formatAssTime(currentTime)},${formatAssTime(currentTime + 4)},EnglishContent,,130,80,80,,${truncatedOriginal.replace(/,/g, '，')}\n`
		}

		// Likes (右下，MarginV=160) - with better positioning
		assContent += `Dialogue: 0,${formatAssTime(currentTime)},${formatAssTime(currentTime + 4)},Likes,,1800,80,160,,❤️ ${likesText}\n`

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

/**
 * Parse time string (HH:MM:SS) to seconds
 */
function parseTimeToSeconds(timeString: string): number {
	const parts = timeString.split(':').map(Number)
	if (parts.length === 3) {
		return parts[0] * 3600 + parts[1] * 60 + parts[2]
	} else if (parts.length === 2) {
		return parts[0] * 60 + parts[1]
	}
	return 0
}

/**
 * Format seconds to time string (HH:MM:SS)
 */
function formatTime(seconds: number): string {
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	const secs = Math.floor(seconds % 60)
	return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
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
export function renderBackground(ctx: CanvasContext, width: number, height: number): void {
	ctx.fillStyle = '#FFFFFF'
	ctx.fillRect(0, 0, width, height)
}

/**
 * Render video placeholder area
 */
export function renderVideoArea(ctx: CanvasContext, videoX: number, videoY: number, videoW: number, videoH: number): void {
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
export function renderHeader(ctx: CanvasContext, videoInfo: VideoInfo, commentsCount: number): void {
	// Video area position (from generateTestFrame)
	const videoY = 30
	const videoH = 506
	const videoCenterY = videoY + videoH / 2
	
	// Header area positioned to align with video center
	const headerX = 40
	const headerY = videoY
	const headerWidth = 880
	const headerHeight = videoH
	const centerY = videoCenterY // Use the same center Y as video

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
	
	// Calculate total content height
	const titleHeight = wrappedTitle.length * 80
	const metadataHeight = 40
	const commentHeight = 35
	const totalContentHeight = titleHeight + metadataHeight + commentHeight + 40 // spacing
	
	// Starting Y position for vertical centering (same as video center)
	let currentY = centerY - totalContentHeight / 2
	
	// Draw title
	wrappedTitle.forEach((line, index) => {
		ctx.fillText(line, headerX + 20, currentY + index * 80)
	})
	
	currentY += titleHeight + 20
	
	// Draw metadata
	ctx.fillStyle = '#666666'
	ctx.font = '32px "Noto Sans SC"'
	const viewText = `${formatViewCount(videoInfo.viewCount)} views`
	const authorText = videoInfo.author || 'Unknown Author'
	const metadataText = `${viewText} • ${authorText}`
	ctx.fillText(metadataText, headerX + 20, currentY)
	
	currentY += metadataHeight + 20
	
	// Draw comment count
	ctx.fillStyle = '#666666'
	ctx.font = '28px "Noto Sans SC"'
	const engagementText = `${commentsCount} comments`
	ctx.fillText(engagementText, headerX + 20, currentY)
}

/**
 * Render comment card with avatar and content - displays both original and translated content
 */
export function renderCommentCard(
	ctx: CanvasContext,
	comment: Comment,
	_commentIndex: number,
	_totalComments: number,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	authorImage: any,
	width: number,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_height: number
): void {
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
	if (comment.translatedContent && comment.translatedContent !== comment.content) {
		ctx.font = 'bold 40px "Noto Sans SC"' // Larger font for Chinese content
		wrappedTranslated = wrapText(ctx, comment.translatedContent, maxCommentWidth)
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
	ctx.fillStyle = '#000000'
	ctx.font = 'bold 32px "Noto Sans SC"'
	ctx.textAlign = 'left'
	ctx.fillText(comment.author, textX, currentY)
	
	// Add likes on the right side of the comment card
	ctx.fillStyle = '#e11d48'
	ctx.font = '24px "Noto Sans SC"'
	ctx.textAlign = 'right'
	const likesX = width - 60 // Position likes on the right side
	ctx.fillText(`❤️ ${formatLikes(comment.likes)}`, likesX, currentY)
	
	// Reset text alignment for content
	ctx.textAlign = 'left'
	currentY += authorHeight + spacing

	// English content (primary) - original content first
	ctx.fillStyle = '#666666'
	ctx.font = '24px "Noto Sans SC"'
	wrappedOriginal.forEach((line, index) => {
		ctx.fillText(line, textX, currentY + index * 32)
	})
	currentY += wrappedOriginal.length * 32 + spacing

	// Chinese content (secondary, more prominent) - translated content below
	if (comment.translatedContent && comment.translatedContent !== comment.content) {
		ctx.fillStyle = '#333333'
		ctx.font = 'bold 40px "Noto Sans SC"' // Larger and bold for Chinese
		wrappedTranslated.forEach((line, index) => {
			ctx.fillText(line, textX, currentY + index * 45) // Larger line height
		})
		currentY += wrappedTranslated.length * 36 + spacing
	}

	// Comment counter removed - no longer needed
}

/**
 * Render external comment card with platform-specific styling
 */
export function renderExternalCommentCard(
	ctx: CanvasContext,
	comment: Comment,
	_commentIndex: number,
	_totalComments: number,
	authorImage: CanvasImageSource | null,
	width: number,
	_height: number,
): void {
	void _height
	// Position comment card below the header/video area
	const headerAreaHeight = 506
	const headerAreaBottom = 30 + headerAreaHeight
	const commentSpacing = 20
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
	const platformHeight = 25
	const counterHeight = 25
	const spacing = 15

	totalContentHeight += authorHeight + spacing
	totalContentHeight += platformHeight + spacing

	// Calculate content height
	const wrappedContent = wrapText(ctx, comment.content, maxCommentWidth)
	const contentHeight = wrappedContent.length * 32
	totalContentHeight += contentHeight + spacing

	// Calculate translated content height (if different from original)
	let translatedHeight = 0
	let wrappedTranslated: string[] = []
	if (comment.translatedContent && comment.translatedContent !== comment.content) {
		ctx.font = 'bold 40px "Noto Sans SC"'
		wrappedTranslated = wrapText(ctx, comment.translatedContent, maxCommentWidth)
		translatedHeight = wrappedTranslated.length * 45
		totalContentHeight += translatedHeight + spacing
	}

	totalContentHeight += counterHeight + padding

	// Calculate final comment card height
	const commentHeight = totalContentHeight

	// Get platform-specific colors
	const platformColors = getPlatformColors(comment.source || comment.platform)

	// Comment card background with platform-specific styling
	ctx.fillStyle = platformColors.backgroundColor
	roundRect(ctx, 20, commentY, width - 40, commentHeight, 12)
	ctx.fill()

	// Comment card border with platform color
	ctx.strokeStyle = platformColors.borderColor
	ctx.lineWidth = 2
	roundRect(ctx, 20, commentY, width - 40, commentHeight, 12)
	ctx.stroke()

	// Platform indicator bar
	ctx.fillStyle = platformColors.accentColor
	roundRect(ctx, 20, commentY, width - 40, 4, 2)
	ctx.fill()

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
		// Fallback avatar with platform color
		ctx.fillStyle = platformColors.accentColor
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
	ctx.fillStyle = platformColors.textColor
	ctx.font = 'bold 32px "Noto Sans SC"'
	ctx.textAlign = 'left'
	ctx.fillText(comment.author, textX, currentY)
	
	// Platform indicator
	currentY += authorHeight + spacing
	ctx.fillStyle = platformColors.accentColor
	ctx.font = '20px "Noto Sans SC"'
	const platformText = getPlatformDisplayName(comment.source || comment.platform)
	ctx.fillText(platformText, textX, currentY)
	
	// Reset text alignment for content
	ctx.textAlign = 'left'
	currentY += platformHeight + spacing

	// Original content
	ctx.fillStyle = platformColors.contentColor
	ctx.font = '24px "Noto Sans SC"'
	wrappedContent.forEach((line, index) => {
		ctx.fillText(line, textX, currentY + index * 32)
	})
	currentY += wrappedContent.length * 32 + spacing

	// Translated content (if available)
	if (comment.translatedContent && comment.translatedContent !== comment.content) {
		ctx.fillStyle = platformColors.textColor
		ctx.font = 'bold 40px "Noto Sans SC"'
		wrappedTranslated.forEach((line, index) => {
			ctx.fillText(line, textX, currentY + index * 45)
		})
		currentY += wrappedTranslated.length * 36 + spacing
	}

	// Likes with platform-specific styling
	ctx.fillStyle = platformColors.accentColor
	ctx.font = '24px "Noto Sans SC"'
	ctx.textAlign = 'right'
	const likesX = width - 60
	const likesIcon = getPlatformLikesIcon(comment.source || comment.platform)
	ctx.fillText(`${likesIcon} ${formatLikes(comment.likes)}`, likesX, currentY)
}

/**
 * Get platform-specific colors for external comments
 */
function getPlatformColors(source?: string): {
	backgroundColor: string
	borderColor: string
	accentColor: string
	textColor: string
	contentColor: string
} {
	switch (source?.toLowerCase()) {
		case 'youtube':
			return {
				backgroundColor: '#FFFBFB',
				borderColor: '#FF0000',
				accentColor: '#FF0000',
				textColor: '#000000',
				contentColor: '#333333'
			}
		case 'tiktok':
			return {
				backgroundColor: '#000000',
				borderColor: '#00F2EA',
				accentColor: '#00F2EA',
				textColor: '#FFFFFF',
				contentColor: '#FFFFFF'
			}
		case 'twitter':
			return {
				backgroundColor: '#F7F9FA',
				borderColor: '#1DA1F2',
				accentColor: '#1DA1F2',
				textColor: '#000000',
				contentColor: '#333333'
			}
		case 'instagram':
			return {
				backgroundColor: '#FAFAFA',
				borderColor: '#E4405F',
				accentColor: '#E4405F',
				textColor: '#000000',
				contentColor: '#333333'
			}
		case 'weibo':
			return {
				backgroundColor: '#F8F8F8',
				borderColor: '#E6162D',
				accentColor: '#E6162D',
				textColor: '#000000',
				contentColor: '#333333'
			}
		default:
			return {
				backgroundColor: '#F9F9F9',
				borderColor: '#666666',
				accentColor: '#666666',
				textColor: '#000000',
				contentColor: '#333333'
			}
	}
}

/**
 * Get platform display name
 */
function getPlatformDisplayName(source?: string): string {
	switch (source?.toLowerCase()) {
		case 'youtube':
			return 'YouTube'
		case 'tiktok':
			return 'TikTok'
		case 'twitter':
			return 'Twitter'
		case 'instagram':
			return 'Instagram'
		case 'weibo':
			return '微博'
		default:
			return source || 'External'
	}
}

/**
 * Get platform-specific likes icon
 */
function getPlatformLikesIcon(source?: string): string {
	switch (source?.toLowerCase()) {
		case 'youtube':
			return '👍'
		case 'tiktok':
			return '❤️'
		case 'twitter':
			return '❤️'
		case 'instagram':
			return '❤️'
		case 'weibo':
			return '❤️'
		default:
			return '❤️'
	}
}

/**
 * Render progress bar
 */
export function renderProgressBar(ctx: CanvasContext, width: number, height: number, progress: number): void {
	const progressHeight = 3
	const progressY = height - progressHeight - 20

	// Progress bar background
	ctx.fillStyle = '#E0E0E0'
	ctx.fillRect(20, progressY, width - 40, progressHeight)

	// Progress bar fill
	ctx.fillStyle = '#666666'
	ctx.fillRect(20, progressY, (width - 40) * progress, progressHeight)
}

/**
 * Generate a single frame for testing purposes
 */
export function generateTestFrame(
	videoInfo: VideoInfo,
	comment: Comment,
	commentIndex: number,
	totalComments: number,
	authorImage?: CanvasImageSource | null,
	width: number = 1920,
	height: number = 1080
): Buffer {
	const canvas = createCanvas(width, height)
	const ctx = canvas.getContext('2d')

	// Render background
	renderBackground(ctx, width, height)

	// Render video area
	const videoX = 950
	const videoY = 30
	const videoW = 900
	const videoH = 506
	renderVideoArea(ctx, videoX, videoY, videoW, videoH)

	// Render header
	renderHeader(ctx, videoInfo, totalComments)

	// Render comment card
	renderCommentCard(ctx, comment, commentIndex, totalComments, authorImage, width, height)

	// Progress bar removed - no longer needed

	return canvas.toBuffer('image/png')
}

// Export the new cover section function for testing
export { renderCoverSection }

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
	const totalDuration = coverDuration + introDuration + comments.length * commentDuration
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
			await renderCoverSection(ctx, videoInfo, comments, time, coverDuration, width, height)
		} else {
			// Render video area (only after cover section)
			const videoX = 950
			const videoY = 30
			const videoW = 900
			const videoH = 506
			renderVideoArea(ctx, videoX, videoY, videoW, videoH)

			// Render header
			renderHeader(ctx, videoInfo, comments.length)

			// Render comment if applicable
			if (time >= coverDuration + introDuration) {
				const commentIndex = Math.floor((time - coverDuration - introDuration) / commentDuration)
				if (commentIndex < comments.length) {
					const comment = comments[commentIndex]
					const authorImage = authorImages[commentIndex]
					renderCommentCard(ctx, comment, commentIndex, comments.length, authorImage, width, height)
				}
			}
		}

		// Progress bar removed - no longer needed

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
	const totalContentHeight = titleHeight + titleGap + authorHeight + authorGap + seriesHeight + seriesGap + viewHeight
	
	// Start Y position for vertical centering
	let currentY = (height - totalContentHeight) / 2
	
	// Main title - larger and prominent
	ctx.fillStyle = '#000000'
	ctx.font = '600 72px "Noto Sans SC"'
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	
	wrappedTitle.forEach((line, index) => {
		ctx.fillText(line, centerX, currentY + index * 80)
	})
	
	currentY += titleHeight + titleGap

	// Author info - larger @ symbol
	const authorText = videoInfo.author || 'Unknown Author'
	ctx.fillStyle = '#333333'
	ctx.font = '500 42px "Noto Sans SC"'
	ctx.fillText(`@${authorText}`, centerX, currentY)
	
	currentY += authorHeight + authorGap

	// Series info (if available) - larger
	if (videoInfo.series) {
		ctx.fillStyle = '#666666'
		ctx.font = '400 32px "Noto Sans SC"'
		const seriesText = videoInfo.seriesEpisode 
			? `${videoInfo.series} 第${videoInfo.seriesEpisode}集`
			: videoInfo.series
		ctx.fillText(seriesText, centerX, currentY)
		currentY += seriesHeight + seriesGap
	}

	// View count - larger
	ctx.fillStyle = '#666666'
	ctx.font = '400 28px "Noto Sans SC"'
	ctx.fillText(`${formatViewCount(videoInfo.viewCount)} 次观看`, centerX, currentY)

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
