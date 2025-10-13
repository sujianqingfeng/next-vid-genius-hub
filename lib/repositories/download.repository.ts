import { eq } from 'drizzle-orm'
import { db, schema } from '~/lib/db'

export class DownloadRepository {
	/**
	 * 检查媒体是否已存在
	 */
	async existsByUrl(url: string): Promise<boolean> {
		const result = await db.query.media.findFirst({
			where: eq(schema.media.url, url)
		})
		return !!result
	}

	/**
	 * 获取下载记录
	 */
	async findByUrl(url: string) {
		return await db.query.media.findFirst({
			where: eq(schema.media.url, url)
		})
	}

	/**
	 * 更新下载状态
	 */
    async updateDownloadStatus(id: string, status: {
        filePath?: string
        audioFilePath?: string
        thumbnailPath?: string
        quality?: string
        status?: string
		errorMessage?: string
		downloadBackend?: 'local' | 'cloud'
		downloadStatus?: string
		downloadJobId?: string
		remoteVideoKey?: string
		remoteAudioKey?: string
		remoteMetadataKey?: string
		rawMetadataPath?: string | null
		rawMetadataDownloadedAt?: Date | null
		downloadError?: string | null
		downloadQueuedAt?: Date | null
		downloadCompletedAt?: Date | null
    }): Promise<void> {
        // Type cast to handle quality field constraint without using 'any'
        const updateData: Record<string, unknown> = { ...status }
        if (status.quality && !['720p', '1080p'].includes(status.quality)) {
            updateData.quality = '720p' // Default fallback
        }

        await db
            .update(schema.media)
            .set(updateData as Partial<typeof schema.media.$inferInsert>)
            .where(eq(schema.media.id, id))
    }

	/**
	 * 创建或更新媒体记录
	 */
    async upsert(data: {
        id: string
        url: string
        source: string
		title?: string
		author?: string
		thumbnail?: string
		duration?: number
		viewCount?: number
		likeCount?: number
		filePath?: string
		audioFilePath?: string
		thumbnailPath?: string
		quality?: string
		downloadBackend?: 'local' | 'cloud'
		downloadStatus?: string
		downloadJobId?: string
		remoteVideoKey?: string
		remoteAudioKey?: string
		remoteMetadataKey?: string
		rawMetadataPath?: string | null
		rawMetadataDownloadedAt?: Date | null
		downloadError?: string | null
		downloadQueuedAt?: Date | null
		downloadCompletedAt?: Date | null
    }): Promise<void> {
        // Ensure required fields have proper types
        const insertData: Record<string, unknown> = {
            ...data,
            title: data.title || 'Unknown Title',
            source: data.source as 'youtube' | 'tiktok',
            quality: (data.quality && ['720p', '1080p'].includes(data.quality)) ? data.quality : '720p',
            downloadBackend: data.downloadBackend ?? 'local',
        }

        await db
            .insert(schema.media)
            .values(insertData as unknown as typeof schema.media.$inferInsert)
            .onConflictDoUpdate({
                target: schema.media.url,
                set: insertData as unknown as Partial<typeof schema.media.$inferInsert>
            })
    }

	/**
	 * 获取下载统计
	 */
	async getDownloadStats(): Promise<{
		totalDownloads: number
		successfulDownloads: number
		failedDownloads: number
		totalSize: number
		averageDownloadTime?: number
	}> {
		// 这里可以实现更复杂的统计逻辑
		// 目前返回基本的统计信息

		const { sql } = await import('drizzle-orm')

		const [totalResult, successResult] = await Promise.all([
			db.select({ count: sql<number>`count(*)` }).from(schema.media),
			db.select({ count: sql<number>`count(*)` }).from(schema.media).where(
				sql`${schema.media.filePath} IS NOT NULL`
			)
		])

		const totalDownloads = totalResult[0]?.count || 0
		const successfulDownloads = successResult[0]?.count || 0
		const failedDownloads = totalDownloads - successfulDownloads

		return {
			totalDownloads,
			successfulDownloads,
			failedDownloads,
			totalSize: 0, // 可以根据需要计算实际文件大小
			averageDownloadTime: undefined
		}
	}
}

// 单例实例
export const downloadRepository = new DownloadRepository()
