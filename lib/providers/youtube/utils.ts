import { extractVideoId as providerExtractVideoId } from '@app/media-providers'

// YouTube URL helpers for the app layer.
// Prefer importing `extractVideoId` directly from `@app/media-providers` at call sites.

/**
 * Check if a URL is a valid YouTube URL
 * @param url URL to check
 * @returns true if valid YouTube URL
 */
export function isValidYouTubeUrl(url: string): boolean {
	return providerExtractVideoId(url) !== null
}

/**
 * Build YouTube watch URL from video ID
 * @param videoId YouTube video ID
 * @returns Full YouTube watch URL
 */
export function buildYouTubeUrl(videoId: string): string {
	return `https://www.youtube.com/watch?v=${videoId}`
}
