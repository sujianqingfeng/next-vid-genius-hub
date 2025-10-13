import { eq, desc, sql } from 'drizzle-orm'
import type { MediaItem } from '~/lib/types/media.types'
import { db, schema } from '~/lib/db'

export class MediaRepository {
	/**
	 * 根据ID查找媒体
	 */
	async findById(id: string): Promise<MediaItem | null> {
		const result = await db.query.media.findFirst({
			where: eq(schema.media.id, id)
		})
		return result ? result as unknown as MediaItem : null
	}

	/**
	 * 根据URL查找媒体
	 */
	async findByUrl(url: string): Promise<MediaItem | null> {
		const result = await db.query.media.findFirst({
			where: eq(schema.media.url, url)
		})
		return result ? result as unknown as MediaItem : null
	}

	/**
	 * 创建媒体记录
	 */
    async create(data: Omit<MediaItem, 'id' | 'createdAt'>): Promise<MediaItem> {
        const [result] = await db
            .insert(schema.media)
            .values(data as unknown as typeof schema.media.$inferInsert)
            .returning()
        return result as unknown as MediaItem
    }

	/**
	 * 更新媒体记录
	 */
    async update(id: string, data: Partial<Omit<MediaItem, 'id' | 'createdAt'>>): Promise<MediaItem | null> {
        const [result] = await db
            .update(schema.media)
            .set(data as unknown as Partial<typeof schema.media.$inferInsert>)
            .where(eq(schema.media.id, id))
            .returning()
        return result ? result as unknown as MediaItem : null
    }

	/**
	 * 删除媒体记录
	 */
	async delete(id: string): Promise<boolean> {
		await db.delete(schema.media).where(eq(schema.media.id, id))
		return true // Assume success if no error thrown
	}

	/**
	 * 获取媒体列表（分页）
	 */
    async findMany(options: {
        limit?: number
        offset?: number
        where?: unknown
        orderBy?: unknown
    }): Promise<MediaItem[]> {
        const { limit = 20, offset = 0, where, orderBy = desc(schema.media.createdAt) } = options

		return await db
			.select()
			.from(schema.media)
			.where(where)
			.orderBy(orderBy)
			.limit(limit)
			.offset(offset) as unknown as MediaItem[]
	}

	/**
	 * 获取媒体总数
	 */
    async count(where?: unknown): Promise<number> {
        const [result] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.media)
            .where(where)
        return result.count
    }

	/**
	 * 搜索媒体
	 */
	async search(query: string, options: {
		limit?: number
		offset?: number
	} = {}): Promise<MediaItem[]> {
		const { limit = 20, offset = 0 } = options

		// 简单的搜索实现
		const searchCondition = sql`
			(
				${schema.media.title} ILIKE ${'%' + query + '%'} OR
				${schema.media.author} ILIKE ${'%' + query + '%'}
			)
		`

		return await db
			.select()
			.from(schema.media)
			.where(searchCondition)
			.orderBy(desc(schema.media.createdAt))
			.limit(limit)
			.offset(offset) as unknown as MediaItem[]
	}

	/**
	 * 根据来源获取媒体
	 */
    async findBySource(source: string, options: {
        limit?: number
        offset?: number
    } = {}): Promise<MediaItem[]> {
        const { limit = 20, offset = 0 } = options

        return await db
            .select()
            .from(schema.media)
            .where(eq(schema.media.source, source as 'youtube' | 'tiktok'))
            .orderBy(desc(schema.media.createdAt))
            .limit(limit)
            .offset(offset) as unknown as MediaItem[]
    }

	/**
	 * 获取最近的媒体
	 */
	async findRecent(days: number = 7, limit: number = 10): Promise<MediaItem[]> {
		const cutoffDate = new Date()
		cutoffDate.setDate(cutoffDate.getDate() - days)

		return await db
			.select()
			.from(schema.media)
			.where(sql`${schema.media.createdAt} >= ${cutoffDate}`)
			.orderBy(desc(schema.media.createdAt))
			.limit(limit) as unknown as MediaItem[]
	}

	/**
	 * 获取媒体统计信息
	 */
	async getStats(): Promise<{
		totalCount: number
		sourceCounts: Record<string, number>
		avgDuration?: number
		totalDuration?: number
	}> {
		// 获取总数和来源统计
		const [countResult, sourceResult] = await Promise.all([
			db.select({ count: sql<number>`count(*)` }).from(schema.media),
			db
				.select({
					source: schema.media.source,
					count: sql<number>`count(*)`
				})
				.from(schema.media)
				.groupBy(schema.media.source)
		])

		const totalCount = countResult[0]?.count || 0
		const sourceCounts: Record<string, number> = {}

		sourceResult.forEach(({ source, count }) => {
			sourceCounts[source || 'unknown'] = count
		})

		// 获取时长统计（如果有 duration 字段）
		let totalDuration = 0
		let durationCount = 0

		if ('duration' in schema.media) {
			const durationResult = await db
				.select({
					totalDuration: sql<number>`sum(${schema.media.duration})`,
					count: sql<number>`count(${schema.media.duration})`
				})
				.from(schema.media)
				.where(sql`${schema.media.duration} IS NOT NULL`)

			if (durationResult[0]) {
				totalDuration = durationResult[0].totalDuration || 0
				durationCount = durationResult[0].count || 0
			}
		}

		return {
			totalCount,
			sourceCounts,
			avgDuration: durationCount > 0 ? totalDuration / durationCount : undefined,
			totalDuration: totalDuration > 0 ? totalDuration : undefined
		}
	}
}

// 单例实例
export const mediaRepository = new MediaRepository()
