import type { TikTokInfo } from './types'

export function extractTikTokVideoId(url: string): string | null {
	const patterns = [
		/tiktok\.com\/@[\w.-]+\/video\/(\d+)/,
		/tiktok\.com\/t\/(\w+)/,
		/vm\.tiktok\.com\/(\w+)/,
		/douyin\.com\/video\/(\d+)/,
		/iesdouyin\.com\/share\/video\/(\d+)/,
	]

	for (const pattern of patterns) {
		const match = url.match(pattern)
		if (match && match[1]) {
			return match[1]
		}
	}

	return null
}

export function isTikTokUrl(url: string): boolean {
	const tiktokPatterns = [
		/tiktok\.com\/@[\w.-]+\/video\/[\d]+/,
		/tiktok\.com\/t\/[\w]+/,
		/vm\.tiktok\.com\/[\w]+/,
		/douyin\.com\/video\/[\d]+/,
		/iesdouyin\.com\/share\/video\/[\d]+/,
	]

	return tiktokPatterns.some(pattern => pattern.test(url))
}

// Pick best thumbnail from TikTokInfo
export function pickTikTokThumbnail(info: TikTokInfo | null): string | undefined {
  if (!info) return undefined
  if (typeof info.thumbnail === 'string' && info.thumbnail.length > 0) {
    return info.thumbnail
  }
  const first = info.thumbnails?.find(
    (t) => typeof t.url === 'string' && (t.url as string).length > 0,
  )
  return first?.url
}
