import { and, eq } from 'drizzle-orm'

import { getJobStatus, type JobManifest } from '~/lib/infra/cloudflare'
import { getDb, schema } from '~/lib/infra/db'
import { enqueueCloudTask } from '~/lib/features/job/enqueue'
import { TASK_KINDS } from '~/lib/features/job/task'
import { logger } from '~/lib/infra/logger'
import { calculateDownloadCost } from '~/lib/domain/points/pricing'
import { addPointsOnce, spendPointsOnce } from '~/lib/domain/points/service'
import { MEDIA_SOURCES } from '~/lib/domain/media/source'
import { ProviderFactory } from '~/lib/shared/providers/provider-factory'
import { resolveSuccessProxy } from '~/lib/infra/proxy/resolve-success-proxy'
import { toProxyJobPayload } from '~/lib/infra/proxy/utils'
import { createId } from '~/lib/shared/utils/id'

function toHttpProxyUrl(proxy: {
	protocol: string
	server: string
	port: number
	username?: string | null
	password?: string | null
}): string | null {
	if (proxy.protocol !== 'http' && proxy.protocol !== 'https') return null
	const auth =
		proxy.username && proxy.password
			? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
			: proxy.username
				? `${encodeURIComponent(proxy.username)}@`
				: ''
	return `${proxy.protocol}://${auth}${proxy.server}:${proxy.port}`
}

function parseHmsToSeconds(value: string): number | null {
	const raw = value.trim()
	if (!raw) return null
	if (!/^\d{1,2}(:\d{1,2}){1,2}$/.test(raw)) return null
	const parts = raw.split(':').map((p) => Number.parseInt(p, 10))
	if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null
	if (parts.length === 2) return parts[0] * 60 + parts[1]
	if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
	return null
}

function normalizeDurationSeconds(value: unknown): number {
	if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
		return value
	}
	if (typeof value === 'string') {
		const asInt = Number.parseInt(value, 10)
		if (Number.isFinite(asInt) && asInt > 0) return asInt
		const hms = parseHmsToSeconds(value)
		if (typeof hms === 'number' && Number.isFinite(hms) && hms > 0) return hms
	}
	return 0
}

async function resolveDurationSeconds(args: {
	url: string
	proxyUrl?: string | null
}): Promise<number> {
	try {
		const metadata = await ProviderFactory.fetchMetadata(
			args.url,
			args.proxyUrl ? { proxyUrl: args.proxyUrl } : {},
		)
		if (metadata.duration) return normalizeDurationSeconds(metadata.duration)

		const raw = metadata.raw as any
		const fromRaw =
			normalizeDurationSeconds(raw?.durationSeconds) ||
			normalizeDurationSeconds(raw?.duration_seconds) ||
			normalizeDurationSeconds(raw?.duration) ||
			normalizeDurationSeconds(raw?.lengthSeconds) ||
			normalizeDurationSeconds(raw?.length_seconds) ||
			0
		return fromRaw
	} catch {
		return 0
	}
}

export async function startCloudDownload(input: {
	userId: string
	url: string
	quality?: '1080p' | '720p'
	proxyId?: string | null
}): Promise<{ mediaId: string; jobId: string; taskId: string }> {
	const { url, userId } = input
	const quality = input.quality ?? '1080p'
	const proxyId = input.proxyId ?? null

	const provider = ProviderFactory.resolveProvider(url)
	const source =
		provider.id === MEDIA_SOURCES.TIKTOK
			? MEDIA_SOURCES.TIKTOK
			: MEDIA_SOURCES.YOUTUBE
	const now = new Date()

	const db = await getDb()
	const existing = await db.query.media.findFirst({
		where: and(eq(schema.media.url, url), eq(schema.media.userId, userId)),
	})

	let mediaId = existing?.id
	let insertedCandidateId: string | null = null
	if (!mediaId) {
		insertedCandidateId = createId()
		mediaId = insertedCandidateId
	}

	logger.info(
		'media',
		`[download.start] user=${userId} media=${mediaId} url=${url} source=${source} quality=${quality} proxyId=${proxyId ?? 'none'}`,
	)

	if (!existing) {
		await db
			.insert(schema.media)
			.values({
				id: mediaId!,
				userId,
				url,
				source: source as 'youtube' | 'tiktok',
				title: 'Pending download',
				quality,
				downloadBackend: 'cloud',
				downloadStatus: 'queued',
				downloadQueuedAt: now,
				rawMetadataPath: null,
				rawMetadataDownloadedAt: null,
				remoteMetadataKey: null,
			})
			.onConflictDoNothing()

		const ensured = await db.query.media.findFirst({
			where: and(eq(schema.media.url, url), eq(schema.media.userId, userId)),
		})
		if (!ensured) {
			throw new Error('Failed to create media record for download')
		}
		mediaId = ensured.id

		// If another request inserted the row first (unique by userId+url), ensure we
		// operate on the persisted id and apply the "retry" semantics.
		if (insertedCandidateId && ensured.id !== insertedCandidateId) {
			logger.warn(
				'media',
				`[download.start] media insert raced; using existing mediaId=${ensured.id} instead of candidate=${insertedCandidateId}`,
			)

			await db
				.update(schema.media)
				.set({
					downloadBackend: 'cloud',
					downloadStatus: 'queued',
					downloadError: null,
					downloadQueuedAt: now,
					downloadCompletedAt: null,
					// Keep any existing remote keys so the media stays streamable during retry.
					downloadJobId: null,
					filePath: ensured.filePath,
					audioFilePath: ensured.audioFilePath,
					rawMetadataPath: ensured.rawMetadataPath,
					rawMetadataDownloadedAt: ensured.rawMetadataDownloadedAt,
				})
				.where(eq(schema.media.id, ensured.id))
		}
	} else {
		// Keep existing remote keys during retry so /api/media/:id/source remains playable.
		await db
			.update(schema.media)
			.set({
				downloadBackend: 'cloud',
				downloadStatus: 'queued',
				downloadError: null,
				downloadQueuedAt: now,
				downloadCompletedAt: null,
				downloadJobId: null,
				filePath: existing.filePath,
				audioFilePath: existing.audioFilePath,
				rawMetadataPath: existing.rawMetadataPath,
				rawMetadataDownloadedAt: existing.rawMetadataDownloadedAt,
			})
			.where(eq(schema.media.id, existing.id))
	}

	const stableJobId = `job_${createId()}`

	try {
		const { proxyId: effectiveProxyId, proxyRecord } =
			await resolveSuccessProxy({
				db,
				requestedProxyId: proxyId ?? undefined,
			})
		const proxyPayload = toProxyJobPayload(proxyRecord)
		const proxyUrl = toHttpProxyUrl(proxyRecord)

		const baseCost = await calculateDownloadCost({ durationSeconds: 0, db })
		let durationSeconds = 0

		// If pricing is duration-based, fetch a best-effort duration before starting the job.
		if (baseCost.rule.pricePerUnit > 0) {
			durationSeconds = await resolveDurationSeconds({ url, proxyUrl })
			if (durationSeconds <= 0) throw new Error('DOWNLOAD_DURATION_UNKNOWN')
		}

		const cost = await calculateDownloadCost({ durationSeconds, db })
		if (durationSeconds <= 0 && cost.rule.pricePerUnit > 0) {
			throw new Error('DOWNLOAD_DURATION_UNKNOWN')
		}

		if (cost.points > 0) {
			await spendPointsOnce({
				userId,
				amount: cost.points,
				type: 'download_usage',
				refType: 'download',
				refId: stableJobId,
				remark:
					durationSeconds > 0
						? `download dur=${durationSeconds.toFixed(1)}s`
						: 'download',
				metadata: {
					purpose: TASK_KINDS.DOWNLOAD,
					resourceType: 'download',
					url,
					quality,
					durationSeconds: durationSeconds > 0 ? durationSeconds : null,
					pricingRuleId: cost.rule.id,
				},
			})
		}

		// Set the expected job id before starting the orchestrator job so callbacks
		// won't be treated as stale even if the request terminates early.
		await db
			.update(schema.media)
			.set({ downloadJobId: stableJobId })
			.where(eq(schema.media.id, mediaId!))

		const { taskId, jobId: startedJobId } = await enqueueCloudTask({
			db,
			userId,
			kind: TASK_KINDS.DOWNLOAD,
			engine: 'media-downloader',
			targetType: 'media',
			targetId: mediaId,
			mediaId,
			jobId: stableJobId,
			purpose: TASK_KINDS.DOWNLOAD,
			title: existing?.title || 'Pending download',
			payload: { url, quality, source, proxyId: effectiveProxyId ?? null },
			options: {
				url,
				quality,
				source,
				proxy: proxyPayload,
			},
			buildManifest: ({ jobId }): JobManifest => {
				return {
					jobId,
					mediaId,
					purpose: TASK_KINDS.DOWNLOAD,
					engine: 'media-downloader',
					createdAt: Date.now(),
					inputs: {},
					optionsSnapshot: {
						url,
						quality,
						source,
						proxyId: effectiveProxyId ?? null,
					},
				}
			},
		})

		if (startedJobId !== stableJobId) {
			throw new Error(
				`JOB_ID_MISMATCH expected=${stableJobId} got=${startedJobId}`,
			)
		}

		logger.info(
			'media',
			`[download.job] queued media=${mediaId} job=${stableJobId} user=${userId} source=${source} quality=${quality} requestedProxyId=${proxyId ?? 'none'} proxyId=${effectiveProxyId ?? 'none'}`,
		)

		return { mediaId: mediaId!, jobId: stableJobId, taskId }
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Failed to start cloud download'
		logger.error(
			'media',
			`[download.error] media=${mediaId} user=${userId} url=${url} source=${source} quality=${quality} error=${message}`,
		)
		await db
			.update(schema.media)
			.set({
				downloadStatus: 'failed',
				downloadError: message,
				downloadJobId: null,
			})
			.where(eq(schema.media.id, mediaId!))

		// If we charged points but never managed to start the job, refund.
		// (Keep this last so we don't hide the original error if refund fails.)
		try {
			const chargedTx = await db.query.pointTransactions.findFirst({
				where: and(
					eq(schema.pointTransactions.userId, userId),
					eq(schema.pointTransactions.type, 'download_usage'),
					eq(schema.pointTransactions.refId, stableJobId),
				),
				columns: { delta: true },
			})
			const amount = typeof chargedTx?.delta === 'number' ? -chargedTx.delta : 0
			if (amount > 0) {
				await addPointsOnce({
					userId,
					amount,
					type: 'refund',
					refType: 'download',
					refId: stableJobId,
					remark: `refund download start failed job=${stableJobId}`,
					metadata: {
						purpose: TASK_KINDS.DOWNLOAD,
						originalType: 'download_usage',
						reason: 'start_failed',
					},
				})
			}
		} catch (refundError) {
			logger.warn(
				'media',
				`[download.refund] failed job=${stableJobId} media=${mediaId} error=${
					refundError instanceof Error ? refundError.message : String(refundError)
				}`,
			)
		}

		throw error
	}
}

export async function getCloudDownloadStatus(input: { jobId: string }) {
	const status = await getJobStatus(input.jobId)
	logger.debug(
		'media',
		`[download.status] job=${input.jobId} status=${status.status} progress=${typeof status.progress === 'number' ? Math.round(status.progress * 100) : 'n/a'}`,
	)
	return status
}

