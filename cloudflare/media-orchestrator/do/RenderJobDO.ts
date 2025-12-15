import type { Env } from '../types'
import { TERMINAL_STATUSES } from '../types'
import { runAsrForPipeline } from '../asr/pipeline'
import { presignS3 } from '../storage/presign'
import { s3Head } from '../storage/s3'
import { jobStub } from '../utils/job'
import { hmacHex, requireJobCallbackSecret } from '../utils/hmac'

// ---------------- Durable Object for strong-consistent job state ----------------
export class RenderJobDO {
	state: DurableObjectState
	env: Env
	constructor(state: DurableObjectState, env: Env) {
		this.state = state
		this.env = env
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
				outputAudioKey: body.outputAudioKey,
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
				outputMetadataKey: body.outputMetadataKey ?? doc.outputMetadataKey,
				outputs: body.outputs ?? doc.outputs,
				metadata: body.metadata ?? doc.metadata,
				ts: Date.now(),
			}
			await this.state.storage.put('job', next)
			const shouldNotify =
				TERMINAL_STATUSES.includes(next.status) &&
				!next.nextNotified &&
				(next.status !== 'completed' ||
					(next.engine === 'asr-pipeline'
						? Boolean(next.outputs?.vtt?.key)
						: Boolean(next.outputKey)))
			if (shouldNotify) {
				await this.notifyNext(next)
				next.nextNotified = true
				await this.state.storage.put('job', next)
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
			// Fire-and-forget ASR work; results and errors will be persisted via /progress.
			this.state.waitUntil(
				(async () => {
					try {
						await runAsrForPipeline(this.env, doc)
					} catch (e) {
						const msg = (e as Error)?.message || String(e)
						console.error('[asr-pipeline] background error', { jobId: doc.jobId, msg })
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
			// Auto-complete if expected outputs exist in S3
			if (doc.status !== 'completed') {
				const bucket = this.env.S3_BUCKET_NAME || 'vidgen-render'
				let shouldComplete = false

				// 1) Standard video output
				if (doc.outputKey) {
					const exists = await s3Head(this.env, bucket, doc.outputKey)
					if (exists) shouldComplete = true
				}

				// 2) Comments-only (media-downloader) metadata output
				if (
					!shouldComplete &&
					doc.engine === 'media-downloader' &&
					doc.outputMetadataKey
				) {
					const metaExists = await s3Head(
						this.env,
						bucket,
						doc.outputMetadataKey,
					)
					if (metaExists) {
						shouldComplete = true
						// Populate outputs with presigned URLs so clients can finalize without waiting for callbacks
						doc.outputs = doc.outputs || {}
						doc.outputs.metadata = {
							key: doc.outputMetadataKey,
							url: await presignS3(
								this.env,
								'GET',
								bucket,
								doc.outputMetadataKey,
								600,
							),
						}
						if (doc.outputAudioKey) {
							const audioExists = await s3Head(
								this.env,
								bucket,
								doc.outputAudioKey,
							)
							if (audioExists) {
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
						}
					}
				}

				if (shouldComplete) {
					// Mark job as fully completed and normalize state
					doc.status = 'completed'
					doc.phase = undefined
					doc.progress = 1
					doc.ts = Date.now()
					await this.state.storage.put('job', doc)

					// Mirror progress handler gating: only notify Next on completed when a video output exists
					const shouldNotify =
						TERMINAL_STATUSES.includes(doc.status) &&
						!doc.nextNotified &&
						(doc.status !== 'completed' || Boolean(doc.outputKey))

					if (shouldNotify) {
						await this.notifyNext(doc)
						doc.nextNotified = true
						await this.state.storage.put('job', doc)
					}
				}
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

	private async notifyNext(doc: any) {
		const nextBase = (
			this.env.NEXT_BASE_URL || 'http://localhost:3000'
		).replace(/\/$/, '')
		const cbUrl = `${nextBase}/api/render/cf-callback`
		const bucket = this.env.S3_BUCKET_NAME || 'vidgen-render'
		const payload: Record<string, unknown> = {
			jobId: doc.jobId,
			mediaId: doc.mediaId || 'unknown',
			engine: doc.engine,
			status: doc.status || 'completed',
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
			const audioKey = doc.outputAudioKey || doc.outputs?.audio?.key
			if (audioKey) {
				outputs.audio = {
					key: audioKey,
					url: await presignS3(this.env, 'GET', bucket, audioKey, 600),
				}
			}
			const metadataKey = doc.outputMetadataKey || doc.outputs?.metadata?.key
			if (metadataKey) {
				outputs.metadata = {
					key: metadataKey,
					url: await presignS3(
						this.env,
						'GET',
						bucket,
						metadataKey,
						600,
					),
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

		const secret = requireJobCallbackSecret(this.env)
		const signature = await hmacHex(secret, JSON.stringify(payload))
		await fetch(cbUrl, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-signature': signature,
			},
			body: JSON.stringify(payload),
		}).catch(() => {})
	}
}
