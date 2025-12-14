import type { Env } from '../types'
import { jobStub } from '../utils/job'
import { hmacHex, requireJobCallbackSecret } from '../utils/hmac'

export async function runAsrForPipeline(env: Env, doc: any) {
	const jobId = doc.jobId
	const audioKey: string | undefined =
		doc.outputAudioKey || doc.outputs?.audio?.key
	if (!audioKey) throw new Error('asr-pipeline: missing outputAudioKey')

	// Decide model
	const model: string =
		(doc?.metadata?.model as string) || '@cf/openai/whisper-tiny-en'
	const jobLanguage =
		typeof doc?.metadata?.language === 'string' ? doc.metadata.language : undefined
	const normalizedLanguage =
		jobLanguage && jobLanguage !== 'auto' ? jobLanguage : undefined

	const nextBase = (env.NEXT_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
	const url = `${nextBase}/api/asr/run`
	const payload = {
		jobId,
		mediaId: doc.mediaId || 'unknown',
		title: doc?.title as string | undefined,
		outputAudioKey: audioKey,
		model,
		language: normalizedLanguage,
	}
	const secret = requireJobCallbackSecret(env)
	const signature = await hmacHex(secret, JSON.stringify(payload))
	console.log('[asr-pipeline] calling Next for ASR', { jobId, model })
	const r = await fetch(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-signature': signature,
		},
		body: JSON.stringify(payload),
	})
	if (!r.ok) {
		const t = await r.text().catch(() => '')
		throw new Error(`Next ASR failed: ${r.status} ${t}`)
	}
	const body = (await r.json()) as { vttKey?: string; wordsKey?: string }
	const vttKey = body.vttKey
	const wordsKey = body.wordsKey

	// Update DO state with outputs
	const stub = jobStub(env, jobId)
	if (stub) {
		const outputs: any = {}
		if (vttKey) outputs.vtt = { key: vttKey }
		if (wordsKey) outputs.words = { key: wordsKey }
		const p = {
			jobId,
			status: vttKey ? 'completed' : 'failed',
			outputs,
			ts: Date.now(),
		}
		await stub.fetch('https://do/progress', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(p),
		})
	}
}
