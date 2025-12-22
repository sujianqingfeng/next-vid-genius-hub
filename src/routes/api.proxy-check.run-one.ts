import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { buildRequestContext } from '~/lib/auth/context'
import { startCloudJob } from '~/lib/cloudflare/jobs'
import {
	PROXY_CHECK_PROBE_BYTES,
	PROXY_CHECK_TEST_URL,
	PROXY_CHECK_TIMEOUT_MS,
} from '~/lib/config/env'
import { getDb, schema } from '~/lib/db'
import { toProxyJobPayload } from '~/lib/proxy/utils'
import { createId } from '~/lib/utils/id'

const InputSchema = z.object({
	proxyId: z.string().min(1),
})

export const Route = createFileRoute('/api/proxy-check/run-one')({
	server: {
		handlers: {
			POST: async ({ request, context }) => {
				const ctx = await buildRequestContext(request)
				if (!ctx.auth.user) {
					const res = Response.json({ error: 'UNAUTHORIZED' }, { status: 401 })
					for (const cookie of ctx.responseCookies) {
						res.headers.append('Set-Cookie', cookie)
					}
					return res
				}
				if (ctx.auth.user.role !== 'admin') {
					const res = Response.json({ error: 'FORBIDDEN' }, { status: 403 })
					for (const cookie of ctx.responseCookies) {
						res.headers.append('Set-Cookie', cookie)
					}
					return res
				}

				const testUrl = (PROXY_CHECK_TEST_URL ?? '').trim()
				if (!testUrl) {
					const res = Response.json(
						{ error: 'PROXY_CHECK_TEST_URL not configured' },
						{ status: 500 },
					)
					for (const cookie of ctx.responseCookies) {
						res.headers.append('Set-Cookie', cookie)
					}
					return res
				}

				const raw = await request.json().catch(() => null)
				const parsed = InputSchema.safeParse(raw)
				if (!parsed.success) {
					const res = Response.json(
						{ error: 'bad request', issues: parsed.error.issues },
						{ status: 400 },
					)
					for (const cookie of ctx.responseCookies) {
						res.headers.append('Set-Cookie', cookie)
					}
					return res
				}

				const db = await getDb()
				const proxy = await db.query.proxies.findFirst({
					where: (proxies, { eq }) => eq(proxies.id, parsed.data.proxyId),
				})
				if (!proxy) {
					const res = Response.json(
						{ error: 'proxy not found' },
						{ status: 404 },
					)
					for (const cookie of ctx.responseCookies) {
						res.headers.append('Set-Cookie', cookie)
					}
					return res
				}

				const proxyPayload = toProxyJobPayload(proxy)
				if (!proxyPayload) {
					const res = Response.json(
						{ error: 'invalid proxy payload' },
						{ status: 400 },
					)
					for (const cookie of ctx.responseCookies) {
						res.headers.append('Set-Cookie', cookie)
					}
					return res
				}

				const runId = `proxycheck_single_${createId()}`
				const jobId = `pchk_${runId}_${proxy.id}`

				const promise = startCloudJob({
					jobId,
					mediaId: 'system-proxy-check',
					engine: 'media-downloader',
					title: 'proxy-check',
					options: {
						task: 'proxy-probe',
						url: testUrl,
						proxy: proxyPayload,
						runId,
						proxyId: proxy.id,
						timeoutMs: PROXY_CHECK_TIMEOUT_MS,
						probeBytes: PROXY_CHECK_PROBE_BYTES,
					},
				})

				const runtimeCtx = (context as any)?.ctx as
					| { waitUntil?: (p: Promise<unknown>) => void }
					| undefined

				if (runtimeCtx?.waitUntil) {
					runtimeCtx.waitUntil(promise)
					const res = Response.json({
						ok: true,
						queued: true,
						runId,
						jobId,
						proxyId: proxy.id,
					})
					for (const cookie of ctx.responseCookies) {
						res.headers.append('Set-Cookie', cookie)
					}
					return res
				}

				await promise
				const res = Response.json({ ok: true, queued: true, runId, jobId })
				for (const cookie of ctx.responseCookies) {
					res.headers.append('Set-Cookie', cookie)
				}
				return res
			},
		},
	},
})
