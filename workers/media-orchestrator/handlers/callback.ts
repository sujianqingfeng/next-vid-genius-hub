import { bucketPaths } from '@app/media-domain'
import type { Env, StatusDoc } from '../types'
import { copyObjectWithFallback, objectExistsWithFallback } from '../storage/fallback'
import { runAsrForPipeline } from '../asr/pipeline'
import { json } from '../utils/http'
import { jobStub } from '../utils/job'
import { requireJobCallbackSecret, verifyHmac } from '../utils/hmac'

async function materializeSubtitlesInput(env: Env, doc: any) {
	const mediaId: string | undefined = doc?.mediaId
	const sourceKey: string | undefined = doc?.outputs?.video?.key
	if (!mediaId || !sourceKey) return
	const pathOptions = { title: doc?.title as string | undefined }
	const targetKey = bucketPaths.inputs.subtitledVideo(mediaId, pathOptions)
	// Skip if already materialized（优先使用 R2 绑定，缺失时回退到 S3）
	const exists = await objectExistsWithFallback(env, targetKey)
	if (exists) return
	await copyObjectWithFallback(env, sourceKey, targetKey, 'video/mp4')
}

export async function handleContainerCallback(env: Env, req: Request) {
	const raw = await req.text()
	const sig = req.headers.get('x-signature') || ''
	const secret = requireJobCallbackSecret(env)
	if (!(await verifyHmac(secret, raw, sig))) {
		return json({ error: 'unauthorized' }, { status: 401 })
	}
	const body = JSON.parse(raw) as Partial<StatusDoc> & {
		mediaId?: string
		nonce?: string
		ts?: number
	}
	// Basic replay guard on nonce
	if (body.nonce) {
		const nonceKey = `nonce:${body.nonce}`
		const exists = await env.JOBS.get(nonceKey)
		if (exists) return json({ ok: true })
		await env.JOBS.put(nonceKey, '1', { expirationTtl: 600 })
	}
	if (!body.jobId || !body.status) {
		return json({ error: 'bad request' }, { status: 400 })
	}
	console.log(
		'[orchestrator] callback',
		body.jobId,
		body.status,
		'phase=',
		body.phase,
		'progress=',
		body.progress,
	)
	if (body.status === 'failed') {
		// surface container error details for easier debugging
		const err = (body as any)?.error
		if (err) {
			console.error(
				'[orchestrator] container error for job',
				body.jobId,
				':',
				err,
			)
		}
	}
	const stub = jobStub(env, body.jobId)
	if (stub) {
		const r = await stub.fetch('https://do/progress', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: raw,
		})
		// After progress update, if this is an ASR pipeline and audio stage is completed, trigger ASR step
		try {
			const stateResp = await stub.fetch('https://do/')
			if (stateResp.ok) {
				const doc = (await stateResp.json()) as any
				// Auto-materialize subtitles variant input when burner-ffmpeg completes
				if (doc?.engine === 'burner-ffmpeg' && body.status === 'completed') {
					try {
						await materializeSubtitlesInput(env, doc)
					} catch (e) {
						console.warn(
							'[materialize] subtitles input copy failed:',
							(e as Error)?.message || String(e),
						)
					}
				}
				if (doc?.engine === 'asr-pipeline' && body.status === 'completed') {
					// Guard: if VTT already exists, skip
					const hasVtt = Boolean(doc?.outputs?.vtt?.key)
					if (!hasVtt) {
						await runAsrForPipeline(env, doc)
					}
				}
			}
		} catch (e) {
			console.error(
				'[asr-pipeline] chain error:',
				(e as Error)?.message || String(e),
			)
			// Propagate failure status so clients don't see a misleading 'completed'
			try {
				await stub.fetch('https://do/progress', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						jobId: body.jobId,
						status: 'failed',
						error: (e as Error)?.message || String(e),
						ts: Date.now(),
					}),
				})
			} catch {}
		}
		return new Response(r.body, {
			status: r.status,
			headers: { 'content-type': 'application/json' },
		})
	}
	return json({ ok: true })
}
