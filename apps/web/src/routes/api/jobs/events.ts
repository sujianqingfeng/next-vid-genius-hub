import { createFileRoute } from '@tanstack/react-router'
import { and, eq, inArray } from 'drizzle-orm'

import { buildRequestContext } from '~/lib/features/auth/context'
import { requireOrchestratorUrl } from '~/lib/infra/cloudflare/utils'
import { getDb, schema } from '~/lib/infra/db'

const SSE_RETRY_MS = 3000
const SSE_KEEPALIVE_MS = 20_000
const MAX_JOB_IDS = 50

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'canceled'])

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

				const startUpstream = async (jobId: string) => {
					const controller = new AbortController()
					upstreamControllers.set(jobId, controller)
					const upstreamUrl = `${orchestratorBase}/jobs/${encodeURIComponent(jobId)}/events`

					try {
						const upstream = await fetch(upstreamUrl, {
							headers: { Accept: 'text/event-stream' },
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
							if (typeof status === 'string' && TERMINAL_STATUSES.has(status)) {
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
						await Promise.allSettled(
							allowedJobIds.map((id) => startUpstream(id)),
						)
						if (!closed) {
							enqueueWrite(encodeSseEvent('done', { jobIds: allowedJobIds }))
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
