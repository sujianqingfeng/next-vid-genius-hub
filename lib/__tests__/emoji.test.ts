import { createCanvas } from 'canvas'
import { describe, expect, it } from 'vitest'
import { generateTestFrame } from '../media'

describe('Emoji Rendering Tests', () => {
	it('should render emojis in comment content', async () => {
		const mockVideoInfo = {
			title: 'Test Video with Emojis 🎬',
			translatedTitle: '测试视频与表情符号 🎬',
			viewCount: 1000000,
			author: 'Test Creator',
		}

		const mockComment = {
			id: 'comment1',
			author: 'EmojiLover 😍',
			content: 'This is amazing! 🎉🎊🎈 The best content I\'ve seen! 🏆🥇💎',
			translatedContent: '这太棒了！🎉🎊🎈 我见过的最好的内容！🏆🥇💎',
			likes: 1250,
			source: 'youtube' as const,
		}

		// Generate a test frame with emojis
		const buffer = await generateTestFrame(
			mockVideoInfo,
			mockComment,
			0,
			1,
			null,
			1920,
			1080,
		)

		// Verify that the buffer was generated successfully
		expect(buffer).toBeInstanceOf(Buffer)
		expect(buffer.length).toBeGreaterThan(0)

		console.log('✅ Emoji rendering test completed successfully')
	}, 30000) // 30 second timeout

	it('should handle various emoji types', async () => {
		const mockVideoInfo = {
			title: 'Emoji Test Video 🎬',
			translatedTitle: '表情符号测试视频 🎬',
			viewCount: 500000,
			author: 'Emoji Tester',
		}

		const testComments = [
			{
				id: 'comment1',
				author: 'User1',
				content: 'Basic emojis: 😀😍🔥💯',
				translatedContent: '基本表情符号: 😀😍🔥💯',
				likes: 100,
				source: 'youtube' as const,
			},
			{
				id: 'comment2',
				author: 'User2',
				content: 'Complex emojis: 👨‍👩‍👧‍👦🏳️‍🌈🇺🇸',
				translatedContent: '复杂表情符号: 👨‍👩‍👧‍👦🏳️‍🌈🇺🇸',
				likes: 200,
				source: 'tiktok' as const,
			},
			{
				id: 'comment3',
				author: 'User3',
				content: 'Activity emojis: ⚽🎮🎨🎭',
				translatedContent: '活动表情符号: ⚽🎮🎨🎭',
				likes: 150,
				source: 'youtube' as const,
			},
		]

		// Test each comment
		for (let i = 0; i < testComments.length; i++) {
			const buffer = await generateTestFrame(
				mockVideoInfo,
				testComments[i],
				i,
				testComments.length,
				null,
				1920,
				1080,
			)

			expect(buffer).toBeInstanceOf(Buffer)
			expect(buffer.length).toBeGreaterThan(0)
		}

		console.log('✅ Multiple emoji types test completed successfully')
	}, 60000) // 60 second timeout for multiple tests
}) 