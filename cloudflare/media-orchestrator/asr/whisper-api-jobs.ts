import { hmacHex, requireJobCallbackSecret } from '../utils/hmac'
import type { Env } from '../types'

type WhisperJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export type WhisperJob = {
	id: string
	status: WhisperJobStatus
	progress?: number | null
	error?: string | null
	model?: string | null
	language?: string | null
	task?: string | null
	created_at?: string | null
	updated_at?: string | null
	started_at?: string | null
	finished_at?: string | null
}

function normalizeBaseUrl(baseUrl: string) {
	return baseUrl.trim().replace(/\/$/, '')
}

export function resolveWhisperProgressFraction(job: WhisperJob): number | undefined {
	const p = typeof job.progress === 'number' ? job.progress : undefined
	if (p === undefined) return undefined
	if (!Number.isFinite(p)) return undefined
	if (p <= 1) return Math.max(0, Math.min(1, p))
	return Math.max(0, Math.min(1, p / 100))
}

export function mapWhisperStatusToJobStatus(status: WhisperJobStatus): 'queued' | 'running' | 'completed' | 'failed' {
	if (status === 'succeeded') return 'completed'
	if (status === 'failed') return 'failed'
	if (status === 'queued') return 'queued'
	return 'running'
}

export async function fetchWhisperApiConfigFromApp(env: Env, opts: {
	providerId: string
	modelId: string
}): Promise<{ baseUrl: string; apiKey: string; remoteModelId: string }> {
	const appBase = (env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
	const url = `${appBase}/api/internal/ai/asr-provider`
	const payload = {
		providerId: opts.providerId,
		modelId: opts.modelId,
		ts: Date.now(),
		nonce: crypto.randomUUID ? crypto.randomUUID() : `${Math.random()}`,
	}
	const raw = JSON.stringify(payload)
	const secret = requireJobCallbackSecret(env)
	const signature = await hmacHex(secret, raw)
	const r = await fetch(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-signature': signature,
		},
		body: raw,
	})
	if (!r.ok) {
		const t = await r.text().catch(() => '')
		throw new Error(`asr-provider config fetch failed: ${r.status} ${t}`)
	}
	const json = (await r.json()) as any
	if (!json?.baseUrl || !json?.apiKey || !json?.remoteModelId) {
		throw new Error('asr-provider config missing fields')
	}
	return {
		baseUrl: String(json.baseUrl),
		apiKey: String(json.apiKey),
		remoteModelId: String(json.remoteModelId),
	}
}


export async function submitWhisperTranscriptionJob(opts: {
	baseUrl: string
	apiKey: string
	model?: string
	language?: string
	audio: ArrayBuffer
	filename?: string
}): Promise<WhisperJob> {
	const baseUrl = normalizeBaseUrl(opts.baseUrl)
	const apiKey = opts.apiKey.trim()
	if (!baseUrl) throw new Error('Whisper API baseUrl is required')
	if (!apiKey) throw new Error('Whisper API token is required')

	const form = new FormData()
	form.append(
		'file',
		new Blob([opts.audio], { type: 'application/octet-stream' }),
		opts.filename?.trim() || 'audio.wav',
	)
	if (opts.model?.trim()) form.append('model', opts.model.trim())
	if (opts.language?.trim()) form.append('language', opts.language.trim())
	form.append('task', 'transcribe')

	const url = `${baseUrl}/v1/audio/transcriptions/jobs`
	const r = await fetch(url, {
		method: 'POST',
		headers: { Authorization: `Bearer ${apiKey}` },
		body: form,
	})
	if (!r.ok) {
		const t = await r.text().catch(() => '')
		throw new Error(`Whisper API job submit failed: ${r.status} ${t}`)
	}
	const json = (await r.json()) as any
	if (!json?.id) throw new Error('Whisper API job submit: missing id')
	return {
		id: String(json.id),
		status: String(json.status || 'queued') as WhisperJobStatus,
		progress: typeof json.progress === 'number' ? json.progress : null,
		error: typeof json.error === 'string' ? json.error : null,
		model: typeof json.model === 'string' ? json.model : null,
		language: typeof json.language === 'string' ? json.language : null,
		task: typeof json.task === 'string' ? json.task : null,
		created_at: typeof json.created_at === 'string' ? json.created_at : null,
		updated_at: typeof json.updated_at === 'string' ? json.updated_at : null,
		started_at: typeof json.started_at === 'string' ? json.started_at : null,
		finished_at: typeof json.finished_at === 'string' ? json.finished_at : null,
	}
}

export async function getWhisperJobStatus(opts: {
	baseUrl: string
	apiKey: string
	jobId: string
}): Promise<WhisperJob & { progressFraction?: number }> {
	const baseUrl = normalizeBaseUrl(opts.baseUrl)
	const apiKey = opts.apiKey.trim()
	const jobId = opts.jobId.trim()
	if (!baseUrl) throw new Error('Whisper API baseUrl is required')
	if (!apiKey) throw new Error('Whisper API token is required')
	if (!jobId) throw new Error('Whisper API jobId is required')

	const url = `${baseUrl}/v1/audio/transcriptions/jobs/${encodeURIComponent(jobId)}`
	const r = await fetch(url, {
		method: 'GET',
		headers: { Authorization: `Bearer ${apiKey}` },
	})
	if (!r.ok) {
		const t = await r.text().catch(() => '')
		throw new Error(`Whisper API job status failed: ${r.status} ${t}`)
	}
	const json = (await r.json()) as any
	const job: WhisperJob = {
		id: String(json.id || jobId),
		status: String(json.status || 'running') as WhisperJobStatus,
		progress: typeof json.progress === 'number' ? json.progress : null,
		error: typeof json.error === 'string' ? json.error : null,
		model: typeof json.model === 'string' ? json.model : null,
		language: typeof json.language === 'string' ? json.language : null,
		task: typeof json.task === 'string' ? json.task : null,
		created_at: typeof json.created_at === 'string' ? json.created_at : null,
		updated_at: typeof json.updated_at === 'string' ? json.updated_at : null,
		started_at: typeof json.started_at === 'string' ? json.started_at : null,
		finished_at: typeof json.finished_at === 'string' ? json.finished_at : null,
	}
	return { ...job, progressFraction: resolveWhisperProgressFraction(job) }
}

export async function getWhisperJobResult(opts: {
	baseUrl: string
	apiKey: string
	jobId: string
	responseFormat: 'json' | 'vtt'
}): Promise<string | unknown> {
	const baseUrl = normalizeBaseUrl(opts.baseUrl)
	const apiKey = opts.apiKey.trim()
	const jobId = opts.jobId.trim()
	if (!baseUrl) throw new Error('Whisper API baseUrl is required')
	if (!apiKey) throw new Error('Whisper API token is required')
	if (!jobId) throw new Error('Whisper API jobId is required')

	const url = `${baseUrl}/v1/audio/transcriptions/jobs/${encodeURIComponent(jobId)}/result?response_format=${encodeURIComponent(opts.responseFormat)}`
	const r = await fetch(url, {
		method: 'GET',
		headers: { Authorization: `Bearer ${apiKey}` },
	})
	if (!r.ok) {
		// 409 means "not ready yet" per spec
		const t = await r.text().catch(() => '')
		throw new Error(`Whisper API job result failed: ${r.status} ${t}`)
	}
	if (opts.responseFormat === 'vtt') {
		return await r.text()
	}
	return await r.json()
}
