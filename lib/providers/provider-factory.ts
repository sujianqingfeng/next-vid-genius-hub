import type { VideoProvider, VideoProviderContext, ThumbnailQuality } from '~/lib/types/provider.types'
import { youtubeProvider } from './youtube/provider'
import { tiktokProvider } from './tiktok/provider'

/**
 * Provider Registry - manages all available video providers
 */
class ProviderRegistry {
	private providers: Map<string, VideoProvider> = new Map()
	private domainMappings: Map<string, VideoProvider> = new Map()

	constructor() {
		this.registerProvider(youtubeProvider)
		this.registerProvider(tiktokProvider)
	}

	/**
	 * Register a new video provider
	 */
	registerProvider(provider: VideoProvider): void {
		this.providers.set(provider.id, provider)

		// Register domain mappings for quick lookup
		if (provider.domains) {
			provider.domains.forEach(domain => {
				this.domainMappings.set(domain.toLowerCase(), provider)
			})
		}
	}

	/**
	 * Get provider by ID
	 */
	getProvider(id: string): VideoProvider | undefined {
		return this.providers.get(id)
	}

	/**
	 * Get all registered providers
	 */
	getAllProviders(): VideoProvider[] {
		return Array.from(this.providers.values())
	}

	/**
	 * Resolve provider for a given URL
	 */
	resolveProvider(url: string): VideoProvider {
		// First try domain-based lookup for performance
		const domain = this.extractDomain(url)
		if (domain) {
			const domainProvider = this.domainMappings.get(domain)
			if (domainProvider) {
				return domainProvider
			}
		}

		// Fallback to checking all providers
		const providers = this.getAllProviders()
		const matched = providers.find((provider) => {
			try {
				return provider.matches(url)
			} catch {
				return false
			}
		})

		return matched || youtubeProvider // Default fallback
	}

	/**
	 * Check if a URL is supported by any provider
	 */
	isUrlSupported(url: string): boolean {
		try {
			const provider = this.resolveProvider(url)
			return provider.matches(url)
		} catch {
			return false
		}
	}

	/**
	 * Get supported domains
	 */
	getSupportedDomains(): string[] {
		return Array.from(this.domainMappings.keys())
	}

	/**
	 * Get supported provider IDs
	 */
	getSupportedProviderIds(): string[] {
		return Array.from(this.providers.keys())
	}

	/**
	 * Cleanup all providers
	 */
	cleanup(): void {
		this.providers.forEach(provider => {
			if (provider.cleanup) {
				provider.cleanup()
			}
		})
	}

	/**
	 * Extract domain from URL
	 */
	private extractDomain(url: string): string | null {
		try {
			const urlObj = new URL(url)
			return urlObj.hostname.toLowerCase()
		} catch {
			return null
		}
	}
}

// Global provider registry instance
export const providerRegistry = new ProviderRegistry()

/**
 * Provider Factory - provides convenient methods to work with providers
 */
export class ProviderFactory {
	/**
	 * Resolve the appropriate provider for a URL
	 */
	static resolveProvider(url: string): VideoProvider {
		return providerRegistry.resolveProvider(url)
	}

	/**
	 * Get provider by ID
	 */
	static getProvider(id: string): VideoProvider | undefined {
		return providerRegistry.getProvider(id)
	}

	/**
	 * Get all providers
	 */
	static getAllProviders(): VideoProvider[] {
		return providerRegistry.getAllProviders()
	}

	/**
	 * Register a new provider
	 */
	static registerProvider(provider: VideoProvider): void {
		providerRegistry.registerProvider(provider)
	}

	/**
	 * Fetch metadata using the appropriate provider
	 */
	static async fetchMetadata(
		url: string,
		context?: VideoProviderContext
	): Promise<ReturnType<VideoProvider['fetchMetadata']>> {
		const provider = this.resolveProvider(url)
		return provider.fetchMetadata(url, context || {})
	}

	/**
	 * Validate URL using appropriate provider
	 */
	static async validateUrl(url: string): Promise<boolean> {
		const provider = this.resolveProvider(url)
		return provider.validateUrl ? provider.validateUrl(url) : provider.matches(url)
	}

	/**
	 * Get video ID from URL
	 */
	static async getVideoId(url: string): Promise<string | null> {
		const provider = this.resolveProvider(url)
		return provider.getVideoId ? provider.getVideoId(url) : null
	}

	/**
	 * Get video URL from video ID
	 */
	static async getVideoUrl(providerId: string, videoId: string): Promise<string | null> {
		const provider = providerRegistry.getProvider(providerId)
		return provider?.getVideoUrl ? provider.getVideoUrl(videoId) : null
	}

	/**
	 * Get embed URL for video
	 */
	static async getEmbedUrl(providerId: string, videoId: string): Promise<string | null> {
		const provider = providerRegistry.getProvider(providerId)
		return provider?.getEmbedUrl ? provider.getEmbedUrl(videoId) : null
	}

	/**
	 * Get thumbnail URL for video
	 */
	static async getThumbnailUrl(
		providerId: string,
		videoId: string,
		quality?: string
	): Promise<string | null> {
		const provider = providerRegistry.getProvider(providerId)
		return provider?.getThumbnailUrl ? provider.getThumbnailUrl(videoId, quality as ThumbnailQuality) : null
	}

	/**
	 * Check if any provider supports the URL
	 */
	static isUrlSupported(url: string): boolean {
		return providerRegistry.isUrlSupported(url)
	}

	/**
	 * Get supported domains
	 */
	static getSupportedDomains(): string[] {
		return providerRegistry.getSupportedDomains()
	}

	/**
	 * Get supported provider information
	 */
	static getProviderInfo(): Array<{
		id: string
		name: string
		domains: string[]
	}> {
		return providerRegistry.getAllProviders().map(provider => ({
			id: provider.id,
			name: provider.name || provider.id,
			domains: provider.domains || [],
		}))
	}

	/**
	 * Cleanup all providers
	 */
	static cleanup(): void {
		providerRegistry.cleanup()
	}
}

