import { createFileRoute } from '@tanstack/react-router'
import { buildRequestContext } from '~/lib/auth/context'
import { runProxyChecksNow } from '~/lib/proxy/check'
import { createId } from '~/lib/utils/id'

export const Route = createFileRoute('/api/proxy-check/run')({
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

				let input: { concurrency?: number } | undefined
				try {
					if (
						request.headers.get('content-type')?.includes('application/json')
					) {
						input = (await request.json()) as { concurrency?: number }
					}
				} catch {}

				const runId = `proxycheck_manual_${createId()}`
				const promise = runProxyChecksNow({
					runId,
					concurrency:
						typeof input?.concurrency === 'number' &&
						Number.isFinite(input.concurrency)
							? Math.max(1, Math.trunc(input.concurrency))
							: undefined,
				})

				const runtimeCtx = (context as any)?.ctx as
					| { waitUntil?: (p: Promise<unknown>) => void }
					| undefined

				if (runtimeCtx?.waitUntil) {
					runtimeCtx.waitUntil(promise)
					const res = Response.json({ ok: true, queued: true, runId })
					for (const cookie of ctx.responseCookies) {
						res.headers.append('Set-Cookie', cookie)
					}
					return res
				}

				const data = await promise
				const res = Response.json(data)
				for (const cookie of ctx.responseCookies) {
					res.headers.append('Set-Cookie', cookie)
				}
				return res
			},
		},
	},
})
