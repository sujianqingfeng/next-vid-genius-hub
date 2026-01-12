import { createFileRoute } from '@tanstack/react-router'
import { and, eq, inArray } from 'drizzle-orm'

import { buildRequestContext } from '~/lib/features/auth/context'
import { requireOrchestratorUrl } from '~/lib/infra/cloudflare/utils'
import { getDb, schema } from '~/lib/infra/db'

const SSE_RETRY_MS = 3000
const SSE_KEEPALIVE_MS = 20_000
const MAX_JOB_IDS = 50

const textEncoder = new TextEncoder()

function encodeSseComment(comment: string): Uint8Array {
	return textEncoder.encode(`: ${comment}\n\n`)
}

function encodeSseEvent(event: string, data: unknown): Uint8Array {
	return textEncoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function appendResponseCookies(res: Response, cookies: string[]) {
	for (const cookie of cookies) {
		res.headers.append('Set-Cookie', cookie)
	}
}

function normalizeJobId(value: string): string {
	return value.trim()
}

export const Route = createFileRoute('/api/jobs/events')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const context = await buildRequestContext(request)
				if (!context.auth.user) {
					const res = Response.json({ error: 'unauthorized' }, { status: 401 })
					appendResponseCookies(res, context.responseCookies)
					return res
				}

				const url = new URL(request.url)
				const jobIds = [...new Set(url.searchParams.getAll('jobId').map(normalizeJobId))].filter(Boolean)
				if (jobIds.length === 0) {
					const res = Response.json({ error: 'jobId required' }, { status: 400 })
					appendResponseCookies(res, context.responseCookies)
					return res
				}
				if (jobIds.length > MAX_JOB_IDS) {
					const res = Response.json(
						{ error: 'too_many_jobIds', max: MAX_JOB_IDS },
						{ status: 400 },
					)
					appendResponseCookies(res, context.responseCookies)
					return res
				}

				const db = await getDb()
				const owned = await db
					.select({ jobId: schema.tasks.jobId })
					.from(schema.tasks)
					.where(
						and(
							eq(schema.tasks.userId, context.auth.user.id),
							inArray(schema.tasks.jobId, jobIds),
						),
					)
				const ownedSet = new Set(
					owned.map((x) => String(x.jobId || '').trim()).filter(Boolean),
				)
				const allowedJobIds = jobIds.filter((id) => ownedSet.has(id))
				if (allowedJobIds.length === 0) {
					const res = Response.json({ error: 'not found' }, { status: 404 })
					appendResponseCookies(res, context.responseCookies)
					return res
				}

				const { readable, writable } = new TransformStream<
					Uint8Array,
					Uint8Array
				>()
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

				const closeAll = () => {
					if (closed) return
					closed = true
					try {
						writer.close()
					} catch {}
				}

				request.signal.addEventListener('abort', closeAll, { once: true })

				const keepAlive = setInterval(() => {
					if (closed) return
					enqueueWrite(encodeSseComment('ping'))
				}, SSE_KEEPALIVE_MS)

				// Start the SSE stream immediately.
				enqueueWrite(textEncoder.encode(`retry: ${SSE_RETRY_MS}\n\n`))

				const orchestratorBase = requireOrchestratorUrl().replace(/\/$/, '')

				for (const jobId of jobIds) {
					if (ownedSet.has(jobId)) continue
					enqueueWrite(encodeSseEvent('error', { jobId, error: 'not found' }))
				}

				void (async () => {
					try {
						const params = new URLSearchParams()
						for (const jobId of allowedJobIds) {
							params.append('jobId', jobId)
						}
						const qs = params.toString()
						const upstreamUrl = `${orchestratorBase}/jobs/events${qs ? `?${qs}` : ''}`

						const upstream = await fetch(upstreamUrl, {
							headers: { Accept: 'text/event-stream' },
							signal: request.signal,
						})

						if (!upstream.ok || !upstream.body) {
							let message = ''
							try {
								message = await upstream.clone().text()
							} catch {}
							if (!closed) {
								enqueueWrite(
									encodeSseEvent('error', {
										status: upstream.status,
										message,
									}),
								)
								enqueueWrite(encodeSseEvent('done', { jobIds: allowedJobIds }))
							}
							return
						}

						const reader = upstream.body.getReader()
						while (true) {
							const { value, done } = await reader.read()
							if (done) break
							enqueueWrite(value)
						}
					} finally {
						try {
							clearInterval(keepAlive)
						} catch {}
						closeAll()
					}
				})()

				const res = new Response(readable, {
					headers: {
						'content-type': 'text/event-stream; charset=utf-8',
						'cache-control': 'no-store',
						'x-content-type-options': 'nosniff',
					},
				})
				appendResponseCookies(res, context.responseCookies)
				return res
			},
		},
	},
})
