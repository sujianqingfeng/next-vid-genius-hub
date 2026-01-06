import { describe, expect, it } from 'vitest'
import {
	buildThreadPostsInsertFromDraft,
	parseXThreadImportDraft,
} from '~/lib/domain/thread/adapters/x'

describe('thread.adapters.x', () => {
	it('parses X thread json into root + one-layer replies blocks', () => {
		const raw = {
			sourceUrl: 'https://x.com/a/status/1',
			total: 2,
			root: {
				statusId: '1',
				url: 'https://x.com/a/status/1',
				author: {
					displayName: 'A',
					handle: '@a',
					profileUrl: 'https://x.com/a',
				},
				createdAt: '2025-12-25T03:47:05.000Z',
				text: 'Root text',
				metrics: { replies: 1, likes: 10 },
				isRoot: true,
			},
			replies: [
				{
					statusId: '2',
					url: 'https://x.com/b/status/2',
					author: {
						displayName: 'B',
						handle: '@b',
						profileUrl: 'https://x.com/b',
					},
					createdAt: '2025-12-25T05:10:05.000Z',
					text: 'Reply 1',
					metrics: { replies: 0, likes: 3 },
					isRoot: false,
				},
			],
			all: [],
		}

		const draft = parseXThreadImportDraft(raw)
		expect(draft.title).toBe('Root text')
		expect(draft.root.author.handle).toBe('@a')
		expect(draft.replies).toHaveLength(1)
		expect(draft.replies[0]?.author.name).toBe('B')
		expect(draft.replies[0]?.contentBlocks[0]?.type).toBe('text')

		const posts = buildThreadPostsInsertFromDraft({
			threadId: 't1',
			draft,
		})
		expect(posts).toHaveLength(2)
		expect(posts[0]?.role).toBe('root')
		expect(posts[1]?.role).toBe('reply')
		expect(posts[1]?.depth).toBe(1)
		expect(posts[1]?.plainText).toBe('Reply 1')
	})

	it('includes external media as non-text blocks', () => {
		const raw = {
			sourceUrl: 'https://x.com/a/status/1',
			total: 1,
			root: {
				statusId: '1',
				url: 'https://x.com/a/status/1',
				author: {
					displayName: 'A',
					handle: '@a',
					profileUrl: 'https://x.com/a',
				},
				createdAt: '2025-12-25T03:47:05.000Z',
				text: 'Root text',
				metrics: { replies: 0, likes: 10 },
				media: [
					{
						type: 'image',
						url: 'https://pbs.twimg.com/media/abc?format=jpg&name=small',
						alt: 'Image',
					},
				],
				isRoot: true,
			},
			replies: [],
			all: [],
		}

		const draft = parseXThreadImportDraft(raw)
		expect(draft.root.contentBlocks[0]?.type).toBe('text')
		expect(draft.root.contentBlocks[1]?.type).toBe('image')
		expect((draft.root.contentBlocks[1] as any).data.assetId).toBe(
			'ext:https://pbs.twimg.com/media/abc?format=jpg&name=small',
		)
	})

	it('accepts single media objects and video poster-only exports', () => {
		const raw = {
			sourceUrl: 'https://x.com/a/status/1',
			total: 1,
			root: {
				statusId: '1',
				url: 'https://x.com/a/status/1',
				author: {
					displayName: 'A',
					handle: '@a',
					profileUrl: 'https://x.com/a',
				},
				createdAt: '2025-12-25T03:47:05.000Z',
				text: 'Root text',
				metrics: { replies: 0, likes: 10 },
				media: {
					type: 'video',
					posterUrl: 'https://pbs.twimg.com/profile_images/poster.jpg',
				},
				isRoot: true,
			},
			replies: [],
			all: [],
		}

		const draft = parseXThreadImportDraft(raw)
		expect(draft.root.contentBlocks[0]?.type).toBe('text')
		expect(draft.root.contentBlocks[1]?.type).toBe('image')
		expect((draft.root.contentBlocks[1] as any).data.assetId).toBe(
			'ext:https://pbs.twimg.com/profile_images/poster.jpg',
		)
	})

	it('prefers m3u8Urls for amplify_video media (init mp4 segments are not playable)', () => {
		const raw = {
			sourceUrl: 'https://x.com/a/status/1',
			total: 1,
			root: {
				statusId: '1',
				url: 'https://x.com/a/status/1',
				author: {
					displayName: 'A',
					handle: '@a',
					profileUrl: 'https://x.com/a',
				},
				createdAt: '2025-12-25T03:47:05.000Z',
				text: 'Root text',
				metrics: { replies: 0, likes: 10 },
				media: [
					{
						type: 'video',
						posterUrl: 'https://pbs.twimg.com/amplify_video_thumb/x/img.jpg',
						m3u8Urls: [
							'https://video.twimg.com/amplify_video/x/pl/_master.m3u8?variant_version=1&tag=21',
							'https://video.twimg.com/amplify_video/x/pl/avc1/1920x1080/vid.m3u8',
						],
						mp4Urls: [
							'https://video.twimg.com/amplify_video/x/aud/mp4a/0/0/32000/audio.mp4',
							'https://video.twimg.com/amplify_video/x/vid/avc1/0/0/1920x1080/video.mp4',
						],
					},
				],
				isRoot: true,
			},
			replies: [],
			all: [],
		}

		const draft = parseXThreadImportDraft(raw)
		expect(draft.root.contentBlocks[1]?.type).toBe('video')
		expect((draft.root.contentBlocks[1] as any).data.assetId).toBe(
			'ext:https://video.twimg.com/amplify_video/x/pl/_master.m3u8?variant_version=1&tag=21',
		)
	})

	it('still prefers mp4Urls for non-amplify video media', () => {
		const raw = {
			sourceUrl: 'https://x.com/a/status/1',
			total: 1,
			root: {
				statusId: '1',
				url: 'https://x.com/a/status/1',
				author: {
					displayName: 'A',
					handle: '@a',
					profileUrl: 'https://x.com/a',
				},
				createdAt: '2025-12-25T03:47:05.000Z',
				text: 'Root text',
				metrics: { replies: 0, likes: 10 },
				media: [
					{
						type: 'video',
						posterUrl: 'https://pbs.twimg.com/tweet_video_thumb/x/img.jpg',
						m3u8Urls: ['https://example.com/video.m3u8'],
						mp4Urls: ['https://cdn.example.com/video.mp4'],
					},
				],
				isRoot: true,
			},
			replies: [],
			all: [],
		}

		const draft = parseXThreadImportDraft(raw)
		expect(draft.root.contentBlocks[1]?.type).toBe('video')
		expect((draft.root.contentBlocks[1] as any).data.assetId).toBe(
			'ext:https://cdn.example.com/video.mp4',
		)
	})
})
