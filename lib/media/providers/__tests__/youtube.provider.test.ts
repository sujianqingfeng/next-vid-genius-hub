import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetYouTubeClient = vi.fn()

vi.mock('~/lib/youtube', async () => {
	const actual = await vi.importActual<typeof import('~/lib/youtube')>(
		'~/lib/youtube',
	)
	return {
		...actual,
		getYouTubeClient: mockGetYouTubeClient,
	}
})

const YOUTUBE_URL = 'https://www.youtube.com/watch?v=9qIHqX6rdiw'

const proxyUrl = 'http://127.0.0.1:7890'

beforeEach(() => {
	mockGetYouTubeClient.mockReset()
})

const createMockClient = () => {
	const mockInfo = {
		basic_info: {
			title: 'Example Title',
			author: 'Example Channel',
			thumbnail: [
				{ url: 'https://example.com/default.jpg', width: 1280, height: 720 },
				{ url: 'https://example.com/alt.jpg', width: 640, height: 360 },
			],
			view_count: 123,
			like_count: 45,
		},
	} as unknown as import('youtubei.js').VideoInfo

	return {
		client: {
			getBasicInfo: vi.fn().mockResolvedValue(mockInfo),
		} as unknown as import('youtubei.js').Innertube,
		info: mockInfo,
	}
}

describe('youtubeProvider.fetchMetadata', () => {
	it('initializes a YouTube client with the proxy and returns metadata', async () => {
		const { youtubeProvider } = await import('../youtube')

		const { client, info } = createMockClient()
		mockGetYouTubeClient.mockResolvedValueOnce(client)

		const metadata = await youtubeProvider.fetchMetadata(YOUTUBE_URL, {
			proxyUrl,
		})

		expect(mockGetYouTubeClient).toHaveBeenCalledWith({ proxy: proxyUrl })
		expect(client.getBasicInfo).toHaveBeenCalledWith('9qIHqX6rdiw')
		expect(metadata).toMatchObject({
			title: 'Example Title',
			author: 'Example Channel',
			thumbnail: 'https://example.com/default.jpg',
			thumbnails: info.basic_info?.thumbnail,
			viewCount: 123,
			likeCount: 45,
			source: 'youtube',
		})

		mockGetYouTubeClient.mockClear()

		const secondCall = await youtubeProvider.fetchMetadata(YOUTUBE_URL, {
			proxyUrl,
		})

		expect(mockGetYouTubeClient).not.toHaveBeenCalled()
		expect(client.getBasicInfo).toHaveBeenCalledTimes(2)
		expect(secondCall.title).toBe('Example Title')
	})
})
