import type { VideoProvider } from './types'
import { tiktokProvider } from './tiktok'
import { youtubeProvider } from './youtube'

export const VIDEO_PROVIDERS: VideoProvider[] = [tiktokProvider, youtubeProvider]

export function getVideoProviders(): VideoProvider[] {
	return VIDEO_PROVIDERS
}

export function resolveVideoProvider(url: string): VideoProvider {
	const providers = getVideoProviders()
	const matched = providers.find((provider) => {
		try {
			return provider.matches(url)
		} catch {
			return false
		}
	})
	return matched ?? youtubeProvider
}

export type { VideoProvider, VideoProviderContext } from './types'
