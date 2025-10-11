import fs from 'node:fs/promises'
import path from 'node:path'
import { createId } from '@paralleldrive/cuid2'
import { eq } from 'drizzle-orm'
import type {
	DownloadRequest,
	DownloadResult,
	DownloadContext,
	DownloadProgress,
	DownloadService as IDownloadService
} from '~/lib/types/download.types'
import type { BasicVideoInfo } from '~/lib/types/provider.types'
import { OPERATIONS_DIR, PROXY_URL } from '~/lib/config/app.config'
import { db, schema, createMediaUpdateData } from '~/lib/db'
import { extractAudio } from '~/lib/media'
import { ProviderFactory } from '~/lib/providers/provider-factory'
import type { VideoProviderContext } from '~/lib/types/provider.types'
import { fileExists as fileExists } from '~/lib/utils/file'
import { downloadVideo } from '~/lib/providers/youtube/downloader'

const FORWARD_PROXY_PROTOCOLS = new Set(['http', 'https', 'socks4', 'socks5'])

export class DownloadService implements IDownloadService {
	private readonly operationDir: string = OPERATIONS_DIR
	private readonly proxyUrl?: string = PROXY_URL

	async download(request: DownloadRequest): Promise<DownloadResult> {
		const { url, quality, proxyId } = request
		let downloadProgress: DownloadProgress = { stage: 'checking', progress: 0 }

		try {
			// 1. 获取代理配置
			const proxyUrl = await this.getProxyUrl(proxyId)

			// 2. 查找现有下载记录或准备新的下载
			const downloadRecord = await db.query.media.findFirst({
				where: eq(schema.media.url, url),
			})

			const id = downloadRecord?.id ?? createId()
			const _context = this.createDownloadContext(id, downloadRecord, proxyUrl)
			await fs.mkdir(_context.operationDir, { recursive: true })

			// 3. 检查文件存在性
			downloadProgress = { stage: 'checking', progress: 10 }
			const [videoExists, audioExists, metadataExists] = await Promise.all([
				fileExists(_context.videoPath),
				fileExists(_context.audioPath),
				fileExists(_context.metadataPath),
			])

			// 4. 获取平台提供者和元数据
			const provider = ProviderFactory.resolveProvider(url)
			const _providerContext: VideoProviderContext = {
				proxyUrl,
			}

			let metadata: BasicVideoInfo | null | undefined
			let metadataPersisted = metadataExists
			let metadataDownloadedAt: Date | null =
				downloadRecord?.rawMetadataDownloadedAt ?? (metadataExists ? new Date() : null)

			const ensureMetadata = async (stage: DownloadProgress['stage'], progress: number) => {
				if (metadataPersisted) return
				downloadProgress = { stage, progress }
				const latest = await this.fetchMetadata(url, _context)
				if (latest) metadata = latest
				if (await this.persistRawMetadata(latest, _context)) {
					metadataPersisted = true
					metadataDownloadedAt = new Date()
				}
			}

			// 如果缺少原始数据，优先抓取
			if (!metadataExists) {
				await ensureMetadata('processing_metadata', 20)
			}

			// 5. 下载视频（如果不存在）
			if (!videoExists) {
				if (!metadataPersisted) {
					await ensureMetadata('processing_metadata', 30)
				}
				downloadProgress = { stage: 'downloading', progress: 40 }
				await this.downloadVideo(url, quality, _context.videoPath)
			}

			// 6. 提取音频（如果不存在）
			if (!audioExists) {
				downloadProgress = { stage: 'extracting_audio', progress: 60 }
				await this.extractAudioFromVideo(_context.videoPath, _context.audioPath)
			}

			// 7. 确保我们有视频信息
			if (!metadata && (!downloadRecord || !metadataPersisted)) {
				downloadProgress = { stage: 'processing_metadata', progress: 80 }
				const latest = await this.fetchMetadata(url, _context)
				if (latest) metadata = latest
				if (await this.persistRawMetadata(latest, _context)) {
					metadataPersisted = true
					metadataDownloadedAt = new Date()
				}
			}

			const metadataPathForDb = metadataPersisted
				? _context.metadataPath
				: downloadRecord?.rawMetadataPath ?? null

			// 8. 更新数据库记录
			downloadProgress = { stage: 'processing_metadata', progress: 90 }
			await this.updateDatabaseRecord(
				id,
				url,
				metadata,
				downloadRecord,
				_context,
				quality,
				{
					metadataPath: metadataPathForDb ?? undefined,
					metadataDownloadedAt,
				},
			)

			downloadProgress = { stage: 'completed', progress: 100 }

			// 9. 返回结果
			const title = metadata?.title ?? downloadRecord?.title ?? 'video'
			const source = metadata?.source ?? this.getProviderSource(provider.id)

			return {
				id,
				videoPath: _context.videoPath,
				audioPath: _context.audioPath,
				title,
				source,
			}

		} catch (error) {
			downloadProgress = {
				stage: 'checking',
				progress: 0,
				error: error instanceof Error ? error.message : 'Unknown error'
			}
			throw error
		}
	}

	async checkExistingFiles(context: DownloadContext): Promise<{
		videoExists: boolean
		audioExists: boolean
		downloadRecord?: any
	}> {
		const videoExists = await fileExists(context.videoPath)
		const audioExists = await fileExists(context.audioPath)

		const downloadRecord = await db.query.media.findFirst({
			where: eq(schema.media.url, context.operationDir.split('/').pop() || ''),
		})

		return { videoExists, audioExists, downloadRecord }
	}

	async fetchMetadata(url: string, context: DownloadContext): Promise<BasicVideoInfo | null> {
		const provider = ProviderFactory.resolveProvider(url)
		const providerContext: VideoProviderContext = {
			proxyUrl: this.proxyUrl,
		}

		try {
			return await provider.fetchMetadata(url, providerContext)
		} catch (error) {
			console.error('Failed to fetch metadata:', error)
			return null
		}
	}

	async handleError(error: Error, context: DownloadContext): Promise<void> {
		console.error('Download error:', error)

		// 记录错误到日志系统
		// 这里可以集成更详细的错误处理逻辑

		// 可选：清理部分下载的文件
		try {
			await this.cleanup(context)
		} catch (cleanupError) {
			console.error('Cleanup failed:', cleanupError)
		}
	}

	async cleanup(context: DownloadContext): Promise<void> {
		// 清理临时文件和目录
		// 只在确实需要时才执行清理
		try {
			const files = await fs.readdir(context.operationDir)
			for (const file of files) {
				const filePath = path.join(context.operationDir, file)
				const stat = await fs.stat(filePath)
				if (stat.isFile() && !file.endsWith('.mp4') && !file.endsWith('.mp3')) {
					await fs.unlink(filePath)
				}
			}
		} catch (error) {
			console.error('Cleanup error:', error)
		}
	}

	private async getProxyUrl(proxyId?: string): Promise<string | undefined> {
		if (!proxyId || proxyId === 'none') {
			return this.proxyUrl
		}

		try {
			const proxy = await db.query.proxies.findFirst({
				where: eq(schema.proxies.id, proxyId),
				columns: {
					server: true,
					port: true,
					protocol: true,
					username: true,
					password: true,
				},
			})

			if (!proxy) {
				return this.proxyUrl
			}

			if (!FORWARD_PROXY_PROTOCOLS.has(proxy.protocol)) {
				console.warn(
					'DownloadService',
					`Proxy protocol "${proxy.protocol}" is not supported for direct forwarding; falling back to default proxy.`,
				)
				return this.proxyUrl
			}

			// Construct proxy URL
			let auth = ''
			if (proxy.username && proxy.password) {
				auth = `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
			}

			return `${proxy.protocol}://${auth}${proxy.server}:${proxy.port}`
		} catch (error) {
			console.error('Failed to get proxy configuration:', error)
			return this.proxyUrl
		}
	}

	private createDownloadContext(id: string, downloadRecord?: any, proxyUrl?: string): DownloadContext {
		const operationDir = path.join(this.operationDir, id)

		return {
			operationDir,
			videoPath: downloadRecord?.filePath ?? path.join(operationDir, `${id}.mp4`),
			audioPath: downloadRecord?.audioFilePath ?? path.join(operationDir, `${id}.mp3`),
			metadataPath: downloadRecord?.rawMetadataPath ?? path.join(operationDir, 'metadata.json'),
			proxyUrl,
		}
	}

	private async downloadVideo(url: string, quality: '1080p' | '720p', outputPath: string): Promise<void> {
		await downloadVideo(url, quality, outputPath)
	}

	private async extractAudioFromVideo(videoPath: string, audioPath: string): Promise<void> {
		await extractAudio(videoPath, audioPath)
	}

	private async persistRawMetadata(metadata: BasicVideoInfo | null | undefined, context: DownloadContext): Promise<boolean> {
		const payload = metadata?.raw ?? metadata
		if (!payload) {
			return false
		}

		try {
			await fs.mkdir(context.operationDir, { recursive: true })
			await fs.writeFile(context.metadataPath, JSON.stringify(payload, null, 2), 'utf8')
			return true
		} catch (error) {
			console.error('Failed to persist raw metadata:', error)
			return false
		}
	}

	private getProviderSource(providerId: string): 'youtube' | 'tiktok' | 'unknown' {
		switch (providerId) {
			case 'youtube':
				return 'youtube'
			case 'tiktok':
				return 'tiktok'
			default:
				return 'unknown'
		}
	}

	private async updateDatabaseRecord(
		id: string,
		url: string,
		metadata: BasicVideoInfo | null | undefined,
		downloadRecord: any,
		context: DownloadContext,
		quality: '1080p' | '720p',
		metadataDetails?: {
			metadataPath?: string
			metadataDownloadedAt?: Date | null
		},
	): Promise<void> {
		const source = metadata?.source ?? 'youtube'
		const resolvedMetadataPath =
			metadataDetails?.metadataPath ??
			downloadRecord?.rawMetadataPath ??
			(null as string | null)
		const resolvedMetadataDownloadedAt =
			metadataDetails?.metadataDownloadedAt ?? downloadRecord?.rawMetadataDownloadedAt ?? null

		const data = createMediaUpdateData({
			metadata: metadata as any,
			downloadRecord,
			videoPath: context.videoPath,
			audioPath: context.audioPath,
			quality,
			metadataPath: resolvedMetadataPath ?? undefined,
		})

		const now = new Date()
		const downloadMeta = {
			downloadBackend: 'local' as const,
			downloadStatus: 'completed' as const,
			downloadError: null as string | null,
			downloadQueuedAt: downloadRecord?.downloadQueuedAt ?? now,
			downloadCompletedAt: now,
			remoteVideoKey: null as string | null,
			remoteAudioKey: null as string | null,
			remoteMetadataKey: null as string | null,
			downloadJobId: null as string | null,
			rawMetadataPath: resolvedMetadataPath,
			rawMetadataDownloadedAt:
				resolvedMetadataDownloadedAt ??
				(resolvedMetadataPath ? now : null),
		}

		await db
			.insert(schema.media)
			.values({
				id,
				url,
				source: source as 'youtube' | 'tiktok',
				...data,
				...downloadMeta,
			} as any)
			.onConflictDoUpdate({
				target: schema.media.url,
				set: {
					...data,
					...downloadMeta,
				} as any,
			})
	}
}

// 单例实例
export const downloadService = new DownloadService()
