import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'

import { buildRequestContext } from '~/lib/features/auth/context'
import { getDb, schema } from '~/lib/infra/db'
import { requireOrchestratorUrl } from '~/lib/infra/cloudflare/utils'

function appendResponseCookies(res: Response, cookies: string[]) {
	for (const cookie of cookies) {
		res.headers.append('Set-Cookie', cookie)
	}
}

export const Route = createFileRoute('/api/jobs/$jobId/events')({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const context = await buildRequestContext(request)
				if (!context.auth.user) {
					const res = Response.json({ error: 'unauthorized' }, { status: 401 })
					appendResponseCookies(res, context.responseCookies)
					return res
				}

				const jobId = params.jobId
				const db = await getDb()

				// Enforce ownership by mapping jobId -> task.userId.
				const task = await db.query.tasks.findFirst({
					where: and(
						eq(schema.tasks.jobId, jobId),
						eq(schema.tasks.userId, context.auth.user.id),
					),
					columns: { id: true },
				})
				if (!task) {
					const res = Response.json({ error: 'not found' }, { status: 404 })
					appendResponseCookies(res, context.responseCookies)
					return res
				}

				const base = requireOrchestratorUrl()
				const url = `${base.replace(/\/$/, '')}/jobs/${encodeURIComponent(jobId)}/events`

				const upstream = await fetch(url, {
					headers: { Accept: 'text/event-stream' },
					signal: request.signal,
				})

				if (!upstream.ok) {
					let message = ''
					try {
						message = await upstream.clone().text()
					} catch {}
					const res = Response.json(
						{ error: 'upstream_error', status: upstream.status, message },
						{ status: upstream.status },
					)
					appendResponseCookies(res, context.responseCookies)
					return res
				}

				const res = new Response(upstream.body, {
					status: upstream.status,
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
