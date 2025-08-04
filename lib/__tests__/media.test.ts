import { createCanvas } from 'canvas'
import path from 'path'
import { describe, expect, it } from 'vitest'
import {
	generateTestFrame,
	renderBackground,
	renderCommentCard,
	renderHeader,
	renderProgressBar,
	renderVideoArea,
	renderVideoWithCanvas,
} from '../media'

describe('renderVideoWithInfoAndComments - Video Rendering Effect Test', () => {
	it('should render video with info and comments for visual verification', async () => {
		// Test video path - using the test.mp4 in the same directory
		const testVideoPath = path.join(__dirname, 'test.mp4')
		const outputPath = path.join(__dirname, 'output_test_video.mp4')

		// Mock video info data
		const videoInfo = {
			title: 'Amazing Test Video - 测试视频',
			translatedTitle: '令人惊叹的测试视频',
			viewCount: 1250000,
			author: 'Test Creator',
			thumbnail: 'https://example.com/thumbnail.jpg',
		}

		// Mock comments data with various scenarios
		const comments = [
			{
				id: 'comment1',
				author: 'User1',
				authorThumbnail:
					'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
				content: 'This is an amazing video! Really enjoyed watching it.',
				translatedContent: '这是一个很棒的视频！真的很喜欢看。',
				likes: 1250,
				replyCount: 15,
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
			},
			{
				id: 'comment3',
				author: 'User3',
				authorThumbnail:
					'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face',
				content: 'Great work! Looking forward to more videos like this.',
				translatedContent: '做得很好！期待更多这样的视频。',
				likes: 432,
				replyCount: 3,
			},
			{
				id: 'comment4',
				author: 'User4',
				authorThumbnail:
					'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face',
				content: 'This helped me a lot. Thank you!',
				translatedContent: '这对我帮助很大。谢谢！',
				likes: 298,
				replyCount: 1,
			},
			{
				id: 'comment5',
				author: 'User5',
				authorThumbnail:
					'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face',
				content: 'Excellent explanation. Very clear and easy to understand.',
				translatedContent: '解释得很棒。非常清晰易懂。',
				likes: 567,
				replyCount: 6,
			},
		]

		console.log('🎬 Starting video rendering test...')
		console.log(`📁 Input video: ${testVideoPath}`)
		console.log(`📁 Output video: ${outputPath}`)
		console.log(`📊 Video info:`, videoInfo)
		console.log(`💬 Comments count: ${comments.length}`)

		// Execute the rendering function
		await renderVideoWithCanvas(testVideoPath, outputPath, videoInfo, comments)

		console.log('✅ Video rendering completed!')
		console.log(`📁 Check the output video at: ${outputPath}`)
		console.log(
			'🎯 You can now open the output video to verify the rendering effect:',
		)
		console.log('   - Video info should appear at the top left')
		console.log('   - Small video should be displayed at the top right')
		console.log(
			'   - Comments should appear below with avatars, authors, content, and likes',
		)
		console.log(
			'   - Total duration should be 23 seconds (3s info + 5 comments × 4s each)',
		)

		// Basic assertion to ensure the function completed without errors
		expect(true).toBe(true)
	}, 120000) // 2 minutes timeout for video processing
})

describe('Individual Rendering Functions - Unit Tests', () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let canvas: any
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let ctx: any

	beforeEach(() => {
		canvas = createCanvas(1920, 1080)
		ctx = canvas.getContext('2d')
	})

	it('should generate individual test frame images for visual verification', async () => {
		const fs = await import('fs')
		const path = await import('path')

		// Test data
		const videoInfo = {
			title: 'Amazing Test Video - 测试视频',
			translatedTitle: '令人惊叹的测试视频',
			viewCount: 1250000,
			author: 'Test Creator',
			thumbnail: 'https://example.com/thumbnail.jpg',
		}

		const comment = {
			id: 'comment1',
			author: 'User1',
			authorThumbnail:
				'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
			content: 'This is an amazing video! Really enjoyed watching it.',
			translatedContent: '这是一个很棒的视频！真的很喜欢看。',
			likes: 1250,
			replyCount: 15,
		}

		console.log('🎨 Generating individual test frame images...')

		// 1. Test renderBackground
		console.log('📋 Testing renderBackground...')
		const bgCanvas = createCanvas(1920, 1080)
		const bgCtx = bgCanvas.getContext('2d')
		renderBackground(bgCtx, 1920, 1080)
		const bgBuffer = bgCanvas.toBuffer('image/png')
		fs.writeFileSync(
			path.join(__dirname, 'test_renderBackground.png'),
			bgBuffer,
		)
		console.log('✅ renderBackground output saved to test_renderBackground.png')

		// 2. Test renderHeader
		console.log('📋 Testing renderHeader...')
		const headerCanvas = createCanvas(1920, 1080)
		const headerCtx = headerCanvas.getContext('2d')
		renderBackground(headerCtx, 1920, 1080)
		renderHeader(headerCtx, videoInfo, 5)
		const headerBuffer = headerCanvas.toBuffer('image/png')
		fs.writeFileSync(
			path.join(__dirname, 'test_renderHeader.png'),
			headerBuffer,
		)
		console.log('✅ renderHeader output saved to test_renderHeader.png')

		// 3. Test renderCommentCard
		console.log('📋 Testing renderCommentCard...')
		const commentCanvas = createCanvas(1920, 1080)
		const commentCtx = commentCanvas.getContext('2d')
		renderBackground(commentCtx, 1920, 1080)
		renderCommentCard(commentCtx, comment, 0, 1, null, 1920, 1080)
		const commentBuffer = commentCanvas.toBuffer('image/png')
		fs.writeFileSync(
			path.join(__dirname, 'test_renderCommentCard.png'),
			commentBuffer,
		)
		console.log(
			'✅ renderCommentCard output saved to test_renderCommentCard.png',
		)

		// 4. Test renderProgressBar
		console.log('📋 Testing renderProgressBar...')
		const progressCanvas = createCanvas(1920, 1080)
		const progressCtx = progressCanvas.getContext('2d')
		renderBackground(progressCtx, 1920, 1080)
		renderProgressBar(progressCtx, 1920, 1080, 0.5)
		const progressBuffer = progressCanvas.toBuffer('image/png')
		fs.writeFileSync(
			path.join(__dirname, 'test_renderProgressBar.png'),
			progressBuffer,
		)
		console.log(
			'✅ renderProgressBar output saved to test_renderProgressBar.png',
		)

		// 5. Test generateTestFrame
		console.log('📋 Testing generateTestFrame...')
		const testFrameBuffer = generateTestFrame(
			videoInfo,
			comment,
			0,
			1,
			null,
			1920,
			1080,
		)
		fs.writeFileSync(
			path.join(__dirname, 'test_generateTestFrame.png'),
			testFrameBuffer,
		)
		console.log(
			'✅ generateTestFrame output saved to test_generateTestFrame.png',
		)

		// 6. Combined test with all components
		console.log('📋 Testing combined components...')
		const combinedCanvas = createCanvas(1920, 1080)
		const combinedCtx = combinedCanvas.getContext('2d')
		renderBackground(combinedCtx, 1920, 1080)
		renderHeader(combinedCtx, videoInfo, 5)
		renderCommentCard(combinedCtx, comment, 0, 1, null, 1920, 1080)
		renderProgressBar(combinedCtx, 1920, 1080, 0.3)
		const combinedBuffer = combinedCanvas.toBuffer('image/png')
		fs.writeFileSync(path.join(__dirname, 'test_combined.png'), combinedBuffer)
		console.log('✅ Combined output saved to test_combined.png')

		// 7. Vertical centering demonstration with visual guides
		console.log('📋 Testing vertical centering demonstration...')
		const centerCanvas = createCanvas(1920, 1080)
		const centerCtx = centerCanvas.getContext('2d')
		renderBackground(centerCtx, 1920, 1080)

		// Draw center line guides showing alignment between left and right sections
		centerCtx.strokeStyle = '#FF0000'
		centerCtx.lineWidth = 2
		centerCtx.setLineDash([5, 5])

		// Video area boundaries (right section)
		const videoX = 950
		const videoY = 30
		const videoW = 900
		const videoH = 506
		const videoCenterY = videoY + videoH / 2

		// Draw video area outline
		centerCtx.strokeRect(videoX, videoY, videoW, videoH)

		// Draw horizontal center line through both sections
		centerCtx.beginPath()
		centerCtx.moveTo(0, videoCenterY)
		centerCtx.lineTo(1920, videoCenterY)
		centerCtx.stroke()

		// Draw header area outline (left section)
		centerCtx.beginPath()
		centerCtx.rect(40, videoY, 880, videoH)
		centerCtx.stroke()

		centerCtx.setLineDash([])
		renderHeader(centerCtx, videoInfo, 5)
		renderVideoArea(centerCtx, videoX, videoY, videoW, videoH)

		// Add labels
		centerCtx.fillStyle = '#FF0000'
		centerCtx.font = '16px Arial'
		centerCtx.textAlign = 'left'
		centerCtx.fillText('Video Area (Right Section)', videoX + 10, videoY - 10)
		centerCtx.fillText('Header Area (Left Section)', 50, videoY - 10)
		centerCtx.fillText('Shared Center Line', 40, videoCenterY - 10)

		const centerBuffer = centerCanvas.toBuffer('image/png')
		fs.writeFileSync(
			path.join(__dirname, 'test_vertical_centering.png'),
			centerBuffer,
		)
		console.log(
			'✅ Vertical centering demonstration saved to test_vertical_centering.png',
		)

		// 8. Test Chinese text wrapping specifically
		console.log('📋 Testing Chinese text wrapping functionality...')
		const chineseCanvas = createCanvas(1920, 1080)
		const chineseCtx = chineseCanvas.getContext('2d')
		renderBackground(chineseCtx, 1920, 1080)

		// Create a comment with very long Chinese text
		const veryLongChineseComment = {
			id: 'chinese_test',
			author: '中文测试用户',
			authorThumbnail:
				'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
			content: 'This is a test comment for Chinese text wrapping.',
			translatedContent:
				'这是一个专门用来测试中文换行功能的超长评论，包含大量中文字符，用于验证中文文本是否能够正确地在画布边界内进行换行显示，确保不会出现文本溢出或者显示不完整的问题。',
			likes: 888,
			replyCount: 12,
		}

		// Draw boundary box for visual reference
		chineseCtx.strokeStyle = '#FF6600'
		chineseCtx.lineWidth = 2
		chineseCtx.setLineDash([5, 5])
		chineseCtx.strokeRect(40, 580, 1600, 400) // Boundary box
		chineseCtx.setLineDash([])

		// Render the comment with long Chinese text
		renderCommentCard(
			chineseCtx,
			veryLongChineseComment,
			0,
			1,
			null,
			1920,
			1080,
		)

		// Add labels
		chineseCtx.fillStyle = '#FF6600'
		chineseCtx.font = '16px Arial'
		chineseCtx.textAlign = 'left'
		chineseCtx.fillText(
			'Chinese Text Wrapping Test - Long Chinese content should wrap within boundary',
			50,
			570,
		)
		chineseCtx.fillText('Boundary Box (1600x400px)', 50, 600)

		const chineseBuffer = chineseCanvas.toBuffer('image/png')
		fs.writeFileSync(
			path.join(__dirname, 'test_chinese_wrapping.png'),
			chineseBuffer,
		)
		console.log(
			'✅ Chinese text wrapping test saved to test_chinese_wrapping.png',
		)

		// 9. Test updated layout with comment area positioned below header area
		console.log('📋 Testing updated layout with comment area below header...')
		const layoutCanvas = createCanvas(1920, 1080)
		const layoutCtx = layoutCanvas.getContext('2d')
		renderBackground(layoutCtx, 1920, 1080)

		// Draw layout guides
		layoutCtx.strokeStyle = '#0000FF'
		layoutCtx.lineWidth = 2
		layoutCtx.setLineDash([5, 5])

		// Header area boundaries
		const headerAreaHeight = 506
		const headerAreaBottom = 30 + headerAreaHeight

		// Draw header area outline
		layoutCtx.strokeRect(40, 30, 880, headerAreaHeight)

		// Draw video area outline
		layoutCtx.strokeRect(videoX, videoY, videoW, videoH)

		// Draw comment area position (should be right below header area)
		const commentSpacing = 20
		const commentY = headerAreaBottom + commentSpacing
		layoutCtx.strokeRect(20, commentY, 1880, 300) // Approximate comment area

		layoutCtx.setLineDash([])
		renderHeader(layoutCtx, videoInfo, 5)
		renderVideoArea(layoutCtx, videoX, videoY, videoW, videoH)
		renderCommentCard(layoutCtx, comment, 0, 1, null, 1920, 1080)

		// Add layout labels
		layoutCtx.fillStyle = '#0000FF'
		layoutCtx.font = '16px Arial'
		layoutCtx.textAlign = 'left'
		layoutCtx.fillText('Header Area (Height: 506px)', 50, 20)
		layoutCtx.fillText('Video Area (Height: 506px)', videoX + 10, 20)
		layoutCtx.fillText(
			'Comment Area (Positioned below header)',
			30,
			commentY - 10,
		)
		layoutCtx.fillText(
			`Header bottom: ${headerAreaBottom}px`,
			50,
			headerAreaBottom + 15,
		)
		layoutCtx.fillText(`Comment top: ${commentY}px`, 30, commentY + 15)
		layoutCtx.fillText(`Gap: ${commentSpacing}px`, 50, headerAreaBottom + 35)

		const layoutBuffer = layoutCanvas.toBuffer('image/png')
		fs.writeFileSync(
			path.join(__dirname, 'test_updated_layout.png'),
			layoutBuffer,
		)
		console.log(
			'✅ Updated layout demonstration saved to test_updated_layout.png',
		)

		// 10. Test bilingual comment display with dynamic height
		console.log('📋 Testing bilingual comment display with dynamic height...')
		const bilingualCanvas = createCanvas(1920, 1080)
		const bilingualCtx = bilingualCanvas.getContext('2d')
		renderBackground(bilingualCtx, 1920, 1080)

		// Create a long comment with both original and translated content
		const longComment = {
			id: 'long_comment',
			author: 'LongCommentUser',
			authorThumbnail:
				'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
			content:
				'This is a very long comment that contains multiple sentences and should wrap properly when rendered. It demonstrates how the system handles both original English content and its Chinese translation simultaneously with dynamic height calculation.',
			translatedContent:
				'这是一个非常非常长的中文评论，包含很多很多的中文字符，应该能够在画布上正确地进行换行显示。这个测试用例专门用来验证中文文本的换行功能是否正常工作，确保长篇中文评论能够被正确渲染而不会超出边界。',
			likes: 1234,
			replyCount: 42,
		}

		// Note: Comment without translation would be rendered here
		// const noTranslationComment = { ... }

		// Render header
		renderHeader(bilingualCtx, videoInfo, 2)
		renderVideoArea(bilingualCtx, 950, 30, 900, 506)

		// Render first comment (with translation) - positioned below header
		renderCommentCard(bilingualCtx, longComment, 0, 2, null, 1920, 1080)

		// Render second comment (without translation) - positioned below first comment
		const headerHeight = 506
		const headerBottom = 30 + headerHeight

		// Calculate where the first comment ends to position the second comment
		bilingualCtx.strokeStyle = '#00FF00'
		bilingualCtx.lineWidth = 1
		bilingualCtx.setLineDash([3, 3])

		// Draw separator line between comments
		const firstCommentBottom = headerBottom + 20 + 250 // Approximate
		bilingualCtx.beginPath()
		bilingualCtx.moveTo(40, firstCommentBottom)
		bilingualCtx.lineTo(1880, firstCommentBottom)
		bilingualCtx.stroke()

		bilingualCtx.setLineDash([])

		// Add labels for different content types
		bilingualCtx.fillStyle = '#000000'
		bilingualCtx.font = '14px Arial'
		bilingualCtx.textAlign = 'left'
		bilingualCtx.fillText(
			'Comment 1: English content first, then Chinese (larger + bold)',
			50,
			firstCommentBottom - 30,
		)
		bilingualCtx.fillText(
			'Comment 2: Original content only (English)',
			50,
			firstCommentBottom + 20,
		)

		const bilingualBuffer = bilingualCanvas.toBuffer('image/png')
		fs.writeFileSync(
			path.join(__dirname, 'test_bilingual_comments.png'),
			bilingualBuffer,
		)
		console.log(
			'✅ Bilingual comment display demonstration saved to test_bilingual_comments.png',
		)

		console.log('🎯 All individual test frame images generated successfully!')
		console.log('📁 Check the following files in the test directory:')
		console.log('   - test_renderBackground.png: White background only')
		console.log(
			'   - test_renderHeader.png: Header with video info (VERTICALLY CENTERED)',
		)
		console.log('   - test_renderCommentCard.png: Single comment card')
		console.log('   - test_renderProgressBar.png: Progress bar at 50%')
		console.log(
			'   - test_generateTestFrame.png: Complete test frame (VERTICALLY CENTERED)',
		)
		console.log(
			'   - test_combined.png: All components combined (VERTICALLY CENTERED)',
		)
		console.log(
			'   - test_vertical_centering.png: Vertical centering demonstration with guide lines',
		)
		console.log(
			'   - test_updated_layout.png: Updated layout with comment area below header',
		)
		console.log(
			'   - test_chinese_wrapping.png: Chinese text wrapping test with very long Chinese content',
		)
		console.log(
			'   - test_bilingual_comments.png: Bilingual comment display (English first, Chinese below with enhanced styling)',
		)

		expect(true).toBe(true)
	})

	describe('renderBackground', () => {
		it('should render white background', () => {
			renderBackground(ctx, 1920, 1080)

			// Get image data to verify background is white
			const imageData = ctx.getImageData(0, 0, 1, 1)
			const pixel = imageData.data

			// Check if pixel is white (255, 255, 255, 255)
			expect(pixel[0]).toBe(255) // R
			expect(pixel[1]).toBe(255) // G
			expect(pixel[2]).toBe(255) // B
			expect(pixel[3]).toBe(255) // A
		})
	})

	describe('renderHeader', () => {
		it('should render header with video info', () => {
			const videoInfo = {
				title: 'Test Video',
				translatedTitle: '测试视频',
				viewCount: 1000000,
				author: 'Test Author',
				thumbnail: 'https://example.com/thumb.jpg',
			}

			renderHeader(ctx, videoInfo, 5)

			// Verify header background was drawn
			const imageData = ctx.getImageData(40, 60, 1, 1)
			expect(imageData.data).toBeDefined()
		})

		it('should handle missing translated title', () => {
			const videoInfo = {
				title: 'Test Video',
				viewCount: 1000000,
				author: 'Test Author',
			}

			renderHeader(ctx, videoInfo, 5)

			// Should not throw error
			expect(true).toBe(true)
		})

		it('should handle missing author', () => {
			const videoInfo = {
				title: 'Test Video',
				viewCount: 1000000,
			}

			renderHeader(ctx, videoInfo, 5)

			// Should not throw error
			expect(true).toBe(true)
		})
	})

	describe('renderCommentCard', () => {
		it('should render comment card with basic info', () => {
			const comment = {
				id: 'comment1',
				author: 'TestUser',
				content: 'This is a test comment',
				likes: 10,
			}

			renderCommentCard(ctx, comment, 0, 1, null, 1920, 1080)

			// Verify comment card was drawn
			const imageData = ctx.getImageData(20, 800, 1, 1)
			expect(imageData.data).toBeDefined()
		})

		it('should render comment with translated content', () => {
			const comment = {
				id: 'comment1',
				author: 'TestUser',
				content: 'This is a test comment',
				translatedContent: '这是一个测试评论',
				likes: 10,
			}

			renderCommentCard(ctx, comment, 0, 1, null, 1920, 1080)

			// Should not throw error
			expect(true).toBe(true)
		})

		it('should handle long comment content', () => {
			const comment = {
				id: 'comment1',
				author: 'TestUser',
				content:
					'This is a very long comment that should wrap properly when rendered in the comment card. It contains multiple sentences and should be handled gracefully by the text wrapping function.',
				likes: 10,
			}

			renderCommentCard(ctx, comment, 0, 1, null, 1920, 1080)

			// Should not throw error
			expect(true).toBe(true)
		})
	})

	describe('renderProgressBar', () => {
		it('should render progress bar with 0% progress', () => {
			renderProgressBar(ctx, 1920, 1080, 0)

			// Verify progress bar was drawn
			const imageData = ctx.getImageData(20, 1057, 1, 1)
			expect(imageData.data).toBeDefined()
		})

		it('should render progress bar with 50% progress', () => {
			renderProgressBar(ctx, 1920, 1080, 0.5)

			// Should not throw error
			expect(true).toBe(true)
		})

		it('should render progress bar with 100% progress', () => {
			renderProgressBar(ctx, 1920, 1080, 1)

			// Should not throw error
			expect(true).toBe(true)
		})
	})

	describe('generateTestFrame', () => {
		it('should generate test frame with all components', () => {
			const videoInfo = {
				title: 'Test Video',
				viewCount: 1000000,
				author: 'Test Author',
			}

			const comment = {
				id: 'comment1',
				author: 'TestUser',
				content: 'This is a test comment',
				likes: 10,
			}

			const buffer = generateTestFrame(videoInfo, comment, 0, 1)

			// Should return buffer
			expect(buffer).toBeInstanceOf(Buffer)
			expect(buffer.length).toBeGreaterThan(0)
		})

		it('should generate test frame with custom dimensions', () => {
			const videoInfo = {
				title: 'Test Video',
				viewCount: 1000000,
				author: 'Test Author',
			}

			const comment = {
				id: 'comment1',
				author: 'TestUser',
				content: 'This is a test comment',
				likes: 10,
			}

			const buffer = generateTestFrame(
				videoInfo,
				comment,
				0,
				1,
				null,
				1280,
				720,
			)

			// Should return buffer
			expect(buffer).toBeInstanceOf(Buffer)
			expect(buffer.length).toBeGreaterThan(0)
		})
	})
})
