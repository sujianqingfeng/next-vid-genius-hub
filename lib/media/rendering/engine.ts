import { PassThrough } from 'node:stream'
import { createCanvas, loadImage } from 'canvas'
import ffmpeg from 'fluent-ffmpeg'
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
	const coverFrames = coverDuration * fps

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

	console.log('🎥 Starting FFmpeg processing (piped frames, no temp files)...')
	return new Promise<void>((resolve, reject) => {
		const frameStream = new PassThrough()

		// Start ffmpeg with piped frames as second input
		ffmpeg(videoPath)
			.input(frameStream)
			.inputFormat('image2pipe')
			.inputFPS(fps)
			.complexFilter([
				// Scale the original video and pad duration
				`[0:v]scale=900:506,tpad=stop_mode=clone:stop_duration=${totalDuration}[scaled_video]`,
				// Add audio delay to start after cover section (3 seconds)
				`[0:a]adelay=${coverDuration}000|${coverDuration}000[delayed_audio]`,
				// Split piped frames into cover first-frame and dynamic remainder
				`[1:v]split=2[cover_src][dyn_src]`,
				// Loop the very first frame to coverDuration (coverFrames)
				`[cover_src]select='eq(n,0)',loop=loop=${coverFrames}:size=1:start=0,format=pix_fmts=yuva420p[cover_bg]`,
				// Take the rest frames (from n>=1) as dynamic background
				`[dyn_src]select='gte(n,1)',setpts=PTS-STARTPTS,format=pix_fmts=yuva420p[dyn_bg]`,
				// Concatenate cover and dynamic backgrounds in time
				`[cover_bg][dyn_bg]concat=n=2:v=1:a=0[overlay_bg]`,
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
			.on('end', () => {
				console.log('✅ FFmpeg processing finished.')
				resolve()
			})
			.on('error', (err) => {
				console.error('❌ Error during ffmpeg processing:', err)
				frameStream.destroy(err)
				reject(err)
			})

		// Generate frames and push to the pipe sequentially, respecting backpressure
		;(async () => {
			try {
				console.log('🖼️ Generating and piping modern overlay frames...')

				// 1) Generate ONLY the first cover frame (time = 0)
				{
					const time = 0
					renderBackground(ctx, width, height)
					await renderCoverSection(
						ctx,
						videoInfo,
						comments,
						time,
						coverDuration,
						width,
						height,
					)
					const coverBuffer = canvas.toBuffer('image/png')
					if (!frameStream.write(coverBuffer)) {
						await new Promise<void>((res) =>
							frameStream.once('drain', () => res()),
						)
					}
				}

				// 2) Generate dynamic frames starting from the end of cover
				for (let i = coverFrames; i < totalFrames; i++) {
					const time = i / fps

					// Render background
					renderBackground(ctx, width, height)

					const videoX = 950
					const videoY = 30
					const videoW = 900
					const videoH = 506
					renderVideoArea(ctx, videoX, videoY, videoW, videoH)

					await renderHeader(ctx, videoInfo, comments.length)

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

					const buffer = canvas.toBuffer('image/png')
					if (!frameStream.write(buffer)) {
						await new Promise<void>((res) =>
							frameStream.once('drain', () => res()),
						)
					}
				}
				frameStream.end()
				console.log('✅ Frames piping complete.')
			} catch (err) {
				console.error('❌ Error generating frames:', err)
				frameStream.destroy(err as Error)
			}
		})()
	})
}
