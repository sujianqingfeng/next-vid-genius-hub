import { bucketPaths, type OrchestratorCallbackPayloadV2 } from '@app/media-domain'
import { runAsrForPipeline } from '../asr/pipeline'
import {
	fetchWhisperApiConfigFromApp,
	getWhisperJobResult,
	getWhisperJobStatus,
	mapWhisperStatusToJobStatus,
	resolveWhisperProgressFraction,
	submitWhisperTranscriptionJob,
} from '../asr/whisper-api-jobs'
import {
	putObjectStreamToStorage,
	readObjectArrayBufferWithFallback,
} from '../storage/fallback'
import { presignS3 } from '../storage/presign'
import type { Env } from '../types'
import { TERMINAL_STATUSES } from '../types'
import { hmacHex, requireJobCallbackSecret } from '../utils/hmac'
import { jobStub } from '../utils/job'

// ---------------- Durable Object for strong-consistent job state ----------------
const SSE_RETRY_MS = 3000
const SSE_KEEPALIVE_MS = 20_000
const SSE_BROADCAST_THROTTLE_MS = 250

const textEncoder = new TextEncoder()

type SseClient = {
	writer: WritableStreamDefaultWriter<Uint8Array>
	keepAlive?: number
	closed: boolean
	close: () => void
}

function encodeSseComment(comment: string): Uint8Array {
	return textEncoder.encode(`: ${comment}\n\n`)
}

function encodeSseEvent(event: string, data: unknown): Uint8Array {
	return textEncoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export class RenderJobDO {
	state: DurableObjectState
	env: Env
	private sseClients = new Map<string, SseClient>()
	private pendingSseBroadcast: any | null = null
	private pendingSseBroadcastTimer: number | null = null
	private lastSseBroadcastAt = 0
	constructor(state: DurableObjectState, env: Env) {
		this.state = state
		this.env = env
	}

	private toPublicJobDoc(doc: any): any {
		if (!doc || typeof doc !== 'object') return doc

		// Clone to avoid mutating any shared references.
		const out = { ...(doc as Record<string, unknown>) } as any

		// If the container stage has completed but ASR hasn't produced VTT yet,
		// present a non-terminal status to clients to avoid premature completion.
		if (out.engine === 'asr-pipeline') {
			const hasVtt = Boolean(out.outputs?.vtt?.key)
			if (out.status === 'completed' && !hasVtt) {
				out.status = 'running'
				// Avoid the confusing "100% but still running" state while ASR is in-flight.
				const p =
					typeof out.progress === 'number' && Number.isFinite(out.progress)
						? (out.progress as number)
						: null
				if (p == null || p >= 1) out.progress = 0.95
			}
		}

		// If job is already completed but retained a stale phase/progress from earlier stages,
		// normalize the response so clients display a final 100% without an active phase.
		// For asr-pipeline, only normalize when the final VTT output exists.
		if (out.status === 'completed') {
			const canFinalize =
				out.engine !== 'asr-pipeline' || Boolean(out.outputs?.vtt?.key)
			if (canFinalize) {
				if (out.phase) delete out.phase
				if (out.progress !== 1) out.progress = 1
			}
		}

		return out
	}

		private scheduleSseBroadcast(doc: any): void {
			if (this.sseClients.size === 0) return
			this.pendingSseBroadcast = doc

			const now = Date.now()
			const status = doc?.status
			const isTerminal =
				typeof status === 'string' &&
				(TERMINAL_STATUSES as readonly string[]).includes(status)
			const delay = isTerminal
				? 0
				: Math.max(0, SSE_BROADCAST_THROTTLE_MS - (now - this.lastSseBroadcastAt))

		if (this.pendingSseBroadcastTimer != null) return
		this.pendingSseBroadcastTimer = setTimeout(() => {
			this.pendingSseBroadcastTimer = null
			void this.flushSseBroadcast()
		}, delay) as unknown as number
	}

	private async flushSseBroadcast(): Promise<void> {
		const doc = this.pendingSseBroadcast
		this.pendingSseBroadcast = null
		if (!doc || this.sseClients.size === 0) return

		this.lastSseBroadcastAt = Date.now()
		const payload = encodeSseEvent('status', this.toPublicJobDoc(doc))

		for (const client of this.sseClients.values()) {
			if (client.closed) continue
			client.writer.write(payload).catch(() => {
				try {
					client.close()
				} catch {}
			})
		}

		// If more updates arrived during flush, schedule another send.
		if (this.pendingSseBroadcast) this.scheduleSseBroadcast(this.pendingSseBroadcast)
	}

	private async handleSseSubscribe(req: Request): Promise<Response> {
		const doc = (await this.state.storage.get('job')) as any
		if (!doc) {
			return new Response(JSON.stringify({ error: 'not found' }), {
				status: 404,
				headers: { 'content-type': 'application/json' },
			})
		}

		const clientId = crypto.randomUUID()
		const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
		const writer = writable.getWriter()

		const client: SseClient = {
			writer,
			closed: false,
			close: () => {},
		}

		client.close = () => {
			if (client.closed) return
			client.closed = true
			this.sseClients.delete(clientId)
			if (client.keepAlive != null) {
				try {
					clearInterval(client.keepAlive)
				} catch {}
			}
			try {
				writer.close()
			} catch {}
		}

		this.sseClients.set(clientId, client)
		req.signal.addEventListener('abort', client.close, { once: true })

		// Set client retry policy and send an initial snapshot.
		await writer.write(textEncoder.encode(`retry: ${SSE_RETRY_MS}\n\n`))
		await writer.write(encodeSseEvent('status', this.toPublicJobDoc(doc)))

		// Keep the connection warm through proxies.
		client.keepAlive = setInterval(() => {
			writer.write(encodeSseComment('ping')).catch(() => client.close())
		}, SSE_KEEPALIVE_MS) as unknown as number

		return new Response(readable, {
			headers: {
				'content-type': 'text/event-stream; charset=utf-8',
				'cache-control': 'no-store',
				'x-content-type-options': 'nosniff',
			},
		})
	}

	private async maybeNotifyTerminal(doc: any): Promise<void> {
		const completionHasOutputs = () => {
			if (doc.engine === 'asr-pipeline') return Boolean(doc.outputs?.vtt?.key)
			if (doc.engine === 'media-downloader') {
				return Boolean(
					doc.outputs?.video?.key ||
						doc.outputs?.metadata?.key,
				)
			}
			return Boolean(doc.outputs?.video?.key)
		}

		const shouldNotify =
			TERMINAL_STATUSES.includes(doc.status) &&
			!(doc.appNotified || doc.nextNotified) &&
			(doc.status !== 'completed' || completionHasOutputs())

		if (!shouldNotify || !doc.jobId) return

		type PendingNotify = {
			eventSeq: number
			eventId: string
			eventTs: number
			payload: OrchestratorCallbackPayloadV2
			attempt: number
			nextAt: number
			lastError?: string
		}

		const now = Date.now()
		let pending = doc.pendingNotify as PendingNotify | undefined

		if (!pending) {
			const lastSeq =
				typeof doc.callbackEventSeq === 'number' &&
				Number.isFinite(doc.callbackEventSeq)
					? Math.trunc(doc.callbackEventSeq)
					: 0
			const eventSeq = lastSeq + 1
			const eventId = `${doc.jobId}:${eventSeq}`
			const eventTs = now
			doc.callbackEventSeq = eventSeq

			const payload = await this.buildAppCallbackPayload(doc, {
				eventSeq,
				eventId,
				eventTs,
			})

			pending = {
				eventSeq,
				eventId,
				eventTs,
				payload,
				attempt: 0,
				nextAt: now,
			}
			doc.pendingNotify = pending
			await this.state.storage.put('job', doc)
		}

		const pendingNotify = pending
		if (
			typeof pendingNotify.nextAt === 'number' &&
			pendingNotify.nextAt > now
		) {
			await this.setAlarmEarlier(pendingNotify.nextAt)
			return
		}

		const ok = await this.postAppCallback(pendingNotify.payload)
		if (ok) {
			doc.appNotified = true
			doc.nextNotified = true
			doc.lastNotifiedEventSeq = pendingNotify.eventSeq
			doc.pendingNotify = undefined
			await this.state.storage.put('job', doc)
			return
		}

		pendingNotify.attempt = Math.max(0, Math.trunc(pendingNotify.attempt || 0)) + 1
		pendingNotify.lastError = 'notifyApp_failed'
		pendingNotify.nextAt = now + this.getNotifyBackoffMs(pendingNotify.attempt)
		doc.pendingNotify = pendingNotify
		await this.state.storage.put('job', doc)
		await this.setAlarmEarlier(pendingNotify.nextAt)
	}

	private async setAlarmEarlier(atMs: number) {
		let existing: number | undefined
		try {
			existing = await this.state.storage.get<number>('alarmAt')
		} catch {}
		const now = Date.now()
		if (typeof existing === 'number' && Number.isFinite(existing)) {
			// If the stored alarm time is already in the past, treat it as cleared so we can schedule again.
			if (existing <= now) existing = undefined
		}
		if (typeof existing === 'number' && Number.isFinite(existing)) {
			if (existing <= atMs) return
		}
		try {
			await this.state.storage.setAlarm(atMs)
			await this.state.storage.put('alarmAt', atMs)
		} catch {}
	}

	private getNotifyBackoffMs(attempt: number): number {
		const idx = Math.max(0, Math.trunc(attempt))
		const schedule = [
			1000, 2000, 5000, 10_000, 20_000, 30_000, 60_000, 120_000, 300_000,
		]
		return schedule[Math.min(idx, schedule.length - 1)]!
	}

	async fetch(req: Request): Promise<Response> {
		const url = new URL(req.url)
		const path = url.pathname
		if (req.method === 'DELETE') {
			await this.state.storage.delete('job')
			return new Response(JSON.stringify({ ok: true }), {
				headers: { 'content-type': 'application/json' },
			})
		}
		if (req.method === 'GET' && path.endsWith('/events')) {
			return await this.handleSseSubscribe(req)
		}
		if (req.method === 'POST' && path.endsWith('/init')) {
			const body = (await req.json()) as any
			const doc = {
				jobId: body.jobId,
				mediaId: body.mediaId,
				title: body.title,
				engine: body.engine,
				purpose: body.purpose,
				status: body.status || 'queued',
				outputs: body.outputs,
				metadata: body.metadata,
				ts: Date.now(),
			}
			await this.state.storage.put('job', doc)
			this.scheduleSseBroadcast(doc)
			return new Response(JSON.stringify({ ok: true }), {
				headers: { 'content-type': 'application/json' },
			})
		}
		if (req.method === 'POST' && path.endsWith('/progress')) {
			const body = (await req.json()) as any
			const doc = ((await this.state.storage.get('job')) as any) || {}
			if (doc?.status === 'canceled' && body?.status !== 'canceled') {
				return new Response(JSON.stringify({ ok: true, ignored: true }), {
					headers: { 'content-type': 'application/json' },
				})
			}
			const incomingOutputs =
				body.outputs && typeof body.outputs === 'object' ? body.outputs : undefined
			const mergedOutputs = (() => {
				if (!incomingOutputs) return doc.outputs
				const base =
					doc.outputs && typeof doc.outputs === 'object' ? doc.outputs : {}
				const next: Record<string, unknown> = { ...base }
				for (const [slot, value] of Object.entries(incomingOutputs)) {
					if (value && typeof value === 'object') {
						const prev = next[slot]
						next[slot] = {
							...(prev && typeof prev === 'object' ? (prev as any) : {}),
							...(value as any),
						}
					} else {
						next[slot] = value
					}
				}
				return next
			})()
			const next = {
				...doc,
				jobId: body.jobId || doc.jobId,
				purpose: body.purpose ?? doc.purpose,
				status: body.status || doc.status,
				phase: body.phase ?? doc.phase,
				progress: body.progress ?? doc.progress,
				error: body.error ?? doc.error,
				outputs: mergedOutputs,
				metadata: body.metadata ?? doc.metadata,
				ts: Date.now(),
			}
			await this.state.storage.put('job', next)
			this.scheduleSseBroadcast(next)
			await this.maybeNotifyTerminal(next)

			return new Response(JSON.stringify({ ok: true }), {
				headers: { 'content-type': 'application/json' },
			})
		}
		if (req.method === 'POST' && path.endsWith('/cancel')) {
			let body: any = null
			try {
				body = await req.json()
			} catch {}

			const doc = ((await this.state.storage.get('job')) as any) || null
			if (!doc || !doc.jobId) {
				return new Response(JSON.stringify({ error: 'job_not_found' }), {
					status: 404,
					headers: { 'content-type': 'application/json' },
				})
			}

			if (TERMINAL_STATUSES.includes(doc.status)) {
				return new Response(JSON.stringify({ ok: true, status: doc.status }), {
					headers: { 'content-type': 'application/json' },
				})
			}

			const reason =
				typeof body?.reason === 'string' && body.reason.trim()
					? body.reason.trim()
					: null

			doc.status = 'canceled'
			doc.error = reason || doc.error || 'canceled'
			doc.canceledAt = Date.now()
			doc.ts = Date.now()
			await this.state.storage.put('job', doc)
			this.scheduleSseBroadcast(doc)
			await this.maybeNotifyTerminal(doc)

			return new Response(JSON.stringify({ ok: true, status: doc.status }), {
				headers: { 'content-type': 'application/json' },
			})
		}
		if (req.method === 'POST' && path.endsWith('/replay-app-callback')) {
			let body: any = null
			try {
				body = await req.json()
			} catch {}

			const doc = ((await this.state.storage.get('job')) as any) || null
			if (!doc || !doc.jobId) {
				return new Response(JSON.stringify({ error: 'job_not_found' }), {
					status: 404,
					headers: { 'content-type': 'application/json' },
				})
			}

			const force = Boolean(body?.force)
			if (!force && !TERMINAL_STATUSES.includes(doc.status)) {
				return new Response(
					JSON.stringify({ error: 'not_terminal', status: doc.status || null }),
					{
						status: 400,
						headers: { 'content-type': 'application/json' },
					},
				)
			}

				type PendingNotify = {
					eventSeq: number
					eventId: string
					eventTs: number
					payload: OrchestratorCallbackPayloadV2
					attempt: number
					nextAt: number
					lastError?: string
				}

			const now = Date.now()
			const lastSeq =
				typeof doc.callbackEventSeq === 'number' && Number.isFinite(doc.callbackEventSeq)
					? Math.trunc(doc.callbackEventSeq)
					: 0
			const eventSeq = lastSeq + 1
			const eventId = `${doc.jobId}:${eventSeq}`
			const eventTs = now
			doc.callbackEventSeq = eventSeq

				const payload = await this.buildAppCallbackPayload(doc, {
					eventSeq,
					eventId,
					eventTs,
				})
			;(payload as any).replay = {
				by: 'debug',
				requestedAt: typeof body?.requestedAt === 'number' ? body.requestedAt : now,
				reason:
					typeof body?.reason === 'string' && body.reason.trim()
						? body.reason.trim()
						: null,
			}

				const pending: PendingNotify = {
					eventSeq,
					eventId,
					eventTs,
					payload,
					attempt: 0,
					nextAt: now,
				}
			doc.pendingNotify = pending
			// Allow replay even if the job was previously notified.
			doc.appNotified = false
			doc.nextNotified = false
			await this.state.storage.put('job', doc)

				const ok = await this.postAppCallback(payload)
				if (ok) {
				doc.appNotified = true
				doc.nextNotified = true
				doc.lastNotifiedEventSeq = eventSeq
				doc.pendingNotify = undefined
				await this.state.storage.put('job', doc)
			} else {
				pending.attempt = 1
				pending.lastError = 'notifyApp_failed'
				pending.nextAt = now + this.getNotifyBackoffMs(pending.attempt)
				doc.pendingNotify = pending
				await this.state.storage.put('job', doc)
				await this.setAlarmEarlier(pending.nextAt)
			}

			return new Response(
				JSON.stringify({
					ok,
					jobId: doc.jobId,
					eventSeq,
					eventId,
					eventTs,
				}),
				{ headers: { 'content-type': 'application/json' } },
			)
		}
		if (req.method === 'POST' && path.endsWith('/start-asr')) {
			const doc = (await this.state.storage.get('job')) as any
			if (!doc || doc.engine !== 'asr-pipeline' || !doc.jobId) {
				return new Response(JSON.stringify({ error: 'bad request' }), {
					status: 400,
					headers: { 'content-type': 'application/json' },
				})
			}
			if (TERMINAL_STATUSES.includes(doc.status) || doc.outputs?.vtt?.key) {
				return new Response(JSON.stringify({ ok: true }), {
					headers: { 'content-type': 'application/json' },
				})
			}
			const providerType = doc?.metadata?.providerType
			if (providerType === 'whisper_api') {
				this.state.waitUntil(
					(async () => {
						try {
							await this.startWhisperAsr(doc)
						} catch (e) {
							const msg = (e as Error)?.message || String(e)
							console.error('[asr-pipeline.whisper_api] background error', {
								jobId: doc.jobId,
								msg,
							})
							try {
								const stub = jobStub(this.env, doc.jobId)
								if (stub) {
									await stub.fetch('https://do/progress', {
										method: 'POST',
										headers: { 'content-type': 'application/json' },
										body: JSON.stringify({
											jobId: doc.jobId,
											status: 'failed',
											error: msg,
											ts: Date.now(),
										}),
									})
								}
							} catch {}
						}
					})(),
				)
				return new Response(JSON.stringify({ ok: true }), {
					headers: { 'content-type': 'application/json' },
				})
			}
			// Fire-and-forget ASR work; results and errors will be persisted via /progress.
			this.state.waitUntil(
				(async () => {
					try {
						await runAsrForPipeline(this.env, doc)
					} catch (e) {
						const msg = (e as Error)?.message || String(e)
						console.error('[asr-pipeline] background error', {
							jobId: doc.jobId,
							msg,
						})
						try {
							const stub = jobStub(this.env, doc.jobId)
							if (stub) {
								await stub.fetch('https://do/progress', {
									method: 'POST',
									headers: { 'content-type': 'application/json' },
									body: JSON.stringify({
										jobId: doc.jobId,
										status: 'failed',
										error: msg,
										ts: Date.now(),
									}),
								})
							}
						} catch {}
					}
				})(),
			)
			return new Response(JSON.stringify({ ok: true }), {
				headers: { 'content-type': 'application/json' },
			})
		}
			if (req.method === 'GET') {
				let doc = (await this.state.storage.get('job')) as any
				if (!doc) {
					return new Response(JSON.stringify({ error: 'not found' }), {
					status: 404,
					headers: { 'content-type': 'application/json' },
				})
			}
					// Enrich outputs with presigned URLs for asr-pipeline artifacts
					try {
						const bucket = this.env.S3_BUCKET_NAME || 'vidgen-render'
						if (doc.engine === 'asr-pipeline') {
						if (doc.outputs?.vtt?.key) {
							doc.outputs.vtt.url = await presignS3(
							this.env,
							'GET',
							bucket,
							doc.outputs.vtt.key,
							600,
						)
					}
						if (doc.outputs?.words?.key) {
							doc.outputs.words.url = await presignS3(
								this.env,
								'GET',
								bucket,
								doc.outputs.words.key,
								600,
							)
						}
						// If the container stage has completed but ASR hasn't produced VTT yet,
						// present a non-terminal status to clients to avoid premature completion.
						if (doc.status === 'completed' && !doc.outputs?.vtt?.key) {
							doc.status = 'running'
							// Avoid the confusing "100% but still running" state while ASR is in-flight.
							const p =
								typeof doc.progress === 'number' && Number.isFinite(doc.progress)
									? (doc.progress as number)
									: null
							if (p == null || p >= 1) doc.progress = 0.95
						}
					}
				} catch {}

			// If job is already completed but retained a stale phase/progress from earlier stages,
			// normalize the response so clients display a final 100% without an active phase.
			// For asr-pipeline, only normalize when the final VTT output exists.
			if (doc.status === 'completed') {
				const canFinalize =
					doc.engine !== 'asr-pipeline' || Boolean(doc.outputs?.vtt?.key)
				if (canFinalize) {
					if (doc.phase) delete doc.phase
					if (doc.progress !== 1) doc.progress = 1
				}
			}
			return new Response(JSON.stringify(doc), {
				headers: { 'content-type': 'application/json' },
			})
		}
		return new Response(JSON.stringify({ error: 'not found' }), {
			status: 404,
			headers: { 'content-type': 'application/json' },
		})
	}

	// Durable Object alarms: used for polling external async ASR providers.
		async alarm() {
			const doc = (await this.state.storage.get('job')) as any
			if (!doc || !doc.jobId) return

		// 1) Retry pending callbacks to the app (alarm-driven).
			type PendingNotify = {
				eventSeq: number
				eventId: string
				eventTs: number
				payload: OrchestratorCallbackPayloadV2
				attempt: number
				nextAt: number
				lastError?: string
			}

			const pendingNotify = doc.pendingNotify as PendingNotify | undefined
			if (pendingNotify && typeof pendingNotify.nextAt === 'number') {
				const now = Date.now()
				if (pendingNotify.nextAt <= now) {
					const ok = await this.postAppCallback(pendingNotify.payload)
					if (ok) {
						doc.appNotified = true
						doc.nextNotified = true
						doc.lastNotifiedEventSeq = pendingNotify.eventSeq
						doc.pendingNotify = undefined
						try {
							await this.state.storage.put('job', doc)
						} catch {}
					} else {
						pendingNotify.attempt =
							Math.max(0, Math.trunc(pendingNotify.attempt || 0)) + 1
						pendingNotify.lastError = 'notifyApp_failed'
						pendingNotify.nextAt =
							now + this.getNotifyBackoffMs(pendingNotify.attempt)
						doc.pendingNotify = pendingNotify
						try {
							await this.state.storage.put('job', doc)
						} catch {}
						await this.setAlarmEarlier(pendingNotify.nextAt)
					}
				} else {
					await this.setAlarmEarlier(pendingNotify.nextAt)
				}
			}

		// Existing ASR polling logic (only).
		if (doc.engine !== 'asr-pipeline') return
		if (TERMINAL_STATUSES.includes(doc.status) || doc.outputs?.vtt?.key) return
		if (doc?.metadata?.providerType !== 'whisper_api') return

		const nextPollAt =
			typeof doc.whisperPollAt === 'number' &&
			Number.isFinite(doc.whisperPollAt)
				? (doc.whisperPollAt as number)
				: null
		if (typeof nextPollAt === 'number' && nextPollAt > Date.now()) {
			await this.setAlarmEarlier(nextPollAt)
			return
		}

		const whisperJobId =
			typeof doc?.metadata?.whisperJobId === 'string'
				? doc.metadata.whisperJobId
				: null
		if (!whisperJobId) return

		try {
			const providerId = String(doc?.metadata?.providerId || '').trim()
			const modelId = String(doc?.metadata?.model || '').trim()
			if (!providerId || !modelId) {
				throw new Error('whisper_api missing providerId/model')
			}

			const cfg = await fetchWhisperApiConfigFromApp(this.env, {
				providerId,
				modelId,
			})
			const status = await getWhisperJobStatus({
				baseUrl: cfg.baseUrl,
				apiKey: cfg.apiKey,
				jobId: whisperJobId,
			})

			const mappedStatus = mapWhisperStatusToJobStatus(status.status)
			const phase =
				status.status === 'queued'
					? 'asr_queued'
					: status.status === 'running'
						? 'asr_running'
						: status.status === 'succeeded'
							? undefined
							: 'asr_failed'

			// Sync progress/status into DO state.
			{
				const stub = jobStub(this.env, doc.jobId)
				if (stub) {
					await stub.fetch('https://do/progress', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({
							jobId: doc.jobId,
							status: mappedStatus === 'completed' ? 'running' : mappedStatus,
							phase,
							progress:
								typeof status.progressFraction === 'number'
									? status.progressFraction
									: undefined,
							error: status.error ?? undefined,
							metadata: { ...(doc.metadata || {}), whisperJobId },
							ts: Date.now(),
						}),
					})
				}
			}

			if (mappedStatus === 'failed') {
				const stub = jobStub(this.env, doc.jobId)
				if (stub) {
					await stub.fetch('https://do/progress', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({
							jobId: doc.jobId,
							status: 'failed',
							error: status.error || 'Whisper API job failed',
							ts: Date.now(),
						}),
					})
				}
				return
			}

			if (mappedStatus === 'completed') {
				const vtt = await getWhisperJobResult({
					baseUrl: cfg.baseUrl,
					apiKey: cfg.apiKey,
					jobId: whisperJobId,
					responseFormat: 'vtt',
				})
				const json = await getWhisperJobResult({
					baseUrl: cfg.baseUrl,
					apiKey: cfg.apiKey,
					jobId: whisperJobId,
					responseFormat: 'json',
				})

				const extractWords = (payload: any) => {
					const out: Array<{ word: string; start: number; end: number }> = []
					const segments = Array.isArray(payload?.segments)
						? payload.segments
						: []
					for (const seg of segments) {
						const words = Array.isArray(seg?.words) ? seg.words : []
						for (const w of words) {
							if (
								w &&
								typeof w.word === 'string' &&
								typeof w.start === 'number' &&
								typeof w.end === 'number'
							) {
								out.push({ word: w.word, start: w.start, end: w.end })
							}
						}
					}
					return out.length > 0 ? out : undefined
				}

				const mediaId = doc.mediaId || 'unknown'
				const title = doc?.title as string | undefined
				const pathOptions = { title }
				const vttKey = bucketPaths.asr.results.transcript(
					mediaId,
					doc.jobId,
					pathOptions,
				)
				await putObjectStreamToStorage(
					this.env,
					vttKey,
					'text/vtt',
					String(vtt),
				)

				let wordsKey: string | undefined
				const words = extractWords(json)
				if (words && words.length > 0) {
					wordsKey = bucketPaths.asr.results.words(
						mediaId,
						doc.jobId,
						pathOptions,
					)
					await putObjectStreamToStorage(
						this.env,
						wordsKey,
						'application/json',
						JSON.stringify(words),
					)
				}

				const stub = jobStub(this.env, doc.jobId)
				if (stub) {
					const outputs: any = {}
					outputs.vtt = { key: vttKey }
					if (wordsKey) outputs.words = { key: wordsKey }
					await stub.fetch('https://do/progress', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({
							jobId: doc.jobId,
							status: 'completed',
							progress: 1,
							outputs,
							metadata: { ...(doc.metadata || {}), whisperJobId },
							ts: Date.now(),
						}),
					})
				}
				return
			}
		} catch (e) {
			const msg = (e as Error)?.message || String(e)
			console.error('[asr-pipeline.whisper_api] poll error', {
				jobId: doc.jobId,
				msg,
			})
		}

		// Not finished yet: schedule another poll.
		try {
			doc.whisperPollAt = Date.now() + 3000
			await this.state.storage.put('job', doc)
			await this.setAlarmEarlier(doc.whisperPollAt)
		} catch {}
	}

		private async startWhisperAsr(doc: any) {
		const providerId = String(doc?.metadata?.providerId || '').trim()
		const modelId = String(doc?.metadata?.model || '').trim()
		if (!providerId || !modelId) {
			throw new Error('whisper_api missing providerId/model')
		}

			const audioKey: string | undefined =
				typeof doc?.metadata?.sourceKey === 'string'
					? doc.metadata.sourceKey
					: doc.outputs?.audioProcessed?.key || doc.outputs?.audio?.key
			if (!audioKey)
				throw new Error(
					'asr-pipeline.whisper_api: missing metadata.sourceKey for input audio',
				)

		const cfg = await fetchWhisperApiConfigFromApp(this.env, {
			providerId,
			modelId,
		})
		const audio = await readObjectArrayBufferWithFallback(this.env, audioKey)
		if (!audio)
			throw new Error(`asr-pipeline.whisper_api: audio not found: ${audioKey}`)

		const language =
			typeof doc?.metadata?.language === 'string' &&
			doc.metadata.language !== 'auto'
				? doc.metadata.language
				: undefined

		const job = await submitWhisperTranscriptionJob({
			baseUrl: cfg.baseUrl,
			apiKey: cfg.apiKey,
			model: cfg.remoteModelId,
			language,
			audio,
			filename: 'audio.wav',
		})

		const stub = jobStub(this.env, doc.jobId)
		if (stub) {
			const progress = resolveWhisperProgressFraction(job) ?? 0
			await stub.fetch('https://do/progress', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					jobId: doc.jobId,
					status: 'running',
					phase: 'asr_submitted',
					progress,
					metadata: { ...(doc.metadata || {}), whisperJobId: job.id },
					ts: Date.now(),
				}),
			})
		}

		try {
			doc.whisperPollAt = Date.now() + 1000
			await this.state.storage.put('job', doc)
			await this.setAlarmEarlier(doc.whisperPollAt)
		} catch {}
	}

		private async buildAppCallbackPayload(
		doc: any,
		event: { eventSeq: number; eventId: string; eventTs: number },
	): Promise<OrchestratorCallbackPayloadV2> {
		const bucket = this.env.S3_BUCKET_NAME || 'vidgen-render'
		const payload: OrchestratorCallbackPayloadV2 = {
			schemaVersion: 2,
			jobId: doc.jobId,
			mediaId: doc.mediaId || 'unknown',
			engine: doc.engine,
			purpose: doc.purpose || doc.engine || 'unknown',
			status: doc.status || 'completed',
			eventSeq: event.eventSeq,
			eventId: event.eventId,
			eventTs: event.eventTs,
		}

		if (doc.error) {
			payload.error = doc.error
		}

			if (doc.engine === 'media-downloader') {
				const outputs: Record<string, unknown> = {}
				const videoKey: string | undefined = doc.outputs?.video?.key
				const audioProcessedKey: string | undefined =
					doc.outputs?.audioProcessed?.key || doc.outputs?.audio?.key
				const audioSourceKey: string | undefined = doc.outputs?.audioSource?.key
				const metadataKey: string | undefined = doc.outputs?.metadata?.key

				if (videoKey) {
					outputs.video = {
						key: videoKey,
						url: await presignS3(this.env, 'GET', bucket, videoKey, 600),
					}
				}
				if (audioProcessedKey) {
					// Keep "audio" as an alias for processed audio (for consumers that haven't migrated).
					outputs.audio = {
						key: audioProcessedKey,
						url: await presignS3(this.env, 'GET', bucket, audioProcessedKey, 600),
					}
					outputs.audioProcessed = {
						key: audioProcessedKey,
						url: await presignS3(this.env, 'GET', bucket, audioProcessedKey, 600),
					}
				}
				if (audioSourceKey) {
					outputs.audioSource = {
						key: audioSourceKey,
						url: await presignS3(this.env, 'GET', bucket, audioSourceKey, 600),
					}
				}
				if (metadataKey) {
					outputs.metadata = {
						key: metadataKey,
						url: await presignS3(this.env, 'GET', bucket, metadataKey, 600),
					}
				}
				if (Object.keys(outputs).length > 0) {
					payload.outputs = outputs
				}
				if (doc.metadata) payload.metadata = doc.metadata
			} else if (doc.engine === 'asr-pipeline') {
			const outputs: Record<string, unknown> = {}
			const vttKey: string | undefined = doc.outputs?.vtt?.key
			const wordsKey: string | undefined = doc.outputs?.words?.key
			if (vttKey) {
				outputs.vtt = {
					key: vttKey,
					url: await presignS3(this.env, 'GET', bucket, vttKey, 600),
				}
			}
			if (wordsKey) {
				outputs.words = {
					key: wordsKey,
					url: await presignS3(this.env, 'GET', bucket, wordsKey, 600),
				}
			}
			if (Object.keys(outputs).length > 0) {
				payload.outputs = outputs
			}
			if (doc.metadata) payload.metadata = doc.metadata
			} else {
				const videoKey: string | undefined = doc.outputs?.video?.key
				if (videoKey) {
					payload.outputs = {
						video: {
							key: videoKey,
							url: await presignS3(this.env, 'GET', bucket, videoKey, 600),
						},
					}
				}
			}

		return payload
	}

	private async postAppCallback(payload: OrchestratorCallbackPayloadV2) {
		const appBase = (this.env.APP_BASE_URL || 'http://localhost:3000').replace(
			/\/$/,
			'',
		)
		const cbUrl = `${appBase}/api/render/cf-callback`
		const secret = requireJobCallbackSecret(this.env)
		const signature = await hmacHex(secret, JSON.stringify(payload))
		try {
			const res = await fetch(cbUrl, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-signature': signature,
				},
				body: JSON.stringify(payload),
			})
			if (!res.ok) {
				const jobId =
					typeof payload.jobId === 'string' ? (payload.jobId as string) : 'n/a'
				console.warn('[orchestrator] notifyApp non-2xx', {
					jobId,
					status: res.status,
					cbUrl,
				})
				return false
			}
			return true
		} catch (e) {
			const jobId =
				typeof payload.jobId === 'string' ? (payload.jobId as string) : 'n/a'
			console.warn('[orchestrator] notifyApp error', {
				jobId,
				cbUrl,
				msg: (e as Error)?.message || String(e),
			})
			return false
		}
	}
}
