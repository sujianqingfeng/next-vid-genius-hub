'use server'

import { ProxyAgent, fetch as undiciFetch } from 'undici'
import type { SessionOptions } from 'youtubei.js'
import { Innertube, UniversalCache } from 'youtubei.js'

export type YouTubeClientConfig = {
	proxy?: string
	cacheEnabled?: boolean
}

export async function getYouTubeClient(
	config: YouTubeClientConfig = {},
): Promise<Innertube> {
	const cache = new UniversalCache(config.cacheEnabled !== false)
	const agent = config.proxy ? new ProxyAgent(config.proxy) : undefined
	const fetchWithProxy: SessionOptions['fetch'] | undefined = agent
		? (input, init) => {
				const undiciInit: Parameters<typeof undiciFetch>[1] = init
					? { ...(init as Parameters<typeof undiciFetch>[1]), dispatcher: agent }
					: { dispatcher: agent }
				return undiciFetch(
					input as Parameters<typeof undiciFetch>[0],
					undiciInit,
				) as unknown as Promise<Response>
			}
		: undefined

	return Innertube.create(
		fetchWithProxy
			? {
					cache,
					fetch: fetchWithProxy,
				}
			: { cache },
	)
}
