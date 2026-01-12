import type { Env } from '../types'
import { TERMINAL_STATUSES } from '../types'
import { json } from '../utils/http'
import { jobStub } from '../utils/job'

const SSE_RETRY_MS = 3000
const SSE_KEEPALIVE_MS = 20_000
const MAX_JOB_IDS = 50

const TERMINAL_STATUS_SET = new Set(TERMINAL_STATUSES as readonly string[])

const textEncoder = new TextEncoder()

function encodeSseComment(comment: string): Uint8Array {
	return textEncoder.encode(`: ${comment}\n\n`)
}

function encodeSseEvent(event: string, data: unknown): Uint8Array {
	return textEncoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function normalizeJobId(value: string): string {
	return value.trim()
}

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

export async function handleGetMultiEvents(env: Env, req: Request) {
	if (!env.RENDER_JOB_DO) {
		return json({ error: 'server misconfigured' }, { status: 500 })
	}

	const url = new URL(req.url)
	const jobIds = [
		...new Set(url.searchParams.getAll('jobId').map(normalizeJobId)),
	].filter(Boolean)

	if (jobIds.length === 0) {
		return json({ error: 'jobId required' }, { status: 400 })
	}
	if (jobIds.length > MAX_JOB_IDS) {
		return json({ error: 'too_many_jobIds', max: MAX_JOB_IDS }, { status: 400 })
	}

	const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
	const writer = writable.getWriter()

	let closed = false
	let writeChain: Promise<unknown> = Promise.resolve()

	const enqueueWrite = (chunk: Uint8Array) => {
		writeChain = writeChain
			.then(() => writer.write(chunk))
			.catch(() => {
				// swallow write errors; client likely disconnected
			})
	}

	const upstreamControllers = new Map<string, AbortController>()

	const closeAll = () => {
		if (closed) return
		closed = true
		for (const c of upstreamControllers.values()) {
			try {
				c.abort()
			} catch {}
		}
		upstreamControllers.clear()
		try {
			writer.close()
		} catch {}
	}

	req.signal.addEventListener('abort', closeAll, { once: true })

	const keepAlive = setInterval(() => {
		if (closed) return
		enqueueWrite(encodeSseComment('ping'))
	}, SSE_KEEPALIVE_MS)

	enqueueWrite(textEncoder.encode(`retry: ${SSE_RETRY_MS}\n\n`))

	const startUpstream = async (jobId: string) => {
		const controller = new AbortController()
		upstreamControllers.set(jobId, controller)

		const stub = jobStub(env, jobId)
		if (!stub) {
			enqueueWrite(encodeSseEvent('error', { jobId, error: 'not found' }))
			return
		}

		try {
			const upstream = await stub.fetch('https://do/events', {
				signal: controller.signal,
			})

			if (!upstream.ok || !upstream.body) {
				let message = ''
				try {
					message = await upstream.clone().text()
				} catch {}
				enqueueWrite(
					encodeSseEvent('error', {
						jobId,
						status: upstream.status,
						message,
					}),
				)
				return
			}

			const reader = upstream.body.getReader()
			const decoder = new TextDecoder()
			let buffer = ''

			const flushFrame = (raw: string) => {
				const lines = raw.split('\n')
				let eventName: string | null = null
				const dataLines: string[] = []
				for (const line of lines) {
					if (!line) continue
					if (line.startsWith(':')) continue
					if (line.startsWith('event:')) {
						eventName = line.slice('event:'.length).trim()
						continue
					}
					if (line.startsWith('data:')) {
						dataLines.push(line.slice('data:'.length).trimStart())
						continue
					}
				}

				if (eventName !== 'status') return
				const data = dataLines.join('\n').trim()
				if (!data) return

				let doc: any
				try {
					doc = JSON.parse(data)
				} catch {
					return
				}

				enqueueWrite(encodeSseEvent('status', { jobId, doc }))

				const status = doc?.status
				if (typeof status === 'string' && TERMINAL_STATUS_SET.has(status)) {
					try {
						controller.abort()
					} catch {}
				}
			}

			while (true) {
				const { value, done } = await reader.read()
				if (done) break
				const chunk = decoder.decode(value, { stream: true })
				buffer += chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

				let idx: number
				while ((idx = buffer.indexOf('\n\n')) !== -1) {
					const frame = buffer.slice(0, idx)
					buffer = buffer.slice(idx + 2)
					if (frame.trim()) flushFrame(frame)
				}
			}
		} catch {
			// ignore upstream errors; client may have disconnected
		} finally {
			upstreamControllers.delete(jobId)
		}
	}

	void (async () => {
		try {
			await Promise.allSettled(jobIds.map((id) => startUpstream(id)))
			if (!closed) {
				enqueueWrite(encodeSseEvent('done', { jobIds }))
			}
		} finally {
			try {
				clearInterval(keepAlive)
			} catch {}
			closeAll()
		}
	})()

	return new Response(readable, {
		headers: {
			'content-type': 'text/event-stream; charset=utf-8',
			'cache-control': 'no-store',
			'x-content-type-options': 'nosniff',
		},
	})
}
