import { eq } from 'drizzle-orm'
import { presignGetByKey } from '~/lib/infra/cloudflare'
import { getDb, schema } from '~/lib/infra/db'
import { logger } from '~/lib/infra/logger'
import { calculateDownloadCost } from '~/lib/domain/points/pricing'
import {
	addPointsOnce,
	getTransactionByTypeRef,
	spendPointsOnce,
} from '~/lib/domain/points/service'
import type { CallbackPayload } from '../types'

type Db = Awaited<ReturnType<typeof getDb>>
type MediaRecord = typeof schema.media.$inferSelect

type RemoteProbe =
	| { state: 'exists'; sizeBytes?: number }
	| { state: 'missing' }
	| { state: 'unknown' }

type MetadataSummary = {
	title?: string
	author?: string
	thumbnail?: string
	viewCount?: number
	likeCount?: number
	durationSeconds?: number
}

function summariseRawMetadata(raw: unknown): MetadataSummary {
	if (!raw || typeof raw !== 'object') return {}
	const obj = raw as Record<string, unknown>

	const asString = (value: unknown): string | undefined => {
		if (typeof value === 'string' && value.trim()) return value
		return undefined
	}

	const asNumber = (value: unknown): number | undefined => {
		if (typeof value === 'number' && Number.isFinite(value)) return value
		if (typeof value === 'string' && value.trim()) {
			const parsed = Number.parseInt(value, 10)
			if (!Number.isNaN(parsed)) return parsed
		}
		return undefined
	}

	let thumbnail = asString(obj.thumbnail)
	const thumbnails = obj.thumbnails
	if (!thumbnail && Array.isArray(thumbnails)) {
		for (let i = thumbnails.length - 1; i >= 0; i--) {
			const candidate = thumbnails[i]
			if (!candidate || typeof candidate !== 'object') continue
			const url = asString((candidate as Record<string, unknown>).url)
			if (url) {
				thumbnail = url
				break
			}
		}
	}

	const authorKeys = ['uploader', 'channel', 'artist', 'owner'] as const
	let author: string | undefined
	for (const key of authorKeys) {
		const v = asString(obj[key])
		if (v) {
			author = v
			break
		}
	}

	const durationSeconds =
		asNumber(obj.durationSeconds) ??
		asNumber(obj.duration) ??
		asNumber(obj.length_seconds)

	return {
		title: asString(obj.title),
		author,
		thumbnail,
		viewCount: asNumber(obj.view_count ?? obj.viewCount),
		likeCount: asNumber(obj.like_count ?? obj.likeCount),
		durationSeconds,
	}
}

export async function handleDownloadCallback(input: {
	db: Db
	media: MediaRecord
	payload: CallbackPayload & { engine: 'media-downloader' }
}): Promise<void> {
	const { db, media, payload } = input
	const where = eq(schema.media.id, payload.mediaId)

	async function refundPrefundedDownload(reason: string) {
		if (!media.userId) return
		try {
			const tx = await getTransactionByTypeRef({
				userId: media.userId,
				type: 'download_usage',
				refId: payload.jobId,
				db,
			})
			const amount = typeof tx?.delta === 'number' ? -tx.delta : 0
			if (amount > 0) {
				await addPointsOnce({
					userId: media.userId,
					amount,
					type: 'refund',
					refType: 'download',
					refId: payload.jobId,
					remark: `refund download ${reason} job=${payload.jobId}`,
					metadata: {
						purpose: 'download',
						originalType: 'download_usage',
						reason,
					},
				})
			}
		} catch (error) {
			logger.warn(
				'api',
				`[cf-callback.download] refund failed: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	logger.info(
		'api',
		`[cf-callback.download] start job=${payload.jobId} media=${payload.mediaId} status=${payload.status}`,
	)

	const isStale = Boolean(media.downloadJobId && media.downloadJobId !== payload.jobId)
	if (isStale) {
		logger.warn(
			'api',
			`[cf-callback.download] ignored stale callback job=${payload.jobId} (current=${media.downloadJobId}) media=${payload.mediaId} status=${payload.status}`,
		)

		if (
			payload.status === 'completed' ||
			payload.status === 'failed' ||
			payload.status === 'canceled'
		) {
			await refundPrefundedDownload('superseded')
		}
		return
	}

	async function remoteObjectExists({
		key,
		directUrl,
	}: {
		key?: string | null
		directUrl?: string | null
	}): Promise<RemoteProbe> {
		const sleep = (ms: number) =>
			new Promise<void>((resolve) => setTimeout(resolve, ms))

		const parseSizeBytes = (res: Response): number | undefined => {
			const contentRange = res.headers.get('content-range')
			if (contentRange) {
				const total = contentRange.split('/').pop()
				if (total) {
					const parsed = Number.parseInt(total, 10)
					if (Number.isFinite(parsed)) return parsed
				}
			}
			const contentLength = res.headers.get('content-length')
			if (contentLength) {
				const parsed = Number.parseInt(contentLength, 10)
				if (Number.isFinite(parsed)) return parsed
			}
			return undefined
		}

		const checkUrl = async (
			url: string,
			{ label, logOnFailure }: { label: string; logOnFailure: boolean },
		): Promise<RemoteProbe> => {
			const controller =
				typeof AbortController !== 'undefined' ? new AbortController() : null
			const timeout = setTimeout(() => controller?.abort(), 10_000)
			let res: Response | null = null
			try {
				res = await fetch(url, {
					method: 'GET',
					headers: { Range: 'bytes=0-0' },
					signal: controller?.signal,
					cache: 'no-store',
				})
				if (res.ok || res.status === 206) {
					const sizeBytes = parseSizeBytes(res)
					if (typeof sizeBytes === 'number' && Number.isFinite(sizeBytes)) {
						return { state: 'exists', sizeBytes }
					}
					return { state: 'exists' }
				}
				if (res.status === 404) return { state: 'missing' }
				if (logOnFailure) {
					logger.warn(
						'api',
						`[cf-callback] remoteObjectExists unexpected status ${res.status} for ${label}`,
					)
				}
				return { state: 'unknown' }
			} catch (error) {
				if (logOnFailure) {
					logger.warn(
						'api',
						`[cf-callback] remoteObjectExists failed for ${label}: ${
							error instanceof Error ? error.message : String(error)
						}`,
					)
				}
				return { state: 'unknown' }
			} finally {
				if (res && !res.bodyUsed) {
					try {
						await res.body?.cancel?.()
					} catch {}
				}
				clearTimeout(timeout)
			}
		}

		if (directUrl) {
			const directLabel = `url=${directUrl.split('?')[0]}`
			const res = await checkUrl(directUrl, {
				label: directLabel,
				logOnFailure: false,
			})
			if (res.state === 'exists') return res
		}

		if (!key) return { state: 'unknown' }

		try {
			const url = await presignGetByKey(key)
			const label = `key=${key}`
			let probe = await checkUrl(url, { label, logOnFailure: true })
			if (probe.state === 'missing') {
				// R2 can occasionally return transient 404s immediately after a successful PUT
				// (especially for large artifacts). Give it a little longer before failing the job.
				for (const delayMs of [250, 750, 1500, 3000, 5000, 8000]) {
					await sleep(delayMs)
					probe = await checkUrl(url, {
						label,
						logOnFailure: delayMs === 8000,
					})
					if (probe.state !== 'missing') break
				}
			}
			return probe
		} catch (error) {
			logger.warn(
				'api',
				`[cf-callback] remoteObjectExists failed for key=${key}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			)
			return { state: 'unknown' }
		}
	}

	const rawVideoKey = payload.outputs?.video?.key ?? null
	const resolvedVideoKey = rawVideoKey ?? null
	const audioProcessedKey =
		payload.outputs?.audioProcessed?.key ?? payload.outputs?.audio?.key ?? null
	const audioSourceKey = payload.outputs?.audioSource?.key ?? null
	const metadataKey = payload.outputs?.metadata?.key ?? null
	const videoUrl = payload.outputs?.video?.url ?? null
	const audioProcessedUrl =
		payload.outputs?.audioProcessed?.url ?? payload.outputs?.audio?.url ?? null
	const audioSourceUrl = payload.outputs?.audioSource?.url ?? null
	const metadataUrl = payload.outputs?.metadata?.url ?? null

	const hasMetadataOutput = Boolean(metadataUrl || metadataKey)
	const hasVideoKey = Boolean(resolvedVideoKey)
	const hasAudioKey = Boolean(audioProcessedKey)
	const isCommentsOnly = hasMetadataOutput && !hasVideoKey && !hasAudioKey

	if (payload.status !== 'completed') {
		await db
			.update(schema.media)
			.set({
				downloadBackend: 'cloud',
				downloadStatus: payload.status,
				downloadError: payload.error ?? 'Cloud download failed',
				downloadJobId: payload.jobId,
			})
			.where(where)
		logger.warn(
			'api',
			`[cf-callback.download] non-completed status=${payload.status} job=${payload.jobId} media=${payload.mediaId} error=${payload.error ?? 'n/a'}`,
		)

		// Deposit prepay: refund on terminal failures only (callbacks may emit non-terminal statuses).
		if (payload.status === 'failed' || payload.status === 'canceled') {
			await refundPrefundedDownload(payload.status)
		}

		return
	}

	if (isCommentsOnly) {
		// If this callback belongs to the active download job but only produced metadata,
		// treat it as a failure and refund points. Otherwise ignore to avoid mutating
		// download fields for non-download jobs routed here accidentally.
		if (media.downloadJobId === payload.jobId) {
			await db
				.update(schema.media)
				.set({
					downloadBackend: 'cloud',
					downloadStatus: 'failed',
					downloadError: 'Cloud download produced metadata only (missing video/audio)',
					downloadJobId: payload.jobId,
				})
				.where(where)
			await refundPrefundedDownload('metadata_only')
			logger.error(
				'api',
				`[cf-callback.download] completed but metadata-only output job=${payload.jobId} media=${payload.mediaId}`,
			)
			return
		}

		logger.info(
			'api',
			`[cf-callback.download] comments-only payload detected job=${payload.jobId} media=${payload.mediaId}`,
		)
		return
	}

	if (!videoUrl && !resolvedVideoKey) {
		await db
			.update(schema.media)
			.set({
				downloadBackend: 'cloud',
				downloadStatus: 'failed',
				downloadError: 'Missing video output from cloud download',
				downloadJobId: payload.jobId,
			})
			.where(where)
		await refundPrefundedDownload('missing_video_output')
		logger.error(
			'api',
			`[cf-callback.download] missing video output job=${payload.jobId} media=${payload.mediaId}`,
		)
		return
	}

	const shouldProbeVideoForSize =
		typeof payload.metadata?.videoBytes !== 'number'
	const shouldProbeAudioForSize =
		typeof payload.metadata?.audioBytes !== 'number'
	const shouldProbeMetadataForSummary =
		!payload.metadata?.title ||
		!payload.metadata?.author ||
		!payload.metadata?.thumbnail

	const [videoProbe, audioProcessedProbe, _audioSourceProbe, metadataProbe] =
		await Promise.all([
			shouldProbeVideoForSize
				? remoteObjectExists({ key: resolvedVideoKey, directUrl: videoUrl })
				: Promise.resolve<RemoteProbe>({ state: 'unknown' }),
			shouldProbeAudioForSize
				? remoteObjectExists({
						key: audioProcessedKey,
						directUrl: audioProcessedUrl,
					})
				: Promise.resolve<RemoteProbe>({ state: 'unknown' }),
			remoteObjectExists({ key: audioSourceKey, directUrl: audioSourceUrl }),
			shouldProbeMetadataForSummary
				? remoteObjectExists({ key: metadataKey, directUrl: metadataUrl })
				: Promise.resolve<RemoteProbe>({ state: 'unknown' }),
		])

	// If the job claims completion but the requested artifacts aren't actually readable,
	// fail fast so downstream renders don't get stuck on missing sources.
	if (hasVideoKey && videoProbe.state === 'missing') {
		await db
			.update(schema.media)
			.set({
				downloadBackend: 'cloud',
				downloadStatus: 'failed',
				downloadError:
					'Video artifact missing in cloud storage (upload failed). Please retry cloud download.',
				downloadJobId: payload.jobId,
				downloadCompletedAt: null,
				remoteVideoKey: null,
				remoteAudioProcessedKey:
					audioProcessedKey ?? media.remoteAudioProcessedKey ?? null,
				remoteAudioSourceKey:
					audioSourceKey ?? media.remoteAudioSourceKey ?? null,
				remoteMetadataKey: metadataKey ?? media.remoteMetadataKey ?? null,
			})
			.where(where)
		await refundPrefundedDownload('video_artifact_missing')
		logger.error(
			'api',
			`[cf-callback.download] completed but video missing job=${payload.jobId} media=${payload.mediaId} key=${resolvedVideoKey ?? 'null'}`,
		)
		return
	}

	if (hasAudioKey && audioProcessedProbe.state === 'missing') {
		await db
			.update(schema.media)
			.set({
				downloadBackend: 'cloud',
				downloadStatus: 'failed',
				downloadError:
					'Audio artifact missing in cloud storage (upload failed). Please retry cloud download.',
				downloadJobId: payload.jobId,
				downloadCompletedAt: null,
				remoteVideoKey: resolvedVideoKey ?? media.remoteVideoKey ?? null,
				remoteAudioProcessedKey: null,
				remoteAudioSourceKey:
					audioSourceKey ?? media.remoteAudioSourceKey ?? null,
				remoteMetadataKey: metadataKey ?? media.remoteMetadataKey ?? null,
			})
			.where(where)
		await refundPrefundedDownload('audio_artifact_missing')
		logger.error(
			'api',
			`[cf-callback.download] completed but audio missing job=${payload.jobId} media=${payload.mediaId} key=${audioProcessedKey ?? 'null'}`,
		)
		return
	}

	const metadataFromPayload = payload.metadata
	let durationSeconds =
		typeof payload.durationMs === 'number'
			? payload.durationMs / 1000
			: typeof metadataFromPayload?.durationSeconds === 'number'
				? metadataFromPayload.durationSeconds
				: typeof metadataFromPayload?.duration === 'number'
					? metadataFromPayload.duration
					: typeof metadataFromPayload?.lengthSeconds === 'number'
						? metadataFromPayload.lengthSeconds
						: 0

	let fallbackSummary: MetadataSummary | null = null
	const shouldHydrateFromRawMetadata =
		!metadataFromPayload?.title ||
		!metadataFromPayload?.author ||
		!metadataFromPayload?.thumbnail ||
		!durationSeconds

	if (shouldHydrateFromRawMetadata && (metadataUrl || metadataKey)) {
		try {
			const url =
				metadataUrl || (metadataKey ? await presignGetByKey(metadataKey) : null)
			if (url) {
				const controller =
					typeof AbortController !== 'undefined' ? new AbortController() : null
				const timeout = setTimeout(() => controller?.abort(), 10_000)
				try {
					const res = await fetch(url, {
						method: 'GET',
						signal: controller?.signal,
						cache: 'no-store',
					})
					try {
						if (res.ok) {
							const raw = (await res.json()) as unknown
							fallbackSummary = summariseRawMetadata(raw)
						}
					} finally {
						if (!res.bodyUsed) {
							try {
								await res.body?.cancel?.()
							} catch {}
						}
					}
				} finally {
					clearTimeout(timeout)
				}
			}
		} catch {
			// Best-effort only
		}
	}

	if (!durationSeconds && fallbackSummary?.durationSeconds) {
		durationSeconds = fallbackSummary.durationSeconds
	}

	const roundedDuration =
		Number.isFinite(durationSeconds) && durationSeconds > 0
			? Math.round(durationSeconds)
			: null

	const updates: Record<string, unknown> = {
		downloadBackend: 'cloud',
		downloadStatus: 'completed',
		downloadError: null,
		downloadJobId: payload.jobId,
		downloadCompletedAt: new Date(),
		remoteVideoKey: resolvedVideoKey ?? media.remoteVideoKey ?? null,
		remoteAudioProcessedKey:
			audioProcessedKey ?? media.remoteAudioProcessedKey ?? null,
		remoteAudioSourceKey: audioSourceKey ?? media.remoteAudioSourceKey ?? null,
		remoteMetadataKey: metadataKey ?? media.remoteMetadataKey ?? null,
	}

	if (roundedDuration) {
		updates.duration = roundedDuration
	}

	const title = metadataFromPayload?.title || fallbackSummary?.title
	const author = metadataFromPayload?.author || fallbackSummary?.author
	const thumbnail = metadataFromPayload?.thumbnail || fallbackSummary?.thumbnail
	const viewCount = metadataFromPayload?.viewCount ?? fallbackSummary?.viewCount
	const likeCount = metadataFromPayload?.likeCount ?? fallbackSummary?.likeCount

	if (title) updates.title = title
	if (author) updates.author = author
	if (thumbnail) updates.thumbnail = thumbnail
	if (viewCount !== undefined) updates.viewCount = viewCount
	if (likeCount !== undefined) updates.likeCount = likeCount
	if (metadataFromPayload?.quality)
		updates.quality = metadataFromPayload.quality
	if (metadataFromPayload?.source) updates.source = metadataFromPayload.source

	const videoBytes =
		typeof metadataFromPayload?.videoBytes === 'number' &&
		Number.isFinite(metadataFromPayload.videoBytes)
			? metadataFromPayload.videoBytes
			: videoProbe.state === 'exists'
				? videoProbe.sizeBytes
				: undefined
	const audioBytes =
		typeof metadataFromPayload?.audioBytes === 'number' &&
		Number.isFinite(metadataFromPayload.audioBytes)
			? metadataFromPayload.audioBytes
			: audioProcessedProbe.state === 'exists'
				? audioProcessedProbe.sizeBytes
				: undefined

	if (typeof videoBytes === 'number' && Number.isFinite(videoBytes)) {
		updates.downloadVideoBytes = videoBytes
	}
	if (typeof audioBytes === 'number' && Number.isFinite(audioBytes)) {
		updates.downloadAudioBytes = audioBytes
	}

	await db.update(schema.media).set(updates).where(where)

	logger.info(
		'api',
		`[cf-callback.download] completed job=${payload.jobId} media=${payload.mediaId} duration=${roundedDuration ?? 0}s hasVideo=${videoProbe.state === 'exists'} hasAudio=${audioProcessedProbe.state === 'exists'} hasMetadata=${metadataProbe.state === 'exists'}`,
	)

	if (media.userId) {
		try {
			const prefunded = await getTransactionByTypeRef({
				userId: media.userId,
				type: 'download_usage',
				refId: payload.jobId,
				db,
			})

			const prefundedPoints =
				typeof prefunded?.delta === 'number' ? Math.max(0, -prefunded.delta) : 0

			const finalCost = await calculateDownloadCost({
				durationSeconds:
					Number.isFinite(durationSeconds) && durationSeconds > 0
						? durationSeconds
						: 0,
				db,
			})

			const finalPoints = finalCost.points
			const deltaPoints = finalPoints - prefundedPoints
			const settleRefId = `${payload.jobId}:settle`

			if (deltaPoints > 0) {
				await spendPointsOnce({
					userId: media.userId,
					amount: deltaPoints,
					type: 'download_usage',
					refType: 'download',
					refId: settleRefId,
					remark: `download settle +${deltaPoints}`,
					metadata: {
						purpose: 'download',
						resourceType: 'download',
						phase: 'settle',
						pricingRuleId: finalCost.rule.id,
						durationSeconds:
							Number.isFinite(durationSeconds) && durationSeconds > 0
								? durationSeconds
								: null,
						prefundedPoints,
						finalPoints,
					},
					db,
				})
			} else if (deltaPoints < 0) {
				await addPointsOnce({
					userId: media.userId,
					amount: -deltaPoints,
					type: 'refund',
					refType: 'download',
					refId: settleRefId,
					remark: `refund download settle ${-deltaPoints}`,
					metadata: {
						purpose: 'download',
						originalType: 'download_usage',
						reason: 'settle_refund',
						pricingRuleId: finalCost.rule.id,
						durationSeconds:
							Number.isFinite(durationSeconds) && durationSeconds > 0
								? durationSeconds
								: null,
						prefundedPoints,
						finalPoints,
					},
					db,
				})
			}
		} catch (error) {
			logger.warn(
				'api',
				`[cf-callback.download] billing settle failed: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}
}
