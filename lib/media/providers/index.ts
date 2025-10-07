// Legacy compatibility layer - redirect to new provider system
export {
	ProviderFactory,
	providerRegistry,
	resolveVideoProvider,
	getVideoProviders,
	providerToSource
} from '~/lib/providers/provider-factory'

export type { VideoProvider, VideoProviderContext } from './types'

// For backward compatibility, maintain the old interface
import { ProviderFactory } from '~/lib/providers/provider-factory'

export const VIDEO_PROVIDERS = ProviderFactory.getAllProviders()
