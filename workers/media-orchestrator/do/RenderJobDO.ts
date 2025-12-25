import { bucketPaths } from '@app/media-domain'
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
export class RenderJobDO {
	state: DurableObjectState
	env: Env
	constructor(state: DurableObjectState, env: Env) {
		this.state = state
		this.env = env
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
		if (req.method === 'POST' && path.endsWith('/init')) {
			const body = (await req.json()) as any
			const doc = {
				jobId: body.jobId,
				mediaId: body.mediaId,
				title: body.title,
				engine: body.engine,
				status: body.status || 'queued',
				outputKey: body.outputKey,
				// Backward-compatible: outputAudioKey is treated as processed audio.
				outputAudioKey: body.outputAudioKey,
				outputAudioSourceKey: body.outputAudioSourceKey,
				outputAudioProcessedKey: body.outputAudioProcessedKey,
				outputMetadataKey: body.outputMetadataKey,
				metadata: body.metadata,
				ts: Date.now(),
			}
			await this.state.storage.put('job', doc)
			return new Response(JSON.stringify({ ok: true }), {
				headers: { 'content-type': 'application/json' },
			})
		}
		if (req.method === 'POST' && path.endsWith('/progress')) {
			const body = (await req.json()) as any
			const doc = ((await this.state.storage.get('job')) as any) || {}
			const next = {
				...doc,
				jobId: body.jobId || doc.jobId,
				status: body.status || doc.status,
				phase: body.phase ?? doc.phase,
				progress: body.progress ?? doc.progress,
				error: body.error ?? doc.error,
				outputKey: body.outputKey ?? doc.outputKey,
				outputAudioKey: body.outputAudioKey ?? doc.outputAudioKey,
				outputAudioSourceKey:
					body.outputAudioSourceKey ?? doc.outputAudioSourceKey,
				outputAudioProcessedKey:
					body.outputAudioProcessedKey ?? doc.outputAudioProcessedKey,
				outputMetadataKey: body.outputMetadataKey ?? doc.outputMetadataKey,
				outputs: body.outputs ?? doc.outputs,
				metadata: body.metadata ?? doc.metadata,
				ts: Date.now(),
			}
			await this.state.storage.put('job', next)

			const completionHasOutputs = () => {
				if (next.engine === 'asr-pipeline')
					return Boolean(next.outputs?.vtt?.key)
				if (next.engine === 'media-downloader') {
					return Boolean(
						next.outputKey ||
						next.outputMetadataKey ||
						next.outputs?.metadata?.key,
					)
				}
				return Boolean(next.outputKey)
			}

			const shouldNotify =
				TERMINAL_STATUSES.includes(next.status) &&
				!(next.appNotified || next.nextNotified) &&
				(next.status !== 'completed' || completionHasOutputs())

			if (shouldNotify && next.jobId) {
				type PendingNotify = {
					eventSeq: number
					eventId: string
					eventTs: number
					payload: Record<string, unknown>
					attempt: number
					nextAt: number
					lastError?: string
				}

				const now = Date.now()
				let pending = next.pendingNotify as PendingNotify | undefined

				if (!pending) {
					const lastSeq =
						typeof next.callbackEventSeq === 'number' &&
						Number.isFinite(next.callbackEventSeq)
							? Math.trunc(next.callbackEventSeq)
							: 0
					const eventSeq = lastSeq + 1
					const eventId = `${next.jobId}:${eventSeq}`
					const eventTs = now
					next.callbackEventSeq = eventSeq

					const payload = await this.buildAppCallbackPayload(next, {
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
					next.pendingNotify = pending
					await this.state.storage.put('job', next)
				}

				if (typeof pending.nextAt === 'number' && pending.nextAt > now) {
					await this.setAlarmEarlier(pending.nextAt)
				} else {
					const ok = await this.postAppCallback(pending.payload)
					if (ok) {
						next.appNotified = true
						next.nextNotified = true
						next.lastNotifiedEventSeq = pending.eventSeq
						next.pendingNotify = undefined
						await this.state.storage.put('job', next)
					} else {
						pending.attempt = Math.max(0, Math.trunc(pending.attempt || 0)) + 1
						pending.lastError = 'notifyApp_failed'
						pending.nextAt = now + this.getNotifyBackoffMs(pending.attempt)
						next.pendingNotify = pending
						await this.state.storage.put('job', next)
						await this.setAlarmEarlier(pending.nextAt)
					}
				}
			}

			return new Response(JSON.stringify({ ok: true }), {
				headers: { 'content-type': 'application/json' },
			})
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
			// If job is already completed but retained a stale phase/progress from earlier stages,
			// normalize the response so clients display a final 100% without an active phase.
			if (doc.status === 'completed') {
				if (doc.phase) delete doc.phase
				if (doc.progress !== 1) doc.progress = 1
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
					if (!doc.outputs?.audio && doc.outputAudioKey) {
						// Provide audio presigned URL for debugging if needed
						doc.outputs = doc.outputs || {}
						doc.outputs.audio = {
							key: doc.outputAudioKey,
							url: await presignS3(
								this.env,
								'GET',
								bucket,
								doc.outputAudioKey,
								600,
							),
						}
					}
					// If the container stage has completed but ASR hasn't produced VTT yet,
					// present a non-terminal status to clients to avoid premature completion.
					if (doc.status === 'completed' && !doc.outputs?.vtt?.key) {
						doc.status = 'running'
					}
				}
			} catch {}
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
			payload: Record<string, unknown>
			attempt: number
			nextAt: number
			lastError?: string
		}

		const pending = doc.pendingNotify as PendingNotify | undefined
		if (pending && typeof pending.nextAt === 'number') {
			const now = Date.now()
			if (pending.nextAt <= now) {
				const ok = await this.postAppCallback(pending.payload)
				if (ok) {
					doc.appNotified = true
					doc.nextNotified = true
					doc.lastNotifiedEventSeq = pending.eventSeq
					doc.pendingNotify = undefined
					try {
						await this.state.storage.put('job', doc)
					} catch {}
				} else {
					pending.attempt = Math.max(0, Math.trunc(pending.attempt || 0)) + 1
					pending.lastError = 'notifyApp_failed'
					pending.nextAt = now + this.getNotifyBackoffMs(pending.attempt)
					doc.pendingNotify = pending
					try {
						await this.state.storage.put('job', doc)
					} catch {}
					await this.setAlarmEarlier(pending.nextAt)
				}
			} else {
				await this.setAlarmEarlier(pending.nextAt)
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
			doc.outputAudioKey || doc.outputs?.audio?.key
		if (!audioKey)
			throw new Error('asr-pipeline.whisper_api: missing outputAudioKey')

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
		event?: { eventSeq: number; eventId: string; eventTs: number },
	) {
		const bucket = this.env.S3_BUCKET_NAME || 'vidgen-render'
		const payload: Record<string, unknown> = {
			jobId: doc.jobId,
			mediaId: doc.mediaId || 'unknown',
			engine: doc.engine,
			status: doc.status || 'completed',
		}
		if (event) {
			payload.eventSeq = event.eventSeq
			payload.eventId = event.eventId
			payload.eventTs = event.eventTs
		}

		if (doc.error) {
			payload.error = doc.error
		}

		if (doc.engine === 'media-downloader') {
			const outputs: Record<string, unknown> = {}
			// Be robust: if a final outputKey exists, always include video output,
			// even if the container did not explicitly populate outputs.video during progress updates.
			if (doc.outputKey) {
				outputs.video = {
					key: doc.outputKey,
					url: await presignS3(this.env, 'GET', bucket, doc.outputKey, 600),
				}
			}
			const audioProcessedKey =
				doc.outputAudioProcessedKey ||
				doc.outputAudioKey ||
				doc.outputs?.audioProcessed?.key ||
				doc.outputs?.audio?.key
			const audioSourceKey =
				doc.outputAudioSourceKey || doc.outputs?.audioSource?.key

			// Backward-compatible field: "audio" points at processed audio.
			if (audioProcessedKey) {
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
			const metadataKey = doc.outputMetadataKey || doc.outputs?.metadata?.key
			if (metadataKey) {
				outputs.metadata = {
					key: metadataKey,
					url: await presignS3(this.env, 'GET', bucket, metadataKey, 600),
				}
			}
			payload.outputs = outputs
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
		} else if (doc.outputKey) {
			payload.outputKey = doc.outputKey
			payload.outputUrl = await presignS3(
				this.env,
				'GET',
				bucket,
				doc.outputKey,
				600,
			)
		}

		return payload
	}

	private async postAppCallback(payload: Record<string, unknown>) {
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
