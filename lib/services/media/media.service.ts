import fs from 'node:fs/promises'
import path from 'node:path'
import { desc, eq } from 'drizzle-orm'
import type { MediaItem } from '~/lib/types/media.types'
import { db, schema } from '~/lib/db'
import { fileExists as fileExists } from '~/lib/utils/file'

export class MediaService {
	/**
	 * 获取媒体列表（分页）
	 */
	async getMediaList(options: {
		page?: number
		limit?: number
		source?: string
		sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'viewCount'
		sortOrder?: 'asc' | 'desc'
	}): Promise<{
		items: MediaItem[]
		total: number
		page: number
		limit: number
		totalPages: number
	}> {
		const {
			page = 1,
			limit = 20,
			source,
			sortBy = 'createdAt',
			sortOrder = 'desc'
		} = options

		const offset = (page - 1) * limit

		// 构建查询条件
		const whereConditions = []
		if (source) {
			whereConditions.push(eq(schema.media.source, source as any))
		}

		// 构建排序条件
		let orderBy
		switch (sortBy) {
			case 'title':
				orderBy = sortOrder === 'asc' ? schema.media.title : desc(schema.media.title)
				break
			case 'viewCount':
				orderBy = sortOrder === 'asc' ? schema.media.viewCount : desc(schema.media.viewCount)
				break
			// updatedAt field not available in schema
			case 'title':
			case 'createdAt':
			default:
				orderBy = sortOrder === 'asc' ? schema.media.createdAt : desc(schema.media.createdAt)
				break
		}

		try {
			// 获取总数
			const totalResult = await db
				.select({ count: schema.media.id })
				.from(schema.media)
				.where(whereConditions.length > 0 ? whereConditions[0] : undefined)

			const total = totalResult.length

			// 获取分页数据
			const items = await db
				.select()
				.from(schema.media)
				.where(whereConditions.length > 0 ? whereConditions[0] : undefined)
				.orderBy(orderBy)
				.limit(limit)
				.offset(offset)

			const totalPages = Math.ceil(total / limit)

			return {
				items: items as unknown as MediaItem[],
				total,
				page,
				limit,
				totalPages
			}
		} catch (error) {
			console.error('Failed to get media list:', error)
			throw new Error('Failed to retrieve media list')
		}
	}

	/**
	 * 根据 ID 获取媒体详情
	 */
	async getMediaById(id: string): Promise<MediaItem | null> {
		try {
			const media = await db.query.media.findFirst({
				where: eq(schema.media.id, id)
			})

			return media ? media as unknown as MediaItem : null
		} catch (error) {
			console.error(`Failed to get media by ID ${id}:`, error)
			return null
		}
	}

	/**
	 * 根据 URL 获取媒体详情
	 */
	async getMediaByUrl(url: string): Promise<MediaItem | null> {
		try {
			const media = await db.query.media.findFirst({
				where: eq(schema.media.url, url)
			})

			return media ? media as unknown as MediaItem : null
		} catch (error) {
			console.error(`Failed to get media by URL ${url}:`, error)
			return null
		}
	}

	/**
	 * 更新媒体信息
	 */
	async updateMedia(id: string, updates: Partial<MediaItem>): Promise<boolean> {
		try {
			await db
				.update(schema.media)
				.set(updates as any)
				.where(eq(schema.media.id, id))

			return true
		} catch (error) {
			console.error(`Failed to update media ${id}:`, error)
			return false
		}
	}

	/**
	 * 删除媒体记录
	 */
	async deleteMedia(id: string, deleteFiles: boolean = false): Promise<boolean> {
		try {
			// 获取媒体信息以获取文件路径
			const media = await this.getMediaById(id)
			if (!media) {
				return false
			}

			// 删除数据库记录
			await db.delete(schema.media).where(eq(schema.media.id, id))

			// 可选：删除文件
			if (deleteFiles && media.filePath && media.audioFilePath) {
				await this.deleteMediaFiles(media.filePath, media.audioFilePath)
			}

			return true
		} catch (error) {
			console.error(`Failed to delete media ${id}:`, error)
			return false
		}
	}

	/**
	 * 搜索媒体
	 */
	async searchMedia(query: string, options: {
		page?: number
		limit?: number
	} = {}): Promise<{
		items: MediaItem[]
		total: number
		page: number
		limit: number
		totalPages: number
	}> {
		const { page = 1, limit = 20 } = options
		const offset = (page - 1) * limit

		try {
			// 简单的搜索实现 - 可以根据需要优化
			const allMedia = await db
				.select()
				.from(schema.media)
				.orderBy(desc(schema.media.createdAt))

			// 过滤搜索结果
			const searchResults = allMedia.filter(media =>
				media.title?.toLowerCase().includes(query.toLowerCase()) ||
				media.author?.toLowerCase().includes(query.toLowerCase())
			)

			const total = searchResults.length
			const items = searchResults.slice(offset, offset + limit)
			const totalPages = Math.ceil(total / limit)

			return {
				items: items as unknown as MediaItem[],
				total,
				page,
				limit,
				totalPages
			}
		} catch (error) {
			console.error('Failed to search media:', error)
			throw new Error('Failed to search media')
		}
	}

	/**
	 * 验证媒体文件是否存在
	 */
	async validateMediaFiles(media: MediaItem): Promise<{
		videoExists: boolean
		audioExists: boolean
	}> {
		const videoExists = media.filePath ? await fileExists(media.filePath) : false
		const audioExists = media.audioFilePath ? await fileExists(media.audioFilePath) : false

		return { videoExists, audioExists }
	}

	/**
	 * 获取媒体统计信息
	 */
	async getMediaStats(): Promise<{
		totalCount: number
		totalSize: number
		sourceCounts: Record<string, number>
		recentCount: number // 最近7天添加的数量
	}> {
		try {
			const allMedia = await db.select().from(schema.media)

			const totalCount = allMedia.length
			let totalSize = 0
			const sourceCounts: Record<string, number> = {}
			let recentCount = 0

			const sevenDaysAgo = new Date()
			sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

			for (const media of allMedia) {
				// 统计来源
				const source = media.source || 'unknown'
				sourceCounts[source] = (sourceCounts[source] || 0) + 1

				// 统计最近添加的
				if (media.createdAt && new Date(media.createdAt) > sevenDaysAgo) {
					recentCount++
				}

				// 计算文件大小（如果可用）
				if (media.filePath) {
					try {
						const stats = await fs.stat(media.filePath)
						totalSize += stats.size
					} catch {
						// 文件不存在，跳过
					}
				}
			}

			return {
				totalCount,
				totalSize,
				sourceCounts,
				recentCount
			}
		} catch (error) {
			console.error('Failed to get media stats:', error)
			throw new Error('Failed to retrieve media statistics')
		}
	}

	private async deleteMediaFiles(videoPath: string, audioPath: string): Promise<void> {
		try {
			if (await fileExists(videoPath)) {
				await fs.unlink(videoPath)
			}
			if (await fileExists(audioPath)) {
				await fs.unlink(audioPath)
			}
		} catch (error) {
			console.error('Failed to delete media files:', error)
		}
	}
}

// 单例实例
export const mediaService = new MediaService()