import type { Env } from '../types'
import { json } from '../utils/http'
import { jobStub } from '../utils/job'

export async function handleGetEvents(env: Env, req: Request, jobId: string) {
	if (!jobId) return json({ error: 'jobId required' }, { status: 400 })
	const stub = jobStub(env, jobId)
	if (!stub) return json({ error: 'not found' }, { status: 404 })

	const r = await stub.fetch('https://do/events', { signal: req.signal })
	const headers = new Headers(r.headers)
	if ((headers.get('content-type') || '').includes('text/event-stream')) {
		headers.set('cache-control', 'no-store')
		headers.set('x-content-type-options', 'nosniff')
	}
	return new Response(r.body, {
		status: r.status,
		headers,
	})
}
