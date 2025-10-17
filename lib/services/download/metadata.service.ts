import type { BasicVideoInfo } from '~/lib/types/provider.types'
import type { VideoProviderContext } from '~/lib/types/provider.types'
import { ProviderFactory } from '~/lib/providers/provider-factory'
import { logger } from '~/lib/logger'

export class MetadataService {
	/**
	 * 获取视频元数据
	 */
	async fetchVideoMetadata(url: string, context?: VideoProviderContext): Promise<BasicVideoInfo | null> {
		try {
			const provider = ProviderFactory.resolveProvider(url)
			return await provider.fetchMetadata(url, context || {})
        } catch (error) {
            logger.error('media', `Failed to fetch video metadata: ${error instanceof Error ? error.message : String(error)}`)
            return null
        }
	}

	/**
	 * 批量获取视频元数据
	 */
	async fetchMultipleVideoMetadata(
		urls: string[],
		context?: VideoProviderContext
	): Promise<Map<string, BasicVideoInfo | null>> {
		const results = new Map<string, BasicVideoInfo | null>()

		// 并行获取，但限制并发数以避免过载
		const batchSize = 5
		for (let i = 0; i < urls.length; i += batchSize) {
			const batch = urls.slice(i, i + batchSize)
			const batchPromises = batch.map(async (url) => {
				const metadata = await this.fetchVideoMetadata(url, context)
				return { url, metadata }
			})

			const batchResults = await Promise.allSettled(batchPromises)

			batchResults.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    results.set(result.value.url, result.value.metadata)
                } else {
                    logger.error('media', `Failed to fetch metadata for ${batch[index]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`)
                    results.set(batch[index], null)
                }
            })
		}

		return results
	}

	/**
	 * 验证元数据完整性
	 */
	validateMetadata(metadata: BasicVideoInfo | null): boolean {
		if (!metadata) return false

		// 检查必需字段
		const requiredFields = ['title']
		return requiredFields.every(field => metadata[field as keyof BasicVideoInfo] !== undefined)
	}

	/**
	 * 标准化元数据
	 */
	normalizeMetadata(metadata: BasicVideoInfo): BasicVideoInfo {
		return {
			...metadata,
			title: metadata.title?.trim() || 'Unknown Title',
			author: metadata.author?.trim() || 'Unknown Author',
			viewCount: metadata.viewCount || 0,
			likeCount: metadata.likeCount || 0,
		}
	}

	/**
	 * 从元数据提取搜索关键词
	 */
	extractKeywords(metadata: BasicVideoInfo): string[] {
		if (!metadata.title) return []

		const keywords: string[] = []
		const title = metadata.title.toLowerCase()

		// 简单的关键词提取逻辑
		// 可以根据需要增强这个逻辑
		const words = title.split(/\s+/)
		words.forEach(word => {
			if (word.length > 3 && !this.isStopWord(word)) {
				keywords.push(word)
			}
		})

		return keywords.slice(0, 10) // 限制关键词数量
	}

	private isStopWord(word: string): boolean {
		const stopWords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'she', 'use', 'her', 'have', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'will', 'with', 'your', 'from', 'they', 'been', 'have', 'were', 'said', 'each', 'which', 'their', 'time', 'will', 'about', 'would', 'there', 'could', 'other', 'them', 'these', 'after', 'first', 'should', 'being', 'under', 'never', 'where', 'those', 'shall', 'having', 'might', 'great', 'could', 'where', 'shall', 'being']
		return stopWords.includes(word)
	}
}

// 单例实例
export const metadataService = new MetadataService()
