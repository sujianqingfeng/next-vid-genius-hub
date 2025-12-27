import type { Env } from '../types'
import { json } from '../utils/http'
import { jobStub } from '../utils/job'
import { requireJobCallbackSecret, verifyHmac } from '../utils/hmac'

export async function handleCancel(env: Env, req: Request, jobIdFromPath?: string) {
	const raw = await req.text()
	const sig = req.headers.get('x-signature') || ''
	const secret = requireJobCallbackSecret(env)
	if (!(await verifyHmac(secret, raw, sig))) {
		return json({ error: 'unauthorized' }, { status: 401 })
	}

	let body: any = null
	try {
		body = raw ? JSON.parse(raw) : null
	} catch {
		return json({ error: 'invalid_json' }, { status: 400 })
	}

	const jobId =
		typeof jobIdFromPath === 'string' && jobIdFromPath.trim()
			? jobIdFromPath.trim()
			: typeof body?.jobId === 'string' && body.jobId.trim()
				? body.jobId.trim()
				: null

	if (!jobId) return json({ error: 'jobId required' }, { status: 400 })

	const stub = jobStub(env, jobId)
	if (!stub) return json({ error: 'not found' }, { status: 404 })

	const reason =
		typeof body?.reason === 'string' && body.reason.trim()
			? body.reason.trim()
			: null

	const r = await stub.fetch('https://do/cancel', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ jobId, reason, requestedAt: Date.now() }),
	})

	const text = await r.text()
	let payload: unknown = null
	try {
		payload = JSON.parse(text)
	} catch {
		payload = { raw: text }
	}

	return json(payload, { status: r.status })
}

