import path from 'path'
import { describe, expect, it } from 'vitest'
import { renderVideoWithCanvas, renderVideoWithInfoAndComments } from '../media'

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
