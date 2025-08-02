import { Innertube, Platform, UniversalCache } from 'youtubei.js'

export type YouTubeClientConfig = {
	proxy?: string
	cacheEnabled?: boolean
}

export async function getYouTubeClient(
	config: YouTubeClientConfig = {},
): Promise<Innertube> {
	const cache = new UniversalCache(config.cacheEnabled !== false)
	const options: any = { cache }

	// 如果提供了代理配置，添加到选项中
	if (config.proxy) {
		options.fetch_options = {
			agent: config.proxy,
		}
	}

	return Innertube.create(options)
}
