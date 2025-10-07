import { pickTikTokThumbnail } from './legacy-compat'

// Re-export utility functions
export { pickTikTokThumbnail }

// Define fetchTikTokMetadata as a server-side function
export async function fetchTikTokMetadata(url: string) {
	const { fetchTikTokMetadata: fetchMetadata } = await import('./metadata.server')
	return fetchMetadata(url)
}