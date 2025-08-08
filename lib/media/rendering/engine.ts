import { PassThrough } from 'node:stream'
import { createCanvas, loadImage } from 'canvas'
import ffmpeg from 'fluent-ffmpeg'
import { preloadEmojiImagesForTexts } from '../emoji'
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
	const coverFrames = coverDuration * fps
	const introFrames = introDuration * fps
	const commentFrames = commentDuration * fps

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

	// Preload emojis used across all visible texts to warm caches
	try {
		const textsToPreload: string[] = []
		const title = videoInfo.translatedTitle || videoInfo.title
		if (title) textsToPreload.push(title)
		if (videoInfo.author) textsToPreload.push(`@${videoInfo.author}`)
		for (const c of comments) {
			if (c.author) textsToPreload.push(c.author)
			if (c.content) textsToPreload.push(c.content)
			if (c.translatedContent) textsToPreload.push(c.translatedContent)
		}
		await preloadEmojiImagesForTexts(textsToPreload, { concurrency: 8 })
		console.log('✅ Emojis pre-loaded.')
	} catch (e) {
		console.warn('⚠️ Emoji preloading failed:', (e as Error).message)
	}

	console.log('🎥 Starting FFmpeg processing (piped frames, no temp files)...')
	return new Promise<void>((resolve, reject) => {
		const frameStream = new PassThrough()

		// Build filter graph to loop static segments (cover, intro, each comment) from single frames
		const segmentCount = 2 + comments.length // cover + intro + N comments
		const splitOutputs = Array.from(
			{ length: segmentCount },
			(_, i) => `[seg${i}]`,
		).join('')
		const perSegmentLoops = Array.from({ length: segmentCount }, (_, i) => {
			const frames =
				i === 0 ? coverFrames : i === 1 ? introFrames : commentFrames
			return `[seg${i}]select='eq(n,${i})',loop=loop=${frames}:size=1:start=0,format=pix_fmts=yuva420p[bg${i}]`
		})
		const concatInputs = Array.from(
			{ length: segmentCount },
			(_, i) => `[bg${i}]`,
		).join('')
		const complexFilters = [
			// Scale the original video and pad duration to totalDuration
			`[0:v]scale=900:506,tpad=stop_mode=clone:stop_duration=${totalDuration}[scaled_video]`,
			// Delay audio to start after cover section
			`[0:a]adelay=${coverDuration}000|${coverDuration}000[delayed_audio]`,
			// Split piped frames into segments
			`[1:v]split=${segmentCount}${splitOutputs}`,
			// Loop each single frame to desired duration
			...perSegmentLoops,
			// Concatenate segments into overlay background
			`${concatInputs}concat=n=${segmentCount}:v=1:a=0[overlay_bg]`,
			// Overlay scaled video after cover
			`[overlay_bg][scaled_video]overlay=x=950:y=30:enable='between(t,${coverDuration},${totalDuration})'[final_video]`,
		]

		// Start ffmpeg with piped frames as second input
		ffmpeg(videoPath)
			.input(frameStream)
			.inputFormat('image2pipe')
			.inputFPS(fps)
			.complexFilter(complexFilters)
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

				// 1) Cover frame (t = 0)
				{
					renderBackground(ctx, width, height)
					await renderCoverSection(
						ctx,
						videoInfo,
						comments,
						0,
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

				// 2) Intro frame (header + video area, no comment)
				{
					renderBackground(ctx, width, height)
					const videoX = 950
					const videoY = 30
					const videoW = 900
					const videoH = 506
					renderVideoArea(ctx, videoX, videoY, videoW, videoH)
					await renderHeader(ctx, videoInfo, comments.length)
					const introBuffer = canvas.toBuffer('image/png')
					if (!frameStream.write(introBuffer)) {
						await new Promise<void>((res) =>
							frameStream.once('drain', () => res()),
						)
					}
				}

				// 3) One frame per comment
				for (
					let commentIndex = 0;
					commentIndex < comments.length;
					commentIndex++
				) {
					renderBackground(ctx, width, height)
					const videoX = 950
					const videoY = 30
					const videoW = 900
					const videoH = 506
					renderVideoArea(ctx, videoX, videoY, videoW, videoH)
					await renderHeader(ctx, videoInfo, comments.length)
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
