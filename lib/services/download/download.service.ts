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
import type { BasicVideoInfo as MediaBasicVideoInfo } from '~/lib/media/types'
import type { BasicVideoInfo as ProviderBasicVideoInfo } from '~/lib/types/provider.types'
import { OPERATIONS_DIR, PROXY_URL } from '~/lib/config/app.config'
import { db, schema } from '~/lib/db'
import { createMediaUpdateData } from '~/lib/db/media-utils'
import { runDownloadPipeline, summariseMetadata, readMetadataSummary, isForwardProxyProtocolSupported, buildForwardProxyUrl } from '@app/media-core'
import { downloadVideo as coreDownloadVideo, extractAudio as coreExtractAudio } from '@app/media-node'
import { ProviderFactory } from '~/lib/providers/provider-factory'
import { fileExists as fileExists } from '~/lib/utils/file/client-safe'
import { logger } from '~/lib/logger'

// use helpers from @app/media-core/proxy

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
                            logger.error('media', `Failed to persist raw metadata: ${e instanceof Error ? e.message : String(e)}`)
                        }
					},
					artifactStore: this.artifactStore
						? {
							uploadMetadata: async (data) => {
								try {
									const res = await this.artifactStore!.uploadMetadata?.(data, _context)
									if (res && res.key) remoteMetadataKey = res.key
                            } catch (err) {
                                logger.warn('media', `Local artifactStore.uploadMetadata failed: ${err instanceof Error ? err.message : String(err)}`)
                            }
							},
							uploadVideo: async (path) => {
								try {
									const res = await this.artifactStore!.uploadVideo?.(path, _context)
									if (res && res.key) remoteVideoKey = res.key
                            } catch (err) {
                                logger.warn('media', `Local artifactStore.uploadVideo failed: ${err instanceof Error ? err.message : String(err)}`)
                            }
							},
							uploadAudio: async (path) => {
								try {
									const res = await this.artifactStore!.uploadAudio?.(path, _context)
									if (res && res.key) remoteAudioKey = res.key
                            } catch (err) {
                                logger.warn('media', `Local artifactStore.uploadAudio failed: ${err instanceof Error ? err.message : String(err)}`)
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
				let metadataForDb: MediaBasicVideoInfo | null | undefined = null
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
                logger.warn('media', `Failed to summarize metadata for DB update (local): ${e instanceof Error ? e.message : String(e)}`)
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

            if (!isForwardProxyProtocolSupported(proxy.protocol)) {
                logger.warn('media', `Proxy protocol "${proxy.protocol}" is not supported for direct forwarding; falling back to default proxy.`)
                return this.proxyUrl
            }

			// Construct proxy URL via shared helper
			return buildForwardProxyUrl({
				protocol: proxy.protocol as 'http' | 'https' | 'socks4' | 'socks5',
				server: proxy.server,
				port: proxy.port,
				username: proxy.username ?? undefined,
				password: proxy.password ?? undefined,
			})
        } catch (error) {
            logger.error('media', `Failed to get proxy configuration: ${error instanceof Error ? error.message : 'Unknown error'}`)
            return this.proxyUrl
        }
	}

    // IDownloadService helpers (implemented to satisfy interface and enable reuse)
    async checkExistingFiles(context: DownloadContext): Promise<{
        videoExists: boolean
        audioExists: boolean
        downloadRecord?: typeof schema.media.$inferSelect
    }> {
        const [videoExists, audioExists] = await Promise.all([
            fileExists(context.videoPath),
            fileExists(context.audioPath),
        ])
        // Best-effort: try to locate an existing DB record by file path
        let downloadRecord: typeof schema.media.$inferSelect | undefined
        try {
            const byVideo = await db.query.media.findFirst({ where: eq(schema.media.filePath, context.videoPath) })
            downloadRecord = byVideo ?? undefined
        } catch {}
        return { videoExists, audioExists, downloadRecord }
    }

    async fetchMetadata(url: string, context: DownloadContext): Promise<ProviderBasicVideoInfo | null> {
        try {
            const provider = ProviderFactory.resolveProvider(url)
            return await provider.fetchMetadata(url, { proxyUrl: context.proxyUrl })
        } catch (err) {
            logger.warn('media', `fetchMetadata failed: ${err instanceof Error ? err.message : String(err)}`)
            return null
        }
    }

    async handleError(error: Error): Promise<void> {
        logger.error('media', `Download error: ${error.message}`)
    }

    async cleanup(): Promise<void> {
        // No-op for now. Local artifacts are kept by design; containers handle their own cleanup.
        return
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
        metadata: MediaBasicVideoInfo | null | undefined,
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

        // Build insert/update payload explicitly to satisfy Drizzle's required fields
        const baseValues = {
            id,
            url,
            source: source as 'youtube' | 'tiktok',
            title: data.title,
            author: data.author,
            thumbnail: data.thumbnail,
            viewCount: data.viewCount,
            likeCount: data.likeCount,
            filePath: context.videoPath,
            audioFilePath: context.audioPath,
            quality,
            rawMetadataPath: resolvedMetadataPath ?? undefined,
        }

        await db
            .insert(schema.media)
            .values({
                ...baseValues,
                downloadBackend: downloadMeta.downloadBackend,
                downloadStatus: downloadMeta.downloadStatus,
                downloadError: downloadMeta.downloadError,
                downloadQueuedAt: downloadMeta.downloadQueuedAt,
                downloadCompletedAt: downloadMeta.downloadCompletedAt,
                remoteVideoKey: downloadMeta.remoteVideoKey,
                remoteAudioKey: downloadMeta.remoteAudioKey,
                remoteMetadataKey: downloadMeta.remoteMetadataKey,
                downloadJobId: downloadMeta.downloadJobId,
                rawMetadataPath: downloadMeta.rawMetadataPath,
                rawMetadataDownloadedAt: downloadMeta.rawMetadataDownloadedAt,
            })
            .onConflictDoUpdate({
                target: schema.media.url,
                set: {
                    ...baseValues,
                    downloadBackend: downloadMeta.downloadBackend,
                    downloadStatus: downloadMeta.downloadStatus,
                    downloadError: downloadMeta.downloadError,
                    downloadQueuedAt: downloadMeta.downloadQueuedAt,
                    downloadCompletedAt: downloadMeta.downloadCompletedAt,
                    remoteVideoKey: downloadMeta.remoteVideoKey,
                    remoteAudioKey: downloadMeta.remoteAudioKey,
                    remoteMetadataKey: downloadMeta.remoteMetadataKey,
                    downloadJobId: downloadMeta.downloadJobId,
                    rawMetadataPath: downloadMeta.rawMetadataPath,
                    rawMetadataDownloadedAt: downloadMeta.rawMetadataDownloadedAt,
                },
            })
	}
}

// 单例实例
export const downloadService = new DownloadService()
