import { ORPCError, onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { createFileRoute } from '@tanstack/react-router'

import { buildRequestContext } from '~/lib/auth/context'
import type { D1Database } from '~/lib/db'
import { setInjectedD1Database } from '~/lib/db'
import { logger } from '~/lib/logger'
import { appRouter } from '~/orpc/router'

type CfEnv = {
	DB?: D1Database
}

function getErrorCauseMessage(error: unknown): string | undefined {
	if (!(error instanceof Error)) return undefined
	const cause = (error as { cause?: unknown }).cause
	if (!cause) return undefined
	if (cause instanceof Error) return `${cause.name}: ${cause.message}`
	return String(cause)
}

const handler = new RPCHandler(appRouter, {
	interceptors: [
		onError((error, options) => {
			const req = (options as { request?: { method?: unknown; url?: unknown } })
				.request
			const method = typeof req?.method === 'string' ? req.method : 'UNKNOWN'
			const url = typeof req?.url === 'string' ? req.url : 'UNKNOWN'

			if (error instanceof ORPCError) {
				const json = error.toJSON()
				const issues = (json.data as any)?.issues
				const issuesText = issues ? ` issues=${JSON.stringify(issues)}` : ''

				logger.error(
					'api',
					`[ORPC] Handler error: code=${json.code} status=${json.status} msg=${json.message} method=${method} url=${url}${issuesText}`,
				)
				return
			}

			const msg = error instanceof Error ? error.message : String(error)
			const causeText = getErrorCauseMessage(error)
			logger.error(
				'api',
				`[ORPC] Handler error: ${msg} method=${method} url=${url}${causeText ? ` cause=${causeText}` : ''}`,
			)
		}),
	],
})

async function handleOrpcRequest(request: Request, env?: CfEnv) {
	if (env?.DB) {
		setInjectedD1Database(env.DB)
	}

	const context = await buildRequestContext(request)
	const { response, matched } = await handler.handle(request, {
		prefix: '/api/orpc',
		context,
	})

	if (!matched) return new Response('Not Found', { status: 404 })

	if (context.responseCookies.length > 0) {
		for (const cookie of context.responseCookies) {
			response.headers.append('Set-Cookie', cookie)
		}
	}

	return response
}

export const Route = createFileRoute('/api/orpc/$')({
	server: {
		handlers: {
			GET: ({ request, context }) =>
				handleOrpcRequest(request, (context as any)?.env as CfEnv | undefined),
			POST: ({ request, context }) =>
				handleOrpcRequest(request, (context as any)?.env as CfEnv | undefined),
			PUT: ({ request, context }) =>
				handleOrpcRequest(request, (context as any)?.env as CfEnv | undefined),
			PATCH: ({ request, context }) =>
				handleOrpcRequest(request, (context as any)?.env as CfEnv | undefined),
			DELETE: ({ request, context }) =>
				handleOrpcRequest(request, (context as any)?.env as CfEnv | undefined),
			HEAD: ({ request, context }) =>
				handleOrpcRequest(request, (context as any)?.env as CfEnv | undefined),
			OPTIONS: ({ request, context }) =>
				handleOrpcRequest(request, (context as any)?.env as CfEnv | undefined),
		},
	},
})
