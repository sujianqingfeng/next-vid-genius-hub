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
import type { BasicVideoInfo } from '~/lib/media/types'
import { OPERATIONS_DIR, PROXY_URL } from '~/lib/config/app.config'
import { db, schema, createMediaUpdateData } from '~/lib/db'
import { extractAudio } from '~/lib/media'
import { runDownloadPipeline } from '@app/media-core'
import { downloadVideo as coreDownloadVideo, extractAudio as coreExtractAudio } from '@app/media-node'
import { ProviderFactory } from '~/lib/providers/provider-factory'
import type { VideoProviderContext } from '~/lib/types/provider.types'
import { fileExists as fileExists } from '~/lib/utils/file'
import { downloadVideo } from '~/lib/providers/youtube/downloader'
import { readMetadataSummary, summariseMetadata } from '~/lib/media/metadata'

const FORWARD_PROXY_PROTOCOLS = new Set(['http', 'https', 'socks4', 'socks5'])

export class DownloadService implements IDownloadService {
	private readonly operationDir: string = OPERATIONS_DIR
	private readonly proxyUrl?: string = PROXY_URL

	// Optional artifact store for syncing/copying uploads in local mode
	private artifactStore?: {
		uploadVideo?: (videoPath: string, context: DownloadContext) => Promise<{ key?: string } | void>
		uploadAudio?: (audioPath: string, context: DownloadContext) => Promise<{ key?: string } | void>
		uploadMetadata?: (metadata: unknown, context: DownloadContext) => Promise<{ key?: string } | void>
	}

	withArtifactStore(store: DownloadService['artifactStore']): this {
		this.artifactStore = store || undefined
		return this
	}

	async download(request: DownloadRequest): Promise<DownloadResult> {
		const { url, quality, proxyId } = request
        let downloadProgress: DownloadProgress = { stage: 'checking', progress: 0 }

		try {
			// 1) 代理与记录
			const proxyUrl = await this.getProxyUrl(proxyId)
			const downloadRecord = await db.query.media.findFirst({ where: eq(schema.media.url, url) })
			const id = downloadRecord?.id ?? createId()
			const _context = this.createDownloadContext(id, downloadRecord, proxyUrl)
			await fs.mkdir(_context.operationDir, { recursive: true })

			// 2) 现有文件检查
			downloadProgress = { stage: 'checking', progress: 10 }
			let [videoExists, audioExists, metadataExists] = await Promise.all([
				fileExists(_context.videoPath),
				fileExists(_context.audioPath),
				fileExists(_context.metadataPath),
			])

			// 3) 使用共享流水线（按需跳过已存在文件）
			const provider = ProviderFactory.resolveProvider(url)
            // rawMetadata is not read anywhere; drop local accumulation to avoid unused warnings

			let remoteVideoKey: string | null = null
			let remoteAudioKey: string | null = null
			let remoteMetadataKey: string | null = null

			const pipelineRes = await runDownloadPipeline(
				{ url, quality },
				{
					ensureDir: async (dir) => {
						await fs.mkdir(dir, { recursive: true })
					},
					resolvePaths: async () => ({
						videoPath: _context.videoPath,
						audioPath: _context.audioPath,
						metadataPath: _context.metadataPath,
					}),
					downloader: async (u, q, out) => {
                        if (videoExists) return { rawMetadata: undefined }
                        const res = await coreDownloadVideo(u, q, out, { proxy: proxyUrl, captureJson: true })
                        return res
					},
					audioExtractor: async (v, a) => {
						if (audioExists) return
						await coreExtractAudio(v, a)
					},
					persistRawMetadata: async (data) => {
                        if (metadataExists) return
                        try {
                            await fs.writeFile(_context.metadataPath, JSON.stringify(data, null, 2), 'utf8')
                            metadataExists = true
                        } catch (e) {
                            console.error('Failed to persist raw metadata:', e)
                        }
					},
					artifactStore: this.artifactStore
						? {
							uploadMetadata: async (data) => {
								try {
									const res = await this.artifactStore!.uploadMetadata?.(data, _context)
									if (res && res.key) remoteMetadataKey = res.key
								} catch (err) {
									console.warn('Local artifactStore.uploadMetadata failed', err)
								}
							},
							uploadVideo: async (path) => {
								try {
									const res = await this.artifactStore!.uploadVideo?.(path, _context)
									if (res && res.key) remoteVideoKey = res.key
								} catch (err) {
									console.warn('Local artifactStore.uploadVideo failed', err)
								}
							},
							uploadAudio: async (path) => {
								try {
									const res = await this.artifactStore!.uploadAudio?.(path, _context)
									if (res && res.key) remoteAudioKey = res.key
								} catch (err) {
									console.warn('Local artifactStore.uploadAudio failed', err)
								}
							},
						}
					: undefined,
				},
				(e) => {
					downloadProgress = { stage: e.stage as DownloadProgress['stage'], progress: e.progress ?? 0 }
				},
			)

			// 更新最终存在性状态
			;[videoExists, audioExists, metadataExists] = await Promise.all([
				fileExists(_context.videoPath),
				fileExists(_context.audioPath),
				fileExists(_context.metadataPath),
			])

			// 4) 写库（与云端一致：提炼并写入元数据摘要）
			let metadataForDb: BasicVideoInfo | null | undefined = null
			try {
				const providerSource = this.getProviderSource(provider.id)
				if (pipelineRes && pipelineRes.rawMetadata !== undefined) {
					const summary = summariseMetadata(pipelineRes.rawMetadata as Record<string, unknown>)
					metadataForDb = {
						title: summary.title,
						author: summary.author,
						thumbnail: summary.thumbnail,
						viewCount: summary.viewCount,
						likeCount: summary.likeCount,
						source: providerSource !== 'unknown' ? (providerSource as 'youtube' | 'tiktok') : undefined,
						// raw is optional; omit to keep payload light
					}
				} else if (metadataExists) {
					const summary = await readMetadataSummary(_context.metadataPath)
					if (summary) {
						metadataForDb = {
							title: summary.title,
							author: summary.author,
							thumbnail: summary.thumbnail,
							viewCount: summary.viewCount,
							likeCount: summary.likeCount,
							source: providerSource !== 'unknown' ? (providerSource as 'youtube' | 'tiktok') : undefined,
						}
					}
				}
			} catch (e) {
				console.warn('Failed to summarize metadata for DB update (local)', e)
			}
			const metadataPathForDb = metadataExists ? _context.metadataPath : downloadRecord?.rawMetadataPath ?? null
			const metadataDownloadedAt = metadataExists
				? new Date()
				: downloadRecord?.rawMetadataDownloadedAt ?? null

            await this.updateDatabaseRecord(
                id,
                url,
                metadataForDb,
                downloadRecord,
                _context,
                quality,
                { metadataPath: metadataPathForDb ?? undefined, metadataDownloadedAt, remoteVideoKey, remoteAudioKey, remoteMetadataKey },
            )

            downloadProgress = { stage: 'completed', progress: 100 }
            // Mark as used to satisfy lint when not otherwise emitted
            void downloadProgress

			// 5) 返回结果（与云端一致：优先使用提炼到的标题）
			const title = metadataForDb?.title ?? downloadRecord?.title ?? 'video'
			const source = this.getProviderSource(provider.id)
			return { id, videoPath: _context.videoPath, audioPath: _context.audioPath, title, source }
        } catch (error) {
            downloadProgress = { stage: 'checking', progress: 0, error: error instanceof Error ? error.message : 'Unknown error' }
            throw error
        }
    }

    async checkExistingFiles(context: DownloadContext): Promise<{
        videoExists: boolean
        audioExists: boolean
        downloadRecord?: typeof schema.media.$inferSelect
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
            void context
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

    private createDownloadContext(id: string, downloadRecord?: typeof schema.media.$inferSelect | null, proxyUrl?: string): DownloadContext {
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
        downloadRecord: typeof schema.media.$inferSelect | null | undefined,
        context: DownloadContext,
        quality: '1080p' | '720p',
        metadataDetails?: {
			metadataPath?: string
			metadataDownloadedAt?: Date | null
			remoteVideoKey?: string | null
			remoteAudioKey?: string | null
			remoteMetadataKey?: string | null
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
            metadata: metadata ?? null,
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
			remoteVideoKey: metadataDetails?.remoteVideoKey ?? null,
			remoteAudioKey: metadataDetails?.remoteAudioKey ?? null,
			remoteMetadataKey: metadataDetails?.remoteMetadataKey ?? null,
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
                ...(data as Partial<typeof schema.media.$inferInsert>),
                ...(downloadMeta as Partial<typeof schema.media.$inferInsert>),
            })
            .onConflictDoUpdate({
                target: schema.media.url,
                set: {
                    ...(data as Partial<typeof schema.media.$inferInsert>),
                    ...(downloadMeta as Partial<typeof schema.media.$inferInsert>),
                },
            })
	}
}

// 单例实例
export const downloadService = new DownloadService()
