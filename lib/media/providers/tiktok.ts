import { getTikTokInfo, pickTikTokThumbnail } from '~/lib/tiktok'

import type { BasicVideoInfo } from '../types'
import type { VideoProvider, VideoProviderContext } from './types'

const TIKTOK_HOSTNAMES = ['tiktok.com', 'douyin.com', 'iesdouyin.com']

function isTikTokUrl(url: string): boolean {
	try {
		const parsed = new URL(url)
		const hostname = parsed.hostname.toLowerCase()
		return TIKTOK_HOSTNAMES.some((host) => hostname.includes(host))
	} catch {
		return false
	}
}

export const tiktokProvider: VideoProvider = {
	id: 'tiktok',
	matches: isTikTokUrl,
	async fetchMetadata(url, _context: VideoProviderContext) {
		const info = await getTikTokInfo(url)
		const metadata: BasicVideoInfo<typeof info> = {
			title: info.title,
			author: info.uploader ?? info.uploader_id,
			thumbnail: pickTikTokThumbnail(info),
			thumbnails: info.thumbnails,
			viewCount:
				typeof info.view_count === 'number' ? info.view_count : undefined,
			likeCount:
				typeof info.like_count === 'number' ? info.like_count : undefined,
			source: 'tiktok',
			raw: info,
		}
		return metadata
	},
}

export { isTikTokUrl }
