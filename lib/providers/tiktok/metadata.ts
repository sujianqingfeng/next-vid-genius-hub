// Re-export from legacy compatibility for now
export {
	getTikTokInfo as fetchTikTokMetadata,
	pickTikTokThumbnail
} from './legacy-compat'

// Define TikTokInfo interface locally to avoid import issues
export interface TikTokInfo {
	title?: string
	uploader?: string
	uploader_id?: string
	thumbnails?: Array<{ url?: string }>
	thumbnail?: string
	view_count?: number
	like_count?: number
	duration?: number
	description?: string
	upload_date?: string
}

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