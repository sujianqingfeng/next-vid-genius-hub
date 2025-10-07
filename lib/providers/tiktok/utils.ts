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