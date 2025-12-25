import { verifyHmacSHA256 } from '@app/job-callbacks'
import { eq } from 'drizzle-orm'
import { presignGetByKey } from '~/lib/cloudflare'
import { JOB_CALLBACK_HMAC_SECRET } from '~/lib/config/env'
import { getDb, schema } from '~/lib/db'
import { TASK_KINDS } from '~/lib/job/task'
import { logger } from '~/lib/logger'
import {
	chargeAsrUsage,
	chargeDownloadUsage,
	InsufficientPointsError,
} from '~/lib/points/billing'
import { persistAsrResultFromBucket } from '~/lib/subtitle/server/asr-result'

type CallbackPayload = {
	jobId: string
	mediaId: string
	eventId?: string
	eventSeq?: number
	eventTs?: number
	status: 'completed' | 'failed' | 'canceled'
	engine?:
		| 'burner-ffmpeg'
		| 'renderer-remotion'
		| 'media-downloader'
		| 'asr-pipeline'
	purpose?: string
	outputUrl?: string
	outputKey?: string
	outputAudioKey?: string
	outputAudioSourceKey?: string
	outputAudioProcessedKey?: string
	outputMetadataKey?: string
	durationMs?: number
	attempts?: number
	error?: string
	outputs?: {
		video?: { url?: string; key?: string }
		audio?: { url?: string; key?: string }
		audioSource?: { url?: string; key?: string }
		audioProcessed?: { url?: string; key?: string }
		metadata?: { url?: string; key?: string }
		vtt?: { url?: string; key?: string }
		words?: { url?: string; key?: string }
	}
	metadata?: {
		title?: string
		author?: string
		thumbnail?: string
		viewCount?: number
		likeCount?: number
		durationSeconds?: number
		duration?: number
		lengthSeconds?: number
		source?: 'youtube' | 'tiktok'
		quality?: '720p' | '1080p'
		commentCount?: number
		model?: string
		videoBytes?: number
		audioBytes?: number
		audioSourceBytes?: number
		kind?: string
	}
}

type MediaRecord = typeof schema.media.$inferSelect

function normaliseEventSeq(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return Math.max(0, Math.trunc(value))
	}
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number.parseInt(value, 10)
		if (Number.isFinite(parsed)) return Math.max(0, parsed)
	}
	return null
}

function parseJsonish(value: unknown): unknown {
	if (!value) return null
	if (typeof value === 'object') return value
	if (typeof value === 'string') {
		try {
			return JSON.parse(value)
		} catch {
			return null
		}
	}
	return null
}

function getLastCallbackEventSeq(task: {
	jobStatusSnapshot?: unknown
}): number | null {
	const snapshot = parseJsonish(task.jobStatusSnapshot) as any
	const seq =
		typeof snapshot?.callback?.lastEventSeq === 'number'
			? snapshot.callback.lastEventSeq
			: typeof snapshot?.lastCallbackEventSeq === 'number'
				? snapshot.lastCallbackEventSeq
				: null
	if (typeof seq === 'number' && Number.isFinite(seq))
		return Math.max(0, Math.trunc(seq))
	return null
}

function mergeCallbackSnapshot(
	task: { jobStatusSnapshot?: unknown },
	input: { eventSeq: number; eventId?: string; eventTs?: number },
) {
	const snapshot = parseJsonish(task.jobStatusSnapshot)
	const base =
		snapshot && typeof snapshot === 'object'
			? (snapshot as Record<string, unknown>)
			: {}
	const existingCallback =
		base.callback && typeof base.callback === 'object'
			? (base.callback as Record<string, unknown>)
			: {}

	return {
		...base,
		callback: {
			...existingCallback,
			lastEventSeq: input.eventSeq,
			lastEventId: input.eventId ?? existingCallback.lastEventId ?? null,
			lastEventTs: input.eventTs ?? Date.now(),
		},
	}
}

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

async function resolveMetadataUrlFromPayload(
	payload: CallbackPayload,
): Promise<string | null> {
	const urlFromStatus = payload.outputs?.metadata?.url
	if (urlFromStatus) return urlFromStatus

	const keyFromStatus =
		payload.outputs?.metadata?.key ?? payload.outputMetadataKey ?? null
	if (!keyFromStatus) return null

	try {
		return await presignGetByKey(keyFromStatus)
	} catch {
		return null
	}
}

function parseCommentsMetadata(raw: unknown): schema.Comment[] {
	if (!raw || typeof raw !== 'object') return []
	const obj = raw as Record<string, unknown>
	const rawComments = Array.isArray(obj.comments) ? obj.comments : []

	const toNumber = (value: unknown): number => {
		if (typeof value === 'number' && Number.isFinite(value)) return value
		if (typeof value === 'string' && value.trim()) {
			const parsed = Number(value)
			if (Number.isFinite(parsed)) return parsed
		}
		return 0
	}

	return rawComments
		.map((c) =>
			c && typeof c === 'object' ? (c as Record<string, unknown>) : {},
		)
		.map((c): schema.Comment => {
			return {
				id: String(c.id ?? ''),
				author: String(c.author ?? ''),
				authorThumbnail:
					typeof c.authorThumbnail === 'string' ? c.authorThumbnail : undefined,
				content: String(c.content ?? ''),
				translatedContent:
					typeof c.translatedContent === 'string' ? c.translatedContent : '',
				likes: toNumber(c.likes),
				replyCount: toNumber(c.replyCount),
			}
		})
}

type ChannelSyncMetadata = {
	channel?: { title?: string; thumbnail?: string }
	videos: Array<Record<string, unknown>>
}

function parseChannelSyncMetadata(raw: unknown): ChannelSyncMetadata {
	if (!raw || typeof raw !== 'object') return { videos: [] }
	const obj = raw as Record<string, unknown>

	const channelRaw = obj.channel
	const channel =
		channelRaw && typeof channelRaw === 'object'
			? {
					title:
						typeof (channelRaw as any).title === 'string'
							? String((channelRaw as any).title)
							: undefined,
					thumbnail:
						typeof (channelRaw as any).thumbnail === 'string'
							? String((channelRaw as any).thumbnail)
							: undefined,
				}
			: undefined

	const videos = Array.isArray(obj.videos)
		? (obj.videos as Array<unknown>)
				.filter((v) => v && typeof v === 'object')
				.map((v) => v as Record<string, unknown>)
		: []

	return { channel, videos }
}

function toDateOrUndefined(value: unknown): Date | undefined {
	if (value == null) return undefined
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? undefined : value
	}
	if (typeof value === 'number') {
		const ms = value < 1e12 ? value * 1000 : value
		const d = new Date(ms)
		return Number.isNaN(d.getTime()) ? undefined : d
	}
	if (typeof value === 'string' && value.trim()) {
		const d = new Date(value)
		return Number.isNaN(d.getTime()) ? undefined : d
	}
	return undefined
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

async function handleCloudDownloadCallback(
	media: MediaRecord,
	payload: CallbackPayload & { engine: 'media-downloader' },
) {
	const db = await getDb()
	const where = eq(schema.media.id, payload.mediaId)

	logger.info(
		'api',
		`[cf-callback.download] start job=${payload.jobId} media=${payload.mediaId} status=${payload.status}`,
	)

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
	const fallbackVideoKey = payload.outputKey ?? null
	const resolvedVideoKey = rawVideoKey ?? fallbackVideoKey ?? null
	const audioProcessedKey =
		payload.outputs?.audioProcessed?.key ??
		payload.outputs?.audio?.key ??
		payload.outputAudioKey ??
		null
	const audioSourceKey =
		payload.outputs?.audioSource?.key ?? payload.outputAudioSourceKey ?? null
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
		return
	}

	if (isCommentsOnly) {
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
				remoteAudioKey: audioProcessedKey ?? media.remoteAudioKey ?? null,
				remoteAudioProcessedKey:
					audioProcessedKey ?? media.remoteAudioProcessedKey ?? null,
				remoteAudioSourceKey:
					audioSourceKey ?? media.remoteAudioSourceKey ?? null,
				remoteMetadataKey: metadataKey ?? media.remoteMetadataKey ?? null,
			})
			.where(where)
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
				remoteAudioKey: null,
				remoteAudioProcessedKey: null,
				remoteAudioSourceKey:
					audioSourceKey ?? media.remoteAudioSourceKey ?? null,
				remoteMetadataKey: metadataKey ?? media.remoteMetadataKey ?? null,
			})
			.where(where)
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
		remoteAudioKey: audioProcessedKey ?? media.remoteAudioKey ?? null,
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

	if (media.userId && durationSeconds > 0) {
		try {
			await chargeDownloadUsage({
				userId: media.userId,
				durationSeconds,
				refType: 'download',
				refId: payload.jobId,
				remark: `download dur=${durationSeconds.toFixed(1)}s`,
			})
		} catch (error) {
			if (error instanceof InsufficientPointsError) {
				logger.warn(
					'api',
					`[cf-callback] download charge skipped (insufficient points) media=${media.id}`,
				)
			} else {
				logger.warn(
					'api',
					`[cf-callback] download charge failed: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		}
	}
}

export async function handleCfCallbackRequest(
	request: Request,
): Promise<Response> {
	try {
		const signature = request.headers.get('x-signature') || ''
		const bodyText = await request.text()

		const secret = JOB_CALLBACK_HMAC_SECRET
		if (!secret) {
			logger.error(
				'api',
				'[cf-callback] JOB_CALLBACK_HMAC_SECRET is not configured',
			)
			return Response.json({ error: 'server misconfigured' }, { status: 500 })
		}
		if (!verifyHmacSHA256(secret, bodyText, signature)) {
			logger.error('api', '[cf-callback] invalid signature')
			return Response.json({ error: 'invalid signature' }, { status: 401 })
		}

		const payload = JSON.parse(bodyText) as CallbackPayload

		const eventSeq = normaliseEventSeq(payload.eventSeq)

		logger.info(
			'api',
			`[cf-callback] received job=${payload.jobId} media=${payload.mediaId} engine=${payload.engine ?? 'unknown'} purpose=${payload.purpose ?? 'n/a'} status=${payload.status} eventSeq=${eventSeq ?? 'n/a'}`,
		)

		const db = await getDb()

		// System-level proxy checks: update proxy status without touching media/tasks.
		if (payload.metadata?.kind === 'proxy-check') {
			const proxyId =
				typeof (payload.metadata as any)?.proxyId === 'string'
					? ((payload.metadata as any).proxyId as string)
					: undefined
			const responseTimeMs =
				typeof (payload.metadata as any)?.responseTimeMs === 'number'
					? ((payload.metadata as any).responseTimeMs as number)
					: undefined
			const okFlag =
				typeof (payload.metadata as any)?.ok === 'boolean'
					? ((payload.metadata as any).ok as boolean)
					: undefined
			const errorMessage =
				typeof (payload.metadata as any)?.error === 'string'
					? ((payload.metadata as any).error as string)
					: undefined

			if (!proxyId) {
				logger.warn(
					'api',
					`[cf-callback.proxy-check] missing proxyId job=${payload.jobId}`,
				)
				return Response.json(
					{ ok: false, error: 'missing proxyId' },
					{ status: 400 },
				)
			}

			const status =
				payload.status === 'completed' && okFlag !== false
					? 'success'
					: 'failed'

			await db
				.update(schema.proxies)
				.set({
					lastTestedAt: new Date(),
					testStatus: status,
					responseTime:
						typeof responseTimeMs === 'number' &&
						Number.isFinite(responseTimeMs)
							? Math.max(0, Math.trunc(responseTimeMs))
							: null,
				})
				.where(eq(schema.proxies.id, proxyId))

			logger.info(
				'api',
				`[cf-callback.proxy-check] updated proxy=${proxyId} status=${status} rttMs=${responseTimeMs ?? 'n/a'} job=${payload.jobId} err=${errorMessage ?? 'n/a'}`,
			)
			return Response.json({ ok: true })
		}

		const task = await db.query.tasks.findFirst({
			where: eq(schema.tasks.jobId, payload.jobId),
		})

		// Callbacks are retried by the orchestrator when eventSeq is present; dedupe by eventSeq.
		if (task && eventSeq != null) {
			const lastSeq = getLastCallbackEventSeq(task)
			if (typeof lastSeq === 'number' && lastSeq >= eventSeq) {
				return Response.json({ ok: true, deduped: true })
			}
		}

		try {
			if (task) {
				await db
					.update(schema.tasks)
					.set({
						status: payload.status,
						progress: payload.status === 'completed' ? 100 : task.progress,
						error: payload.error ?? null,
						finishedAt: new Date(),
						updatedAt: new Date(),
					})
					.where(eq(schema.tasks.id, task.id))
			}
		} catch (err) {
			logger.warn(
				'api',
				`[cf-callback] task sync skipped: ${err instanceof Error ? err.message : String(err)}`,
			)
		}

		const effectiveKind =
			typeof payload.purpose === 'string' && payload.purpose.trim()
				? payload.purpose.trim()
				: task?.kind

		// media-downloader is also used for non-download tasks (comments-only, metadata refresh, channel sync).
		// Those jobs should not mutate the media's download fields.
		if (payload.engine === 'media-downloader' && effectiveKind) {
			if (effectiveKind === TASK_KINDS.DOWNLOAD) {
				// handled below
			} else if (effectiveKind === TASK_KINDS.COMMENTS_DOWNLOAD) {
				if (payload.status === 'completed') {
					const metadataUrl = await resolveMetadataUrlFromPayload(payload)
					if (!metadataUrl) {
						throw new Error(
							`comments-download missing metadata output job=${payload.jobId}`,
						)
					}
					const r = await fetch(metadataUrl)
					if (!r.ok) throw new Error(`Fetch comments failed: ${r.status}`)
					const json = (await r.json()) as unknown
					const comments = parseCommentsMetadata(json)
					const targetMediaId = task?.targetId || payload.mediaId
					await db
						.update(schema.media)
						.set({
							comments,
							commentCount: comments.length,
							commentsDownloadedAt: new Date(),
						})
						.where(eq(schema.media.id, targetMediaId))
				}

				if (eventSeq != null) {
					try {
						const nextSnapshot = mergeCallbackSnapshot(task, {
							eventSeq,
							eventId: payload.eventId,
							eventTs: payload.eventTs,
						})
						await db
							.update(schema.tasks)
							.set({ jobStatusSnapshot: nextSnapshot, updatedAt: new Date() })
							.where(eq(schema.tasks.id, task.id))
					} catch {}
				}

				return Response.json({ ok: true })
			} else if (effectiveKind === TASK_KINDS.CHANNEL_SYNC) {
				if (!task?.targetId) {
					logger.warn(
						'api',
						`[cf-callback] channel-sync callback missing task targetId job=${payload.jobId}`,
					)
					return Response.json({ ok: true, ignored: true })
				}
				const where = eq(schema.channels.id, task.targetId)

				if (payload.status === 'completed') {
					const channel = await db.query.channels.findFirst({ where })

					const metadataUrl = await resolveMetadataUrlFromPayload(payload)
					if (!metadataUrl) {
						throw new Error(
							`channel-sync missing metadata output job=${payload.jobId}`,
						)
					}
					const r = await fetch(metadataUrl)
					if (!r.ok) throw new Error(`Fetch channel videos failed: ${r.status}`)
					const json = (await r.json()) as unknown
					const metadata = parseChannelSyncMetadata(json)
					const videos = metadata.videos

					for (const v of videos) {
						const vid: string = String(v.id ?? '')
						if (!vid) continue

						const title: string = String(v.title ?? '')
						const url: string =
							typeof v.url === 'string' && v.url.trim()
								? v.url
								: `https://www.youtube.com/watch?v=${vid}`

						const publishedRaw =
							v.publishedAt ?? v.published ?? v.date ?? v.publishedTimeText
						const publishedAt = toDateOrUndefined(publishedRaw)

						const thumb: string | undefined =
							typeof v.thumbnail === 'string'
								? v.thumbnail
								: Array.isArray(v.thumbnails) &&
									  typeof v.thumbnails[0]?.url === 'string'
									? String(v.thumbnails[0].url)
									: undefined

						const viewCount =
							typeof v.viewCount === 'number' ? v.viewCount : undefined
						const likeCount =
							typeof v.likeCount === 'number' ? v.likeCount : undefined

						await db
							.insert(schema.channelVideos)
							.values({
								channelId: task.targetId,
								videoId: vid,
								title,
								url,
								thumbnail: thumb ?? null,
								publishedAt: publishedAt ?? undefined,
								viewCount: viewCount ?? undefined,
								likeCount: likeCount ?? undefined,
								raw: v ? JSON.stringify(v) : undefined,
							})
							.onConflictDoNothing()
					}

					const updates: Record<string, unknown> = {
						lastSyncedAt: new Date(),
						lastSyncStatus: 'completed',
						updatedAt: new Date(),
					}
					const title =
						typeof metadata.channel?.title === 'string'
							? metadata.channel.title.trim()
							: ''
					if (title) updates.title = title
					const thumbnail =
						typeof metadata.channel?.thumbnail === 'string'
							? metadata.channel.thumbnail.trim()
							: ''
					if (thumbnail) updates.thumbnail = thumbnail
					// Preserve existing values when metadata is missing.
					if (!title && channel?.title) updates.title = channel.title
					if (!thumbnail && channel?.thumbnail)
						updates.thumbnail = channel.thumbnail

					await db.update(schema.channels).set(updates).where(where)
				} else if (
					payload.status === 'failed' ||
					payload.status === 'canceled'
				) {
					await db
						.update(schema.channels)
						.set({
							lastSyncStatus: 'failed',
							updatedAt: new Date(),
						})
						.where(where)
				}

				if (eventSeq != null) {
					try {
						const nextSnapshot = mergeCallbackSnapshot(task, {
							eventSeq,
							eventId: payload.eventId,
							eventTs: payload.eventTs,
						})
						await db
							.update(schema.tasks)
							.set({ jobStatusSnapshot: nextSnapshot, updatedAt: new Date() })
							.where(eq(schema.tasks.id, task.id))
					} catch {}
				}

				return Response.json({ ok: true })
			} else if (effectiveKind === TASK_KINDS.METADATA_REFRESH) {
				if (payload.status === 'completed') {
					const meta = (payload.metadata ?? {}) as Record<string, unknown>
					const updates: Record<string, unknown> = {}

					const title = typeof meta.title === 'string' ? meta.title.trim() : ''
					const author =
						typeof meta.author === 'string' ? meta.author.trim() : ''
					const thumbnail =
						typeof meta.thumbnail === 'string' ? meta.thumbnail.trim() : ''
					const viewCount =
						typeof meta.viewCount === 'number' ? meta.viewCount : undefined
					const likeCount =
						typeof meta.likeCount === 'number' ? meta.likeCount : undefined

					if (title) updates.title = title
					if (author) updates.author = author
					if (thumbnail) updates.thumbnail = thumbnail
					if (typeof viewCount === 'number') updates.viewCount = viewCount
					if (typeof likeCount === 'number') updates.likeCount = likeCount

					const metadataKey = payload.outputs?.metadata?.key
					if (typeof metadataKey === 'string' && metadataKey.trim()) {
						updates.remoteMetadataKey = metadataKey.trim()
						updates.rawMetadataDownloadedAt = new Date()
					}

					const targetMediaId = task?.targetId || payload.mediaId
					if (Object.keys(updates).length > 0) {
						await db
							.update(schema.media)
							.set(updates)
							.where(eq(schema.media.id, targetMediaId))
					}
				}

				if (eventSeq != null) {
					try {
						const nextSnapshot = mergeCallbackSnapshot(task, {
							eventSeq,
							eventId: payload.eventId,
							eventTs: payload.eventTs,
						})
						await db
							.update(schema.tasks)
							.set({ jobStatusSnapshot: nextSnapshot, updatedAt: new Date() })
							.where(eq(schema.tasks.id, task.id))
					} catch {}
				}

				return Response.json({ ok: true })
			} else {
				if (eventSeq != null) {
					try {
						const nextSnapshot = mergeCallbackSnapshot(task, {
							eventSeq,
							eventId: payload.eventId,
							eventTs: payload.eventTs,
						})
						await db
							.update(schema.tasks)
							.set({ jobStatusSnapshot: nextSnapshot, updatedAt: new Date() })
							.where(eq(schema.tasks.id, task.id))
					} catch {}
				}
				logger.info(
					'api',
					`[cf-callback] non-download media-downloader job ignored job=${payload.jobId} kind=${effectiveKind}`,
				)
				return Response.json({ ok: true, ignored: true })
			}
		}

		const media = await db.query.media.findFirst({
			where: eq(schema.media.id, payload.mediaId),
		})

		if (!media) {
			const outputs = payload.outputs
			const hasMetadataOnly = Boolean(outputs?.metadata) && !outputs?.video
			if (payload.engine === 'media-downloader' && hasMetadataOnly) {
				logger.info(
					'api',
					`[cf-callback] non-media job callback ignored mediaId=${payload.mediaId}`,
				)
				return Response.json({ ok: true, ignored: true })
			}
			logger.error('api', `[cf-callback] media not found: ${payload.mediaId}`)
			return Response.json({ error: 'media not found' }, { status: 404 })
		}

		if (payload.engine === 'media-downloader') {
			await handleCloudDownloadCallback(
				media,
				payload as CallbackPayload & { engine: 'media-downloader' },
			)
			if (task && eventSeq != null) {
				try {
					const nextSnapshot = mergeCallbackSnapshot(task, {
						eventSeq,
						eventId: payload.eventId,
						eventTs: payload.eventTs,
					})
					await db
						.update(schema.tasks)
						.set({
							jobStatusSnapshot: nextSnapshot,
							updatedAt: new Date(),
						})
						.where(eq(schema.tasks.id, task.id))
				} catch {
					// best-effort
				}
			}
			logger.info(
				'api',
				`[cf-callback] handled downloader callback job=${payload.jobId} media=${payload.mediaId} status=${payload.status}`,
			)
			return Response.json({ ok: true })
		}

		if (payload.engine === 'asr-pipeline') {
			if (payload.status === 'completed') {
				const vttKey = payload.outputs?.vtt?.key
				if (!vttKey) {
					logger.error(
						'api',
						`[cf-callback] asr-pipeline missing vtt output job=${payload.jobId}`,
					)
					return Response.json({ error: 'missing vtt output' }, { status: 400 })
				}

				try {
					await persistAsrResultFromBucket({
						mediaId: payload.mediaId,
						vttKey,
						wordsKey: payload.outputs?.words?.key,
						vttUrl: payload.outputs?.vtt?.url,
						wordsUrl: payload.outputs?.words?.url,
						title: media.title,
					})
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err)
					logger.error(
						'api',
						`[cf-callback] asr persist failed job=${payload.jobId} media=${payload.mediaId} error=${msg}`,
					)
					return Response.json({ error: msg }, { status: 500 })
				}

				try {
					const durationSeconds =
						typeof media.duration === 'number' && media.duration > 0
							? media.duration
							: 0
					const modelId =
						typeof payload.metadata?.model === 'string'
							? payload.metadata.model
							: undefined
					if (durationSeconds > 0 && modelId && media.userId) {
						await chargeAsrUsage({
							userId: media.userId,
							modelId,
							durationSeconds,
							refType: 'asr',
							refId: payload.jobId,
							remark: `asr ${modelId} ${durationSeconds.toFixed(1)}s`,
						})
					}
				} catch (error) {
					if (error instanceof InsufficientPointsError) {
						logger.warn(
							'api',
							`[cf-callback] asr charge skipped (insufficient points) media=${media.id}`,
						)
					} else {
						logger.warn(
							'api',
							`[cf-callback] asr charge failed: ${error instanceof Error ? error.message : String(error)}`,
						)
					}
				}

				logger.info(
					'api',
					`[cf-callback] asr completed job=${payload.jobId} media=${payload.mediaId}`,
				)
			} else if (payload.status === 'failed' || payload.status === 'canceled') {
				await db
					.update(schema.media)
					.set({
						downloadError: `[asr-pipeline] ${payload.error ?? payload.status}`,
					})
					.where(eq(schema.media.id, media.id))
				logger.warn(
					'api',
					`[cf-callback] asr ${payload.status} job=${payload.jobId} media=${payload.mediaId} error=${payload.error ?? 'n/a'}`,
				)
			}

			if (task && eventSeq != null) {
				try {
					const nextSnapshot = mergeCallbackSnapshot(task, {
						eventSeq,
						eventId: payload.eventId,
						eventTs: payload.eventTs,
					})
					await db
						.update(schema.tasks)
						.set({
							jobStatusSnapshot: nextSnapshot,
							updatedAt: new Date(),
						})
						.where(eq(schema.tasks.id, task.id))
				} catch {
					// best-effort; ignore dedupe snapshot write failures
				}
			}

			return Response.json({ ok: true })
		}

		if (payload.status === 'completed') {
			if (payload.engine === 'renderer-remotion') {
				await db
					.update(schema.media)
					.set({
						videoWithInfoPath: `remote:orchestrator:${payload.jobId}`,
					})
					.where(eq(schema.media.id, media.id))
				logger.info(
					'api',
					`[cf-callback] render-info completed job=${payload.jobId} media=${payload.mediaId}`,
				)
			} else {
				await db
					.update(schema.media)
					.set({
						videoWithSubtitlesPath: `remote:orchestrator:${payload.jobId}`,
					})
					.where(eq(schema.media.id, media.id))
				logger.info(
					'api',
					`[cf-callback] render-subtitles completed job=${payload.jobId} media=${payload.mediaId}`,
				)
			}
		} else if (payload.status === 'failed' || payload.status === 'canceled') {
			const errorMessage =
				payload.error ||
				(payload.status === 'failed'
					? 'Cloud render failed'
					: 'Cloud render canceled')
			const updates: Record<string, unknown> = {
				downloadError: `[${payload.engine}] ${errorMessage}`,
			}
			await db
				.update(schema.media)
				.set(updates)
				.where(eq(schema.media.id, media.id))
			logger.warn(
				'api',
				`[cf-callback] render ${payload.status} job=${payload.jobId} media=${payload.mediaId} engine=${payload.engine} error=${errorMessage}`,
			)
		}

		if (task && eventSeq != null) {
			try {
				const nextSnapshot = mergeCallbackSnapshot(task, {
					eventSeq,
					eventId: payload.eventId,
					eventTs: payload.eventTs,
				})
				await db
					.update(schema.tasks)
					.set({
						jobStatusSnapshot: nextSnapshot,
						updatedAt: new Date(),
					})
					.where(eq(schema.tasks.id, task.id))
			} catch {}
		}

		return Response.json({ ok: true })
	} catch (e) {
		logger.error(
			'api',
			`[cf-callback] error: ${e instanceof Error ? e.message : String(e)}`,
		)
		return Response.json({ error: 'internal error' }, { status: 500 })
	}
}
