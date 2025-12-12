import type { Env } from '../types'
import { json } from '../utils/http'
import { jobStub } from '../utils/job'

export async function handleGetStatus(env: Env, jobId: string) {
	if (!jobId) return json({ error: 'jobId required' }, { status: 400 })
	const stub = jobStub(env, jobId)
	if (!stub) return json({ error: 'not found' }, { status: 404 })
	const r = await stub.fetch('https://do/')
	return new Response(r.body, {
		status: r.status,
		headers: { 'content-type': 'application/json' },
	})
}

