import { ProxyAgent, fetch as undiciFetch } from 'undici'
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
	const fetchWithProxy = agent
		? ((input: RequestInfo | URL, init?: RequestInit) =>
				undiciFetch(input, {
					...(init ?? {}),
					dispatcher: agent,
				}))
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
