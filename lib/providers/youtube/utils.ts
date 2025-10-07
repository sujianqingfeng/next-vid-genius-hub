import getYouTubeID from 'get-youtube-id'

/**
 * Extract YouTube video ID from URL
 * @param url YouTube URL (e.g., https://www.youtube.com/watch?v=VIDEO_ID)
 * @returns Video ID or null if invalid URL
 */
export function extractVideoId(url: string): string | null {
	return getYouTubeID(url)
}

/**
 * Check if a URL is a valid YouTube URL
 * @param url URL to check
 * @returns true if valid YouTube URL
 */
export function isValidYouTubeUrl(url: string): boolean {
	return extractVideoId(url) !== null
}

/**
 * Build YouTube watch URL from video ID
 * @param videoId YouTube video ID
 * @returns Full YouTube watch URL
 */
export function buildYouTubeUrl(videoId: string): string {
	return `https://www.youtube.com/watch?v=${videoId}`
}
