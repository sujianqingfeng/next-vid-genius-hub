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
			`[0:v]tpad=stop_mode=clone:stop_duration=${totalDuration},scale=600:338:force_original_aspect_ratio=decrease,pad=600:338:(ow-iw)/2:(oh-ih)/2:white[small_video]`,

			// Create white background
			`color=size=1920x1080:color=white:duration=${totalDuration}[bg]`,

			// Overlay small video on top right (position: 1200, 50)
			`[bg][small_video]overlay=1200:50[bg_with_video]`,

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
			finalFilter = `[0:v]tpad=stop_mode=clone:stop_duration=${totalDuration},scale=600:338:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:white,overlay=1200:50,ass=${assPath}[final]`
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
	// Comment content style - regular, dark text
	assContent += `Style: CommentContent,Noto Sans SC,28,&H00333333,&H000000FF,&H00FFFFFF,&H80000000,0,0,0,0,100,100,0,0,1,1,1,1,80,80,100,1\n`
	// English content style - italic, lighter text
	assContent += `Style: EnglishContent,Noto Sans SC,24,&H00666666,&H000000FF,&H00FFFFFF,&H80000000,0,1,0,0,100,100,0,0,1,1,1,1,80,80,80,1\n`
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
	assContent += `Dialogue: 0,${formatAssTime(0)},${formatAssTime(totalDuration)},Divider,,0,0,160,,{\\p1}m 0 0 l 1920 0{\\p0}\n`

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
		assContent += `Dialogue: 0,${formatAssTime(currentTime)},${formatAssTime(currentTime + 4)},CommentBg,,0,0,80,,{\\p1}m 0 0 l 1920 0 l 1920 180 l 0 180{\\p0}\n`

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
