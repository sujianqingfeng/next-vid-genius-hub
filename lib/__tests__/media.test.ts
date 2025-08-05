import { createCanvas } from 'canvas'
import path from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
	renderBackground,
	renderCommentCard,
	renderHeader,
	renderVideoArea,
	renderVideoWithCanvas,
} from '../media'

describe('Video Rendering Pipeline', () => {
	// Mock data for testing
	const mockVideoInfo = {
		title: 'Amazing Test Video - 测试视频',
		translatedTitle: '令人惊叹的测试视频',
		viewCount: 1250000,
		author: 'Test Creator',
		thumbnail: 'https://example.com/thumbnail.jpg',
		series: '技术分享系列',
		seriesEpisode: 5,
	}

	const mockComments = [
		{
			id: 'comment1',
			author: 'User1',
			authorThumbnail:
				'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
			content: 'This is an amazing video! Really enjoyed watching it.',
			translatedContent: '这是一个很棒的视频！真的很喜欢看。',
			likes: 1250,
			replyCount: 15,
			source: 'youtube' as const,
		},
		{
			id: 'comment2',
			author: 'User2',
			authorThumbnail:
				'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
			content: 'Thanks for sharing this content. Very informative!',
			translatedContent: '感谢分享这个内容。非常有信息量！',
			likes: 856,
			replyCount: 8,
			source: 'tiktok' as const,
		},
	]

	it.skip('should execute the full video rendering pipeline for visual verification', async () => {
		const testVideoPath = path.join(__dirname, 'test.mp4')
		const outputPath = path.join(__dirname, 'output_test_video.mp4')

		console.log('🎬 Starting full video rendering pipeline test...')
		await renderVideoWithCanvas(
			testVideoPath,
			outputPath,
			mockVideoInfo,
			mockComments,
		)
		console.log(`✅ Full pipeline test completed. Output at: ${outputPath}`)

		// This is a visual test, so we just assert it runs without errors.
		expect(true).toBe(true)
	}, 120000) // 2-minute timeout for video processing

	describe('Core Rendering Stage Unit Tests', () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let canvas: any
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let ctx: any

		beforeEach(() => {
			canvas = createCanvas(1920, 1080)
			ctx = canvas.getContext('2d')
		})

		it('should render a solid white background', () => {
			renderBackground(ctx, 1920, 1080)
			const pixel = ctx.getImageData(0, 0, 1, 1).data
			expect(pixel).toEqual(new Uint8ClampedArray([255, 255, 255, 255]))
		})

		it('should render the header section with video metadata', () => {
			renderHeader(ctx, mockVideoInfo, 5)
			// A simple check to ensure something was drawn.
			const pixel = ctx.getImageData(50, 50, 1, 1).data
			expect(pixel[3]).not.toBe(0) // Check that the pixel is not fully transparent
		})

		it('should render a comment card with bilingual content', () => {
			renderCommentCard(ctx, mockComments[0], 0, 1, null, 1920, 1080)
			// A simple check to ensure something was drawn.
			const pixel = ctx.getImageData(100, 600, 1, 1).data
			expect(pixel[3]).not.toBe(0)
		})

		it('should generate and save visual snapshots of rendering stages', async () => {
			const fs = await import('fs/promises')
			const path = await import('path')

			// 1. Test renderHeader
			const headerCanvas = createCanvas(1920, 1080)
			const headerCtx = headerCanvas.getContext('2d')
			renderBackground(headerCtx, 1920, 1080)
			renderHeader(headerCtx, mockVideoInfo, mockComments.length)
			const headerBuffer = headerCanvas.toBuffer('image/png')
			await fs.writeFile(
				path.join(__dirname, 'test_renderHeader.png'),
				headerBuffer,
			)
			console.log('✅ Saved header snapshot to test_renderHeader.png')

			// 2. Test renderCommentCard
			const commentCanvas = createCanvas(1920, 1080)
			const commentCtx = commentCanvas.getContext('2d')
			renderBackground(commentCtx, 1920, 1080)
			renderCommentCard(
				commentCtx,
				mockComments[0],
				0,
				mockComments.length,
				null,
				1920,
				1080,
			)
			const commentBuffer = commentCanvas.toBuffer('image/png')
			await fs.writeFile(
				path.join(__dirname, 'test_renderCommentCard.png'),
				commentBuffer,
			)
			console.log('✅ Saved comment card snapshot to test_renderCommentCard.png')

			// 3. Test combined frame
			const combinedCanvas = createCanvas(1920, 1080)
			const combinedCtx = combinedCanvas.getContext('2d')
			renderBackground(combinedCtx, 1920, 1080)
			renderHeader(combinedCtx, mockVideoInfo, mockComments.length)
			renderVideoArea(combinedCtx, 950, 30, 900, 506)
			renderCommentCard(
				combinedCtx,
				mockComments[1],
				1,
				mockComments.length,
				null,
				1920,
				1080,
			)
			const combinedBuffer = combinedCanvas.toBuffer('image/png')
			await fs.writeFile(
				path.join(__dirname, 'test_combined_frame.png'),
				combinedBuffer,
			)
			console.log('✅ Saved combined frame snapshot to test_combined_frame.png')

			// This is a visual test, so we just assert it runs without errors.
			expect(true).toBe(true)
		})
	})
})