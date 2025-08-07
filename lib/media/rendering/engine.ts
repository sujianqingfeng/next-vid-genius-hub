import { createCanvas, loadImage } from 'canvas'
import ffmpeg from 'fluent-ffmpeg'
import { promises as fs } from 'fs'
import * as path from 'path'
import type { Comment, VideoInfo } from '../types'
import {
	renderCommentCard,
	renderCoverSection,
	renderHeader,
} from './components'
import { renderBackground, renderVideoArea } from './ui'

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
